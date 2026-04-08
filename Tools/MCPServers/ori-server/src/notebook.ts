/**
 * Persistent notebook — append-only NDJSON memory for cross-run context.
 *
 * Categories: observation, decision, anomaly, trend, cross-run-context
 * Auto-populated after test runs, report generation, threat model parses.
 * Queryable by category, tags, project, and time.
 */

import { generateId } from "@cascade/shared-types/id";
import { promises as fs } from "fs";
import path from "path";
import { getConfig } from "./config.js";

const config = getConfig();

export type NoteCategory = "observation" | "decision" | "anomaly" | "trend" | "cross-run-context";

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
