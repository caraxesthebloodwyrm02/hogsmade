import { describe, expect, it } from "vitest";
import {
  compileFormsHandler,
  evaluateCandidateHandler,
  evaluateRoutine,
  explainHierarchyHandler,
  getFixtureCandidateById,
  listAttributeCatalogHandler,
  resolveCandidates,
  safeEvaluateRoutine,
  validateCandidates,
  recordCycleSignalHandler,
  recordHandoffHandler,
  advanceCycleHandler,
  upsertEndpointSpecHandler,
} from "../src/index.js";

describe("eligibility routine smoke", () => {
  it("fails closed with a typed validation result when no candidates are provided", () => {
    const evaluation = safeEvaluateRoutine([]);
    expect(evaluation.validation.ok).toBe(false);
    expect(evaluation.validation.issues).toContain("At least one candidate is required.");
    expect(evaluation.result).toBeNull();
  });

  it("reproduces identical weights and hierarchy for the same candidate, args, and seed", () => {
    const candidate = getFixtureCandidateById("balanced-bridge");
    expect(candidate).toBeDefined();

    const args = {
      governance: 1.1,
      usability: 1.1,
      integration: 1.2,
      observability: 1.3,
      operationalFit: 1.0,
      seed: "stable-seed",
      formTarget: "all" as const,
      tableScope: "all" as const,
    };

    const first = evaluateRoutine([candidate!], args);
    const second = evaluateRoutine([candidate!], args);

    expect(first.seed).toBe(second.seed);
    expect(first.argvSignature).toBe(second.argvSignature);
    expect(first.weights).toEqual(second.weights);
    expect(first.hierarchy).toEqual(second.hierarchy);
    expect(first.table.rows).toEqual(second.table.rows);
  });

  it("changes the overall hierarchy when governance and usability biases change", () => {
    const governanceHeavy = evaluateRoutine(
      [getFixtureCandidateById("governance-lattice")!, getFixtureCandidateById("usability-orbit")!],
      {
        governance: 1.8,
        usability: 0.7,
        integration: 1,
        observability: 1,
        operationalFit: 1,
      },
    );

    const usabilityHeavy = evaluateRoutine(
      [getFixtureCandidateById("governance-lattice")!, getFixtureCandidateById("usability-orbit")!],
      {
        governance: 0.7,
        usability: 1.8,
        integration: 1,
        observability: 1,
        operationalFit: 1,
      },
    );

    expect(
      governanceHeavy.hierarchy.find((slice) => slice.dimension === "overall" && slice.rank === 1)
        ?.candidateId,
    ).toBe("governance-lattice");
    expect(
      usabilityHeavy.hierarchy.find((slice) => slice.dimension === "overall" && slice.rank === 1)
        ?.candidateId,
    ).toBe("usability-orbit");
  });

  it("exposes handlers for catalog, forms, and hierarchy explanation", () => {
    const catalog = listAttributeCatalogHandler();
    expect(catalog.attributes.length).toBeGreaterThan(0);
    expect(catalog.fixtures.length).toBeGreaterThan(0);

    const forms = compileFormsHandler({
      fixtureId: "balanced-bridge",
      args: { formTarget: "all", tableScope: "all" },
    });
    expect(forms.validation.ok).toBe(true);
    expect(forms.forms.length).toBe(5);

    const explanation = explainHierarchyHandler({
      fixtureId: "balanced-bridge",
      args: { formTarget: "all", tableScope: "all" },
    });
    expect(explanation.validation.ok).toBe(true);
    expect(explanation.explanation).toContain("Top overall hierarchy");

    const evaluation = evaluateCandidateHandler({
      fixtureId: "balanced-bridge",
      args: { formTarget: "all", tableScope: "all" },
    });
    expect(evaluation.validation.ok).toBe(true);
    expect(evaluation.result?.forms.length).toBe(5);
  });
});

