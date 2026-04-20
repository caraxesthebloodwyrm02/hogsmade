/**
 * Checkpoint orchestrator — aggregates all sources, computes clusters,
 * drift, trust, and assembles the final Checkpoint response.
 */

import type {
  Checkpoint,
  CheckpointMeta,
  Depth,
  Trajectory,
  RawSources,
  AggregatedData,
} from "./types.js";
import { aggregateAllSources } from "./sources.js";
import { computeClusterInsights } from "./clusters.js";
import { detectDrift } from "./drift.js";
import { computeTrust } from "./trust.js";

export interface CheckpointParams {
  focus?: string;
  since?: string;
  depth?: Depth;
}

export async function aggregateCheckpoint(params: CheckpointParams): Promise<Checkpoint> {
  const depth: Depth = params.depth ?? "standard";
  const sinceBoundary = params.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const focus = params.focus ?? null;

  // 1. Gather all source data
  const data = await aggregateAllSources(sinceBoundary);

  // 2. Compute cluster insights
  const clusters = computeClusterInsights(data, focus);

  // 3. Detect drift
  const drift = detectDrift(data);

  // 4. Compute relational trust
  const trust = computeTrust(data, drift, clusters);

  // 5. Compute trajectory
  const trajectory = computeTrajectory(data);

  // 6. Assemble meta
  const meta: CheckpointMeta = {
    generatedAt: new Date().toISOString(),
    sinceBoundary,
    focus,
    depth,
    dataSources: data.dataSources,
  };

  // 7. Assemble checkpoint
  const checkpoint: Checkpoint = {
    meta,
    trajectory,
    clusters,
    drift,
    trust,
  };

  // 8. Add raw sources in deep mode
  if (depth === "deep") {
    checkpoint.rawSources = buildRawSources(data);
  }

  // 9. In summary mode, strip entity details from non-focused clusters
  if (depth === "summary") {
    for (const cluster of checkpoint.clusters) {
      cluster.entities = cluster.entities.map((e) => ({
        ...e,
        branch: null,
        uncommittedChanges: null,
        lastActivity: null,
        issues: [],
        auditSummary: { eventsInWindow: 0, failures: 0, lastStatus: null },
      }));
    }
  }

  return checkpoint;
}

// ── Trajectory ──

function computeTrajectory(data: AggregatedData): Trajectory {
  const ecosystemScore = data.latestSnapshot?.overallScore ?? null;
  const previousScore = data.previousSnapshot?.overallScore ?? null;
  const scoreDelta =
    ecosystemScore != null && previousScore != null ? ecosystemScore - previousScore : null;

  const evidence: string[] = [];
  let direction: Trajectory["direction"] = "unknown";

  if (ecosystemScore != null) {
    evidence.push(`Current ecosystem score: ${ecosystemScore}/100`);
  }

  if (scoreDelta != null) {
    if (scoreDelta > 5) {
      direction = "improving";
      evidence.push(`Score improved by ${scoreDelta} points`);
    } else if (scoreDelta < -5) {
      direction = "degrading";
      evidence.push(`Score degraded by ${Math.abs(scoreDelta)} points`);
    } else {
      direction = "stable";
      evidence.push(`Score stable (delta: ${scoreDelta})`);
    }
  } else if (ecosystemScore != null) {
    direction = "stable";
    evidence.push("Only one snapshot available — assuming stable");
  }

  // Audit event health
  const totalEvents = data.auditEvents.length;
  const failures = data.auditEvents.filter(
    (e) => e.status === "failure" || e.status === "error" || e.status === "blocked",
  ).length;

  if (totalEvents > 0) {
    const failRate = failures / totalEvents;
    evidence.push(
      `${totalEvents} audit events, ${failures} failures (${Math.round(
        failRate * 100,
      )}% fail rate)`,
    );
    if (failRate > 0.2 && direction !== "degrading") {
      direction = "degrading";
      evidence.push("High audit failure rate suggests degradation");
    }
  }

  // Available sources
  const available = data.dataSources.filter((s) => s.available).length;
  evidence.push(`${available}/${data.dataSources.length} data sources available`);

  return {
    direction,
    ecosystemScore,
    previousScore,
    scoreDelta,
    evidence,
  };
}

// ── Raw Sources ──

function buildRawSources(data: AggregatedData): RawSources {
  return {
    auditEventCount: data.auditEvents.length,
    snapshotTimestamp: data.latestSnapshot?.timestamp ?? null,
    journalEntryCount: data.journalEntryCount,
    focusSessionActive: data.focusSessionActive,
    workflowsRunToday: data.workflowsRunToday,
  };
}
