import { describe, expect, it } from "vitest";
import type { ProjectEntry } from "../src/types.js";
import type { CoverageReport, ThreatModel } from "../src/threat-model.js";
import {
  buildThreatProjectHeatmap,
  scoreThreatProjectCell,
} from "../src/heatmap.js";

function modelWithThreats(ids: string[]): ThreatModel {
  return {
    threats: ids.map((id) => ({
      id,
      source: "",
      prerequisites: "",
      action: "",
      impact: "",
      impactedAssets: "",
      existingControls: "",
      gaps: "",
      mitigations: "",
      detectionIdeas: "",
      likelihood: "",
      impactSeverity: "",
      priority: "Low",
    })),
    focusPaths: [],
    parsedAt: new Date().toISOString(),
  };
}

function emptyCoverage(threatIds: string[]): CoverageReport {
  return {
    mappings: threatIds.map((threatId) => ({
      threatId,
      priority: "Low",
      coveredByProjects: [],
      uncoveredGaps: [],
    })),
    totalThreats: threatIds.length,
    threatsWithCoverage: 0,
    threatsWithoutCoverage: threatIds.length,
    generatedAt: new Date().toISOString(),
  };
}

describe("scoreThreatProjectCell", () => {
  const base = (overrides: Partial<ProjectEntry>): ProjectEntry => ({
    id: "p1",
    name: "P1",
    location: "/tmp",
    runner: { type: "vitest", command: "npx", args: ["vitest", "run"], cwd: "/tmp" },
    approxTestFiles: 1,
    tags: [],
    threatModelIds: ["TM-001"],
    ...overrides,
  });

  it("returns null score when threat not mapped", () => {
    const c = scoreThreatProjectCell(base({ threatModelIds: ["TM-002"] }), "TM-001");
    expect(c.score).toBeNull();
    expect(c.label).toBe("unmapped");
  });

  it("returns 1 for healthy with timestamp", () => {
    const c = scoreThreatProjectCell(
      base({
        healthStatus: "healthy",
        lastRunTimestamp: new Date().toISOString(),
      }),
      "TM-001",
    );
    expect(c.score).toBe(1);
    expect(c.label).toBe("healthy");
  });

  it("returns 0.5 for healthy without timestamp (stale)", () => {
    const c = scoreThreatProjectCell(base({ healthStatus: "healthy" }), "TM-001");
    expect(c.score).toBe(0.5);
    expect(c.label).toBe("stale_run");
  });

  it("returns 0 for failing", () => {
    const c = scoreThreatProjectCell(base({ healthStatus: "failing" }), "TM-001");
    expect(c.score).toBe(0);
  });

  it("returns 0.5 for degraded", () => {
    const c = scoreThreatProjectCell(base({ healthStatus: "degraded" }), "TM-001");
    expect(c.score).toBe(0.5);
  });
});

describe("buildThreatProjectHeatmap", () => {
  it("builds dense grid and legend", () => {
    const tm = modelWithThreats(["TM-002", "TM-001"]);
    const projects: ProjectEntry[] = [
      {
        id: "a",
        name: "A",
        location: "/a",
        runner: { type: "vitest", command: "npx", args: ["vitest", "run"], cwd: "/a" },
        approxTestFiles: 1,
        tags: [],
        threatModelIds: ["TM-001"],
        healthStatus: "healthy",
        lastRunTimestamp: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "b",
        name: "B",
        location: "/b",
        runner: { type: "vitest", command: "npx", args: ["vitest", "run"], cwd: "/b" },
        approxTestFiles: 1,
        tags: [],
        threatModelIds: ["TM-002"],
        healthStatus: "failing",
      },
    ];
    const cov: CoverageReport = {
      mappings: [
        {
          threatId: "TM-001",
          priority: "Low",
          coveredByProjects: ["a"],
          uncoveredGaps: [],
        },
        {
          threatId: "TM-002",
          priority: "Low",
          coveredByProjects: ["b"],
          uncoveredGaps: ["gap"],
        },
      ],
      totalThreats: 2,
      threatsWithCoverage: 2,
      threatsWithoutCoverage: 0,
      generatedAt: new Date().toISOString(),
    };

    const h = buildThreatProjectHeatmap(tm, projects, cov, {});

    expect(h.kind).toBe("threat_project_coverage");
    expect(h.axes.rowIds).toEqual(["TM-002", "TM-001"]);
    expect(h.axes.colIds).toEqual(["a", "b"]);
    expect(h.cells).toHaveLength(4);
    expect(h.legend.length).toBeGreaterThan(0);
    expect(h.truncated.threatsOmitted).toBe(0);
    expect(h.truncated.projectsOmitted).toBe(0);

    const tm002a = h.cells.find((c) => c.row === "TM-002" && c.col === "a")!;
    expect(tm002a.score).toBeNull();

    const tm002b = h.cells.find((c) => c.row === "TM-002" && c.col === "b")!;
    expect(tm002b.score).toBe(0);
  });

  it("filters by threatIdPrefix and projectIds", () => {
    const tm = modelWithThreats(["TM-001", "TM-999"]);
    const projects: ProjectEntry[] = [
      {
        id: "x",
        name: "X",
        location: "/x",
        runner: { type: "vitest", command: "npx", args: ["vitest", "run"], cwd: "/x" },
        approxTestFiles: 1,
        tags: [],
        threatModelIds: ["TM-001"],
      },
      {
        id: "y",
        name: "Y",
        location: "/y",
        runner: { type: "vitest", command: "npx", args: ["vitest", "run"], cwd: "/y" },
        approxTestFiles: 1,
        tags: [],
        threatModelIds: ["TM-001"],
      },
    ];
    const cov = emptyCoverage(["TM-001", "TM-999"]);

    const h = buildThreatProjectHeatmap(tm, projects, cov, {
      threatIdPrefix: "TM-00",
      projectIds: ["y", "x"],
    });

    expect(h.axes.rowIds).toEqual(["TM-001"]);
    expect(h.axes.colIds).toEqual(["y", "x"]);
    expect(h.cells).toHaveLength(2);
  });

  it("reports truncated counts when capped", () => {
    const tm = modelWithThreats(["TM-001", "TM-002", "TM-003"]);
    const projects: ProjectEntry[] = [
      {
        id: "p1",
        name: "P1",
        location: "/p1",
        runner: { type: "vitest", command: "npx", args: ["vitest", "run"], cwd: "/p1" },
        approxTestFiles: 1,
        tags: [],
      },
      {
        id: "p2",
        name: "P2",
        location: "/p2",
        runner: { type: "vitest", command: "npx", args: ["vitest", "run"], cwd: "/p2" },
        approxTestFiles: 1,
        tags: [],
      },
    ];
    const cov = emptyCoverage(["TM-001", "TM-002", "TM-003"]);

    const h = buildThreatProjectHeatmap(tm, projects, cov, {
      maxThreats: 2,
      maxProjects: 1,
    });

    expect(h.axes.rowIds).toHaveLength(2);
    expect(h.axes.colIds).toHaveLength(1);
    expect(h.truncated.threatsOmitted).toBe(1);
    expect(h.truncated.projectsOmitted).toBe(1);
  });
});