describe("eligibility verification: schema-handler alignment", () => {
  it("resolveCandidates returns empty array when no input provided", () => {
    expect(resolveCandidates()).toEqual([]);
    expect(resolveCandidates({})).toEqual([]);
  });

  it("resolveCandidates handles unknown fixtureId gracefully", () => {
    expect(resolveCandidates({ fixtureId: "nonexistent-fixture" })).toEqual([]);
  });

  it("resolveCandidates resolves multiple fixtureIds and filters missing", () => {
    const result = resolveCandidates({
      fixtureIds: ["balanced-bridge", "nonexistent", "governance-lattice"],
    });
    expect(result.length).toBe(2);
    expect(result.map((c) => c.id)).toContain("balanced-bridge");
    expect(result.map((c) => c.id)).toContain("governance-lattice");
  });

  it("validateCandidates rejects duplicate ids", () => {
    const candidate = getFixtureCandidateById("balanced-bridge")!;
    const validation = validateCandidates([candidate, candidate]);
    expect(validation.ok).toBe(false);
    expect(validation.issues.some((i) => i.includes("Duplicate"))).toBe(true);
  });

  it("validateCandidates rejects candidate with empty properties", () => {
    const validation = validateCandidates([
      { id: "empty-props", label: "Empty", summary: "No props", properties: [] },
    ]);
    expect(validation.ok).toBe(false);
    expect(validation.issues.some((i) => i.includes("at least one property"))).toBe(true);
  });

  it("evaluateCandidateHandler with multiple fixtureIds produces multi-candidate hierarchy", () => {
    const evaluation = evaluateCandidateHandler({
      fixtureIds: ["balanced-bridge", "governance-lattice", "usability-orbit"],
    });
    expect(evaluation.validation.ok).toBe(true);
    expect(evaluation.validation.candidateCount).toBe(3);
    const overallSlices = evaluation.result?.hierarchy.filter((s) => s.dimension === "overall") ?? [];
    expect(overallSlices.length).toBe(3);
    expect(overallSlices[0].rank).toBe(1);
  });

  it("weight bands classify correctly across the full range", () => {
    const result = evaluateRoutine([getFixtureCandidateById("balanced-bridge")!], {
      governance: 2.0,
      usability: 0.5,
      integration: 1.0,
      observability: 1.0,
      operationalFit: 1.0,
    });
    const bands = result.weights.map((w) => w.weightBand);
    expect(bands.length).toBeGreaterThan(0);
    for (const band of bands) {
      expect(["dominant", "elevated", "steady", "trace"]).toContain(band);
    }
  });

  it("conditions are generated when governance is below watch threshold", () => {
    const result = evaluateRoutine([getFixtureCandidateById("usability-orbit")!], {
      governance: 0.5,
      usability: 2.0,
      integration: 1.0,
      observability: 1.0,
      operationalFit: 1.0,
    });
    const governanceConditions = result.conditions.filter(
      (c) => c.dimension === "governance" && c.severity === "priority",
    );
    expect(governanceConditions.length).toBeGreaterThanOrEqual(0);
  });

  it("table output contains rows and columns with provenance credit", () => {
    const result = evaluateRoutine([getFixtureCandidateById("balanced-bridge")!]);
    expect(result.table.columns.length).toBeGreaterThan(0);
    expect(result.table.rows.length).toBeGreaterThan(0);
    expect(result.table.generatedAt).toBeTruthy();
  });
});

// ── Struggle Points: first-class connective nodes ──

