import { describe, it, expect } from "vitest";
import { computeTrust } from "../src/trust.js";
import type { AggregatedData, ClusterInsight, DriftReport } from "../src/types.js";

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

function makeClusters(overrides: Partial<ClusterInsight>[] = []): ClusterInsight[] {
  const defaults: ClusterInsight[] = [
    {
      id: "grid-family",
      label: "GRID Family",
      entities: [
        {
          name: "GRID", type: "repo", healthScore: 90, branch: "main",
          uncommittedChanges: 0, lastActivity: new Date().toISOString(), issues: [],
          auditSummary: { eventsInWindow: 5, failures: 0, lastStatus: "success" },
        },
      ],
      clusterHealth: 90,
      issueCount: 0,
      driftItems: [],
    },
    {
      id: "mcp-infrastructure",
      label: "MCP Infrastructure",
      entities: [
        {
          name: "hogsmade", type: "repo", healthScore: 80, branch: "hogsmade",
          uncommittedChanges: 0, lastActivity: new Date().toISOString(), issues: [],
          auditSummary: { eventsInWindow: 3, failures: 0, lastStatus: "success" },
        },
      ],
      clusterHealth: 80,
      issueCount: 0,
      driftItems: [],
    },
  ];

  return defaults.map((cluster, i) => ({
    ...cluster,
    ...(overrides[i] ?? {}),
  }));
}

