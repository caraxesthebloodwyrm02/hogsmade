/**
 * @file core/drift-guard/formulas.js
 * @description Detection mathematics, constants, and policy definitions
 */

import { createHash } from 'node:crypto';

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS & CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

export const VERSION = '2.1.0';
export const DEFAULT_STATE_PATH = '.glimpse/drift-guard/state.json';
export const LOG_PATH = '.glimpse/drift-guard/events.ndjson';

export const DRIFT_POLICIES = {
  STRICT: {
    id: 'strict',
    thresholds: { LINE_DIFF: 50, HASH_DIFF: 1, COVERAGE: 0.50 },
    autoHeal: false,
    failClosed: true,
    escalation: 'HALT'
  },
  ADAPTIVE: {
    id: 'adaptive',
    thresholds: { LINE_DIFF: 10, HASH_DIFF: 1, COVERAGE: 0.30 },
    autoHeal: true,
    failClosed: false,
    escalation: 'WARN'
  },
  PERMISSIVE: {
    id: 'permissive',
    thresholds: { LINE_DIFF: 100, HASH_DIFF: 1, COVERAGE: 0.20 },
    autoHeal: true,
    failClosed: false,
    escalation: 'LOG'
  }
};

// ═══════════════════════════════════════════════════════════════════
// FORMULAS — Detection Mathematics
// ═══════════════════════════════════════════════════════════════════

export class DriftFormulas {
  /**
   * Content-addressable hash (SHA-256/16)
   * @param {string} content
   * @returns {string} 16-char hex hash
   */
  static computeHash(content) {
    return createHash('sha256')
      .update(content, 'utf8')
      .digest('hex')
      .slice(0, 16);
  }

  /**
   * Drift detection formula: H(YAML) ≠ H(Embedded)
   * @param {string} yamlHash
   * @param {string} embeddedHash
   * @returns {boolean}
   */
  static isDrift(yamlHash, embeddedHash) {
    return yamlHash !== embeddedHash;
  }

  /**
   * Severity calculation based on line differential
   * @param {number} lineDiff
   * @returns {string} severity level
   */
  static calculateSeverity(lineDiff) {
    const absDiff = Math.abs(lineDiff);
    if (absDiff > 50) return 'critical';
    if (absDiff > 10) return 'high';
    if (absDiff > 0) return 'medium';
    return 'none';
  }

  /**
   * Coverage gap formula: coverage < threshold
   * @param {number} covered
   * @param {number} total
   * @param {number} threshold
   * @returns {Object} gap info
   */
  static coverageGap(covered, total, threshold) {
    const ratio = total > 0 ? covered / total : 0;
    const isGap = ratio < threshold;
    const severity = ratio === 0 ? 0.8 :
                     (1 - ratio / threshold) * 0.7 + 0.3;

    return {
      detected: isGap,
      ratio,
      threshold,
      severity: Math.min(1, severity),
      metadata: { covered, total, deficit: total - covered }
    };
  }

  /**
   * Compound severity score for multi-modal assessment
   * @param {Object} factors
   * @returns {number} 0-1 score
   */
  static compoundSeverity({
    driftDetected = false,
    gapCount = 0,
    contractViolations = 0,
    trend = 0
  }) {
    return Math.min(1,
      (driftDetected ? 0.4 : 0) +
      (gapCount > 5 ? 0.3 : gapCount * 0.06) +
      (contractViolations > 0 ? 0.3 : 0) +
      (trend > 0 ? 0.1 : 0)
    );
  }

  /**
   * Auto-adjustment formula for calibration
   * @param {Array<number>} history
   * @param {number} factor
   * @returns {Object} adjustment suggestion
   */
  static suggestAdjustment(history, factor = 0.05) {
    if (!history || history.length < 3) {
      return { canAdjust: false, reason: 'insufficient_history' };
    }

    const avg = history.reduce((a, b) => a + b, 0) / history.length;
    const variance = history.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / history.length;
    const recent = history.slice(-3);
    const older = history.slice(0, -3);
    const trend = recent.reduce((a, b) => a + b, 0) / recent.length -
                  (older.length ? older.reduce((a, b) => a + b, 0) / older.length : 0);

    if (avg < 1.0 && trend <= 0) {
      return { canAdjust: true, action: 'lower', adjustment: -factor, confidence: 0.8 };
    }
    if (avg > 5.0 && trend > 0) {
      return { canAdjust: true, action: 'raise', adjustment: factor, confidence: 0.7 };
    }
    if (variance > 10.0) {
      return { canAdjust: true, action: 'stabilize', adjustment: 0, confidence: 0.5 };
    }

    return { canAdjust: false, reason: 'well_calibrated', confidence: 0.9 };
  }
}
