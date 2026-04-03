import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GroundingProvider,
  LocalGroundingProvider,
  ContextWindowGroundingProvider,
  WebGroundingProvider,
  selectGroundingProvider,
  applyGrounding,
  applyGroundingAsync,
} from "../core/grounding.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeContext(overrides = {}) {
  return {
    entities: [],
    relations: [],
    evidences: [],
    inferenceGaps: [],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GroundingProvider (base)
// ─────────────────────────────────────────────────────────────────────────────

describe("GroundingProvider (base)", () => {
  it("verify returns unimplemented stub", () => {
    const p = new GroundingProvider();
    const result = p.verify({}, {});
    assert.equal(result.confirmed, false);
    assert.equal(result.confidence, 0);
    assert.equal(result.basis, "unimplemented");
  });

  it("getCapabilities returns empty array", () => {
    assert.deepEqual(new GroundingProvider().getCapabilities(), []);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LocalGroundingProvider
// ─────────────────────────────────────────────────────────────────────────────

describe("LocalGroundingProvider", () => {
  it("reports capabilities", () => {
    const caps = new LocalGroundingProvider().getCapabilities();
    assert.ok(caps.includes("entity-cross-ref"));
    assert.ok(caps.includes("relation-validation"));
    assert.equal(caps.length, 4);
  });

  it("returns no-evidence basis when claim has no evidence or relations", () => {
    const provider = new LocalGroundingProvider();
    const result = provider.verify({ text: "test", evidenceIds: [] }, makeContext());
    assert.equal(result.basis, "no-evidence");
    assert.equal(result.confidence, 0.25);
    assert.equal(result.confirmed, false);
  });

  it("boosts confidence for multi-source agreement", () => {
    const provider = new LocalGroundingProvider();
    const evidences = [
      { id: "ev-1", sourceRuleId: "r-1", confidence: 0.7 },
      { id: "ev-2", sourceRuleId: "r-2", confidence: 0.8 },
    ];
    const result = provider.verify(
      { text: "test", evidenceIds: ["ev-1", "ev-2"] },
      makeContext({ evidences }),
    );
    assert.ok(result.confidence > 0.5);
    assert.ok(result.basis.includes("multi-source"));
    assert.equal(result.confirmed, true);
  });

  it("boosts confidence for well-connected entities", () => {
    const provider = new LocalGroundingProvider();
    const relations = [
      { source: "e-1", target: "e-2" },
      { source: "e-1", target: "e-3" },
    ];
    const result = provider.verify(
      { text: "test", entityId: "e-1", evidenceIds: [] },
      makeContext({ relations }),
    );
    assert.ok(result.basis.includes("connected"));
  });

  it("boosts confidence when filling an inference gap", () => {
    const provider = new LocalGroundingProvider();
    const inferenceGaps = [{ affectedIds: ["e-1"] }];
    const relations = [
      { source: "e-1", target: "e-2" },
      { source: "e-1", target: "e-3" },
    ];
    const result = provider.verify(
      { text: "test", entityId: "e-1", evidenceIds: [] },
      makeContext({ relations, inferenceGaps }),
    );
    assert.ok(result.basis.includes("gap-filling"));
  });

  it("penalizes contradictions", () => {
    const provider = new LocalGroundingProvider();
    const evidences = [
      {
        id: "ev-1",
        sourceRuleId: "r-1",
        confidence: 0.8,
        payload: { relationType: "supports" },
      },
      {
        id: "ev-2",
        sourceRuleId: "r-2",
        confidence: 0.8,
        payload: { relationType: "contradicts" },
      },
    ];
    const withContradiction = provider.verify(
      { text: "test", evidenceIds: ["ev-1", "ev-2"] },
      makeContext({ evidences }),
    );
    const withoutContradiction = provider.verify(
      { text: "test", evidenceIds: ["ev-1"] },
      makeContext({ evidences: [evidences[0]] }),
    );
    assert.ok(withContradiction.confidence < withoutContradiction.confidence + 0.25);
    assert.ok(withContradiction.basis.includes("contradictions"));
  });

  it("caps confidence at 0.95", () => {
    const provider = new LocalGroundingProvider();
    const evidences = Array.from({ length: 10 }, (_, i) => ({
      id: `ev-${i}`,
      sourceRuleId: `r-${i}`,
      confidence: 1.0,
    }));
    const relations = Array.from({ length: 10 }, (_, i) => ({
      source: "e-1",
      target: `e-${i + 2}`,
    }));
    const result = provider.verify(
      {
        text: "test",
        entityId: "e-1",
        evidenceIds: evidences.map((e) => e.id),
      },
      makeContext({ evidences, relations }),
    );
    assert.ok(result.confidence <= 0.95);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ContextWindowGroundingProvider
// ─────────────────────────────────────────────────────────────────────────────

describe("ContextWindowGroundingProvider", () => {
  it("reports session-memory capability", () => {
    const p = new ContextWindowGroundingProvider();
    assert.ok(p.getCapabilities().includes("session-memory"));
  });

  it("boosts confidence on session memory hit", () => {
    const memory = [{ text: "testing a claim about entity X" }];
    const p = new ContextWindowGroundingProvider(memory);
    const result = p.verify(
      { text: "testing a claim about entity X", evidenceIds: [] },
      makeContext(),
    );
    // Should be base (0.25 no-evidence) + 0.1 memory bonus
    assert.ok(result.basis.includes("session-memory"));
    assert.ok(result.confidence > 0.25);
  });

  it("falls back to local grounding when no memory match", () => {
    const p = new ContextWindowGroundingProvider([{ text: "unrelated" }]);
    const result = p.verify(
      { text: "something completely different", evidenceIds: [] },
      makeContext(),
    );
    assert.ok(!result.basis.includes("session-memory"));
  });

  it("defaults to empty session memory", () => {
    const p = new ContextWindowGroundingProvider();
    const result = p.verify({ text: "test", evidenceIds: [] }, makeContext());
    assert.equal(result.basis, "no-evidence");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WebGroundingProvider
// ─────────────────────────────────────────────────────────────────────────────

describe("WebGroundingProvider", () => {
  it("reports web-cross-reference capability", () => {
    const p = new WebGroundingProvider(() => []);
    assert.deepEqual(p.getCapabilities(), ["web-cross-reference"]);
  });

  it("returns no-search-function when searchFn is missing", async () => {
    const p = new WebGroundingProvider(null);
    const result = await p.verify({ text: "test" }, {});
    assert.equal(result.basis, "no-search-function");
    assert.equal(result.confidence, 0);
  });

  it("returns low confidence for web results", async () => {
    const searchFn = async () => [{ title: "result" }];
    const p = new WebGroundingProvider(searchFn);
    const result = await p.verify({ text: "test claim" }, {});
    assert.equal(result.confirmed, true);
    assert.equal(result.confidence, 0.35);
    assert.equal(result.basis, "web-cross-reference");
  });

  it("returns very low confidence for no web results", async () => {
    const searchFn = async () => [];
    const p = new WebGroundingProvider(searchFn);
    const result = await p.verify({ text: "obscure" }, {});
    assert.equal(result.confirmed, false);
    assert.equal(result.confidence, 0.1);
  });

  it("handles search errors gracefully", async () => {
    const searchFn = async () => {
      throw new Error("network down");
    };
    const p = new WebGroundingProvider(searchFn);
    const result = await p.verify({ text: "test" }, {});
    assert.equal(result.basis, "web-search-error");
    assert.equal(result.confidence, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// selectGroundingProvider
// ─────────────────────────────────────────────────────────────────────────────

describe("selectGroundingProvider", () => {
  it("returns LocalGroundingProvider by default", () => {
    const p = selectGroundingProvider("local", {});
    assert.ok(p instanceof LocalGroundingProvider);
  });

  it("returns ContextWindowGroundingProvider for session mode", () => {
    const p = selectGroundingProvider("session", { sessionMemory: [] });
    assert.ok(p instanceof ContextWindowGroundingProvider);
  });

  it("returns WebGroundingProvider for web mode with searchFn", () => {
    const fn = () => [];
    const p = selectGroundingProvider("web", { searchFn: fn });
    assert.ok(p instanceof WebGroundingProvider);
  });

  it("falls back to LocalGroundingProvider for web mode without searchFn", () => {
    const p = selectGroundingProvider("web", {});
    assert.ok(p instanceof LocalGroundingProvider);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// applyGrounding
// ─────────────────────────────────────────────────────────────────────────────

describe("applyGrounding", () => {
  it("attaches grounding results to insights", () => {
    const provider = new LocalGroundingProvider();
    const insights = [
      {
        compressed: "Entity X is notable",
        densityScore: 0.6,
        supportingEvidence: [],
      },
    ];
    const result = applyGrounding(provider, insights, makeContext());
    assert.equal(result.length, 1);
    assert.ok("grounding" in result[0]);
    assert.ok("adjustedConfidence" in result[0]);
    assert.equal(typeof result[0].grounding.confirmed, "boolean");
    assert.equal(typeof result[0].grounding.confidence, "number");
  });

  it("preserves original insight properties", () => {
    const provider = new LocalGroundingProvider();
    const insights = [
      {
        compressed: "test",
        original: "original text",
        densityScore: 0.5,
        supportingEvidence: [],
        custom: "keep",
      },
    ];
    const result = applyGrounding(provider, insights, makeContext());
    assert.equal(result[0].custom, "keep");
    assert.equal(result[0].original, "original text");
  });

  it("adjustedConfidence blends densityScore and grounding confidence", () => {
    const provider = new LocalGroundingProvider();
    const insights = [{ compressed: "test", densityScore: 0.8, supportingEvidence: [] }];
    const result = applyGrounding(provider, insights, makeContext());
    // 0.8 * 0.7 + groundingConf * 0.3
    const expected = Math.round((0.8 * 0.7 + result[0].grounding.confidence * 0.3) * 1000) / 1000;
    assert.equal(result[0].adjustedConfidence, expected);
  });

  it("handles empty insights array", () => {
    const provider = new LocalGroundingProvider();
    const result = applyGrounding(provider, [], makeContext());
    assert.deepEqual(result, []);
  });

  it("throws when an async provider is used on the sync path", () => {
    const provider = new WebGroundingProvider(async () => [{ title: "result" }]);
    assert.throws(
      () =>
        applyGrounding(
          provider,
          [{ compressed: "test", densityScore: 0.8, supportingEvidence: [] }],
          makeContext(),
        ),
      /applyGroundingAsync/,
    );
  });
});

describe("applyGroundingAsync", () => {
  it("awaits async grounding providers", async () => {
    const provider = new WebGroundingProvider(async () => [{ title: "result" }]);
    const insights = [
      {
        compressed: "Entity X is notable",
        densityScore: 0.6,
        supportingEvidence: [],
      },
    ];
    const result = await applyGroundingAsync(provider, insights, makeContext());
    assert.equal(result.length, 1);
    assert.equal(result[0].grounding.basis, "web-cross-reference");
    assert.equal(result[0].grounding.confirmed, true);
    assert.equal(result[0].adjustedConfidence, Math.round((0.6 * 0.7 + 0.35 * 0.3) * 1000) / 1000);
  });

  it("handles empty insights array", async () => {
    const provider = new WebGroundingProvider(async () => [{ title: "result" }]);
    const result = await applyGroundingAsync(provider, [], makeContext());
    assert.deepEqual(result, []);
  });
});
