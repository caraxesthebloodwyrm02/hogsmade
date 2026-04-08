/**
 * Threat model parser — reads CascadeProjects-threat-model.md,
 * extracts structured threat data, and builds coverage maps
 * against the project registry.
 */

import { promises as fs } from "fs";
import path from "path";
import { getConfig } from "./config.js";
import type { ProjectEntry } from "./types.js";

const config = getConfig();

// ── Types ──

export interface ThreatEntry {
  id: string;
  source: string;
  prerequisites: string;
  action: string;
  impact: string;
  impactedAssets: string;
  existingControls: string;
  gaps: string;
  mitigations: string;
  detectionIdeas: string;
  likelihood: string;
  impactSeverity: string;
  priority: string;
}

export interface FocusPath {
  path: string;
  reason: string;
  threatIds: string[];
}

export interface ThreatModel {
  threats: ThreatEntry[];
  focusPaths: FocusPath[];
  parsedAt: string;
}

export interface CoverageMapping {
  threatId: string;
  priority: string;
  coveredByProjects: string[];
  uncoveredGaps: string[];
}

export interface CoverageReport {
  mappings: CoverageMapping[];
  totalThreats: number;
  threatsWithCoverage: number;
  threatsWithoutCoverage: number;
  generatedAt: string;
}

// ── Parser ──

function stripMarkdownLinks(text: string): string {
  // Convert [text](url) to just text
  return text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
}

function parseThreatTable(lines: string[]): ThreatEntry[] {
  const threats: ThreatEntry[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("| TM-")) continue;

    // Split on pipe, trim each cell
    const cells = trimmed
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    if (cells.length < 13) continue;

    threats.push({
      id: cells[0],
      source: stripMarkdownLinks(cells[1]),
      prerequisites: stripMarkdownLinks(cells[2]),
      action: stripMarkdownLinks(cells[3]),
      impact: stripMarkdownLinks(cells[4]),
      impactedAssets: stripMarkdownLinks(cells[5]),
      existingControls: stripMarkdownLinks(cells[6]),
      gaps: stripMarkdownLinks(cells[7]),
      mitigations: stripMarkdownLinks(cells[8]),
      detectionIdeas: stripMarkdownLinks(cells[9]),
      likelihood: cells[10],
      impactSeverity: cells[11],
      priority: cells[12],
    });
  }

  return threats;
}

function parseFocusPaths(lines: string[]): FocusPath[] {
  const paths: FocusPath[] = [];
  let inFocusTable = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("## Focus paths")) {
      inFocusTable = true;
      continue;
    }

    if (inFocusTable && trimmed.startsWith("## ")) {
      break; // Next section
    }

    if (!inFocusTable) continue;
    if (!trimmed.startsWith("| [") && !trimmed.startsWith("| /")) continue;

    const cells = trimmed
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    if (cells.length < 3) continue;

    // Extract path from markdown link or plain text
    const pathCell = cells[0];
    const pathMatch = pathCell.match(/\[([^\]]*)\]/);
    const extractedPath = pathMatch ? pathMatch[1] : pathCell;

    // Extract threat IDs from last cell
    const threatIds = (cells[2].match(/TM-\d+/g) ?? []);

    paths.push({
      path: extractedPath,
      reason: stripMarkdownLinks(cells[1]),
      threatIds,
    });
  }

  return paths;
}

/**
 * Parse the threat model markdown file.
 * Returns structured data and caches to disk.
 */
export async function parseThreatModel(filePath?: string): Promise<ThreatModel> {
  const defaultPath = path.join(
    config.cascadeRoot,
    "Documentation/docs/CascadeProjects-threat-model.md",
  );
  const targetPath = filePath ?? defaultPath;

  const content = await fs.readFile(targetPath, "utf-8");
  const lines = content.split("\n");

  const threats = parseThreatTable(lines);
  const focusPaths = parseFocusPaths(lines);

  const model: ThreatModel = {
    threats,
    focusPaths,
    parsedAt: new Date().toISOString(),
  };

  // Cache to disk
  await fs.mkdir(config.threatModelDir, { recursive: true });
  const cachePath = path.join(config.threatModelDir, "parsed.json");
  await fs.writeFile(cachePath, JSON.stringify(model, null, 2), "utf-8");

  return model;
}

/**
 * Load cached threat model from disk, or parse fresh.
 */
export async function loadThreatModel(): Promise<ThreatModel> {
  const cachePath = path.join(config.threatModelDir, "parsed.json");
  try {
    const raw = await fs.readFile(cachePath, "utf-8");
    const cached = JSON.parse(raw) as ThreatModel;
    if (cached.threats?.length > 0) return cached;
  } catch {
    // Cache miss — parse fresh
  }
  return parseThreatModel();
}

// ── Coverage mapping ──

/**
 * Build a coverage map: which projects cover which threats,
 * and which threats have no test coverage.
 */
export function buildCoverageMap(
  projects: ProjectEntry[],
  threatModel: ThreatModel,
): CoverageReport {
  const mappings: CoverageMapping[] = [];

  for (const threat of threatModel.threats) {
    const coveredBy = projects
      .filter((p) => p.threatModelIds?.includes(threat.id))
      .map((p) => p.id);

    // Identify gaps: threats with no project coverage
    const gaps: string[] = [];
    if (coveredBy.length === 0) {
      gaps.push(`No projects mapped to ${threat.id}`);
    }

    // Check if any covering project has a recent healthy run
    const staleProjects = projects
      .filter((p) => p.threatModelIds?.includes(threat.id))
      .filter((p) => !p.lastRunTimestamp || p.healthStatus === "failing");
    if (staleProjects.length > 0 && coveredBy.length > 0) {
      gaps.push(
        `${staleProjects.length} covering project(s) have no recent healthy run: ${staleProjects.map((p) => p.id).join(", ")}`,
      );
    }

    mappings.push({
      threatId: threat.id,
      priority: threat.priority,
      coveredByProjects: coveredBy,
      uncoveredGaps: gaps,
    });
  }

  const threatsWithCoverage = mappings.filter((m) => m.coveredByProjects.length > 0).length;

  return {
    mappings,
    totalThreats: threatModel.threats.length,
    threatsWithCoverage,
    threatsWithoutCoverage: threatModel.threats.length - threatsWithCoverage,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Route a single threat to relevant projects and focus paths.
 */
export function routeThreatToTests(
  threatId: string,
  projects: ProjectEntry[],
  threatModel: ThreatModel,
): {
  threat: ThreatEntry | null;
  projects: Array<{ id: string; name: string; healthStatus?: string }>;
  focusPaths: FocusPath[];
} {
  const threat = threatModel.threats.find((t) => t.id === threatId) ?? null;
  const matchedProjects = projects
    .filter((p) => p.threatModelIds?.includes(threatId))
    .map((p) => ({ id: p.id, name: p.name, healthStatus: p.healthStatus }));
  const matchedPaths = threatModel.focusPaths.filter((fp) =>
    fp.threatIds.includes(threatId),
  );

  return { threat, projects: matchedProjects, focusPaths: matchedPaths };
}
