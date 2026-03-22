/**
 * Data source readers for overview-server.
 * All reads are file-based and read-only — no inter-server RPC.
 */

import { promises as fs } from "fs";
import path from "path";
import { getConfig } from "./config.js";
import type {
  AuditEventParsed,
  DataSourceStatus,
  SeedsSnapshotData,
  SeedsRepoData,
  AggregatedData,
} from "./types.js";

const config = getConfig();
const MAX_AUDIT_FILE_BYTES = 100 * 1024 * 1024; // 100MB guard
const STALE_THRESHOLD_MS = 48 * 60 * 60 * 1000; // 48 hours

// ── Helpers ──

async function fileExists(filepath: string): Promise<boolean> {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}

async function fileMtime(filepath: string): Promise<Date | null> {
  try {
    const stat = await fs.stat(filepath);
    return stat.mtime;
  } catch {
    return null;
  }
}

function isStale(mtime: Date | null): boolean {
  if (!mtime) return true;
  return Date.now() - mtime.getTime() > STALE_THRESHOLD_MS;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Echoes Audit Log ──

export async function readAuditEvents(
  sinceBoundary: string,
  limit = 500,
): Promise<{ events: AuditEventParsed[]; source: DataSourceStatus }> {
  const source: DataSourceStatus = {
    name: "echoes-audit",
    available: false,
    lastModified: null,
    recordCount: null,
    stale: true,
  };

  try {
    const auditPath = config.echoesAuditPath;
    if (!(await fileExists(auditPath))) return { events: [], source };

    const stat = await fs.stat(auditPath);
    source.lastModified = stat.mtime.toISOString();
    source.stale = isStale(stat.mtime);

    if (stat.size > MAX_AUDIT_FILE_BYTES) {
      console.error(`[overview-server] Audit log too large (${Math.round(stat.size / (1024 * 1024))}MB) — skipping`);
      return { events: [], source };
    }

    const content = await fs.readFile(auditPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    const sinceMs = new Date(sinceBoundary).getTime();

    const events: AuditEventParsed[] = [];
    // Read from end for efficiency
    for (let i = lines.length - 1; i >= 0 && events.length < limit; i--) {
      try {
        const parsed = JSON.parse(lines[i]) as Record<string, unknown>;
        const ts = parsed.timestamp as string;
        if (ts && new Date(ts).getTime() >= sinceMs) {
          events.push({
            timestamp: ts,
            source: (parsed.source as string) || "unknown",
            tool: (parsed.tool as string) || "unknown",
            status: (parsed.status as string) || "unknown",
            durationMs: parsed.durationMs as number | undefined,
            metadata: parsed.metadata as Record<string, unknown> | undefined,
          });
        } else if (ts && new Date(ts).getTime() < sinceMs) {
          break; // Audit log is chronological; stop once we pass the boundary
        }
      } catch {
        // Skip malformed lines
      }
    }

    source.available = true;
    source.recordCount = events.length;
    return { events, source };
  } catch {
    return { events: [], source };
  }
}

// ── Seeds Snapshots ──

export async function readSeedsSnapshots(): Promise<{
  latest: SeedsSnapshotData | null;
  previous: SeedsSnapshotData | null;
  source: DataSourceStatus;
}> {
  const source: DataSourceStatus = {
    name: "seeds-snapshots",
    available: false,
    lastModified: null,
    recordCount: null,
    stale: true,
  };

  try {
    const dir = config.seedsSnapshotsDir;
    if (!(await fileExists(dir))) return { latest: null, previous: null, source };

    const files = await fs.readdir(dir);
    const jsonFiles = files
      .filter((f: string) => f.endsWith(".json"))
      .sort()
      .reverse();

    if (jsonFiles.length === 0) return { latest: null, previous: null, source };

    const latestPath = path.join(dir, jsonFiles[0]);
    const mtime = await fileMtime(latestPath);
    source.lastModified = mtime?.toISOString() ?? null;
    source.stale = isStale(mtime);
    source.recordCount = jsonFiles.length;
    source.available = true;

    const latestContent = await fs.readFile(latestPath, "utf-8");
    const latestRaw = JSON.parse(latestContent) as Record<string, unknown>;
    const latest = normalizeSnapshot(latestRaw);

    let previous: SeedsSnapshotData | null = null;
    if (jsonFiles.length > 1) {
      try {
        const prevContent = await fs.readFile(path.join(dir, jsonFiles[1]), "utf-8");
        const prevRaw = JSON.parse(prevContent) as Record<string, unknown>;
        previous = normalizeSnapshot(prevRaw);
      } catch {
        // Previous snapshot unreadable — that's fine
      }
    }

    return { latest, previous, source };
  } catch {
    return { latest: null, previous: null, source };
  }
}

function normalizeSnapshot(raw: Record<string, unknown>): SeedsSnapshotData {
  const repos = Array.isArray(raw.repos)
    ? (raw.repos as Record<string, unknown>[]).map(normalizeRepo)
    : [];

  // Compute overall score as average of existing repos
  const existing = repos.filter((r) => r.exists);
  const overallScore =
    existing.length > 0
      ? Math.round(existing.reduce((sum, r) => sum + r.healthScore, 0) / existing.length)
      : null;

  return {
    timestamp: (raw.timestamp as string) || new Date().toISOString(),
    repos,
    overallScore,
  };
}

function normalizeRepo(raw: Record<string, unknown>): SeedsRepoData {
  return {
    name: (raw.name as string) || "unknown",
    exists: (raw.exists as boolean) ?? false,
    hasGit: (raw.hasGit as boolean) ?? false,
    hasDependencyFile: (raw.hasDependencyFile as boolean) ?? false,
    hasTests: (raw.hasTests as boolean) ?? false,
    healthScore: (raw.healthScore as number) ?? 0,
    branch: (raw.branch as string) || undefined,
    uncommittedChanges: (raw.uncommittedChanges as number) ?? undefined,
    lastCommit: (raw.lastCommit as string) || undefined,
    issues: Array.isArray(raw.issues) ? (raw.issues as string[]) : [],
  };
}

// ── Pulse Journal & Focus ──

export async function readPulseData(): Promise<{
  journalEntryCount: number;
  focusSessionActive: boolean;
  source: DataSourceStatus;
}> {
  const source: DataSourceStatus = {
    name: "pulse-journal",
    available: false,
    lastModified: null,
    recordCount: null,
    stale: false,
  };

  let journalEntryCount = 0;
  let focusSessionActive = false;

  try {
    // Read today's journal
    const journalPath = path.join(config.pulseJournalDir, `${todayKey()}.json`);
    if (await fileExists(journalPath)) {
      const content = await fs.readFile(journalPath, "utf-8");
      const entries = JSON.parse(content) as unknown[];
      journalEntryCount = entries.length;
      const mtime = await fileMtime(journalPath);
      source.lastModified = mtime?.toISOString() ?? null;
      source.stale = isStale(mtime);
      source.recordCount = journalEntryCount;
      source.available = true;
    }
  } catch {
    // Journal unavailable
  }

  try {
    // Check active focus session
    const focusPath = path.join(config.pulseFocusDir, "active.json");
    if (await fileExists(focusPath)) {
      const content = await fs.readFile(focusPath, "utf-8");
      const session = JSON.parse(content) as Record<string, unknown>;
      focusSessionActive = !session.endedAt;
      if (!source.available) {
        source.available = true;
        const mtime = await fileMtime(focusPath);
        source.lastModified = mtime?.toISOString() ?? null;
      }
    }
  } catch {
    // Focus unavailable
  }

  return { journalEntryCount, focusSessionActive, source };
}

// ── Afloat Workflow History ──

export async function readAfloatHistory(): Promise<{
  workflowsRunToday: number;
  source: DataSourceStatus;
}> {
  const source: DataSourceStatus = {
    name: "afloat-history",
    available: false,
    lastModified: null,
    recordCount: null,
    stale: true,
  };

  try {
    const dir = config.afloatHistoryDir;
    if (!(await fileExists(dir))) return { workflowsRunToday: 0, source };

    const files = await fs.readdir(dir);
    const jsonFiles = files.filter((f: string) => f.endsWith(".json"));
    if (jsonFiles.length === 0) return { workflowsRunToday: 0, source };

    const today = todayKey();
    let todayCount = 0;
    let latestMtime: Date | null = null;

    for (const file of jsonFiles) {
      try {
        const filePath = path.join(dir, file);
        const mtime = await fileMtime(filePath);
        if (mtime && (!latestMtime || mtime > latestMtime)) {
          latestMtime = mtime;
        }
        const content = await fs.readFile(filePath, "utf-8");
        const exec = JSON.parse(content) as Record<string, unknown>;
        if ((exec.startedAt as string)?.startsWith(today)) todayCount++;
      } catch {
        // Skip unreadable files
      }
    }

    source.available = true;
    source.lastModified = latestMtime?.toISOString() ?? null;
    source.stale = isStale(latestMtime);
    source.recordCount = jsonFiles.length;

    return { workflowsRunToday: todayCount, source };
  } catch {
    return { workflowsRunToday: 0, source };
  }
}

// ── Aggregate All Sources ──

export async function aggregateAllSources(sinceBoundary: string): Promise<AggregatedData> {
  const [auditResult, seedsResult, pulseResult, afloatResult] = await Promise.all([
    readAuditEvents(sinceBoundary),
    readSeedsSnapshots(),
    readPulseData(),
    readAfloatHistory(),
  ]);

  return {
    auditEvents: auditResult.events,
    latestSnapshot: seedsResult.latest,
    previousSnapshot: seedsResult.previous,
    journalEntryCount: pulseResult.journalEntryCount,
    focusSessionActive: pulseResult.focusSessionActive,
    workflowsRunToday: afloatResult.workflowsRunToday,
    dataSources: [
      auditResult.source,
      seedsResult.source,
      pulseResult.source,
      afloatResult.source,
    ],
    sinceBoundary,
  };
}
