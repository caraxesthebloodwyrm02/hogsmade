/**
 * Relational trust computation — "trust score 47 to whom?"
 *
 * Trust is a relationship between an observer and a subject.
 * Different observers see different trust levels. The system
 * computes trust from the builder's perspective (daily user),
 * the ecosystem's self-assessment, and a newcomer's first impression.
 *
 * Pure function, no I/O.
 */

import type {
  AggregatedData,
  ClusterInsight,
  DriftReport,
  TrustAssessment,
  TrustRelationship,
  TrustBasisItem,
  TrustObserver,
} from "./types.js";

// ── Public API ──

export function computeTrust(
  data: AggregatedData,
  drift: DriftReport,
  clusters: ClusterInsight[],
): TrustAssessment {
  const relationships: TrustRelationship[] = [];

  // Builder perspective — per cluster
  for (const cluster of clusters) {
    relationships.push(computeBuilderTrust(cluster, data, drift));
  }

  // Ecosystem self-assessment
  relationships.push(computeEcosystemSelfTrust(data, drift));

  // Newcomer perspective — can someone new look at this and feel held?
  relationships.push(computeNewcomerTrust(data, clusters));

  // Generate narrative
  const narrative = generateNarrative(relationships, drift);

  // Legacy flat score for backward compatibility
  const builderRelationships = relationships.filter((r) => r.observer === "builder");
  const validScores = builderRelationships
    .map((r) => r.confidence)
    .filter((c): c is number => c !== null);
  const legacyScore =
    validScores.length > 0
      ? Math.round((validScores.reduce((a, b) => a + b, 0) / validScores.length) * 100)
      : 50;

  return { relationships, narrative, legacyScore };
}

// ── Builder Perspective ──
// The daily user who knows the system. Cares about: health scores,
// audit failures, drift, activity recency.

function computeBuilderTrust(
  cluster: ClusterInsight,
  data: AggregatedData,
  drift: DriftReport,
): TrustRelationship {
  const basis: TrustBasisItem[] = [];
  let score = 0.5; // neutral

  // Cluster health
  if (cluster.clusterHealth >= 80) {
    score += 0.2;
    basis.push({
      signal: `Health ${cluster.clusterHealth}/100 (strong)`,
      weight: 0.2,
      sentiment: "positive",
    });
  } else if (cluster.clusterHealth >= 60) {
    score += 0.1;
    basis.push({
      signal: `Health ${cluster.clusterHealth}/100 (stable)`,
      weight: 0.1,
      sentiment: "positive",
    });
  } else if (cluster.clusterHealth > 0) {
    score -= 0.15;
    basis.push({
      signal: `Health ${cluster.clusterHealth}/100 (below threshold)`,
      weight: -0.15,
      sentiment: "negative",
    });
  }

  // Issue count
  if (cluster.issueCount === 0) {
    score += 0.1;
    basis.push({ signal: "No open issues", weight: 0.1, sentiment: "positive" });
  } else if (cluster.issueCount > 3) {
    score -= 0.1;
    basis.push({
      signal: `${cluster.issueCount} open issues`,
      weight: -0.1,
      sentiment: "negative",
    });
  }

  // Drift items affecting this cluster
  const clusterEntityNames = new Set(cluster.entities.map((e) => e.name.toLowerCase()));
  const clusterDrift = drift.items.filter((d) => clusterEntityNames.has(d.entity.toLowerCase()));
  const criticalDrift = clusterDrift.filter((d) => d.severity === "critical");

  if (criticalDrift.length > 0) {
    score -= 0.2;
    basis.push({
      signal: `${criticalDrift.length} critical drift item${criticalDrift.length === 1 ? "" : "s"}`,
      weight: -0.2,
      sentiment: "negative",
    });
  } else if (clusterDrift.length === 0) {
    score += 0.05;
    basis.push({ signal: "No drift detected", weight: 0.05, sentiment: "positive" });
  }

  // Audit activity for cluster entities
  const clusterAuditFailures = cluster.entities.reduce(
    (sum, e) => sum + e.auditSummary.failures,
    0,
  );
  const clusterAuditEvents = cluster.entities.reduce(
    (sum, e) => sum + e.auditSummary.eventsInWindow,
    0,
  );

  if (clusterAuditEvents > 0 && clusterAuditFailures === 0) {
    score += 0.1;
    basis.push({
      signal: `${clusterAuditEvents} audit events, zero failures`,
      weight: 0.1,
      sentiment: "positive",
    });
  } else if (clusterAuditFailures > 0) {
    const penalty = Math.min(0.2, clusterAuditFailures * 0.05);
    score -= penalty;
    basis.push({
      signal: `${clusterAuditFailures} audit failure${
        clusterAuditFailures === 1 ? "" : "s"
      } in window`,
      weight: -penalty,
      sentiment: "negative",
    });
  }

  return {
    observer: "builder",
    subject: cluster.id,
    confidence: clamp01(score),
    basis,
  };
}

