/**
 * @file core/validators/calibration-engine.js
 * @description Dynamic confidence calibration with configurable policies
 * Agentic capability: Self-adjusting thresholds based on historical performance
 */

import { recordGap } from "../confidence.js";

/**
 * Gap type constants (re-exported for convenience)
 */
export const GAP_TYPES = {
  MISSING_DIMENSION: "missing_dimension",
  LOW_COVERAGE: "low_coverage",
  CONFLICTING_EVIDENCE: "conflicting_evidence",
  WEAK_BASIS: "weak_basis",
  ORPHAN_ENTITY: "orphan_entity",
  LOW_CONFIDENCE: "low_confidence",
  INSUFFICIENT_EVIDENCE: "insufficient_evidence",
};

/**
 * Calibration policies for different execution modes
 * Each policy defines thresholds, auto-adjustment, and failure behavior
 */
export const CALIBRATION_POLICIES = {
  strict: {
    name: "strict",
    description: "Maximum quality gates, fails on any gap",
    thresholds: {
      LOW_COVERAGE: 0.5, // Changed from static 0.3
      WEAK_BASIS: 0.65, // Changed from static 0.5
      MISSING_DIMENSION: 0.5, // Changed from static 0.3
      INSUFFICIENT_EVIDENCE: 0.4,
    },
    autoAdjust: false,
    failOnGap: true,
    minEvidenceCount: 10,
    confidenceFloor: 0.6,
  },

  adaptive: {
    name: "adaptive",
    description: "Balances quality with flexibility, learns from history",
    thresholds: {
      LOW_COVERAGE: 0.3,
      WEAK_BASIS: 0.5,
      MISSING_DIMENSION: 0.3,
      INSUFFICIENT_EVIDENCE: 0.25,
    },
    autoAdjust: true,
    windowSize: 10,
    adjustmentFactor: 0.05,
    failOnGap: false,
    minEvidenceCount: 5,
    confidenceFloor: 0.4,
  },

  permissive: {
    name: "permissive",
    description: "Maximum flexibility for exploration",
    thresholds: {
      LOW_COVERAGE: 0.2,
      WEAK_BASIS: 0.4,
      MISSING_DIMENSION: 0.2,
      INSUFFICIENT_EVIDENCE: 0.15,
    },
    autoAdjust: true,
    windowSize: 5,
    adjustmentFactor: 0.08,
    failOnGap: false,
    minEvidenceCount: 3,
    confidenceFloor: 0.3,
  },

  research: {
    name: "research",
    description: "Optimized for research scenarios with sparse data",
    thresholds: {
      LOW_COVERAGE: 0.15,
      WEAK_BASIS: 0.35,
      MISSING_DIMENSION: 0.15,
      INSUFFICIENT_EVIDENCE: 0.1,
    },
    autoAdjust: true,
    windowSize: 20,
    adjustmentFactor: 0.03,
    failOnGap: false,
    minEvidenceCount: 3,
    confidenceFloor: 0.25,
  },
};

/**
 * Creates a calibration engine with specified policy
 * @param {string} policyName - Key in CALIBRATION_POLICIES
 * @param {Object} overrides - Policy overrides (deep merged for thresholds)
 * @returns {CalibrationEngine}
 */
