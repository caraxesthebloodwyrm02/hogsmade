import { describe, it, expect } from "vitest";
import { computeTrust } from "../src/trust.js";
import type { AggregatedData, DriftReport, DataSourceStatus } from "../src/types.js";

function makeData(overrides: Partial<AggregatedData> = {}): AggregatedData {
  return {
    auditEvents: [],
    latestSnapshot: null,
    previousSnapshot: null,
    journalEntryCount: 0,
    focusSessionActive: false,
    workflowsRunToday: 0,
    dataSources: [
      { name: "echoes-audit", available: true, lastModified: new Date().toISOString(), recordCount: 10, stale: false },
      { name: "seeds-snapshots", available: true, lastModified: new Date().toISOString(), recordCount: 5, stale: false },
    ],
    sinceBoundary: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

function emptyDrift(): DriftReport {
  return { totalDriftItems: 0, severity: "none", items: [] };
}

describe("trust computation", () => {
  it("healthy ecosystem produces high confidence", () => {
    const data = makeData({
      latestSnapshot: {
        timestamp: new Date().toISOString(),
        repos: [],
        overallScore: 85,
      },
      previousSnapshot: {
        timestamp: new Date().toISOString(),
        repos: [],
        overallScore: 80,
      },
      auditEvents: [
        { timestamp: new Date().toISOString(), source: "seeds-server", tool: "scan", status: "success" },
      ],
      focusSessionActive: true,
      journalEntryCount: 3,
    });

    const trust = computeTrust(data, emptyDrift());
    expect(trust.score).toBeGreaterThanOrEqual(75);
    expect(trust.confidence).toBe("high");
    expect(trust.basis.length).toBeGreaterThan(0);
  });

  it("no data sources produces insufficient-data", () => {
    const data = makeData({
      dataSources: [
        { name: "echoes-audit", available: false, lastModified: null, recordCount: null, stale: true },
        { name: "seeds-snapshots", available: false, lastModified: null, recordCount: null, stale: true },
      ],
    });

    const trust = computeTrust(data, emptyDrift());
    // Score starts at 50, -10 for no snapshot, -10 for audit unavailable = 30
    // With < 2 available sources → insufficient-data
    expect(trust.confidence).toBe("insufficient-data");
  });

  it("critical ecosystem score produces negative sentiment", () => {
    const data = makeData({
      latestSnapshot: {
        timestamp: new Date().toISOString(),
        repos: [],
        overallScore: 30,
      },
    });

    const trust = computeTrust(data, emptyDrift());
    expect(trust.score).toBeLessThan(50);
    const negativeBasis = trust.basis.filter((b) => b.sentiment === "negative");
    expect(negativeBasis.length).toBeGreaterThan(0);
  });

  it("audit failures reduce trust score", () => {
    const now = new Date().toISOString();
    const data = makeData({
      latestSnapshot: {
        timestamp: now,
        repos: [],
        overallScore: 70,
      },
      auditEvents: [
        { timestamp: now, source: "grid-server", tool: "test", status: "failure" },
        { timestamp: now, source: "grid-server", tool: "test", status: "failure" },
        { timestamp: now, source: "grid-server", tool: "test", status: "failure" },
      ],
    });

    const trustWithFailures = computeTrust(data, emptyDrift());
    const cleanData = makeData({
      latestSnapshot: { timestamp: now, repos: [], overallScore: 70 },
      auditEvents: [
        { timestamp: now, source: "grid-server", tool: "test", status: "success" },
      ],
    });
    const trustClean = computeTrust(cleanData, emptyDrift());

    expect(trustWithFailures.score).toBeLessThan(trustClean.score);
  });

  it("critical drift items reduce trust score", () => {
    const data = makeData({
      latestSnapshot: {
        timestamp: new Date().toISOString(),
        repos: [],
        overallScore: 70,
      },
    });

    const driftWithCritical: DriftReport = {
      totalDriftItems: 3,
      severity: "high",
      items: [
        { entity: "GRID", type: "uncommitted-changes", detail: "30 uncommitted", severity: "critical", firstDetected: null },
        { entity: "grid-server", type: "audit-anomaly", detail: "burst", severity: "critical", firstDetected: null },
        { entity: "ecosystem", type: "snapshot-score-drop", detail: "dropped 30", severity: "critical", firstDetected: null },
      ],
    };

    const trustWithDrift = computeTrust(data, driftWithCritical);
    const trustClean = computeTrust(data, emptyDrift());

    expect(trustWithDrift.score).toBeLessThan(trustClean.score);
  });

  it("basis items explain every signal", () => {
    const data = makeData({
      latestSnapshot: {
        timestamp: new Date().toISOString(),
        repos: [],
        overallScore: 85,
      },
      focusSessionActive: true,
      journalEntryCount: 2,
    });

    const trust = computeTrust(data, emptyDrift());
    // Should have basis items for: high score, zero failures, focus, journal
    expect(trust.basis.length).toBeGreaterThanOrEqual(3);
    for (const item of trust.basis) {
      expect(item.signal).toBeTruthy();
      expect(typeof item.weight).toBe("number");
      expect(["positive", "neutral", "negative"]).toContain(item.sentiment);
    }
  });
});