// ── Ecosystem Self-Assessment ──
// The system looking at itself. Cares about: data source availability,
// overall trajectory, whether it can see its own state clearly.

function computeEcosystemSelfTrust(data: AggregatedData, drift: DriftReport): TrustRelationship {
  const basis: TrustBasisItem[] = [];
  let score = 0.5;

  // Data source coverage
  const available = data.dataSources.filter((s) => s.available).length;
  const total = data.dataSources.length;
  const coverage = total > 0 ? available / total : 0;

  if (coverage >= 0.8) {
    score += 0.15;
    basis.push({
      signal: `${available}/${total} data sources available`,
      weight: 0.15,
      sentiment: "positive",
    });
  } else if (coverage >= 0.5) {
    score += 0.05;
    basis.push({
      signal: `${available}/${total} data sources available (partial visibility)`,
      weight: 0.05,
      sentiment: "neutral",
    });
  } else {
    score -= 0.2;
    basis.push({
      signal: `Only ${available}/${total} data sources — limited self-awareness`,
      weight: -0.2,
      sentiment: "negative",
    });
  }

  // Staleness
  const staleCount = data.dataSources.filter((s) => s.stale).length;
  if (staleCount > 0) {
    const penalty = Math.min(0.15, staleCount * 0.05);
    score -= penalty;
    basis.push({
      signal: `${staleCount} stale data source${staleCount === 1 ? "" : "s"}`,
      weight: -penalty,
      sentiment: "negative",
    });
  }

  // Overall ecosystem score
  if (data.latestSnapshot?.overallScore != null) {
    if (data.latestSnapshot.overallScore >= 80) {
      score += 0.15;
      basis.push({
        signal: `Ecosystem score ${data.latestSnapshot.overallScore}/100`,
        weight: 0.15,
        sentiment: "positive",
      });
    } else if (data.latestSnapshot.overallScore < 50) {
      score -= 0.15;
      basis.push({
        signal: `Ecosystem score ${data.latestSnapshot.overallScore}/100 (low)`,
        weight: -0.15,
        sentiment: "negative",
      });
    }
  } else {
    score -= 0.1;
    basis.push({ signal: "No ecosystem score available", weight: -0.1, sentiment: "negative" });
  }

  // Drift severity
  if (drift.severity === "high") {
    score -= 0.15;
    basis.push({ signal: "High overall drift severity", weight: -0.15, sentiment: "negative" });
  } else if (drift.severity === "none") {
    score += 0.1;
    basis.push({ signal: "No drift detected ecosystem-wide", weight: 0.1, sentiment: "positive" });
  }

  return {
    observer: "ecosystem",
    subject: "self",
    confidence: clamp01(score),
    basis,
  };
}

// ── Newcomer Perspective ──
// Can someone new look at this and feel held? Cares about:
// completeness, documentation signals, overall health, no alarming failures.