export function createCalibrationEngine(policyName = "adaptive", overrides = {}) {
  const basePolicy = CALIBRATION_POLICIES[policyName] || CALIBRATION_POLICIES.adaptive;
  // Deep merge thresholds
  const policy = {
    ...basePolicy,
    ...overrides,
    thresholds: {
      ...basePolicy.thresholds,
      ...(overrides.thresholds || {}),
    },
  };

  const engine = {
    policy,
    history: [],
    adjustments: [],
    createdAt: Date.now(),

    /**
     * Detects gaps using policy-adjusted thresholds
     * @param {Object} frame - Confidence frame
     * @param {Object} ctx - Pipeline context { entities, relations, evidences, profile }
     */
    detectGapsPolicy(frame, ctx) {
      const { entities, evidences, profile } = ctx;
      const dimensions = ["time", "space", "domain"];

      // Dimension coverage gaps
      for (const dim of dimensions) {
        const coverage = entities.filter((e) => e.dimensions?.[dim] != null).length;
        const ratio = entities.length > 0 ? coverage / entities.length : 0;
        const threshold = policy.thresholds.LOW_COVERAGE;

        if (ratio < threshold) {
          const severity = ratio === 0 ? 0.8 : (1 - ratio / threshold) * 0.7 + 0.3;

          recordGap(frame, {
            type: GAP_TYPES.LOW_COVERAGE,
            description: `Coverage ${(ratio * 100).toFixed(1)}% below threshold ${(threshold * 100).toFixed(0)}% for ${dim} dimension`,
            severity: Math.min(1, severity),
            affectedIds: entities.filter((e) => e.dimensions?.[dim] == null).map((e) => e.id),
            metadata: {
              dimension: dim,
              actualCoverage: ratio,
              threshold,
              policy: policy.name,
            },
          });
        }
      }

      // Evidence count gaps (policy-specific)
      if (evidences?.length < policy.minEvidenceCount) {
        recordGap(frame, {
          type: GAP_TYPES.INSUFFICIENT_EVIDENCE,
          description: `${evidences?.length || 0} evidence below minimum ${policy.minEvidenceCount} for policy ${policy.name}`,
          severity: 0.5 + (1 - (evidences?.length || 0) / policy.minEvidenceCount) * 0.3,
          metadata: {
            actualCount: evidences?.length || 0,
            minRequired: policy.minEvidenceCount,
            policy: policy.name,
          },
        });
      }

      // Weak basis detection (entity-level confidence)
      const lowConfidenceEntities = entities.filter((e) => {
        const entityEvidence =
          evidences?.filter((ev) => ev.scope === "entity" && ev.targetId === e.id) || [];
        const avgConfidence =
          entityEvidence.length > 0
            ? entityEvidence.reduce((a, b) => a + b.confidence, 0) / entityEvidence.length
            : 0;
        return avgConfidence < policy.confidenceFloor;
      });

      if (lowConfidenceEntities.length > entities.length * 0.3) {
        recordGap(frame, {
          type: GAP_TYPES.WEAK_BASIS,
          description: `${lowConfidenceEntities.length}/${entities.length} entities have confidence below floor ${policy.confidenceFloor}`,
          severity: 0.6,
          affectedIds: lowConfidenceEntities.map((e) => e.id),
          metadata: {
            affectedCount: lowConfidenceEntities.length,
            totalCount: entities.length,
            confidenceFloor: policy.confidenceFloor,
            policy: policy.name,
          },
        });
      }

      // Record history for adaptive learning
      this.history.push({
        timestamp: Date.now(),
        gapCount: frame.gaps.length,
        entityCount: entities.length,
        evidenceCount: evidences?.length || 0,
        policy: policy.name,
      });

      // Trim history to window size
      if (this.history.length > policy.windowSize) {
        this.history = this.history.slice(-policy.windowSize);
      }
    },

    /**
     * Suggests threshold adjustments based on historical patterns
     * @returns {Object} Suggestion with confidence
     */
    suggestAdjustments() {
      if (!policy.autoAdjust || this.history.length < 3) {
        return {
          canAdjust: false,
          reason: "insufficient_history",
          runsAnalyzed: this.history.length,
          minRequired: 3,
        };
      }

      const gaps = this.history.map((h) => h.gapCount);
      const avgGaps = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const variance = gaps.reduce((acc, g) => acc + Math.pow(g - avgGaps, 2), 0) / gaps.length;

      // Trend analysis
      const recent = gaps.slice(-3);
      const older = gaps.slice(0, -3);
      const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const olderAvg =
        older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : recentAvg;
      const trend = recentAvg - olderAvg;

      if (avgGaps < 1 && trend <= 0) {
        // Very few gaps and stable or improving
        return {
          canAdjust: true,
          confidence: 0.8,
          action: "lower_thresholds",
          reason: `Consistently low gap count (${avgGaps.toFixed(1)} avg) suggests thresholds may be too strict`,
          suggestedAdjustment: -policy.adjustmentFactor || -0.05,
          affectedThresholds: ["LOW_COVERAGE", "WEAK_BASIS"],
          statistics: { avgGaps, variance, trend, sampleSize: gaps.length },
        };
      }

      if (avgGaps > 5 && trend > 0) {
        // Many gaps and increasing
        return {
          canAdjust: true,
          confidence: 0.7,
          action: "raise_thresholds",
          reason: `High and increasing gap count (${avgGaps.toFixed(1)} avg) suggests thresholds too permissive`,
          suggestedAdjustment: policy.adjustmentFactor || 0.05,
          affectedThresholds: ["LOW_COVERAGE", "WEAK_BASIS"],
          statistics: { avgGaps, variance, trend, sampleSize: gaps.length },
        };
      }

      if (variance > 10) {
        // High variance - inconsistent results
        return {
          canAdjust: true,
          confidence: 0.5,
          action: "tighten_bounds",
          reason: `High variance in gap detection (${variance.toFixed(1)}) suggests unstable configuration`,
          suggestedAdjustment: 0,
          recommendation: "Review pipeline configuration for consistency",
          statistics: { avgGaps, variance, trend, sampleSize: gaps.length },
        };
      }

      return {
        canAdjust: false,
        reason: "thresholds_well_calibrated",
        confidence: 0.9,
        statistics: { avgGaps, variance, trend, sampleSize: gaps.length },
      };
    },

    /**
     * Applies suggested adjustments to current thresholds
     * @param {Object} suggestion - From suggestAdjustments()
     * @returns {boolean} Whether adjustments were applied
     */
    applyAdjustments(suggestion) {
      if (!suggestion.canAdjust || !suggestion.suggestedAdjustment) {
        return false;
      }

      const adjustment = suggestion.suggestedAdjustment;
      const appliedChanges = {};

      if (suggestion.affectedThresholds) {
        for (const threshold of suggestion.affectedThresholds) {
          if (policy.thresholds[threshold] !== undefined) {
            const oldValue = policy.thresholds[threshold];
            const newValue = Math.max(0.05, Math.min(0.95, oldValue + adjustment));
            policy.thresholds[threshold] = newValue;
            appliedChanges[threshold] = { from: oldValue, to: newValue };
          }
        }
      }

      this.adjustments.push({
        timestamp: Date.now(),
        ...suggestion,
        appliedChanges,
      });

      return Object.keys(appliedChanges).length > 0;
    },

    /**
     * Exports current state for persistence
     * @returns {Object} Serializable state
     */
    exportState() {
      return {
        policy: this.policy,
        history: this.history,
        adjustments: this.adjustments,
        createdAt: this.createdAt,
        exportedAt: Date.now(),
      };
    },

    /**
     * Imports state from persisted data
     * @param {Object} state - From exportState()
     */
    importState(state) {
      if (state.history) this.history = state.history;
      if (state.adjustments) this.adjustments = state.adjustments;
      if (state.createdAt) this.createdAt = state.createdAt;
    },
  };

  return engine;
}

