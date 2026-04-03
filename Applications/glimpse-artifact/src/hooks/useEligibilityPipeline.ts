import { useMemo } from "react";
import type { CycleSnapshot, MomentumFrame, PromotionGateResult } from "@/components/phase4/types";

// ── Shader buffer data shape ────────────────────────────────────────

export interface ShaderBufferData {
  /** Interleaved vertex attributes: position(2) + weightRaw(1) + runtimeInfluence(1)
   *  + weightBand(1) + conditionSeverity(1) + promotionPassed(1) + fnvNoise(1)
   *  + dimensionScores(4) + opFitScore(1) = 13 floats per candidate */
  vertices: Float32Array;
  /** 8-pass x 1 pixel RGBA residue texture (32 bytes) */
  residueTexture: Uint8Array;
  /** Number of candidate points to draw */
  candidateCount: number;
  /** Extracted uniform values */
  uniforms: {
    beat: number;
    momentum: number;
    sidewalkDrift: number;
    acceleration: number;
    cbState: number;
    argBiases: [number, number, number, number];
    opFitBias: number;
    promotionThresholds: [number, number, number, number];
  };
}

const FLOATS_PER_VERTEX = 13;

// WeightBand encoding matching pipeline.ts:116-121
function encodeBand(band: string | null): number {
  switch (band) {
    case "dominant":
      return 3;
    case "elevated":
      return 2;
    case "steady":
      return 1;
    default:
      return 0; // trace
  }
}

// ConditionSeverity encoding matching pipeline.ts:269-325
function encodeSeverity(severity: string): number {
  switch (severity) {
    case "priority":
      return 2;
    case "watch":
      return 1;
    default:
      return 0; // info
  }
}

