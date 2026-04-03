/**
 * @file core/drift-guard/adapter.js
 * @description Pipeline integration adapter for DriftGuard
 * Embeds anti-drift into the core execution path
 */

import { DriftGuard, DRIFT_POLICIES } from "./index.js";

/**
 * Pipeline middleware that runs drift guard before execution
 * @param {Function} pipelineFn - Original pipeline function
 * @returns {Function} Wrapped pipeline with drift protection
 */
export function withDriftProtection(pipelineFn) {
  return async function protectedPipeline(...args) {
    const [rawData, fileType, config, options = {}] = args;

    // Initialize DriftGuard with options
    const guard = new DriftGuard({
      policy: options.driftPolicy || DRIFT_POLICIES.ADAPTIVE,
      root: process.cwd(),
    });

    // Pre-execution check
    const check = await guard.guard({
      execute: options.autoHealDrift,
    });

    // Attach drift metadata to pipeline context
    const enhancedOptions = {
      ...options,
      _driftGuard: {
        runId: check.runId,
        healthy: check.healthy,
        trends: check.trends,
      },
    };

    // If critical drift detected and strict mode, halt
    if (!check.healthy && options.strictDriftCheck) {
      const error = new Error(`Pipeline blocked: ${check.report.state}`);
      error.type = "DRIFT_GUARD_VIOLATION";
      error.driftReport = check.report;
      throw error;
    }

    // Execute pipeline
    const result = pipelineFn(rawData, fileType, config, enhancedOptions);

    // Post-execution enrichment
    if (result) {
      result._meta = {
        ...(result._meta || {}),
        driftGuard: check,
      };
    }

    return result;
  };
}

/**
 * Calibration-aware confidence frame factory
 * Integration point for calibration policies
 * @param {string} policyName
 * @returns {Object} frame with calibration
 */
export function createGuardedFrame(policyName = "adaptive") {
  const policy =
    Object.values(DRIFT_POLICIES).find((p) => p.id === policyName) || DRIFT_POLICIES.ADAPTIVE;

  return {
    entries: [],
    gaps: [],
    summary: null,
    policy,
    createdAt: Date.now(),

    // Policy-aware gap detection
    detectGaps(ctx) {
      const { entities = [], evidences = [] } = ctx;

      // Coverage gap formula
      const dimensions = ["time", "space", "domain"];
      for (const dim of dimensions) {
        const covered = entities.filter((e) => e.dimensions?.[dim] != null).length;
        const total = entities.length;
        const ratio = total > 0 ? covered / total : 0;

        if (ratio < (policy.thresholds.COVERAGE || 0.3)) {
          this.gaps.push({
            type: "LOW_COVERAGE",
            dimension: dim,
            severity: ratio === 0 ? 0.8 : (1 - ratio / policy.thresholds.COVERAGE) * 0.7 + 0.3,
            ratio,
            threshold: policy.thresholds.COVERAGE,
          });
        }
      }

      // Evidence adequacy
      if (evidences.length < (policy.minEvidence || 5)) {
        this.gaps.push({
          type: "INSUFFICIENT_EVIDENCE",
          severity: 0.5 + (1 - evidences.length / (policy.minEvidence || 5)) * 0.3,
        });
      }
    },
  };
}

// Hook for pipeline modification
export function installDriftGuard(pipeline) {
  const originalRun = pipeline.runContextPipeline || pipeline;

  return {
    ...pipeline,
    runContextPipeline: withDriftProtection(originalRun),
  };
}