function computeNewcomerTrust(data: AggregatedData, clusters: ClusterInsight[]): TrustRelationship {
  const basis: TrustBasisItem[] = [];

  // If we don't have enough data, say so honestly
  const available = data.dataSources.filter((s) => s.available).length;
  if (available < 2) {
    return {
      observer: "newcomer",
      subject: "ecosystem",
      confidence: null,
      basis: [
        { signal: "Not enough signal to form an impression", weight: 0, sentiment: "neutral" },
      ],
    };
  }

  let score = 0.5;

  // Overall health impression
  const healthyClusters = clusters.filter((c) => c.clusterHealth >= 70);
  const ratio = clusters.length > 0 ? healthyClusters.length / clusters.length : 0;

  if (ratio >= 0.7) {
    score += 0.2;
    basis.push({
      signal: `${healthyClusters.length}/${clusters.length} clusters healthy — ecosystem feels coherent`,
      weight: 0.2,
      sentiment: "positive",
    });
  } else if (ratio >= 0.4) {
    score += 0.05;
    basis.push({
      signal: `${healthyClusters.length}/${clusters.length} clusters healthy — mixed signals`,
      weight: 0.05,
      sentiment: "neutral",
    });
  } else {
    score -= 0.15;
    basis.push({
      signal: `Only ${healthyClusters.length}/${clusters.length} clusters healthy`,
      weight: -0.15,
      sentiment: "negative",
    });
  }

  // Failure visibility — are there alarming failures a newcomer would see?
  const totalFailures = data.auditEvents.filter(
    (e) => e.status === "failure" || e.status === "error" || e.status === "blocked",
  ).length;

  if (totalFailures === 0) {
    score += 0.15;
    basis.push({
      signal: "No visible failures — clean first impression",
      weight: 0.15,
      sentiment: "positive",
    });
  } else if (totalFailures > 10) {
    score -= 0.2;
    basis.push({
      signal: `${totalFailures} failures visible — could feel chaotic`,
      weight: -0.2,
      sentiment: "negative",
    });
  }

  // Active builder presence — does it feel maintained?
  if (data.focusSessionActive || data.journalEntryCount > 0) {
    score += 0.1;
    basis.push({ signal: "Active builder presence detected", weight: 0.1, sentiment: "positive" });
  }

  return {
    observer: "newcomer",
    subject: "ecosystem",
    confidence: clamp01(score),
    basis,
  };
}

// ── Narrative Generation ──

function generateNarrative(relationships: TrustRelationship[], drift: DriftReport): string {
  const parts: string[] = [];

  // Builder cluster summaries — pick the strongest and weakest
  const builderRels = relationships
    .filter((r) => r.observer === "builder" && r.confidence !== null)
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));

  if (builderRels.length > 0) {
    const strongest = builderRels[0];
    const pct = Math.round((strongest.confidence ?? 0) * 100);
    if (pct >= 75) {
      parts.push(`${subjectLabel(strongest.subject)} is solid at ${pct}% confidence.`);
    } else {
      parts.push(`${subjectLabel(strongest.subject)} leads at ${pct}% confidence.`);
    }
  }

  if (builderRels.length > 1) {
    const weakest = builderRels[builderRels.length - 1];
    const pct = Math.round((weakest.confidence ?? 0) * 100);
    if (pct < 50) {
      parts.push(`${subjectLabel(weakest.subject)} needs attention (${pct}%).`);
    } else {
      parts.push(`${subjectLabel(weakest.subject)} is holding at ${pct}%.`);
    }
  }

  // Ecosystem self
  const eco = relationships.find((r) => r.observer === "ecosystem");
  if (eco?.confidence != null) {
    const pct = Math.round(eco.confidence * 100);
    if (pct >= 70) {
      parts.push("The ecosystem is watching itself heal.");
    } else if (pct >= 50) {
      parts.push("The ecosystem sees itself clearly but with gaps.");
    } else {
      parts.push("The ecosystem's self-awareness is limited.");
    }
  }

  // Drift color
  if (drift.severity === "high") {
    parts.push("Active drift needs pruning.");
  } else if (drift.severity === "none") {
    parts.push("No drift — the garden is quiet.");
  }

  return parts.join(" ");
}

function subjectLabel(subject: string): string {
  const labels: Record<string, string> = {
    "grid-family": "Grid family",
    "mcp-infrastructure": "MCP infrastructure",
    "canopy-apps": "Canopy apps",
    "glimpse-family": "Glimpse family",
    "deployment-pipeline": "Deployment pipeline",
    "seed-archive": "Seed & archive",
    self: "The ecosystem",
    ecosystem: "The ecosystem",
  };
  return labels[subject] ?? subject;
}

// ── Helpers ──

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
