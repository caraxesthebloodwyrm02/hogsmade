/**
 * Writes a dated GRUFF SVG under ORI_DATA_DIR/reports (default ~/.ori/reports).
 * Used in CI to persist a visual snapshot artifact without a full MCP session.
 */
import { mkdirSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { buildThreatProjectHeatmap } from "../src/heatmap.js";
import { renderGruffGeometrySvg } from "../src/geometry-box.js";
import { buildCoverageMap } from "../src/threat-model.js";
import type { ProjectEntry } from "../src/types.js";
import type { ThreatModel } from "../src/threat-model.js";

const threatModel: ThreatModel = {
  threats: [
    {
      id: "TM-001",
      source: "CI",
      prerequisites: "",
      action: "Test",
      impact: "Low",
      impactedAssets: "CI",
      existingControls: "GHA",
      gaps: "",
      mitigations: "Monitor",
      detectionIdeas: "Logs",
      likelihood: "Low",
      impactSeverity: "Low",
      priority: "Low",
    },
    {
      id: "TM-002",
      source: "CI",
      prerequisites: "",
      action: "Test",
      impact: "Low",
      impactedAssets: "CI",
      existingControls: "GHA",
      gaps: "",
      mitigations: "Monitor",
      detectionIdeas: "Logs",
      likelihood: "Low",
      impactSeverity: "Low",
      priority: "Low",
    },
  ],
  focusPaths: [],
  parsedAt: new Date().toISOString(),
};

const projects: ProjectEntry[] = [
  {
    id: "ci-a",
    name: "ci-a",
    location: "/tmp",
    runner: { type: "vitest", command: "npx", args: ["vitest", "run"], cwd: "/tmp" },
    approxTestFiles: 1,
    tags: [],
    threatModelIds: ["TM-001", "TM-002"],
    healthStatus: "healthy",
    lastRunTimestamp: new Date().toISOString(),
  },
  {
    id: "ci-b",
    name: "ci-b",
    location: "/tmp",
    runner: { type: "vitest", command: "npx", args: ["vitest", "run"], cwd: "/tmp" },
    approxTestFiles: 1,
    tags: [],
    threatModelIds: ["TM-001"],
    healthStatus: "degraded",
  },
];

function main(): void {
  const dataDir = process.env.ORI_DATA_DIR?.trim() || path.join(os.homedir(), ".ori");
  const reportsDir = path.join(dataDir, "reports");
  mkdirSync(reportsDir, { recursive: true });

  const coverageReport = buildCoverageMap(projects, threatModel);
  const heatmap = buildThreatProjectHeatmap(threatModel, projects, coverageReport, {
    maxThreats: 20,
    maxProjects: 20,
  });
  const svg = renderGruffGeometrySvg(heatmap, {
    title: "GRUFF — CI snapshot",
  });

  const day = new Date().toISOString().slice(0, 10);
  const outPath = path.join(reportsDir, `${day}-ci-gruff.svg`);
  writeFileSync(outPath, svg, "utf-8");
  console.log(`Wrote ${outPath}`);
}

main();