// FNV1a hash matching pipeline.ts:79-86
function fnv1a(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableFraction(seed: string, salt: string): number {
  return fnv1a(`${seed}::${salt}`) / 4294967295;
}

// CycleBeat → int matching types.ts:190
function encodeBeat(beat: string): number {
  switch (beat) {
    case "map":
      return 0;
    case "balance":
      return 1;
    case "tighten":
      return 2;
    case "verify":
      return 3;
    default:
      return 0;
  }
}

// ── Residue texture builder ─────────────────────────────────────────
// 8x1 RGBA texture encoding ResidueStack deposits as brightness values
// Each pass's deposit count is normalized to 0-255 for the R channel

const PASS_IDS = [
  "normalize-runtime-args",
  "build-attribute-catalog",
  "derive-analog-weights",
  "project-vertical-hierarchy",
  "derive-condition-notes",
  "derive-observation-notes",
  "compile-reusable-forms",
  "emit-collection-table",
];

const DEPOSIT_KEYS: Record<string, string> = {
  "normalize-runtime-args": "seed",
  "build-attribute-catalog": "attributeCount",
  "derive-analog-weights": "weightCount",
  "project-vertical-hierarchy": "hierarchyCount",
  "derive-condition-notes": "conditionCount",
  "derive-observation-notes": "observationCount",
  "compile-reusable-forms": "formCount",
  "emit-collection-table": "rowCount",
};

function buildResidueTexture(snapshot: CycleSnapshot): Uint8Array {
  const tex = new Uint8Array(32); // 8 pixels * 4 channels (RGBA)

  const result = snapshot.caseRecord.latestEligibilityResult;
  if (!result) return tex;

  // Derive approximate counts from the result data
  const counts: Record<string, number> = {
    seed: 1, // normalize always produces 1 seed
    attributeCount: 10, // default catalog has 10 attributes
    weightCount: result.table.rows.filter((r) => r.rowType === "attribute").length || 30,
    hierarchyCount: result.table.rows.filter((r) => r.rowType === "dimension").length || 18,
    conditionCount: snapshot.caseRecord.conditionNotes.length,
    observationCount: snapshot.caseRecord.observationNotes.length,
    formCount: 5, // typically 5 form kinds
    rowCount: result.table.rows.length,
  };

  for (let i = 0; i < 8; i++) {
    const passId = PASS_IDS[i];
    const key = DEPOSIT_KEYS[passId];
    const count = counts[key] ?? 0;
    // Normalize: clamp count to 0-50 range, map to 0-255
    const normalized = Math.min(255, Math.round((Math.min(count, 50) / 50) * 255));
    const offset = i * 4;
    tex[offset] = normalized; // R: brightness
    tex[offset + 1] = normalized; // G
    tex[offset + 2] = Math.round(normalized * 0.7); // B: slightly cooler
    tex[offset + 3] = 255; // A: fully opaque
  }

  return tex;
}

// ── Main hook ───────────────────────────────────────────────────────

export function useEligibilityPipeline(
  snapshot: CycleSnapshot | null,
  promotionGate: PromotionGateResult | null = null,
  cbState = 0,
): ShaderBufferData | null {
  return useMemo(() => {
    if (!snapshot) return null;

    const caseRecord = snapshot.caseRecord;
    const result = caseRecord.latestEligibilityResult;
    const momentum: MomentumFrame = caseRecord.momentum;

    // Build per-candidate vertex data from the collection table + conditions
    const candidateIds = caseRecord.candidateIds;
    const candidateCount = candidateIds.length;

    if (candidateCount === 0) return null;

    const vertices = new Float32Array(candidateCount * FLOATS_PER_VERTEX);

    // Build dimension score lookup from table rows
    const dimScores = new Map<string, Record<string, number>>();
    const weightData = new Map<
      string,
      { totalRaw: number; count: number; maxBand: string; maxInfluence: number }
    >();

    if (result) {
      for (const row of result.table.rows) {
        if (row.rowType === "dimension" && row.dimensionScore !== null) {
          let entry = dimScores.get(row.candidateId);
          if (!entry) {
            entry = {};
            dimScores.set(row.candidateId, entry);
          }
          entry[row.dimension] = row.dimensionScore;
        }
        if (row.rowType === "attribute" && row.weightRaw !== null) {
          let wd = weightData.get(row.candidateId);
          if (!wd) {
            wd = { totalRaw: 0, count: 0, maxBand: "trace", maxInfluence: 0.5 };
            weightData.set(row.candidateId, wd);
          }
          wd.totalRaw += row.weightRaw;
          wd.count += 1;
          const bandVal = encodeBand(row.weightBand);
          if (bandVal > encodeBand(wd.maxBand)) {
            wd.maxBand = row.weightBand ?? "trace";
          }
        }
      }
    }

    // Build condition severity lookup (highest severity per candidate)
    const conditionSeverities = new Map<string, number>();
    for (const note of caseRecord.conditionNotes) {
      const sev = encodeSeverity(note.severity);
      const current = conditionSeverities.get(note.candidateId) ?? 0;
      if (sev > current) conditionSeverities.set(note.candidateId, sev);
    }

    // Promotion status
    const promotionPassed = promotionGate ? (promotionGate.passed ? 1.0 : -1.0) : 0.0;

    // Seed for FNV noise
    const seed = result?.table.rows[0]?.seed ?? caseRecord.caseId;

    for (let i = 0; i < candidateCount; i++) {
      const cid = candidateIds[i];
      const dims = dimScores.get(cid) ?? {};
      const wd = weightData.get(cid);

      const overallScore = dims["overall"] ?? 0.5;
      // Find dominant dimension (highest score excluding overall)
      let dominantScore = 0;
      for (const dim of [
        "governance",
        "usability",
        "integration",
        "observability",
        "operational_fit",
      ]) {
        const s = dims[dim] ?? 0;
        if (s > dominantScore) dominantScore = s;
      }

      const avgWeight = wd ? wd.totalRaw / Math.max(wd.count, 1) : 0.5;
      const noise = stableFraction(seed, cid);

      const offset = i * FLOATS_PER_VERTEX;
      vertices[offset] = overallScore; // a_position.x
      vertices[offset + 1] = dominantScore; // a_position.y
      vertices[offset + 2] = avgWeight; // a_weightRaw
      vertices[offset + 3] = clamp(1.0 + (avgWeight - 0.5) * 0.5, 0.5, 1.5); // a_runtimeInfluence approx
      vertices[offset + 4] = wd ? encodeBand(wd.maxBand) : 0; // a_weightBand
      vertices[offset + 5] = conditionSeverities.get(cid) ?? 0; // a_conditionSeverity
      vertices[offset + 6] = promotionPassed; // a_promotionPassed
      vertices[offset + 7] = noise; // a_fnvNoise
      vertices[offset + 8] = dims["governance"] ?? 0.5; // a_dimensionScores.x
      vertices[offset + 9] = dims["usability"] ?? 0.5; // a_dimensionScores.y
      vertices[offset + 10] = dims["integration"] ?? 0.5; // a_dimensionScores.z
      vertices[offset + 11] = dims["observability"] ?? 0.5; // a_dimensionScores.w
      vertices[offset + 12] = dims["operational_fit"] ?? 0.5; // a_opFitScore
    }

    const residueTexture = buildResidueTexture(snapshot);

    // Extract args from the case's routine args or default
    const args = caseRecord.latestEligibilityResult
      ? {
          governance: 1.0,
          usability: 1.0,
          integration: 1.0,
          observability: 1.0,
          operationalFit: 1.0,
        }
      : {
          governance: 1.0,
          usability: 1.0,
          integration: 1.0,
          observability: 1.0,
          operationalFit: 1.0,
        };

    return {
      vertices,
      residueTexture,
      candidateCount,
      uniforms: {
        beat: encodeBeat(caseRecord.currentBeat),
        momentum: momentum.momentum,
        sidewalkDrift: momentum.sidewalkDrift,
        acceleration: momentum.acceleration,
        cbState,
        argBiases: [args.governance, args.usability, args.integration, args.observability],
        opFitBias: args.operationalFit,
        // evolution.ts:624-629 thresholds
        promotionThresholds: [0.68, 0.62, 0.64, 0.35],
      },
    };
  }, [snapshot, promotionGate, cbState]);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
