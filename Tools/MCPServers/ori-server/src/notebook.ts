/**
 * Persistent notebook — append-only NDJSON memory for cross-run context.
 *
 * Categories: observation, decision, anomaly, trend, cross-run-context
 * Auto-populated after test runs, report generation, threat model parses.
 * Queryable by category, tags, project, and time.
 *
 * ═══════════════════════════════════════════════════════════════
 * TRANSFORMATION SCHEMA (Biochem-Inspired: Mystique + Hox Genes)
 * ═══════════════════════════════════════════════════════════════
 *
 * File Extension Transformations:
 * | From | To   | Tool     |
 * | .ts  | .js  | esbuild  |
 * | .md  | .html| marked   |
 * | .json| .ts  | json2ts  |
 * | .pdf | .txt | pdftotext|
 *
 * Dimensional Cross-Reference (Hox Colinearity):
 *   tier0: parsing  → tier1: AST → tier2: semantics → tier3: codegen
 *
 * Baseline Rules (Mystique Limits):
 *   • Mass conservation: input ≈ output
 *   • No power mimicry: transform structure, not behavior
 *   • Concentration required: mental effort for complex transforms
 *   • Time limit: extreme transforms ≤2min hold
 *   • Selector→Realizator: parse → emit pipeline
 *
 * Hook Architecture:
 *   interface TransformHook<TIn, TOut> {
 *     before?: (input: TIn) => TIn;
 *     after?: (output: TOut) => TOut;
 *   }
 */

import { generateId } from "@cascade/shared-types/id";
import { promises as fs } from "fs";
import path from "path";
import { getConfig } from "./config.js";

const config = getConfig();

export type NoteCategory =
  | "observation"
  | "decision"
  | "anomaly"
  | "trend"
  | "cross-run-context"
  | "transformation";

export interface NotebookEntry {
  id: string;
  timestamp: string;
  category: NoteCategory;
  title: string;
  body: string;
  tags: string[];
  projectId?: string;
  source: string;
}

export interface TransformationEntry extends NotebookEntry {
  category: "transformation";
  transformation: {
    from: string;
    to: string;
    tool: string;
    tier: 0 | 1 | 2 | 3;
    massConserved: boolean;
    durationMs?: number;
  };
}

export interface NotebookQueryOptions {
  category?: NoteCategory;
  tags?: string[];
  projectId?: string;
  since?: string;
  until?: string;
  limit?: number;
  source?: string;
}

function notebookPath(): string {
  return path.join(config.notebookDir, "notebook.ndjson");
}

/**
 * Append a note to the persistent notebook.
 */
export async function appendNote(
  entry: Omit<NotebookEntry, "id" | "timestamp">,
): Promise<NotebookEntry> {
  await fs.mkdir(config.notebookDir, { recursive: true });
  const note: NotebookEntry = {
    id: generateId("note"),
    timestamp: new Date().toISOString(),
    ...entry,
  };
  await fs.appendFile(notebookPath(), JSON.stringify(note) + "\n", "utf-8");
  return note;
}

/**
 * Read all notebook entries from disk.
 */
async function readAllNotes(): Promise<NotebookEntry[]> {
  try {
    const content = await fs.readFile(notebookPath(), "utf-8");
    return content
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as NotebookEntry;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as NotebookEntry[];
  } catch {
    return [];
  }
}

/**
 * Query notebook entries with filters.
 */
export async function queryNotes(options?: NotebookQueryOptions): Promise<NotebookEntry[]> {
  let notes = await readAllNotes();

  if (options?.category) {
    notes = notes.filter((n) => n.category === options.category);
  }
  if (options?.tags && options.tags.length > 0) {
    const tagSet = new Set(options.tags);
    notes = notes.filter((n) => n.tags.some((t) => tagSet.has(t)));
  }
  if (options?.projectId) {
    notes = notes.filter((n) => n.projectId === options.projectId);
  }
  if (options?.source) {
    notes = notes.filter((n) => n.source === options.source);
  }
  if (options?.since) {
    notes = notes.filter((n) => n.timestamp >= options.since!);
  }
  if (options?.until) {
    notes = notes.filter((n) => n.timestamp <= options.until!);
  }

  // Most recent first
  notes.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  if (options?.limit && options.limit > 0) {
    notes = notes.slice(0, options.limit);
  }

  return notes;
}

/**
 * Get the N most recent notes.
 */
export async function getRecentNotes(limit = 10): Promise<NotebookEntry[]> {
  return queryNotes({ limit });
}

/**
 * Get notes by tag(s).
 */
export async function getNotesByTag(tags: string[]): Promise<NotebookEntry[]> {
  return queryNotes({ tags });
}

/**
 * Get notes for a specific project.
 */