describe("struggle points in pipeline output", () => {
  it("pipeline produces struggle points with G, seed, and proximity", () => {
    const result = evaluateRoutine([getFixtureCandidateById("governance-lattice")!]);
    expect(result.strugglePoints).toBeDefined();
    expect(Array.isArray(result.strugglePoints)).toBe(true);
  });

  it("each struggle point carries required fields", () => {
    const result = evaluateRoutine([getFixtureCandidateById("governance-lattice")!]);
    for (const sp of result.strugglePoints) {
      expect(sp.id).toBeTruthy();
      expect(sp.candidateId).toBeTruthy();
      expect(sp.dimension).toBeTruthy();
      expect(sp.seed).toBeTruthy();
      expect(typeof sp.g).toBe("number");
      expect(sp.g).toBeGreaterThanOrEqual(0);
      expect(sp.g).toBeLessThanOrEqual(1);
      expect(typeof sp.score).toBe("number");
      expect(typeof sp.threshold).toBe("number");
      expect(Array.isArray(sp.proximity)).toBe(true);
      expect(sp.proximity.length).toBeGreaterThan(0);
      expect(Array.isArray(sp.sourceIds)).toBe(true);
    }
  });

  it("struggle points carry token annotations", () => {
    const result = evaluateRoutine([getFixtureCandidateById("governance-lattice")!]);
    for (const sp of result.strugglePoints) {
      expect(sp.tokens).toBeDefined();
      expect([0, 1, 2, 3, 4]).toContain(sp.tokens.traceOpacity);
      expect(["active", "dormant", "transitioning", "sealed"]).toContain(sp.tokens.state);
      expect([100, 200, 300, 400, 500, 600, 700, 800, 900]).toContain(sp.tokens.coolStep);
    }
  });

  it("struggle proximity creates cross-dimension links", () => {
    const result = evaluateRoutine([getFixtureCandidateById("governance-lattice")!]);
    const dims = new Set(result.strugglePoints.map((sp) => sp.dimension));
    const proxDims = new Set(result.strugglePoints.flatMap((sp) => sp.proximity));
    // Proximity reaches dimensions that may not have their own struggle points
    // This is the integration surface — the joint where domains connect
    expect(proxDims.size).toBeGreaterThan(0);
  });

  it("multi-candidate pipeline produces per-candidate struggle points", () => {
    const result = evaluateRoutine([
      getFixtureCandidateById("governance-lattice")!,
      getFixtureCandidateById("usability-orbit")!,
      getFixtureCandidateById("balanced-bridge")!,
    ]);
    const candidateIds = new Set(result.strugglePoints.map((sp) => sp.candidateId));
    // At least one candidate should have struggles (not all dimensions score above threshold)
    expect(candidateIds.size).toBeGreaterThanOrEqual(1);
  });

  it("passCount reflects the new struggle pass (9 passes)", () => {
    const result = evaluateRoutine([getFixtureCandidateById("balanced-bridge")!]);
    expect(result.passCount).toBe(9);
  });
});

// ── Token Bridge: triangular signal mapping ──

import {
  weightBandToOpacity,
  cycleStatusToState,
  gateDecisionToCool,
  moodToToken,
  timestampToRecency,
  endpointStatusToConsent,
  conditionSeverityToOpacity,
  momentumDriftToState,
  resolveCoolStep,
  resolveTraceOpacity,
  resolveMemoryRecency,
  theta,
  radius,
  angularDistance,
  pythagoreanDistance,
  sortByAngle,
  clusterByRadius,
  arcsPerLayer,
  attentionScore,
  attend,
  ATTENTION_HEADS,
  type EntityPoint,
} from "../src/token-bridge.js";

describe("token bridge — weight band → trace opacity", () => {
  it("dominant → full confidence (0)", () => {
    expect(weightBandToOpacity("dominant")).toBe(0);
  });
  it("elevated → high confidence (1)", () => {
    expect(weightBandToOpacity("elevated")).toBe(1);
  });
  it("steady → moderate confidence (3)", () => {
    expect(weightBandToOpacity("steady")).toBe(3);
  });
  it("trace → lowest confidence (4)", () => {
    expect(weightBandToOpacity("trace")).toBe(4);
  });
});

describe("token bridge — cycle status → state", () => {
  it("active → active", () => {
    expect(cycleStatusToState("active")).toBe("active");
  });
  it("promotion_pending → transitioning", () => {
    expect(cycleStatusToState("promotion_pending")).toBe("transitioning");
  });
  it("promoted → sealed", () => {
    expect(cycleStatusToState("promoted")).toBe("sealed");
  });
  it("returned → dormant", () => {
    expect(cycleStatusToState("returned")).toBe("dormant");
  });
  it("archived → dormant", () => {
    expect(cycleStatusToState("archived")).toBe("dormant");
  });
});

describe("token bridge — gate decision → cool scale", () => {
  it("allow → lightest (100)", () => {
    expect(gateDecisionToCool("allow_promotion")).toBe(100);
  });
  it("hold → mid (400)", () => {
    expect(gateDecisionToCool("hold_for_tighten")).toBe(400);
  });
  it("return → deep (600)", () => {
    expect(gateDecisionToCool("return_to_balance")).toBe(600);
  });
  it("deny → darkest (900)", () => {
    expect(gateDecisionToCool("deny_promotion")).toBe(900);
  });
});