/**
 * Factory for confidence frame with embedded calibration
 * @param {string} policy - Policy name from CALIBRATION_POLICIES
 * @param {Object} overrides - Policy overrides
 * @returns {Object} Frame with calibrated detection
 */
export function createCalibratedFrame(policy = "adaptive", overrides = {}) {
  const engine = createCalibrationEngine(policy, overrides);

  return {
    entries: [],
    gaps: [],
    summary: null,
    policy,
    calibrationEngine: engine,
    createdAt: Date.now(),

    /**
     * Detect gaps with policy-aware thresholds
     * @param {Object} ctx - Pipeline context
     */
    detectGaps(ctx) {
      this.calibrationEngine.detectGapsPolicy(this, ctx);
    },

    /**
     * Get calibration summary
     * @returns {Object} Summary with suggestions
     */
    getCalibrationSummary() {
      return {
        policy: this.calibrationEngine.policy,
        historySize: this.calibrationEngine.history.length,
        totalGaps: this.gaps.length,
        suggestions: this.calibrationEngine.suggestAdjustments(),
      };
    },
  };
}

/**
 * Compares two calibration policies
 * @param {string} policyA - First policy name
 * @param {string} policyB - Second policy name
 * @returns {Object} Comparison with recommendations
 */
export function comparePolicies(policyA, policyB) {
  const a = CALIBRATION_POLICIES[policyA];
  const b = CALIBRATION_POLICIES[policyB];

  if (!a || !b) {
    return { error: "Unknown policy", valid: false };
  }

  const thresholdDiffs = {};
  for (const key of Object.keys(a.thresholds)) {
    thresholdDiffs[key] = {
      a: a.thresholds[key],
      b: b.thresholds[key],
      diff: b.thresholds[key] - a.thresholds[key],
    };
  }

  const stricter = {};
  const looser = {};

  for (const [key, diff] of Object.entries(thresholdDiffs)) {
    if (diff.diff > 0) stricter[key] = diff;
    if (diff.diff < 0) looser[key] = diff;
  }

  return {
    valid: true,
    policyA: a.name,
    policyB: b.name,
    comparison: {
      stricterInB: stricter,
      looserInB: looser,
      autoAdjustA: a.autoAdjust,
      autoAdjustB: b.autoAdjust,
      failOnGapA: a.failOnGap,
      failOnGapB: b.failOnGap,
    },
    recommendation:
      Object.keys(stricter).length > Object.keys(looser).length
        ? `${policyB} is stricter than ${policyA}`
        : `${policyB} is more permissive than ${policyA}`,
  };
}