describe("relational trust computation", () => {
  it("returns relationships for each cluster + ecosystem + newcomer", () => {
    const clusters = makeClusters();
    const trust = computeTrust(makeData(), emptyDrift(), clusters);

    // builder relationships (one per cluster) + ecosystem self + newcomer
    expect(trust.relationships.length).toBe(clusters.length + 2);

    const observers = trust.relationships.map((r) => r.observer);
    expect(observers).toContain("builder");
    expect(observers).toContain("ecosystem");
    expect(observers).toContain("newcomer");
  });

  it("healthy clusters produce high builder confidence", () => {
    const data = makeData({
      latestSnapshot: {
        timestamp: new Date().toISOString(),
        repos: [],
        overallScore: 85,
      },
      auditEvents: [
        { timestamp: new Date().toISOString(), source: "seeds-server", tool: "scan", status: "success" },
      ],
    });

    const clusters = makeClusters();
    const trust = computeTrust(data, emptyDrift(), clusters);

    const gridTrust = trust.relationships.find(
      (r) => r.observer === "builder" && r.subject === "grid-family",
    );
    expect(gridTrust).toBeDefined();
    expect(gridTrust!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("newcomer gets null confidence with insufficient data sources", () => {
    const data = makeData({
      dataSources: [
        { name: "echoes-audit", available: false, lastModified: null, recordCount: null, stale: true },
        { name: "seeds-snapshots", available: false, lastModified: null, recordCount: null, stale: true },
      ],
    });

    const trust = computeTrust(data, emptyDrift(), makeClusters());
    const newcomer = trust.relationships.find((r) => r.observer === "newcomer");
    expect(newcomer).toBeDefined();
    expect(newcomer!.confidence).toBeNull();
  });

  it("critical drift items reduce builder confidence for affected cluster", () => {
    const clusters = makeClusters();
    const drift: DriftReport = {
      totalDriftItems: 2,
      severity: "high",
      items: [
        { entity: "GRID", type: "uncommitted-changes", detail: "30 uncommitted", severity: "critical", firstDetected: null },
        { entity: "GRID", type: "audit-anomaly", detail: "burst", severity: "critical", firstDetected: null },
      ],
    };

    const trustWithDrift = computeTrust(makeData(), drift, clusters);
    const trustClean = computeTrust(makeData(), emptyDrift(), clusters);

    const gridDrift = trustWithDrift.relationships.find(
      (r) => r.observer === "builder" && r.subject === "grid-family",
    );
    const gridClean = trustClean.relationships.find(
      (r) => r.observer === "builder" && r.subject === "grid-family",
    );

    expect(gridDrift!.confidence!).toBeLessThan(gridClean!.confidence!);
  });

  it("audit failures reduce builder confidence", () => {
    const now = new Date().toISOString();
    const dataWithFailures = makeData({
      auditEvents: [
        { timestamp: now, source: "grid-server", tool: "test", status: "failure" },
        { timestamp: now, source: "grid-server", tool: "test", status: "failure" },
      ],
    });

    const clusters: ClusterInsight[] = [{
      id: "grid-family",
      label: "GRID Family",
      entities: [{
        name: "grid-server", type: "mcp-server", healthScore: 70, branch: null,
        uncommittedChanges: null, lastActivity: now, issues: [],
        auditSummary: { eventsInWindow: 2, failures: 2, lastStatus: "failure" },
      }],
      clusterHealth: 70,
      issueCount: 0,
      driftItems: [],
    }];

    const cleanClusters: ClusterInsight[] = [{
      id: "grid-family",
      label: "GRID Family",
      entities: [{
        name: "grid-server", type: "mcp-server", healthScore: 70, branch: null,
        uncommittedChanges: null, lastActivity: now, issues: [],
        auditSummary: { eventsInWindow: 2, failures: 0, lastStatus: "success" },
      }],
      clusterHealth: 70,
      issueCount: 0,
      driftItems: [],
    }];

    const withFailures = computeTrust(dataWithFailures, emptyDrift(), clusters);
    const clean = computeTrust(makeData(), emptyDrift(), cleanClusters);

    const failGrid = withFailures.relationships.find(
      (r) => r.observer === "builder" && r.subject === "grid-family",
    );
    const cleanGrid = clean.relationships.find(
      (r) => r.observer === "builder" && r.subject === "grid-family",
    );

    expect(failGrid!.confidence!).toBeLessThan(cleanGrid!.confidence!);
  });

  it("generates a narrative string", () => {
    const trust = computeTrust(makeData(), emptyDrift(), makeClusters());
    expect(trust.narrative).toBeTruthy();
    expect(typeof trust.narrative).toBe("string");
    expect(trust.narrative.length).toBeGreaterThan(10);
  });

  it("legacyScore is a number 0-100", () => {
    const trust = computeTrust(makeData(), emptyDrift(), makeClusters());
    expect(trust.legacyScore).toBeGreaterThanOrEqual(0);
    expect(trust.legacyScore).toBeLessThanOrEqual(100);
  });

  it("basis items on every relationship have required fields", () => {
    const trust = computeTrust(makeData(), emptyDrift(), makeClusters());

    for (const rel of trust.relationships) {
      for (const item of rel.basis) {
        expect(item.signal).toBeTruthy();
        expect(typeof item.weight).toBe("number");
        expect(["positive", "neutral", "negative"]).toContain(item.sentiment);
      }
    }
  });

  it("ecosystem self-trust reflects data source availability", () => {
    const goodData = makeData({
      latestSnapshot: { timestamp: new Date().toISOString(), repos: [], overallScore: 85 },
      dataSources: [
        { name: "echoes-audit", available: true, lastModified: new Date().toISOString(), recordCount: 10, stale: false },
        { name: "seeds-snapshots", available: true, lastModified: new Date().toISOString(), recordCount: 5, stale: false },
        { name: "pulse-journal", available: true, lastModified: new Date().toISOString(), recordCount: 2, stale: false },
      ],
    });

    const poorData = makeData({
      dataSources: [
        { name: "echoes-audit", available: false, lastModified: null, recordCount: null, stale: true },
        { name: "seeds-snapshots", available: false, lastModified: null, recordCount: null, stale: true },
        { name: "pulse-journal", available: false, lastModified: null, recordCount: null, stale: true },
      ],
    });

    const goodTrust = computeTrust(goodData, emptyDrift(), makeClusters());
    const poorTrust = computeTrust(poorData, emptyDrift(), makeClusters());

    const goodEco = goodTrust.relationships.find((r) => r.observer === "ecosystem");
    const poorEco = poorTrust.relationships.find((r) => r.observer === "ecosystem");

    expect(goodEco!.confidence!).toBeGreaterThan(poorEco!.confidence!);
  });
});