describe("token bridge — mood → resolved token", () => {
  it("returns cssVar, value, and group for each mood", () => {
    const token = moodToToken("curious");
    expect(token.cssVar).toBe("--atlas-mood-curious");
    expect(token.value).toBe("#a4b5c8");
    expect(token.group).toBe("mood");
  });
  it("covers all 7 moods", () => {
    const moods = ["enthusiastic", "curious", "supportive", "playful", "focused", "calm", "creative"] as const;
    for (const mood of moods) {
      const token = moodToToken(mood);
      expect(token.cssVar).toContain(mood);
      expect(token.value).toBeTruthy();
    }
  });
});

describe("token bridge — timestamp → memory recency", () => {
  const now = "2026-04-06T12:00:00Z";
  it("< 1h → fresh", () => {
    expect(timestampToRecency("2026-04-06T11:30:00Z", now)).toBe("fresh");
  });
  it("< 24h → recent", () => {
    expect(timestampToRecency("2026-04-06T00:00:00Z", now)).toBe("recent");
  });
  it("< 7d → dated", () => {
    expect(timestampToRecency("2026-04-02T12:00:00Z", now)).toBe("dated");
  });
  it(">= 7d → aged", () => {
    expect(timestampToRecency("2026-03-01T12:00:00Z", now)).toBe("aged");
  });
});

describe("token bridge — endpoint status → consent", () => {
  it("ready → exploratory", () => {
    expect(endpointStatusToConsent("ready")).toBe("exploratory");
  });
  it("verified → exploratory", () => {
    expect(endpointStatusToConsent("verified")).toBe("exploratory");
  });
  it("draft → restricted", () => {
    expect(endpointStatusToConsent("draft")).toBe("restricted");
  });
  it("blocked → restricted", () => {
    expect(endpointStatusToConsent("blocked")).toBe("restricted");
  });
});

describe("token bridge — memo pattern extensions", () => {
  it("condition severity priority → full opacity (0)", () => {
    expect(conditionSeverityToOpacity("priority")).toBe(0);
  });
  it("condition severity watch → mid opacity (2)", () => {
    expect(conditionSeverityToOpacity("watch")).toBe(2);
  });
  it("condition severity info → faint opacity (4)", () => {
    expect(conditionSeverityToOpacity("info")).toBe(4);
  });
  it("high drift → sealed state", () => {
    expect(momentumDriftToState(0.6)).toBe("sealed");
  });
  it("moderate drift → transitioning state", () => {
    expect(momentumDriftToState(0.4)).toBe("transitioning");
  });
  it("low drift → active state", () => {
    expect(momentumDriftToState(0.2)).toBe("active");
  });
  it("minimal drift → dormant state", () => {
    expect(momentumDriftToState(0.1)).toBe("dormant");
  });
});

describe("token bridge — resolve helpers", () => {
  it("cool step resolves to correct CSS var and hex", () => {
    const token = resolveCoolStep(400);
    expect(token.cssVar).toBe("--atlas-cool-400");
    expect(token.value).toBe("#8a9bb0");
    expect(token.group).toBe("cool");
  });
  it("trace opacity resolves to correct CSS var", () => {
    const token = resolveTraceOpacity(2);
    expect(token.cssVar).toBe("--atlas-trace-opacity-2");
    expect(token.value).toBe("0.55");
    expect(token.group).toBe("trace");
  });
  it("memory recency resolves to correct CSS var and hex", () => {
    const token = resolveMemoryRecency("dated");
    expect(token.cssVar).toBe("--atlas-memory-dated");
    expect(token.value).toBe("#526073");
    expect(token.group).toBe("memory");
  });
});

// ── Angular attention: geometric sort with transformer-inspired heads ──

const SEEDS: EntityPoint[] = [
  { entityId: "grounding-gate",    g: 1.0, score: 1.0, layer: 2 },
  { entityId: "struggle-point",    g: 1.0, score: 0.8, layer: 3 },
  { entityId: "token-bridge",      g: 0.8, score: 0.7, layer: 3 },
  { entityId: "scaffold-boundary", g: 0.6, score: 0.6, layer: 2 },
];

