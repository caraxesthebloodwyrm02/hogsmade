import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  scoreInsightDensity,
  compressInsight,
  findInvariantPatterns,
  rankByDensity,
} from "../core/compression.js";

const makeLenses = () => [
  { id: "physics", label: "Physics" },
  { id: "philosophy", label: "Philosophy" },
  { id: "social", label: "Social Science" },
];

const makeEvidences = () => [
  {
    id: "ev-1",
    sourceRuleId: "rule-a",
    confidence: 0.8,
    scope: "entity",
    targetId: "e-1",
    reason: "Strong physics signal detected.",
    payload: { lens: "physics" },
    affects: ["context_lens"],
  },
  {
    id: "ev-2",
    sourceRuleId: "rule-b",
    confidence: 0.7,
    scope: "entity",
    targetId: "e-1",
    reason: "Philosophy keywords found.",
    payload: { lens: "philosophy" },
    affects: ["context_lens"],
  },
  {
    id: "ev-3",
    sourceRuleId: "rule-a",
    confidence: 0.75,
    scope: "relation",
    targetId: "rel-1",
    reason: "Social dynamics pattern in physics context.",
    payload: { lens: "social", relationType: "shared-domain" },
    affects: ["relation"],
  },
  {
    id: "ev-4",
    sourceRuleId: "rule-c",
    confidence: 0.65,
    scope: "dataset",
    targetId: "dataset",
    reason: "Cross-domain bridging observed.",
    payload: {},
    affects: ["context_lens"],
  },
];

describe("scoreInsightDensity", () => {
  it("scores higher for insights covering more domains", () => {
    const evidences = makeEvidences();
    const lenses = makeLenses();

    const narrow = scoreInsightDensity(
      "Physics signal detected",
      ["ev-1"],
      evidences,
      lenses
    );
    const broad = scoreInsightDensity(
      "Cross-domain pattern",
      ["ev-1", "ev-2", "ev-3"],
      evidences,
      lenses
    );

    assert.ok(
      broad.coverageRatio >= narrow.coverageRatio,
      `broad coverage ${broad.coverageRatio} should >= narrow ${narrow.coverageRatio}`
    );
  });

  it("returns tokenCount", () => {
    const result = scoreInsightDensity(
      "Every action has an equal and opposite reaction",
      [],
      [],
      []
    );
    assert.ok(result.tokenCount > 0);
    assert.equal(result.tokenCount, 8);
  });

  it("returns 0 density for empty evidence", () => {
    const result = scoreInsightDensity("test", [], [], []);
    assert.equal(result.coverageRatio, 0);
  });
});

describe("compressInsight", () => {
  it("returns structured compressed insight", () => {
    const evidences = makeEvidences();
    const entities = [{ id: "e-1", name: "Newton" }, { id: "e-2", name: "Leibniz" }];
    const result = compressInsight(
      "Newton embodies physics and philosophy",
      ["ev-1", "ev-2"],
      { allEvidences: evidences, lenses: makeLenses(), entities }
    );

    assert.ok(result.compressed);
    assert.ok(result.densityScore >= 0);
    assert.ok(result.domainsValidated.length > 0);
    assert.ok(Array.isArray(result.counterexamples));
  });

  it("identifies uncovered entities as counterexamples", () => {
    const evidences = makeEvidences();
    const entities = [
      { id: "e-1", name: "Newton" },
      { id: "e-2", name: "Leibniz" },
      { id: "e-3", name: "Euler" },
    ];
    const result = compressInsight(
      "Physics insight",
      ["ev-1"], // only covers e-1
      { allEvidences: evidences, lenses: makeLenses(), entities }
    );
    assert.ok(
      result.counterexamples.includes("Leibniz") ||
      result.counterexamples.includes("Euler"),
      "Should include uncovered entities"
    );
  });
});

describe("findInvariantPatterns", () => {
  it("finds patterns from rules that fire multiple times", () => {
    const evidences = makeEvidences(); // rule-a fires twice (ev-1, ev-3)
    const patterns = findInvariantPatterns(evidences, [], [], makeLenses());

    assert.ok(patterns.length > 0, "Should find at least one pattern");
    const ruleA = patterns.find((p) => p.ruleId === "rule-a");
    assert.ok(ruleA, "rule-a fires twice, should be a pattern");
    assert.equal(ruleA.firingCount, 2);
  });

  it("ranks by density (coverage per token)", () => {
    const patterns = findInvariantPatterns(makeEvidences(), [], [], makeLenses());
    for (let i = 1; i < patterns.length; i++) {
      assert.ok(
        patterns[i - 1].densityScore >= patterns[i].densityScore ||
        patterns[i - 1].scope >= patterns[i].scope,
        "Should be sorted by density then scope"
      );
    }
  });

  it("skips rules with only 1 firing", () => {
    const evidences = [
      { id: "ev-1", sourceRuleId: "once-only", confidence: 0.9, scope: "entity", targetId: "e-1", reason: "test", payload: {} },
    ];
    const patterns = findInvariantPatterns(evidences, [], [], []);
    assert.equal(patterns.length, 0, "Single-firing rules should not produce patterns");
  });
});

describe("rankByDensity", () => {
  it("sorts by densityScore descending", () => {
    const items = [
      { densityScore: 0.3, invarianceScore: 0.5 },
      { densityScore: 0.8, invarianceScore: 0.2 },
      { densityScore: 0.5, invarianceScore: 0.9 },
    ];
    const ranked = rankByDensity(items);
    assert.equal(ranked[0].densityScore, 0.8);
    assert.equal(ranked[1].densityScore, 0.5);
    assert.equal(ranked[2].densityScore, 0.3);
  });

  it("uses invarianceScore as tiebreak", () => {
    const items = [
      { densityScore: 0.5, invarianceScore: 0.3 },
      { densityScore: 0.5, invarianceScore: 0.9 },
    ];
    const ranked = rankByDensity(items);
    assert.equal(ranked[0].invarianceScore, 0.9);
  });
});
