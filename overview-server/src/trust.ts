/**
 * Trust signal computation — pure function, no I/O.
 * Base score 50, adjusted by evidence signals.
 */

import type {
  AggregatedData,
  DriftReport,
  TrustSignal,
  TrustBasisItem,
  Confidence,
} from "./types.js";

export function computeTrust(
  data: AggregatedData,
  drift: DriftReport,
): TrustSignal {
  const basis: TrustBasisItem[] = [];
  let score = 50; // neutral base

  // ── Positive signals ──

  if (data.latestSnapshot?.overallScore != null) {
    if (data.latestSnapshot.overallScore >= 80) {
      const weight = 15;
      score += weight;
      basis.push({
        signal: `Seeds ecosystem score ${data.latestSnapshot.overallScore}/100 (strong)`,
        weight,
        sentiment: "positive",
      });
    } else if (data.latestSnapshot.overallScore >= 60) {
      const weight = 10;
      score += weight;
      basis.push({
        signal: `Seeds ecosystem score ${data.latestSnapshot.overallScore}/100 (healthy)`,
        weight,
        sentiment: "positive",
      });
    }
  }

  // Score improvement
  if (
    data.latestSnapshot?.overallScore != null &&
    data.previousSnapshot?.overallScore != null &&
    data.latestSnapshot.overallScore > data.previousSnapshot.overallScore
  ) {
    const delta = data.latestSnapshot.overallScore - data.previousSnapshot.overallScore;
    const weight = 5;
    score += weight;
    basis.push({
      signal: `Score improved by ${delta} since last snapshot`,
      weight,
      sentiment: "positive",
    });
  }

  // Zero audit failures
  const auditFailures = data.auditEvents.filter(
    (e) => e.status === "failure" || e.status === "error" || e.status === "blocked",
  ).length;

  if (auditFailures === 0 && data.auditEvents.length > 0) {
    const weight = 10;
    score += weight;
    basis.push({
      signal: `Zero audit failures in window (${data.auditEvents.length} events clean)`,
      weight,
      sentiment: "positive",
    });
  }

  // Active focus session
  if (data.focusSessionActive) {
    const weight = 3;
    score += weight;
    basis.push({
      signal: "Active focus session",
      weight,
      sentiment: "positive",
    });
  }

  // Journal entries
  if (data.journalEntryCount > 0) {
    const weight = 2;
    score += weight;
    basis.push({
      signal: `${data.journalEntryCount} journal entries today`,
      weight,
      sentiment: "positive",
    });
  }

  // ── Negative signals ──

  if (data.latestSnapshot?.overallScore != null) {
    if (data.latestSnapshot.overallScore < 40) {
      const weight = -20;
      score += weight;
      basis.push({
        signal: `Seeds ecosystem score ${data.latestSnapshot.overallScore}/100 (critical)`,
        weight,
        sentiment: "negative",
      });
    } else if (data.latestSnapshot.overallScore < 60) {
      const weight = -10;
      score += weight;
      basis.push({
        signal: `Seeds ecosystem score ${data.latestSnapshot.overallScore}/100 (below healthy)`,
        weight,
        sentiment: "negative",
      });
    }
  }

  // Score degradation
  if (
    data.latestSnapshot?.overallScore != null &&
    data.previousSnapshot?.overallScore != null &&
    data.latestSnapshot.overallScore < data.previousSnapshot.overallScore
  ) {
    const delta = data.previousSnapshot.overallScore - data.latestSnapshot.overallScore;
    const weight = -5;
    score += weight;
    basis.push({
      signal: `Score degraded by ${delta} since last snapshot`,
      weight,
      sentiment: "negative",
    });
  }

  // Audit failures
  if (auditFailures > 0) {
    const weight = Math.max(-15, auditFailures * -3);
    score += weight;
    basis.push({
      signal: `${auditFailures} audit failure${auditFailures === 1 ? "" : "s"} in window`,
      weight,
      sentiment: "negative",
    });
  }

  // No seeds snapshot
  if (!data.latestSnapshot) {
    const weight = -10;
    score += weight;
    basis.push({
      signal: "No seeds snapshot available",
      weight,
      sentiment: "negative",
    });
  }

  // Audit log unavailable
  const auditSource = data.dataSources.find((s) => s.name === "echoes-audit");
  if (auditSource && !auditSource.available) {
    const weight = -10;
    score += weight;
    basis.push({
      signal: "Audit log unavailable",
      weight,
      sentiment: "negative",
    });
  }

  // Critical drift items
  const criticalDriftCount = drift.items.filter((i) => i.severity === "critical").length;
  if (criticalDriftCount > 0) {
    const weight = Math.max(-15, criticalDriftCount * -5);
    score += weight;
    basis.push({
      signal: `${criticalDriftCount} critical drift item${criticalDriftCount === 1 ? "" : "s"}`,
      weight,
      sentiment: "negative",
    });
  }

  // Clamp score to 0-100
  score = Math.max(0, Math.min(100, score));

  // Determine confidence
  const availableSources = data.dataSources.filter((s) => s.available).length;
  const confidence = computeConfidence(score, availableSources);

  return { confidence, score, basis };
}

function computeConfidence(score: number, availableSources: number): Confidence {
  if (score < 30 || availableSources < 2) return "insufficient-data";
  if (score >= 75) return "high";
  if (score >= 50) return "moderate";
  return "low";
}
