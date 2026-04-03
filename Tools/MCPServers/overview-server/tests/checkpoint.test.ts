import { describe, it, expect, beforeAll } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { aggregateCheckpoint } from "../src/checkpoint.js";

const TEST_DIR = "/tmp/overview-test-checkpoint";

describe("checkpoint aggregation", () => {
  beforeAll(async () => {
    // Set up temp dirs
    const snapshotsDir = path.join(TEST_DIR, "snapshots");
    const journalDir = path.join(TEST_DIR, "journal");
    const focusDir = path.join(TEST_DIR, "focus");
    const historyDir = path.join(TEST_DIR, "history");
    const auditPath = path.join(TEST_DIR, "audit.ndjson");

    await fs.mkdir(snapshotsDir, { recursive: true });
    await fs.mkdir(journalDir, { recursive: true });
    await fs.mkdir(focusDir, { recursive: true });
    await fs.mkdir(historyDir, { recursive: true });

    // Write a test snapshot
    const snapshot = {
      timestamp: new Date().toISOString(),
      repos: [
        {
          name: "GRID",
          exists: true,
          hasGit: true,
          hasDependencyFile: true,
          hasTests: true,
          healthScore: 85,
          branch: "main",
          uncommittedChanges: 2,
          lastCommit: "2 hours ago",
          issues: [],
        },
        {
          name: "hogsmade",
          exists: true,
          hasGit: true,
          hasDependencyFile: true,
          hasTests: true,
          healthScore: 90,
          branch: "main",
          uncommittedChanges: 0,
          lastCommit: "1 day ago",
          issues: [],
        },
      ],
    };
    await fs.writeFile(
      path.join(snapshotsDir, "snapshot-2025-01-01.json"),
      JSON.stringify(snapshot),
    );

    // Write audit events
    const now = new Date().toISOString();
    const auditLines = [
      JSON.stringify({
        timestamp: now,
        source: "seeds-server",
        tool: "ecosystem_scan",
        status: "success",
        durationMs: 150,
      }),
      JSON.stringify({
        timestamp: now,
        source: "pulse-server",
        tool: "morning_briefing",
        status: "success",
        durationMs: 300,
      }),
    ].join("\n");
    await fs.writeFile(auditPath, auditLines + "\n");

    // Set env vars
    process.env.ECHOES_AUDIT_PATH = auditPath;
    process.env.SEEDS_SNAPSHOTS_DIR = snapshotsDir;
    process.env.PULSE_JOURNAL_DIR = journalDir;
    process.env.PULSE_FOCUS_DIR = focusDir;
    process.env.AFLOAT_HISTORY_DIR = historyDir;
    process.env.OVERVIEW_DATA_DIR = TEST_DIR;
  });

  it("returns valid checkpoint with all top-level keys", async () => {
    const checkpoint = await aggregateCheckpoint({});

    expect(checkpoint.meta).toBeDefined();
    expect(checkpoint.trajectory).toBeDefined();
    expect(checkpoint.clusters).toBeDefined();
    expect(checkpoint.drift).toBeDefined();
    expect(checkpoint.trust).toBeDefined();

    expect(checkpoint.meta.depth).toBe("standard");
    expect(checkpoint.meta.focus).toBeNull();
    expect(checkpoint.clusters.length).toBe(6);
  });

  it("deep mode includes rawSources", async () => {
    const checkpoint = await aggregateCheckpoint({ depth: "deep" });
    expect(checkpoint.rawSources).toBeDefined();
    expect(typeof checkpoint.rawSources!.auditEventCount).toBe("number");
  });

  it("summary mode strips entity details", async () => {
    const checkpoint = await aggregateCheckpoint({ depth: "summary" });
    for (const cluster of checkpoint.clusters) {
      for (const entity of cluster.entities) {
        expect(entity.branch).toBeNull();
        expect(entity.issues).toEqual([]);
      }
    }
  });

  it("focus parameter filters cluster detail", async () => {
    const checkpoint = await aggregateCheckpoint({ focus: "grid-family" });
    expect(checkpoint.meta.focus).toBe("grid-family");
    // Grid family should have enriched entities
    const gridCluster = checkpoint.clusters.find((c) => c.id === "grid-family");
    expect(gridCluster).toBeDefined();
  });

  it("trajectory has a valid direction with single snapshot", async () => {
    const checkpoint = await aggregateCheckpoint({});
    // With a single snapshot the trajectory depends on audit data — any direction is valid
    expect(["stable", "improving", "degrading", "unknown"]).toContain(
      checkpoint.trajectory.direction,
    );
    expect(checkpoint.trajectory.evidence.length).toBeGreaterThan(0);
  });
});
