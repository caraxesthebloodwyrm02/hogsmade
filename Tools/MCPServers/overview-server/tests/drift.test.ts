import { describe, it, expect } from "vitest";
import { detectDrift } from "../src/drift.js";
import type { AggregatedData, SeedsSnapshotData, DataSourceStatus } from "../src/types.js";

function makeData(overrides: Partial<AggregatedData> = {}): AggregatedData {
  return {
    auditEvents: [],
    latestSnapshot: null,
    previousSnapshot: null,
    journalEntryCount: 0,
    focusSessionActive: false,
    workflowsRunToday: 0,
    dataSources: [],
    sinceBoundary: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<SeedsSnapshotData> = {}): SeedsSnapshotData {
  return {
    timestamp: new Date().toISOString(),
    repos: [],
    overallScore: 75,
    ...overrides,
  };
}

describe("drift detection", () => {
  it("returns no drift items when everything is clean", () => {
    const data = makeData({
      latestSnapshot: makeSnapshot({
        repos: [
          {
            name: "GRID",
            exists: true,
            hasGit: true,
            hasDependencyFile: true,
            hasTests: true,
            healthScore: 90,
            branch: "main",
            uncommittedChanges: 0,
            lastCommit: "2 hours ago",
            issues: [],
          },
        ],
      }),
    });

    const drift = detectDrift(data);
    expect(drift.severity).toBe("none");
    expect(drift.totalDriftItems).toBe(0);
  });

  it("detects critical uncommitted changes (> 20)", () => {
    const data = makeData({
      latestSnapshot: makeSnapshot({
        repos: [
          {
            name: "GRID",
            exists: true,
            hasGit: true,
            hasDependencyFile: true,
            hasTests: true,
            healthScore: 50,
            uncommittedChanges: 25,
            issues: [],
          },
        ],
      }),
    });

    const drift = detectDrift(data);
    expect(drift.totalDriftItems).toBeGreaterThanOrEqual(1);
    const item = drift.items.find((i) => i.type === "uncommitted-changes");
    expect(item).toBeDefined();
    expect(item!.severity).toBe("critical");
  });

  it("detects warning-level uncommitted changes (5-20)", () => {
    const data = makeData({
      latestSnapshot: makeSnapshot({
        repos: [
          {
            name: "afloat",
            exists: true,
            hasGit: true,
            hasDependencyFile: true,
            hasTests: true,
            healthScore: 70,
            uncommittedChanges: 10,
            issues: [],
          },
        ],
      }),
    });

    const drift = detectDrift(data);
    const item = drift.items.find((i) => i.type === "uncommitted-changes");
    expect(item).toBeDefined();
    expect(item!.severity).toBe("warning");
  });

  it("detects stale branches", () => {
    const data = makeData({
      latestSnapshot: makeSnapshot({
        repos: [
          {
            name: "Vision",
            exists: true,
            hasGit: true,
            hasDependencyFile: false,
            hasTests: false,
            healthScore: 30,
            lastCommit: "3 months ago",
            issues: [],
          },
        ],
      }),
    });

    const drift = detectDrift(data);
    const item = drift.items.find((i) => i.type === "stale-branch");
    expect(item).toBeDefined();
    expect(item!.severity).toBe("warning");
  });

  it("detects test failures from audit events", () => {
    const now = new Date();
    const data = makeData({
      auditEvents: [
        { timestamp: now.toISOString(), source: "seeds-server", tool: "ecosystem_scan", status: "failure" },
        { timestamp: now.toISOString(), source: "seeds-server", tool: "repo_detail", status: "failure" },
        { timestamp: now.toISOString(), source: "seeds-server", tool: "ecosystem_scan", status: "failure" },
        { timestamp: now.toISOString(), source: "seeds-server", tool: "ecosystem_scan", status: "failure" },
      ],
    });

    const drift = detectDrift(data);
    const item = drift.items.find((i) => i.type === "test-failure");
    expect(item).toBeDefined();
    expect(item!.severity).toBe("critical"); // > 3 failures
  });

  it("detects snapshot score drop", () => {
    const data = makeData({
      latestSnapshot: makeSnapshot({ overallScore: 45 }),
      previousSnapshot: makeSnapshot({ overallScore: 80 }),
    });

    const drift = detectDrift(data);
    const item = drift.items.find((i) => i.type === "snapshot-score-drop");
    expect(item).toBeDefined();
    expect(item!.severity).toBe("critical"); // delta -35 > 25
  });

  it("detects audit anomaly (burst)", () => {
    const baseTime = Date.now();
    const events = Array.from({ length: 15 }, (_, i) => ({
      timestamp: new Date(baseTime + i * 1000).toISOString(), // 15 events within seconds
      source: "grid-server",
      tool: "validate_envelope",
      status: "failure" as const,
    }));

    const data = makeData({ auditEvents: events });
    const drift = detectDrift(data);
    const item = drift.items.find((i) => i.type === "audit-anomaly");
    expect(item).toBeDefined();
    expect(item!.severity).toBe("critical");
  });

  it("overall severity is 'high' when any critical items exist", () => {
    const data = makeData({
      latestSnapshot: makeSnapshot({
        repos: [
          {
            name: "test",
            exists: true,
            hasGit: true,
            hasDependencyFile: true,
            hasTests: true,
            healthScore: 50,
            uncommittedChanges: 30,
            issues: [],
          },
        ],
      }),
    });

    const drift = detectDrift(data);
    expect(drift.severity).toBe("high");
  });
});
