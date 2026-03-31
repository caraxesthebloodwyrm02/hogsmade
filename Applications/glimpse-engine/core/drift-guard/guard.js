/**
 * @file core/drift-guard/guard.js
 * @description Unified orchestrator — Detect → Analyze → Resolve → Log
 */

import { DRIFT_POLICIES } from './formulas.js';
import { DriftDetector } from './detector.js';
import { DriftResolver } from './resolver.js';
import { DriftTelemetry } from './telemetry.js';

// ═══════════════════════════════════════════════════════════════════
// DRIFTGUARD — Unified Orchestrator
// ═══════════════════════════════════════════════════════════════════

export class DriftGuard {
  constructor(config = {}) {
    this.config = config;
    this.detector = new DriftDetector(config);
    this.resolver = new DriftResolver(config.policy || DRIFT_POLICIES.ADAPTIVE);
    this.telemetry = new DriftTelemetry(config);

    // Load historical context
    this.state = this.telemetry.loadState();
  }

  /**
   * Execute complete guard sequence: Detect → Analyze → Resolve → Log
   * @param {Object} options
   * @returns {Promise<Object>} complete result
   */
  async guard(options = {}) {
    const runId = Date.now().toString(36);
    const startTime = Date.now();

    // Phase 1: Detection
    const report = this.detector.detect();

    // Ensure duration is set (in case detector didn't complete normally)
    if (!report.duration) {
      report.duration = Date.now() - startTime;
    }

    // Phase 2: Decision
    const decision = this.resolver.decide(report);

    // Phase 3: Resolution (if auto)
    let resolution = null;
    if (options.execute && decision.autoHeal) {
      resolution = await this.resolver.execute(decision);

      // Re-verify if healed
      if (resolution.status === 'SUCCESS') {
        report.verification = this.detector.detect();
        report.healed = !report.verification.drift.detected;
      }
    }

    // Phase 4: Telemetry
    const runRecord = {
      runId,
      timestamp: report.timestamp,
      state: report.state,
      driftDetected: report.drift?.detected,
      severity: report.drift?.severity,
      duration: report.duration,
      action: decision.action,
      resolution: resolution?.status
    };

    this.state.runs = [...(this.state.runs || []), runRecord].slice(-100); // Keep last 100
    this.telemetry.saveState(this.state);
    this.telemetry.log(runRecord);

    return {
      runId,
      healthy: report.state === 'HEALTHY',
      report,
      decision,
      resolution,
      trends: this.telemetry.analyzeTrends()
    };
  }

  /**
   * CI/CD entry point
   * @param {boolean} strict
   * @returns {Promise<boolean>} pass/fail
   */
  async ci(strict = false) {
    const policy = strict ? DRIFT_POLICIES.STRICT : this.resolver.policy;
    const oldPolicy = this.resolver.policy;
    this.resolver.policy = policy;

    const result = await this.guard({ execute: policy.autoHeal });

    this.resolver.policy = oldPolicy;

    if (!result.healthy && policy.failClosed) {
      const error = new Error(`DRIFTGUARD_HALT: ${result.report.state}`);
      error.result = result;
      throw error;
    }

    return result.healthy;
  }

  /**
   * Quick health check
   * @returns {boolean}
   */
  health() {
    const report = this.detector.detect();
    return report.state === 'HEALTHY';
  }
}

export default DriftGuard;

// Factory function for quick instantiation
export function createDriftGuard(config) {
  return new DriftGuard(config);
}