export async function getNotesByProject(projectId: string): Promise<NotebookEntry[]> {
  return queryNotes({ projectId });
}

/**
 * Notebook state summary — counts by category, date range, total.
 */
export async function getNotebookSummary(): Promise<{
  totalNotes: number;
  byCategory: Record<string, number>;
  bySource: Record<string, number>;
  oldestTimestamp: string | null;
  newestTimestamp: string | null;
  uniqueProjects: string[];
  uniqueTags: string[];
}> {
  const notes = await readAllNotes();

  const byCategory: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const projectSet = new Set<string>();
  const tagSet = new Set<string>();

  for (const note of notes) {
    byCategory[note.category] = (byCategory[note.category] ?? 0) + 1;
    bySource[note.source] = (bySource[note.source] ?? 0) + 1;
    if (note.projectId) projectSet.add(note.projectId);
    for (const tag of note.tags) tagSet.add(tag);
  }

  return {
    totalNotes: notes.length,
    byCategory,
    bySource,
    oldestTimestamp: notes.length > 0 ? notes[0].timestamp : null,
    newestTimestamp: notes.length > 0 ? notes[notes.length - 1].timestamp : null,
    uniqueProjects: [...projectSet],
    uniqueTags: [...tagSet],
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════
 * TRANSFORMATION FEATURE (Deeply Baked)
 * ═══════════════════════════════════════════════════════════════════
 * Phenomenon: Biochem-inspired transformation logic
 * Sources: Mystique (psionic cell control), Hox genes (colinearity)
 * Features: mass conservation, tier mapping, hook architecture
 */

const TRANSFORM_REGISTRY: Record<string, { to: string; tool: string; tier: 0 | 1 | 2 | 3 }> = {
  ".ts": { to: ".js", tool: "esbuild", tier: 3 },
  ".tsx": { to: ".js", tool: "esbuild", tier: 3 },
  ".py": { to: ".pyc", tool: "compile", tier: 3 },
  ".md": { to: ".html", tool: "marked", tier: 3 },
  ".json": { to: ".ts", tool: "json2ts", tier: 2 },
  ".yaml": { to: ".json", tool: "js-yaml", tier: 2 },
  ".sql": { to: ".duckdb", tool: "duckdb", tier: 3 },
  ".pdf": { to: ".txt", tool: "pdftotext", tier: 3 },
  ".png": { to: ".txt", tool: "tesseract", tier: 3 },
  ".mp3": { to: ".txt", tool: "whisper", tier: 3 },
};

export interface TransformRecord {
  from: string;
  to: string;
  tool: string;
  tier: 0 | 1 | 2 | 3;
  massConserved: boolean;
  performedAt: string;
  durationMs?: number;
}

/**
 * Log a transformation event to the notebook.
 */
export async function logTransformation(
  fromExt: string,
  toExt: string,
  options?: { durationMs?: number; massConserved?: boolean },
): Promise<NotebookEntry> {
  const spec = TRANSFORM_REGISTRY[fromExt];
  if (!spec) {
    throw new Error(`No transformation registered for ${fromExt}`);
  }

  const record: TransformRecord = {
    from: fromExt,
    to: spec.to,
    tool: spec.tool,
    tier: spec.tier,
    massConserved: options?.massConserved ?? true,
    performedAt: new Date().toISOString(),
    durationMs: options?.durationMs,
  };

  return appendNote({
    category: "transformation",
    title: `${fromExt} → ${toExt}`,
    body: JSON.stringify(record),
    tags: ["transform", fromExt, toExt, `tier-${spec.tier}`],
    source: "transform-logger",
  });
}

/**
 * Query transformation history.
 */
export async function getTransformationHistory(options?: {
  since?: string;
  until?: string;
  limit?: number;
}): Promise<TransformRecord[]> {
  const notes = await queryNotes({
    category: "transformation",
    since: options?.since,
    until: options?.until,
    limit: options?.limit ?? 20,
  });

  return notes.map((n) => JSON.parse(n.body) as TransformRecord);
}

/**
 * Get transformation statistics.
 */
export async function getTransformStats(): Promise<{
  total: number;
  byTier: Record<number, number>;
  byTool: Record<string, number>;
  massConservedRate: number;
}> {
  const history = await getTransformationHistory({ limit: 1000 });

  const byTier: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  const byTool: Record<string, number> = {};
  let conserved = 0;

  for (const t of history) {
    byTier[t.tier] = (byTier[t.tier] ?? 0) + 1;
    byTool[t.tool] = (byTool[t.tool] ?? 0) + 1;
    if (t.massConserved) conserved++;
  }

  return {
    total: history.length,
    byTier,
    byTool,
    massConservedRate: history.length > 0 ? conserved / history.length : 0,
  };
}
