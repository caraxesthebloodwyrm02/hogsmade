/**
 * Drift detection — pure function, no I/O.
 * Takes aggregated data and returns a DriftReport.
 */

import type {
  AggregatedData,
  DriftReport,
  DriftItem,
  DriftSeverity,
  DriftItemSeverity,
  AuditEventParsed,
} from "./types.js";

export function detectDrift(data: AggregatedData): DriftReport {
  const items: DriftItem[] = [
    ...detectUncommittedChanges(data),
    ...detectStaleBranches(data),
    ...detectTestFailures(data),
    ...detectAuditAnomalies(data),
    ...detectScoreDrop(data),
    ...detectStaleData(data),
  ];

  const severity = computeOverallSeverity(items);

  return {
    totalDriftItems: items.length,
    severity,
    items,
  };
}

// ── Uncommitted Changes ──

function detectUncommittedChanges(data: AggregatedData): DriftItem[] {
  if (!data.latestSnapshot) return [];

  return data.latestSnapshot.repos
    .filter((r) => r.exists && r.uncommittedChanges != null && r.uncommittedChanges > 0)
    .map((r) => {
      const count = r.uncommittedChanges!;
      let severity: DriftItemSeverity = "info";
      if (count >= 5 && count <= 20) severity = "warning";
      if (count > 20) severity = "critical";

      return {
        entity: r.name,
        type: "uncommitted-changes" as const,
        detail: `${count} uncommitted change${count === 1 ? "" : "s"}`,
        severity,
        firstDetected: data.latestSnapshot!.timestamp,
      };
    });
}

// ── Stale Branches ──

function detectStaleBranches(data: AggregatedData): DriftItem[] {
  if (!data.latestSnapshot) return [];

  return data.latestSnapshot.repos
    .filter((r) => {
      if (!r.exists || !r.lastCommit) return false;
      const lc = r.lastCommit.toLowerCase();
      return lc.includes("month") || lc.includes("year");
    })
    .map((r) => ({
      entity: r.name,
      type: "stale-branch" as const,
      detail: `Last commit: ${r.lastCommit}`,
      severity: "warning" as const,
      firstDetected: data.latestSnapshot!.timestamp,
    }));
}

// ── Test Failures (from audit events) ──

function detectTestFailures(data: AggregatedData): DriftItem[] {
  const failuresBySource = new Map<string, number>();

  for (const event of data.auditEvents) {
    if (event.status === "failure" || event.status === "error") {
      failuresBySource.set(event.source, (failuresBySource.get(event.source) ?? 0) + 1);
    }
  }

  const items: DriftItem[] = [];
  for (const [source, count] of failuresBySource) {
    let severity: DriftItemSeverity = "warning";
    if (count > 3) severity = "critical";

    items.push({
      entity: source,
      type: "test-failure",
      detail: `${count} failure${count === 1 ? "" : "s"} in audit window`,
      severity,
      firstDetected: null,
    });
  }

  return items;
}

// ── Audit Anomalies (burst detection) ──

function detectAuditAnomalies(data: AggregatedData): DriftItem[] {
  // Group events by source within 1-hour windows
  const hourBuckets = new Map<string, number>();
  const ONE_HOUR_MS = 60 * 60 * 1000;

  for (const event of data.auditEvents) {
    if (event.status !== "failure" && event.status !== "error" && event.status !== "blocked") {
      continue;
    }
    const ts = new Date(event.timestamp).getTime();
    const hourKey = `${event.source}:${Math.floor(ts / ONE_HOUR_MS)}`;
    hourBuckets.set(hourKey, (hourBuckets.get(hourKey) ?? 0) + 1);
  }

  const items: DriftItem[] = [];
  const seenSources = new Set<string>();

  for (const [key, count] of hourBuckets) {
    if (count > 10) {
      const source = key.split(":")[0];
      if (seenSources.has(source)) continue;
      seenSources.add(source);

      items.push({
        entity: source,
        type: "audit-anomaly",
        detail: `${count} failures from ${source} within 1 hour`,
        severity: "critical",
        firstDetected: null,
      });
    }
  }

  return items;
}

// ── Snapshot Score Drop ──

function detectScoreDrop(data: AggregatedData): DriftItem[] {
  if (!data.latestSnapshot?.overallScore || !data.previousSnapshot?.overallScore) {
    return [];
  }

  const delta = data.latestSnapshot.overallScore - data.previousSnapshot.overallScore;
  if (delta >= -10) return []; // No significant drop

  let severity: DriftItemSeverity = "warning";
  if (delta < -25) severity = "critical";

  return [
    {
      entity: "ecosystem",
      type: "snapshot-score-drop",
      detail: `Ecosystem score dropped by ${Math.abs(delta)} points (${
        data.previousSnapshot.overallScore
      } → ${data.latestSnapshot.overallScore})`,
      severity,
      firstDetected: data.latestSnapshot.timestamp,
    },
  ];
}

// ── Stale Data Sources ──

function detectStaleData(data: AggregatedData): DriftItem[] {
  const items: DriftItem[] = [];
  const HOURS_48 = 48 * 60 * 60 * 1000;
  const HOURS_96 = 96 * 60 * 60 * 1000;

  for (const src of data.dataSources) {
    if (!src.lastModified) continue;
    const ageMs = Date.now() - new Date(src.lastModified).getTime();

    if (ageMs > HOURS_96) {
      items.push({
        entity: src.name,
        type: "stale-data",
        detail: `Data source "${src.name}" last updated ${Math.round(
          ageMs / (60 * 60 * 1000),
        )}h ago`,
        severity: "warning",
        firstDetected: null,
      });
    } else if (ageMs > HOURS_48) {
      items.push({
        entity: src.name,
        type: "stale-data",
        detail: `Data source "${src.name}" last updated ${Math.round(
          ageMs / (60 * 60 * 1000),
        )}h ago`,
        severity: "info",
        firstDetected: null,
      });
    }
  }

  return items;
}

// ── Overall Severity ──

function computeOverallSeverity(items: DriftItem[]): DriftSeverity {
  if (items.length === 0) return "none";
  if (items.some((i) => i.severity === "critical")) return "high";
  if (items.some((i) => i.severity === "warning")) return "moderate";
  return "low";
}
