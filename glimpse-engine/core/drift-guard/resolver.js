/**
 * @file core/drift-guard/resolver.js
 * @description Policy-driven decision and execution engine
 */

import { DriftFormulas, DRIFT_POLICIES } from './formulas.js';

// ═══════════════════════════════════════════════════════════════════
// RESOLVER — Action Execution Engine
// ═══════════════════════════════════════════════════════════════════

export class DriftResolver {
  constructor(policy = DRIFT_POLICIES.ADAPTIVE) {
    this.policy = policy;
    this.history = [];
  }

  /**
   * Decision matrix: what action to take?
   * @param {Object} report
   * @returns {Object} resolution plan
   */
  decide(report) {
    const severityScore = DriftFormulas.compoundSeverity({
      driftDetected: report.drift?.detected,
      gapCount: report.gaps?.length || 0
    });

    // Policy-driven decision tree
    if (severityScore >= 0.7 || this.policy.escalation === 'HALT') {
      return {
        action: 'HALT',
        autoHeal: false,
        notify: 'ADMIN_ALERT',
        reason: `Severity ${severityScore.toFixed(2)} exceeds threshold`
      };
    }

    if (report.drift?.detected && this.policy.autoHeal) {
      return {
        action: 'AUTO_SYNC',
        autoHeal: true,
        notify: 'LOG_EVENT',
        command: 'node scripts/sync-default-master.mjs'
      };
    }

    if (report.drift?.detected) {
      return {
        action: 'MANUAL_REQUIRED',
        autoHeal: false,
        notify: 'WARN_USER',
        reason: 'Auto-heal disabled by policy'
      };
    }

    return {
      action: 'HEALTHY',
      autoHeal: false,
      notify: 'SILENT'
    };
  }

  /**
   * Execute resolution if permitted
   * @param {Object} plan
   * @returns {Promise<Object>} result
   */
  async execute(plan) {
    if (!plan.autoHeal) {
      return {
        status: 'SKIPPED',
        reason: plan.reason || 'Auto-heal not permitted'
      };
    }

    try {
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execAsync = promisify(exec);

      const startTime = Date.now();
      const { stdout, stderr } = await execAsync(plan.command, {
        timeout: 30000,
        cwd: process.cwd()
      });

      return {
        status: 'SUCCESS',
        duration: Date.now() - startTime,
        output: stdout,
        errors: stderr || null
      };

    } catch (error) {
      return {
        status: 'FAILED',
        error: error.message,
        exitCode: error.code
      };
    }
  }
}
