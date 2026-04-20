import { describe, expect, it } from "vitest";
import type { ProjectEntry } from "../src/types.js";
import type { CoverageReport, ThreatModel } from "../src/threat-model.js";
import { buildThreatProjectHeatmap } from "../src/heatmap.js";
import { GRUFF_PALETTE, renderGruffGeometrySvg } from "../src/geometry-box.js";

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

describe("GRUFF geometry box", () => {
  it("renders rects for full row×col grid", () => {
    const projects: ProjectEntry[] = [
      {
        id: "p-a",
        name: "A",
        location: "/a",
        runner: { type: "vitest", command: "npx", args: ["vitest", "run"], cwd: "/a" },
        approxTestFiles: 1,
        tags: [],
        threatModelIds: ["TM-001"],
        healthStatus: "healthy",
        lastRunTimestamp: new Date().toISOString(),
      },
      {
        id: "p-b",
        name: "B",
        location: "/b",
        runner: { type: "vitest", command: "npx", args: ["vitest", "run"], cwd: "/b" },
        approxTestFiles: 1,
        tags: [],
        threatModelIds: ["TM-002"],
        healthStatus: "failing",
      },
    ];
    const tm = modelWithThreats(["TM-001", "TM-002"]);
    const cov = emptyCoverage(["TM-001", "TM-002"]);
    const heat = buildThreatProjectHeatmap(tm, projects, cov, { maxThreats: 10, maxProjects: 10 });
    const svg = renderGruffGeometrySvg(heat, { cellPx: 12, title: "Test grid" });

    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain(GRUFF_PALETTE.healthy);
    expect(svg).toContain(GRUFF_PALETTE.bad);
    const dataRects = svg.match(/<rect[^>]*data-row=/g);
    expect(dataRects?.length ?? 0).toBe(heat.axes.rowIds.length * heat.axes.colIds.length);
  });

  it("returns empty-state svg when grid has no rows", () => {
    const heat = buildThreatProjectHeatmap(modelWithThreats([]), [], emptyCoverage([]), {
      maxThreats: 10,
      maxProjects: 10,
    });
    const svg = renderGruffGeometrySvg(heat);
    expect(svg).toContain("No grid data");
  });
});
