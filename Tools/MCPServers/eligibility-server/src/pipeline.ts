import {
  createPipeline,
  findResidue,
  type Pass,
  type PassInput,
  type ResidueStack,
} from "@cascade/shared-pipeline";
import { getDefaultAttributeCatalog } from "./catalog.js";
import { getFixtureCandidates } from "./examples.js";
import { compileFormArtifacts } from "./forms.js";
import { buildCollectionTable } from "./table.js";
import type {
  AnalogWeight,
  CompileTarget,
  ConditionNote,
  EligibilityAttribute,
  EligibilityCandidate,
  EligibilityState,
  EligibilityValidationResult,
  HierarchySlice,
  IntegrationDimension,
  ObservationNote,
  RoutineArgs,
  RoutineResult,
  SafeRoutineEvaluation,
  StrugglePoint,
  WeightBand,
} from "./types.js";

const ROUTINE_PIPELINE_ID = "eligibility-routine";
const DIMENSIONS: readonly IntegrationDimension[] = [
  "governance",
  "usability",
  "integration",
  "observability",
  "operational_fit",
] as const;

function round(value: number): number {
  return Number(value.toFixed(6));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeBias(value: number | undefined): number {
  return round(clamp(value ?? 1, 0.5, 2));
}

function normalizeFormTarget(value: CompileTarget | undefined): CompileTarget {
  if (
    value === "server_tool" ||
    value === "rule" ||
    value === "agent" ||
    value === "skill" ||
    value === "reference" ||
    value === "all"
  ) {
    return value;
  }
  return "all";
}

function normalizeTableScope(
  value: RoutineArgs["tableScope"] | undefined,
): RoutineArgs["tableScope"] {
  return value === "attributes" || value === "dimensions" || value === "all" ? value : "all";
}

function sanitizeSeed(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function getArgValue(args: RoutineArgs, dimension: IntegrationDimension): number {
  if (dimension === "operational_fit") return args.operationalFit;
  return args[dimension];
}

function fnv1a(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableFraction(seed: string, salt: string): number {
  return fnv1a(`${seed}::${salt}`) / 4294967295;
}

function buildArgvSignature(args: RoutineArgs): string {
  return [
    `governance=${args.governance.toFixed(2)}`,
    `usability=${args.usability.toFixed(2)}`,
    `integration=${args.integration.toFixed(2)}`,
    `observability=${args.observability.toFixed(2)}`,
    `operationalFit=${args.operationalFit.toFixed(2)}`,
    `formTarget=${args.formTarget}`,
    `tableScope=${args.tableScope}`,
  ].join("|");
}

function buildDeterministicTimestamp(seed: string, argvSignature: string): string {
  const baseMs = Date.UTC(2026, 0, 1, 0, 0, 0, 0);
  const offsetMs = Math.floor(stableFraction(seed, argvSignature) * 86_400_000);
  return new Date(baseMs + offsetMs).toISOString();
}

function buildSeed(candidates: EligibilityCandidate[], args: RoutineArgs): string {
  const explicitSeed = sanitizeSeed(args.seed);
  if (explicitSeed) return explicitSeed;
  return `${candidates
    .map((candidate) => candidate.id)
    .sort()
    .join(",")}::${buildArgvSignature(args)}::${args.formTarget}`;
}

function classifyBand(value: number): WeightBand {
  if (value >= 0.8) return "dominant";
  if (value >= 0.6) return "elevated";
  if (value >= 0.35) return "steady";
  return "trace";
}

function propertyValue(candidate: EligibilityCandidate, propertyId: string): number | undefined {
  return candidate.properties.find((property) => property.id === propertyId)?.value;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getPropertyScore(
  candidate: EligibilityCandidate,
  attribute: EligibilityAttribute,
): { value: number; sourcePropertyIds: string[] } {
  const values: number[] = [];
  const sourcePropertyIds: string[] = [];

  for (const propertyId of attribute.propertyKeys) {
    const value = propertyValue(candidate, propertyId);
    if (value === undefined) continue;
    values.push(value);
    sourcePropertyIds.push(propertyId);
  }

  const propertyScore = values.length > 0 ? average(values) : 0.5;
  return {
    value: attribute.polarity === "negative" ? 1 - propertyScore : propertyScore,
    sourcePropertyIds,
  };
}

function scoreWeights(
  candidates: EligibilityCandidate[],
  catalog: EligibilityAttribute[],
  args: RoutineArgs,
  seed: string,
  argvSignature: string,
): AnalogWeight[] {
  const weights: AnalogWeight[] = [];

  for (const candidate of candidates) {
    for (const attribute of catalog) {
      const bandSpan = attribute.baseBand[1] - attribute.baseBand[0];
      const analogBase =
        attribute.baseBand[0] + bandSpan * stableFraction(seed, `${candidate.id}:${attribute.id}`);
      const propertyScore = getPropertyScore(candidate, attribute);
      const biasDelta =
        (getArgValue(args, attribute.dimension) - 1) *
        (0.22 + (attribute.argMultipliers[attribute.dimension] ?? 0.2) * 0.35);
      const runtimeInfluence = round(clamp(1 + biasDelta, 0.5, 1.5));
      const weightRaw = round(
        clamp(analogBase * 0.4 + propertyScore.value * 0.45 + biasDelta, 0, 1),
      );

      weights.push({
        id: `${candidate.id}:${attribute.id}`,
        candidateId: candidate.id,
        attributeId: attribute.id,
        dimension: attribute.dimension,
        seed,
        argvSignature,
        sourcePropertyIds: propertyScore.sourcePropertyIds,
        weightRaw,
        weightBand: classifyBand(weightRaw),
        runtimeInfluence: round(runtimeInfluence),
      });
    }
  }

  return weights;
}

function rankDimensionSlices(
  weights: AnalogWeight[],
  dimension: IntegrationDimension,
): HierarchySlice[] {
  const grouped = new Map<string, AnalogWeight[]>();

  for (const weight of weights.filter((entry) => entry.dimension === dimension)) {
    const bucket = grouped.get(weight.candidateId) ?? [];
    bucket.push(weight);
    grouped.set(weight.candidateId, bucket);
  }

  return [...grouped.entries()]
    .map(([candidateId, bucket]) => ({
      id: `${candidateId}:${dimension}`,
      candidateId,
      dimension,
      score: round(average(bucket.map((weight) => weight.weightRaw))),
      rank: 0,
      leadingAttributeIds: bucket
        .sort((left, right) => right.weightRaw - left.weightRaw)
        .slice(0, 2)
        .map((weight) => weight.attributeId),
    }))
    .sort((left, right) => right.score - left.score)
    .map((slice, index) => ({
      ...slice,
      rank: index + 1,
    }));
}

function rankOverallSlices(slices: HierarchySlice[], args: RoutineArgs): HierarchySlice[] {
  const grouped = new Map<string, HierarchySlice[]>();

  for (const slice of slices.filter((entry) => entry.dimension !== "overall")) {
    const bucket = grouped.get(slice.candidateId) ?? [];
    bucket.push(slice);
    grouped.set(slice.candidateId, bucket);
  }

  return [...grouped.entries()]
    .map(([candidateId, bucket]) => {
      const weightedScore =
        bucket.reduce((sum, slice) => {
          const multiplier = Math.pow(
            getArgValue(args, slice.dimension as IntegrationDimension),
            1.35,
          );
          return sum + slice.score * multiplier;
        }, 0) /
        bucket.reduce(
          (sum, slice) =>
            sum + Math.pow(getArgValue(args, slice.dimension as IntegrationDimension), 1.35),
          0,
        );

      return {
        id: `${candidateId}:overall`,
        candidateId,
        dimension: "overall" as const,
        score: round(weightedScore),
        rank: 0,
        leadingAttributeIds: bucket
          .sort((left, right) => right.score - left.score)
          .slice(0, 2)
          .flatMap((slice) => slice.leadingAttributeIds)
          .slice(0, 3),
      };
    })
    .sort((left, right) => right.score - left.score)
    .map((slice, index) => ({
      ...slice,
      rank: index + 1,
    }));
}

function deriveHierarchy(weights: AnalogWeight[], args: RoutineArgs): HierarchySlice[] {
  const slices = DIMENSIONS.flatMap((dimension) => rankDimensionSlices(weights, dimension));
  return [...slices, ...rankOverallSlices(slices, args)];
}

function leadingDimension(
  candidateId: string,
  hierarchy: HierarchySlice[],
): HierarchySlice | undefined {
  return hierarchy
    .filter((slice) => slice.candidateId === candidateId && slice.dimension !== "overall")
    .sort((left, right) => right.score - left.score)[0];
}

function deriveConditions(hierarchy: HierarchySlice[]): ConditionNote[] {
  const notes: ConditionNote[] = [];
  const candidateIds = [...new Set(hierarchy.map((slice) => slice.candidateId))];

  for (const candidateId of candidateIds) {
    const governance = hierarchy.find(
      (slice) => slice.candidateId === candidateId && slice.dimension === "governance",
    );
    const usability = hierarchy.find(
      (slice) => slice.candidateId === candidateId && slice.dimension === "usability",
    );
    const observability = hierarchy.find(
      (slice) => slice.candidateId === candidateId && slice.dimension === "observability",
    );
    const overall = hierarchy.find(
      (slice) => slice.candidateId === candidateId && slice.dimension === "overall",
    );

    if (governance && governance.score < 0.58) {
      notes.push({
        id: `${candidateId}:governance-watch`,
        candidateId,
        dimension: "governance",
        severity: "priority",
        message:
          "Governance weight is below the watch threshold; keep fail-closed handling and provenance visible.",
        sourceWeightIds: governance.leadingAttributeIds,
      });
    }

    if (usability && usability.score < 0.58) {
      notes.push({
        id: `${candidateId}:usability-watch`,
        candidateId,
        dimension: "usability",
        severity: "watch",
        message:
          "Usability weight is trailing; simplify the entry path and reduce friction in exposed surfaces.",
        sourceWeightIds: usability.leadingAttributeIds,
      });
    }

    if (observability && observability.score < 0.6) {
      notes.push({
        id: `${candidateId}:observability-watch`,
        candidateId,
        dimension: "observability",
        severity: "watch",
        message:
          "Observability weight is thin; increase credit visibility and formula-ready row output.",
        sourceWeightIds: observability.leadingAttributeIds,
      });
    }

    if (overall && overall.score >= 0.74) {
      notes.push({
        id: `${candidateId}:overall-ready`,
        candidateId,
        dimension: "overall",
        severity: "info",
        message:
          "Overall profile is stable enough to compile into multiple forms without losing hierarchy clarity.",
        sourceWeightIds: overall.leadingAttributeIds,
      });
    }
  }

  return notes;
}

function observationHint(dimension: IntegrationDimension | "overall"): string {
  switch (dimension) {
    case "governance":
      return "Keep provenance, override paths, and failure boundaries in view.";
    case "usability":
      return "Favor plain labels and pointed entry cues without flattening the hierarchy.";
    case "integration":
      return "Show where tool calls and adapters fit naturally before broadening scope.";
    case "observability":
      return "Credit every row and preserve machine-readable columns for downstream formulas.";
    case "operational_fit":
      return "Keep responsibility exclusive and argv shapes narrow enough to stay legible.";
    case "overall":
      return "Use the overall ranking as the summary surface, not as a replacement for per-dimension detail.";
  }
}

function deriveObservations(hierarchy: HierarchySlice[]): ObservationNote[] {
  const notes: ObservationNote[] = [];
  const candidateIds = [...new Set(hierarchy.map((slice) => slice.candidateId))];

  for (const candidateId of candidateIds) {
    const dominant = leadingDimension(candidateId, hierarchy);
    const overall = hierarchy.find(
      (slice) => slice.candidateId === candidateId && slice.dimension === "overall",
    );

    if (dominant) {
      notes.push({
        id: `${candidateId}:${dominant.dimension}:observation`,
        candidateId,
        dimension: dominant.dimension,
        message: `${dominant.dimension} currently defines the strongest vertical surface for this candidate.`,
        surfaceHint: observationHint(dominant.dimension),
        sourceSliceIds: [dominant.id],
      });
    }

    if (overall) {
      notes.push({
        id: `${candidateId}:overall:observation`,
        candidateId,
        dimension: "overall",
        message: `Overall score ${overall.score.toFixed(3)} holds rank ${overall.rank} in the current analog hierarchy.`,
        surfaceHint: observationHint("overall"),
        sourceSliceIds: [overall.id],
      });
    }
  }

  return notes;
}

function summarizeResult(candidates: EligibilityCandidate[], hierarchy: HierarchySlice[]): string {
  const overall = hierarchy
    .filter((slice) => slice.dimension === "overall")
    .sort((left, right) => left.rank - right.rank);
  const top = overall[0];
  const candidate = candidates.find((entry) => entry.id === top?.candidateId);

  if (!top || !candidate) {
    return "No eligible candidate hierarchy was produced.";
  }

  const dominant = leadingDimension(candidate.id, hierarchy);
  return `${candidate.label} leads the current hierarchy with overall score ${top.score.toFixed(3)}. The dominant vertical dimension is ${dominant?.dimension ?? "unknown"}.`;
}

// ── Struggle point derivation ──

const STRUGGLE_THRESHOLDS: Record<IntegrationDimension, number> = {
  governance: 0.58,
  usability: 0.58,
  integration: 0.65,
  observability: 0.6,
  operational_fit: 0.6,
};

const PROXIMITY_MAP: Record<IntegrationDimension, IntegrationDimension[]> = {
  governance: ["observability", "operational_fit"],
  usability: ["integration", "observability"],
  integration: ["usability", "governance"],
  observability: ["governance", "integration"],
  operational_fit: ["governance", "usability"],
};

function deriveStrugglePoints(
  hierarchy: HierarchySlice[],
  conditions: ConditionNote[],
  seed: string,
): StrugglePoint[] {
  const points: StrugglePoint[] = [];
  const candidateIds = [...new Set(hierarchy.map((s) => s.candidateId))];

  for (const candidateId of candidateIds) {
    for (const dim of DIMENSIONS) {
      const slice = hierarchy.find(
        (s) => s.candidateId === candidateId && s.dimension === dim,
      );
      if (!slice) continue;

      const threshold = STRUGGLE_THRESHOLDS[dim];
      const distance = slice.score - threshold;

      // Struggle fires when score is below or near threshold
      if (distance >= 0.1) continue;

      const condition = conditions.find(
        (c) => c.candidateId === candidateId && c.dimension === dim,
      );

      // G: grounding score based on how directly measured the struggle is
      const g = condition
        ? (condition.severity === "priority" ? 1.0 : condition.severity === "watch" ? 0.8 : 0.6)
        : (distance < 0 ? 0.7 : 0.5);

      // Trace opacity from G
      const traceOpacity = g >= 0.9 ? 0 : g >= 0.7 ? 1 : g >= 0.5 ? 2 : g >= 0.3 ? 3 : 4;

      // State from distance to threshold
      const state = distance < -0.15 ? "sealed" as const
        : distance < 0 ? "active" as const
        : distance < 0.05 ? "transitioning" as const
        : "dormant" as const;

      // Cool step from G (high G = well-attested struggle = warm/open, low G = speculative = deep/closed)
      const coolStep = g >= 0.9 ? 100 : g >= 0.7 ? 300 : g >= 0.5 ? 500 : g >= 0.3 ? 700 : 900;

      points.push({
        id: `${candidateId}:${dim}:struggle`,
        candidateId,
        dimension: dim,
        severity: condition?.severity ?? "info",
        message: condition?.message
          ?? `${dim} score ${slice.score.toFixed(3)} is within struggle range of threshold ${threshold}.`,
        seed,
        g,
        score: slice.score,
        threshold,
        proximity: PROXIMITY_MAP[dim],
        sourceIds: slice.leadingAttributeIds,
        tokens: {
          traceOpacity: traceOpacity as 0 | 1 | 2 | 3 | 4,
          state,
          coolStep: coolStep as 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900,
        },
      });
    }
  }

  return points;
}

function initialState(
  candidates: EligibilityCandidate[],
  args: RoutineArgs,
  seed: string,
  argvSignature: string,
): EligibilityState {
  return {
    args,
    argvSignature,
    seed,
    candidates,
    catalog: [],
    weights: [],
    hierarchy: [],
    conditions: [],
    observations: [],
    strugglePoints: [],
    forms: [],
    table: {
      columns: [],
      rows: [],
      generatedAt: buildDeterministicTimestamp(seed, argvSignature),
    },
    summary: "",
  };
}

function normalizeArgsPass(): Pass<EligibilityState> {
  return {
    id: "normalize-runtime-args",
    description: "Clamp and stabilize routine args",
    execute(input: PassInput<EligibilityState>) {
      const args = normalizeRoutineArgs(input.state.args);
      const argvSignature = buildArgvSignature(args);
      const seed = buildSeed(input.state.candidates, args);
      return {
        state: {
          ...input.state,
          args,
          argvSignature,
          seed,
          table: {
            ...input.state.table,
            generatedAt: buildDeterministicTimestamp(seed, argvSignature),
          },
        },
        deposit: { argvSignature, seed, args },
      };
    },
  };
}

function catalogPass(): Pass<EligibilityState> {
  return {
    id: "build-attribute-catalog",
    description: "Attach default eligibility attributes",
    execute(input: PassInput<EligibilityState>) {
      const catalog = getDefaultAttributeCatalog();
      return {
        state: { ...input.state, catalog },
        deposit: { attributeCount: catalog.length },
      };
    },
  };
}

function weightPass(): Pass<EligibilityState> {
  return {
    id: "derive-analog-weights",
    description: "Derive seeded analog weights from args, seed, and candidate properties",
    execute(input: PassInput<EligibilityState>) {
      const weights = scoreWeights(
        input.state.candidates,
        input.state.catalog,
        input.state.args,
        input.state.seed,
        input.state.argvSignature,
      );
      return {
        state: { ...input.state, weights },
        deposit: { weightCount: weights.length },
      };
    },
  };
}

function hierarchyPass(): Pass<EligibilityState> {
  return {
    id: "project-vertical-hierarchy",
    description: "Project dimension and overall hierarchy slices",
    execute(input: PassInput<EligibilityState>) {
      const hierarchy = deriveHierarchy(input.state.weights, input.state.args);
      return {
        state: { ...input.state, hierarchy },
        deposit: {
          hierarchyCount: hierarchy.length,
          topCandidateIds: hierarchy
            .filter((slice) => slice.dimension === "overall")
            .sort((left, right) => left.rank - right.rank)
            .slice(0, 3)
            .map((slice) => slice.candidateId),
        },
      };
    },
  };
}

function conditionPass(): Pass<EligibilityState> {
  return {
    id: "derive-condition-notes",
    description: "Derive condition notes from hierarchy thresholds",
    execute(input: PassInput<EligibilityState>) {
      const conditions = deriveConditions(input.state.hierarchy);
      return {
        state: { ...input.state, conditions },
        deposit: { conditionCount: conditions.length },
      };
    },
  };
}

function observationPass(): Pass<EligibilityState> {
  return {
    id: "derive-observation-notes",
    description: "Attach observation notes and UI/UX-grounded surface hints",
    execute(input: PassInput<EligibilityState>) {
      const observations = deriveObservations(input.state.hierarchy);
      const summary = summarizeResult(input.state.candidates, input.state.hierarchy);
      return {
        state: { ...input.state, observations, summary },
        deposit: { observationCount: observations.length, summary },
      };
    },
  };
}

function strugglePass(): Pass<EligibilityState> {
  return {
    id: "derive-struggle-points",
    description:
      "Derive struggle points as first-class connective nodes with G, seed, and proximity",
    execute(input: PassInput<EligibilityState>) {
      const strugglePoints = deriveStrugglePoints(
        input.state.hierarchy,
        input.state.conditions,
        input.state.seed,
      );
      return {
        state: { ...input.state, strugglePoints },
        deposit: {
          struggleCount: strugglePoints.length,
          dimensions: [...new Set(strugglePoints.map((p) => p.dimension))],
          proximityPairs: strugglePoints.flatMap((p) =>
            p.proximity.map((prox) => `${p.dimension}→${prox}`),
          ),
        },
      };
    },
  };
}

function formsPass(): Pass<EligibilityState> {
  return {
    id: "compile-reusable-forms",
    description:
      "Compile runtime-backed result into server, rule, agent, skill, and reference forms",
    execute(input: PassInput<EligibilityState>) {
      const forms = compileFormArtifacts({
        args: input.state.args,
        seed: input.state.seed,
        argvSignature: input.state.argvSignature,
        candidateIds: input.state.candidates.map((candidate) => candidate.id),
        hierarchy: input.state.hierarchy,
        conditions: input.state.conditions,
        observations: input.state.observations,
        summary: input.state.summary,
      });
      return {
        state: { ...input.state, forms },
        deposit: { formCount: forms.length, formKinds: forms.map((form) => form.kind) },
      };
    },
  };
}

function tablePass(): Pass<EligibilityState> {
  return {
    id: "emit-collection-table",
    description: "Emit row and column output with provenance credit",
    execute(input: PassInput<EligibilityState>) {
      const table = buildCollectionTable({
        args: input.state.args,
        argvSignature: input.state.argvSignature,
        seed: input.state.seed,
        weights: input.state.weights,
        hierarchy: input.state.hierarchy,
        conditions: input.state.conditions,
        observations: input.state.observations,
        generatedAt: input.state.table.generatedAt,
      });

      return {
        state: { ...input.state, table },
        deposit: { rowCount: table.rows.length, columnCount: table.columns.length },
      };
    },
  };
}

export function normalizeRoutineArgs(args: Partial<RoutineArgs> = {}): RoutineArgs {
  return {
    governance: normalizeBias(args.governance),
    usability: normalizeBias(args.usability),
    integration: normalizeBias(args.integration),
    observability: normalizeBias(args.observability),
    operationalFit: normalizeBias(args.operationalFit),
    seed: sanitizeSeed(args.seed),
    formTarget: normalizeFormTarget(args.formTarget),
    tableScope: normalizeTableScope(args.tableScope),
  };
}

export function validateCandidates(
  candidates: EligibilityCandidate[],
): EligibilityValidationResult {
  const issues: string[] = [];

  if (candidates.length === 0) {
    issues.push("At least one candidate is required.");
  }

  const seenIds = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate.id.trim()) {
      issues.push("Candidate ids must be non-empty.");
    }
    if (seenIds.has(candidate.id)) {
      issues.push(`Duplicate candidate id: ${candidate.id}`);
    }
    seenIds.add(candidate.id);
    if (candidate.properties.length === 0) {
      issues.push(`Candidate ${candidate.id} must provide at least one property.`);
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    candidateCount: candidates.length,
  };
}

export function buildRoutinePipeline(): ReturnType<typeof createPipeline<EligibilityState>> {
  return createPipeline(ROUTINE_PIPELINE_ID, [
    normalizeArgsPass(),
    catalogPass(),
    weightPass(),
    hierarchyPass(),
    conditionPass(),
    observationPass(),
    strugglePass(),
    formsPass(),
    tablePass(),
  ]);
}

export function explainHierarchy(result: RoutineResult): string {
  const topOverall = result.hierarchy
    .filter((slice) => slice.dimension === "overall")
    .sort((left, right) => left.rank - right.rank)
    .slice(0, 3)
    .map((slice) => `${slice.rank}. ${slice.candidateId} (${slice.score.toFixed(3)})`)
    .join("\n");

  const topCondition = result.conditions[0]?.message ?? "none";
  const topObservation = result.observations[0]?.message ?? "none";

  return [
    result.summary,
    "",
    "Top overall hierarchy:",
    topOverall || "none",
    "",
    `Top condition: ${topCondition}`,
    `Top observation: ${topObservation}`,
  ].join("\n");
}

export function evaluateRoutine(
  candidates: EligibilityCandidate[],
  args: Partial<RoutineArgs> = {},
): RoutineResult {
  const normalizedArgs = normalizeRoutineArgs(args);
  const argvSignature = buildArgvSignature(normalizedArgs);
  const seed = buildSeed(candidates, normalizedArgs);
  const pipeline = buildRoutinePipeline();
  const pipelineResult = pipeline.run(
    initialState(candidates, normalizedArgs, seed, argvSignature),
  );

  return {
    pipelineId: pipelineResult.pipelineId,
    passCount: pipelineResult.passCount,
    durationMs: pipelineResult.durationMs,
    args: pipelineResult.state.args,
    argvSignature: pipelineResult.state.argvSignature,
    seed: pipelineResult.state.seed,
    candidates: pipelineResult.state.candidates,
    catalog: pipelineResult.state.catalog,
    weights: pipelineResult.state.weights,
    hierarchy: pipelineResult.state.hierarchy,
    conditions: pipelineResult.state.conditions,
    observations: pipelineResult.state.observations,
    strugglePoints: pipelineResult.state.strugglePoints,
    forms: pipelineResult.state.forms,
    table: pipelineResult.state.table,
    residue: pipelineResult.residue,
    summary: pipelineResult.state.summary,
  };
}

export function safeEvaluateRoutine(
  candidates: EligibilityCandidate[],
  args: Partial<RoutineArgs> = {},
): SafeRoutineEvaluation {
  const validation = validateCandidates(candidates);
  if (!validation.ok) {
    return { validation, result: null };
  }

  return {
    validation,
    result: evaluateRoutine(candidates, args),
  };
}

export function resolveCandidates(input?: {
  candidate?: EligibilityCandidate;
  fixtureId?: string;
  fixtureIds?: string[];
}): EligibilityCandidate[] {
  if (input?.candidate) {
    return [input.candidate];
  }

  if (input?.fixtureId) {
    const fixture = getFixtureCandidates().find((candidate) => candidate.id === input.fixtureId);
    return fixture ? [fixture] : [];
  }

  if (input?.fixtureIds && input.fixtureIds.length > 0) {
    const fixtures = getFixtureCandidates();
    return input.fixtureIds
      .map((fixtureId) => fixtures.find((candidate) => candidate.id === fixtureId))
      .filter((candidate): candidate is EligibilityCandidate => Boolean(candidate));
  }

  return [];
}

export function latestDeposit(
  residue: ResidueStack,
  passId: string,
): Record<string, unknown> | undefined {
  return findResidue(residue, passId)?.data as Record<string, unknown> | undefined;
}

export { ROUTINE_PIPELINE_ID, buildArgvSignature, buildDeterministicTimestamp };
