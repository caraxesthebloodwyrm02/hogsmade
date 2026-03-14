import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createConfidenceFrame,
  recordInference,
  recordGap,
  detectGaps,
  calibrateConfidence,
  summarizeConfidence,
  GAP_TYPES,
} from "../core/confidence.js";

describe("createConfidenceFrame", () => {
  it("returns empty frame", () => {
    const frame = createConfidenceFrame();
    assert.deepEqual(frame.entries, []);
    assert.deepEqual(frame.gaps, []);
    assert.equal(frame.summary, null);
  });
});

describe("recordInference", () => {
  it("adds entry to frame", () => {
    const frame = createConfidenceFrame();
    recordInference(frame, {
      ruleId: "rule-1",
      claimed: "Entity is in domain X",
      basis: "taxonomy_score",
      confidence: 0.8,
    });
    assert.equal(frame.entries.length, 1);
    assert.equal(frame.entries[0].ruleId, "rule-1");
    assert.equal(frame.entries[0].confidence, 0.8);
  });

  it("uses defaults for missing fields", () => {
    const frame = createConfidenceFrame();
    recordInference(frame, {});
    assert.equal(frame.entries[0].ruleId, "unknown");
    assert.equal(frame.entries[0].confidence, 0.5);
  });
});

describe("recordGap", () => {
  it("adds gap to frame", () => {
    const frame = createConfidenceFrame();
    recordGap(frame, {
      type: GAP_TYPES.ORPHAN_ENTITY,
      description: "2 entities have no relations",
      severity: 0.4,
      affectedIds: ["e-1", "e-2"],
    });
    assert.equal(frame.gaps.length, 1);
    assert.equal(frame.gaps[0].type, "orphan_entity");
  });

  it("clamps severity to [0, 1]", () => {
    const frame = createConfidenceFrame();
    recordGap(frame, { severity: 5 });
    assert.equal(frame.gaps[0].severity, 1);
    recordGap(frame, { severity: -1 });
    assert.equal(frame.gaps[1].severity, 0);
  });
});

describe("detectGaps", () => {
  it("detects orphan entities", () => {
    const frame = createConfidenceFrame();
    const ctx = {
      entities: [
        { id: "e-1", dimensions: {} },
        { id: "e-2", dimensions: {} },
        { id: "e-3", dimensions: {} },
      ],
      relations: [{ source: "e-1", target: "e-2" }],
      evidences: [],
      profile: {},
    };
    detectGaps(frame, ctx);
    const orphanGap = frame.gaps.find(
      (g) => g.type === GAP_TYPES.ORPHAN_ENTITY
    );
    assert.ok(orphanGap, "Should detect orphan entity");
    assert.ok(orphanGap.affectedIds.includes("e-3"));
  });

  it("detects low dimension coverage", () => {
    const frame = createConfidenceFrame();
    const ctx = {
      entities: [
        { id: "e-1", dimensions: { time: 1990 } },
        { id: "e-2", dimensions: {} },
        { id: "e-3", dimensions: {} },
        { id: "e-4", dimensions: {} },
      ],
      relations: [],
      evidences: [],
      profile: {},
    };
    detectGaps(frame, ctx);
    const coverageGap = frame.gaps.find(
      (g) => g.type === GAP_TYPES.LOW_COVERAGE
    );
    assert.ok(coverageGap, "Should detect low time coverage (25%)");
  });

  it("detects weak evidence basis", () => {
    const frame = createConfidenceFrame();
    const ctx = {
      entities: [],
      relations: [],
      evidences: [
        { id: "ev-1", confidence: 0.3 },
        { id: "ev-2", confidence: 0.4 },
        { id: "ev-3", confidence: 0.2 },
      ],
      profile: {},
    };
    detectGaps(frame, ctx);
    const weakGap = frame.gaps.find((g) => g.type === GAP_TYPES.WEAK_BASIS);
    assert.ok(weakGap, "Should detect weak evidence basis");
  });
});

describe("calibrateConfidence", () => {
  it("returns raw value with no factors", () => {
    const result = calibrateConfidence(0.7);
    assert.ok(result >= 0.65 && result <= 0.75, `Got ${result}`);
  });

  it("boosts with multiple evidences", () => {
    const single = calibrateConfidence(0.7, { evidenceCount: 1 });
    const multi = calibrateConfidence(0.7, { evidenceCount: 4 });
    assert.ok(multi > single, `multi=${multi} should > single=${single}`);
  });

  it("boosts with cross-references", () => {
    const base = calibrateConfidence(0.7, { crossRefHits: 0 });
    const xref = calibrateConfidence(0.7, { crossRefHits: 2 });
    assert.ok(xref > base, `xref=${xref} should > base=${base}`);
  });

  it("penalizes low completeness", () => {
    const complete = calibrateConfidence(0.7, { completeness: 1 });
    const incomplete = calibrateConfidence(0.7, { completeness: 0.3 });
    assert.ok(
      complete > incomplete,
      `complete=${complete} should > incomplete=${incomplete}`
    );
  });

  it("never exceeds 1.0", () => {
    const result = calibrateConfidence(1.0, {
      evidenceCount: 10,
      crossRefHits: 5,
      completeness: 1,
    });
    assert.ok(result <= 1.0);
  });
});

describe("summarizeConfidence", () => {
  it("returns summary with averages", () => {
    const frame = createConfidenceFrame();
    recordInference(frame, { confidence: 0.8 });
    recordInference(frame, { confidence: 0.6 });
    const summary = summarizeConfidence(frame);
    assert.equal(summary.avgConfidence, 0.7);
    assert.equal(summary.entryCount, 2);
    assert.equal(summary.gapCount, 0);
  });

  it("penalizes overall score for gaps", () => {
    const frame = createConfidenceFrame();
    recordInference(frame, { confidence: 0.8 });
    recordGap(frame, { severity: 0.5 });
    recordGap(frame, { severity: 0.7 });
    const summary = summarizeConfidence(frame);
    assert.ok(
      summary.overallScore < summary.avgConfidence,
      "Gaps should reduce overall score"
    );
  });

  it("sorts topGaps by severity descending", () => {
    const frame = createConfidenceFrame();
    recordGap(frame, { severity: 0.3, description: "low" });
    recordGap(frame, { severity: 0.9, description: "high" });
    recordGap(frame, { severity: 0.6, description: "mid" });
    const summary = summarizeConfidence(frame);
    assert.equal(summary.topGaps[0].description, "high");
    assert.equal(summary.topGaps[1].description, "mid");
    assert.equal(summary.topGaps[2].description, "low");
  });
});