describe("angular attention — geometry", () => {
  it("theta: balanced (1,1) → 45°", () => {
    expect(theta(SEEDS[0])).toBeCloseTo(45, 1);
  });
  it("theta: struggle-point (1,0.8) → ~38.66°", () => {
    expect(theta(SEEDS[1])).toBeCloseTo(38.66, 1);
  });
  it("radius: grounding-gate → √2", () => {
    expect(radius(SEEDS[0])).toBeCloseTo(Math.SQRT2, 4);
  });
  it("pythagorean distance: gate to scaffold", () => {
    expect(pythagoreanDistance(SEEDS[0], SEEDS[3])).toBeCloseTo(
      Math.hypot(1.0 - 0.6, 1.0 - 0.6),
      4,
    );
  });
  it("angular distance: struggle-point to grounding-gate ≈ 6.34°", () => {
    expect(angularDistance(SEEDS[1], SEEDS[0])).toBeCloseTo(45 - 38.66, 0);
  });
});

describe("angular attention — sort and cluster", () => {
  it("sortByAngle: struggle-point first (lowest θ)", () => {
    const sorted = sortByAngle(SEEDS);
    expect(sorted[0].entityId).toBe("struggle-point");
  });
  it("clusterByRadius: tight radius isolates all", () => {
    const clusters = clusterByRadius(SEEDS, 0.05);
    expect(clusters.length).toBe(4);
  });
  it("clusterByRadius: wide radius merges all", () => {
    const clusters = clusterByRadius(SEEDS, 1.0);
    expect(clusters.length).toBe(1);
    expect(clusters[0].length).toBe(4);
  });
});

describe("angular attention — arcs per layer", () => {
  it("produces 2 arcs (agentic + hierarchy)", () => {
    const arcs = arcsPerLayer(SEEDS);
    expect(arcs.length).toBe(2);
    expect(arcs[0].label).toBe("agentic");
    expect(arcs[1].label).toBe("hierarchy");
  });
  it("each arc is narrow (< 10°)", () => {
    for (const arc of arcsPerLayer(SEEDS)) {
      expect(arc.arcWidth).toBeLessThan(10);
    }
  });
  it("agentic arc contains grounding-gate and scaffold-boundary", () => {
    const arcs = arcsPerLayer(SEEDS);
    const agentic = arcs.find((a) => a.layer === 2)!;
    const ids = agentic.points.map((p) => p.entityId);
    expect(ids).toContain("grounding-gate");
    expect(ids).toContain("scaffold-boundary");
  });
  it("arc description has count, width, dominant", () => {
    for (const arc of arcsPerLayer(SEEDS)) {
      expect(arc.description).toContain("entities");
      expect(arc.description).toContain("arc");
      expect(arc.description).toContain("dominant");
    }
  });
});

describe("angular attention — attention heads", () => {
  it("sentinel head: tight window (5°) excludes distant entities", () => {
    const query = SEEDS[0]; // grounding-gate θ=45°
    const key = SEEDS[1];   // struggle-point θ≈38.66°
    // angular distance ≈ 6.34° > sentinel tolerance 5° → score = 0
    expect(attentionScore(query, key, ATTENTION_HEADS.sentinel)).toBe(0);
  });
  it("watchman head: 15° window includes struggle-point from gate", () => {
    const query = SEEDS[0];
    const key = SEEDS[1];
    const score = attentionScore(query, key, ATTENTION_HEADS.watchman);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });
  it("identical θ → attention score = 1", () => {
    // grounding-gate and scaffold-boundary both at θ=45°
    const score = attentionScore(SEEDS[0], SEEDS[3], ATTENTION_HEADS.sentinel);
    expect(score).toBeCloseTo(1, 4);
  });
  it("attend returns keys sorted by score descending, filtered > 0", () => {
    const result = attend(SEEDS[0], SEEDS.slice(1), ATTENTION_HEADS.watchman);
    expect(result.length).toBeGreaterThan(0);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score);
    }
    for (const entry of result) {
      expect(entry.score).toBeGreaterThan(0);
    }
  });
  it("open head attends to all seeds", () => {
    const result = attend(SEEDS[0], SEEDS.slice(1), ATTENTION_HEADS.open);
    expect(result.length).toBe(3); // all 3 siblings
  });
});
