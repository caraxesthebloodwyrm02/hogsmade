/**
 * Cross-server interop — read-only access to sibling MCP server data.
 *
 * Reads:
 * - Echoes audit log (~/.echoes/audit.ndjson)
 * - Seeds snapshots (~/.seeds-server/snapshots/)
 * - Pulse priorities (~/.pulse-server/)
 *
 * All reads are graceful — returns empty/null when files don't exist.
 */

import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { getConfig } from "./config.js";

const config = getConfig();

// ── Types ──

export interface EchoesAuditEvent {
  timestamp: string;
  source: string;
  tool: string;
  status: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

export interface SeedsSnapshot {
  timestamp: string;
  overallScore: number;
  repos: Array<{
    name: string;
    healthScore: number;
    status?: string;
  }>;
}

export interface EcosystemContext {
  echoes: {
    recentEvents: EchoesAuditEvent[];
    totalEvents: number;
    sourceBreakdown: Record<string, number>;
  };
  seeds: {
    latestSnapshot: SeedsSnapshot | null;
    snapshotCount: number;
  };
  collectedAt: string;
}

// ── Echoes audit log ──

/**
 * Read recent entries from the Echoes audit log.
 * Graceful: returns empty array if file doesn't exist.
 */
export async function readEchoesAudit(limit = 50): Promise<EchoesAuditEvent[]> {
  try {
    const content = await fs.readFile(config.echoesAuditPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);

    const events: EchoesAuditEvent[] = [];
    // Read from end for most recent
    const startIdx = Math.max(0, lines.length - limit);
    for (let i = startIdx; i < lines.length; i++) {
      try {
        events.push(JSON.parse(lines[i]) as EchoesAuditEvent);
      } catch {
        // Skip corrupt lines
      }
    }

    return events.reverse(); // Most recent first
  } catch {
    return [];
  }
}

/**
 * Get audit stats — source breakdown, total count.
 */
export async function getEchoesAuditStats(): Promise<{
  totalEvents: number;
  sourceBreakdown: Record<string, number>;
  recentSources: string[];
}> {
  const events = await readEchoesAudit(200);
  const sourceBreakdown: Record<string, number> = {};
  for (const e of events) {
    sourceBreakdown[e.source] = (sourceBreakdown[e.source] ?? 0) + 1;
  }
  const recentSources = [...new Set(events.slice(0, 20).map((e) => e.source))];
  return { totalEvents: events.length, sourceBreakdown, recentSources };
}

// ── Seeds snapshots ──

function seedsSnapshotDir(): string {
  return path.resolve(
    process.env.SEEDS_SNAPSHOT_DIR?.trim() || path.join(os.homedir(), ".seeds-server", "snapshots"),
  );
}

/**
 * Load the latest Seeds ecosystem snapshot.
 * Files are named snapshot-{timestamp}.json — sort by name for latest.
 */
export async function loadLatestSeedsSnapshot(): Promise<SeedsSnapshot | null> {
  try {
    const dir = seedsSnapshotDir();
    const files = await fs.readdir(dir);
    const snapshots = files.filter((f) => f.startsWith("snapshot-") && f.endsWith(".json")).sort();

    if (snapshots.length === 0) return null;

    const latest = snapshots[snapshots.length - 1];
    const content = await fs.readFile(path.join(dir, latest), "utf-8");
    const parsed = JSON.parse(content);

    return {
      timestamp: parsed.timestamp ?? parsed.generatedAt ?? latest,
      overallScore: parsed.overallScore ?? parsed.overall_score ?? 0,
      repos: Array.isArray(parsed.repos)
        ? parsed.repos.map((r: Record<string, unknown>) => ({
            name: (r.name ?? r.repo ?? "") as string,
            healthScore: (r.healthScore ?? r.health_score ?? 0) as number,
            status: (r.status ?? "") as string,
          }))
        : [],
    };
  } catch {
    return null;
  }
}

/**
 * Count available snapshots.
 */
export async function countSeedsSnapshots(): Promise<number> {
  try {
    const dir = seedsSnapshotDir();
    const files = await fs.readdir(dir);
    return files.filter((f) => f.startsWith("snapshot-") && f.endsWith(".json")).length;
  } catch {
    return 0;
  }
}

// ── Aggregated ecosystem context ──

/**
 * Collect cross-server context into a single object.
 * Read-only. All reads graceful.
 */
export async function collectEcosystemContext(): Promise<EcosystemContext> {
  const [recentEvents, auditStats, latestSnapshot, snapshotCount] = await Promise.all([
    readEchoesAudit(30),
    getEchoesAuditStats(),
    loadLatestSeedsSnapshot(),
    countSeedsSnapshots(),
  ]);

  return {
    echoes: {
      recentEvents: recentEvents.slice(0, 10),
      totalEvents: auditStats.totalEvents,
      sourceBreakdown: auditStats.sourceBreakdown,
    },
    seeds: {
      latestSnapshot,
      snapshotCount,
    },
    collectedAt: new Date().toISOString(),
  };
}
