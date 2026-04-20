/**
 * Threat × project coverage heatmap — dense JSON grid for MCP consumers.
 *
 * Contract (stable fields):
 * - axes.rowIds: threat IDs (TM-…)
 * - axes.colIds: project registry IDs
 * - cells: one entry per (row, col); score null = project not mapped to threat
 * - legend: score semantics for rendering (accessible color scales recommended)
 * - truncated: how many rows/cols were dropped by caps (progressive disclosure)
 */

import type { ProjectEntry } from "./types.js";
import type { CoverageReport, ThreatModel } from "./threat-model.js";

/** One interpretable level for UI / LLM consumption. */
export interface HeatmapLegendEntry {
  score: number | null;
  label: string;
}

export interface HeatmapAxes {
  rowKind: "threat";
  colKind: "project";
  rowIds: string[];
  colIds: string[];
}

export interface HeatmapCell {
  row: string;
  col: string;
  score: number | null;
  label: string;
}

export interface ThreatProjectHeatmapPayload {
  kind: "threat_project_coverage";
  axes: HeatmapAxes;
  cells: HeatmapCell[];
  legend: HeatmapLegendEntry[];
  truncated: {
    threatsOmitted: number;
    projectsOmitted: number;
  };
  generatedAt: string;
}

export interface BuildThreatProjectHeatmapOptions {
  /** Only threats whose id starts with this prefix (e.g. "TM-"). */
  threatIdPrefix?: string;
  /** Restrict to these project ids (order preserved where possible). */
  projectIds?: string[];
  maxThreats?: number;
  maxProjects?: number;
}

const DEFAULT_MAX_THREATS = 80;
const DEFAULT_MAX_PROJECTS = 40;

export const THREAT_PROJECT_HEATMAP_LEGEND: HeatmapLegendEntry[] = [
  { score: 1, label: "Project maps to threat and last run is healthy (timestamp present)" },
  { score: 0.5, label: "Project maps to threat but run is stale, degraded, or health unknown" },
  { score: 0, label: "Project maps to threat and last run failed or errored" },
  { score: null, label: "Project does not list this threat in threatModelIds" },
];

/**
 * Score for one (threat, project) pair. Mirrors buildCoverageMap stale/healthy signals.
 */
export function scoreThreatProjectCell(project: ProjectEntry, threatId: string): HeatmapCell {
  const ids = project.threatModelIds ?? [];
  if (!ids.includes(threatId)) {
    return { row: threatId, col: project.id, score: null, label: "unmapped" };
  }

  if (project.healthStatus === "failing") {
    return { row: threatId, col: project.id, score: 0, label: "failing" };
  }

  if (project.healthStatus === "healthy" && project.lastRunTimestamp) {
    return { row: threatId, col: project.id, score: 1, label: "healthy" };
  }

  if (project.healthStatus === "healthy" && !project.lastRunTimestamp) {
    return { row: threatId, col: project.id, score: 0.5, label: "stale_run" };
  }

  if (project.healthStatus === "degraded") {
    return { row: threatId, col: project.id, score: 0.5, label: "degraded" };
  }

  return { row: threatId, col: project.id, score: 0.5, label: project.healthStatus ?? "unknown" };
}

/**
 * Build a full threat×project matrix from the threat model and registry.
 * CoverageReport is optional metadata; scoring uses ProjectEntry fields only.
 */
export function buildThreatProjectHeatmap(
  threatModel: ThreatModel,
  projects: ProjectEntry[],
  coverageReport: CoverageReport,
  options?: BuildThreatProjectHeatmapOptions,
): ThreatProjectHeatmapPayload {
  const maxThreats = options?.maxThreats ?? DEFAULT_MAX_THREATS;
  const maxProjects = options?.maxProjects ?? DEFAULT_MAX_PROJECTS;
  const prefix = options?.threatIdPrefix ?? "";

  const gapWeight = new Map<string, number>();
  for (const m of coverageReport.mappings) {
    gapWeight.set(m.threatId, m.uncoveredGaps.length > 0 ? 1 : 0);
  }

  let threatPool = threatModel.threats
    .map((t) => t.id)
    .filter((id) => id.startsWith(prefix))
    .sort((a, b) => {
      const ga = gapWeight.get(a) ?? 0;
      const gb = gapWeight.get(b) ?? 0;
      if (gb !== ga) return gb - ga;
      return a.localeCompare(b);
    });

  const threatsTotal = threatPool.length;
  const rowIds = threatPool.slice(0, maxThreats);
  const threatsOmitted = Math.max(0, threatsTotal - rowIds.length);

  let projectPool: ProjectEntry[];
  if (options?.projectIds?.length) {
    projectPool = options.projectIds
      .map((id) => projects.find((p) => p.id === id))
      .filter((p): p is ProjectEntry => p !== undefined);
  } else {
    projectPool = [...projects].sort((a, b) => a.id.localeCompare(b.id));
  }

  const projectsTotal = projectPool.length;
  const colIds = projectPool.slice(0, maxProjects).map((p) => p.id);
  const projectsOmitted = Math.max(0, projectsTotal - colIds.length);

  const colSet = new Set(colIds);
  const projectsForGrid = projectPool.filter((p) => colSet.has(p.id));

  const cells: HeatmapCell[] = [];
  for (const tid of rowIds) {
    for (const proj of projectsForGrid) {
      cells.push(scoreThreatProjectCell(proj, tid));
    }
  }

  return {
    kind: "threat_project_coverage",
    axes: {
      rowKind: "threat",
      colKind: "project",
      rowIds,
      colIds,
    },
    cells,
    legend: THREAT_PROJECT_HEATMAP_LEGEND,
    truncated: {
      threatsOmitted,
      projectsOmitted,
    },
    generatedAt: new Date().toISOString(),
  };
}
