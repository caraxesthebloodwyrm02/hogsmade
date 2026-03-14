/**
 * Confidence Calibration & Inference Gap Ledger
 *
 * Tracks inference quality, detects gaps in reasoning, and calibrates
 * confidence scores based on evidence density and cross-referencing.
 * Pure functions, browser-compatible, zero dependencies.
 */

/**
 * Gap types the ledger tracks.
 */
export const GAP_TYPES = {
  MISSING_DIMENSION: "missing_dimension",
  LOW_COVERAGE: "low_coverage",
  CONFLICTING_EVIDENCE: "conflicting_evidence",
  WEAK_BASIS: "weak_basis",
  ORPHAN_ENTITY: "orphan_entity",
};

/**
 * Create a new confidence frame for a pipeline run.
 *
 * @returns {ConfidenceFrame}
 */
export function createConfidenceFrame() {
  return {
    entries: [],
    gaps: [],
    summary: null,
  };
}

/**
 * Record an inference claim into the frame.
 *
 * @param {ConfidenceFrame} frame
 * @param {{ ruleId: string, claimed: string, basis: string, confidence?: number }} entry
 */
export function recordInference(frame, entry) {
  frame.entries.push({
    ruleId: entry.ruleId || "unknown",
    claimed: entry.claimed || "",
    basis: entry.basis || "unspecified",
    confidence: entry.confidence ?? 0.5,
    timestamp: Date.now(),
  });
}

/**
 * Record an inference gap.
 *
 * @param {ConfidenceFrame} frame
 * @param {{ type: string, description: string, severity: number, affectedIds?: string[] }} gap
 */
export function recordGap(frame, gap) {
  frame.gaps.push({
    type: gap.type || GAP_TYPES.WEAK_BASIS,
    description: gap.description || "",
    severity: Math.min(1, Math.max(0, gap.severity ?? 0.5)),
    affectedIds: gap.affectedIds || [],
    timestamp: Date.now(),
  });
}

/**
 * Detect gaps from pipeline state.
 *
 * Scans entities, relations, and evidences for common inference weaknesses.
 *
 * @param {ConfidenceFrame} frame
 * @param {object} ctx - Pipeline context { entities, relations, evidences, profile }
 */
export function detectGaps(frame, ctx) {
  const { entities, relations, evidences, profile } = ctx;

  // Missing dimension gaps
  const dimensions = ["time", "space", "domain"];
  for (const dim of dimensions) {
    const coverage = entities.filter(
      (e) => e.dimensions?.[dim] != null
    ).length;
    const ratio = entities.length > 0 ? coverage / entities.length : 0;

    if (ratio > 0 && ratio < 0.3) {
      recordGap(frame, {
        type: GAP_TYPES.LOW_COVERAGE,
        description: `Only ${Math.round(ratio * 100)}% of entities have the ${dim} dimension.`,
        severity: 0.6,
        affectedIds: entities
          .filter((e) => e.dimensions?.[dim] == null)
          .map((e) => e.id),
      });
    }
  }

  // Orphan entities (no relations)
  const relatedIds = new Set();
  for (const rel of relations) {
    relatedIds.add(rel.source);
    relatedIds.add(rel.target);
  }
  const orphans = entities.filter((e) => !relatedIds.has(e.id));
  if (orphans.length > 0 && entities.length > 2) {
    recordGap(frame, {
      type: GAP_TYPES.ORPHAN_ENTITY,
      description: `${orphans.length} entit${orphans.length === 1 ? "y has" : "ies have"} no relations.`,
      severity: orphans.length / entities.length > 0.5 ? 0.7 : 0.4,
      affectedIds: orphans.map((e) => e.id),
    });
  }

  // Weak basis: evidences with confidence below 0.5
  const weakEvidences = evidences.filter((e) => e.confidence < 0.5);
  if (weakEvidences.length > evidences.length * 0.4 && evidences.length > 2) {
    recordGap(frame, {
      type: GAP_TYPES.WEAK_BASIS,
      description: `${weakEvidences.length} of ${evidences.length} evidence items have confidence below 50%.`,
      severity: 0.5,
      affectedIds: weakEvidences.map((e) => e.id),
    });
  }
}

/**
 * Calibrate a raw confidence value based on supporting factors.
 *
 * @param {number} raw - The raw confidence (0..1)
 * @param {{ evidenceCount?: number, crossRefHits?: number, completeness?: number }} factors
 * @returns {number} Calibrated confidence (0..1)
 */
export function calibrateConfidence(raw, factors = {}) {
  const { evidenceCount = 1, crossRefHits = 0, completeness = 1 } = factors;

  // Evidence density bonus: more independent evidences increase confidence
  // Diminishing returns: +0.05 per evidence up to +0.15
  const evidenceBonus = Math.min(0.15, (evidenceCount - 1) * 0.05);

  // Cross-reference bonus: independent corroboration is strong signal
  const crossRefBonus = Math.min(0.1, crossRefHits * 0.05);

  // Completeness penalty: incomplete data reduces confidence
  const completenessFactor = 0.7 + 0.3 * Math.min(1, completeness);

  const calibrated = (raw + evidenceBonus + crossRefBonus) * completenessFactor;
  return Math.min(1, Math.max(0, Math.round(calibrated * 1000) / 1000));
}

/**
 * Summarize the confidence frame into a report.
 *
 * @param {ConfidenceFrame} frame
 * @returns {{ overallScore: number, gapCount: number, topGaps: Array, entryCount: number, avgConfidence: number }}
 */
export function summarizeConfidence(frame) {
  const entries = frame.entries || [];
  const gaps = frame.gaps || [];

  const avgConfidence =
    entries.length > 0
      ? entries.reduce((sum, e) => sum + e.confidence, 0) / entries.length
      : 0;

  // Gap penalty: each gap reduces the overall score
  const gapPenalty = gaps.reduce((sum, g) => sum + g.severity * 0.1, 0);

  const overallScore = Math.max(0, Math.min(1,
    Math.round((avgConfidence - gapPenalty) * 1000) / 1000
  ));

  // Sort gaps by severity descending
  const topGaps = [...gaps]
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 5);

  const summary = {
    overallScore,
    gapCount: gaps.length,
    topGaps,
    entryCount: entries.length,
    avgConfidence: Math.round(avgConfidence * 1000) / 1000,
  };

  frame.summary = summary;
  return summary;
}
