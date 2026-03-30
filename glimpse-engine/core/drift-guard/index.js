/**
 * @file core/drift-guard/index.js
 * @description DriftGuard — Unified Anti-Drift Architecture
 * Mature, production-hardened subsystem for configuration integrity
 * 
 * Architecture: Detector → Analyzer → Resolver → Telemetry
 * Formula-driven with policy-based decision matrices
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS & CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

const VERSION = '2.1.0';
const DEFAULT_STATE_PATH = '.glimpse/drift-guard/state.json';
const LOG_PATH = '.glimpse/drift-guard/events.ndjson';

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

// ═══════════════════════════════════════════════════════════════════
// DETECTOR — Extraction & Comparison Engine
// ═══════════════════════════════════════════════════════════════════

export class DriftDetector {
  constructor(config = {}) {
    this.yamlPath = config.yamlPath || 'glimpse.master.yaml';
    this.jsPath = config.jsPath || 'default-master.js';
    this.root = config.root || process.cwd();
  }

  resolve(p) {
    return path.resolve(this.root, p);
  }

  /**
   * Extract embedded YAML from JS fallback
   * @param {string} jsContent 
   * @returns {Object} extraction result
   */
  extractEmbeddedYaml(jsContent) {
    const match = jsContent.match(/export const DEFAULT_MASTER_YAML = `([\s\S]*?)`;?$/m);
    
    if (!match) {
      return { 
        success: false, 
        error: 'no_template_literal_found',
        content: null 
      };
    }

    return {
      success: true,
      content: match[1],
      error: null
    };
  }

  /**
   * Execute full drift detection sequence
   * @returns {Object} comprehensive drift report
   */
  detect() {
    const startTime = Date.now();
    const report = {
      timestamp: new Date().toISOString(),
      duration: 0,
      state: 'unknown',
      yaml: { exists: false, hash: null, lines: 0 },
      embedded: { exists: false, hash: null, lines: 0, extractable: false },
      drift: { detected: false, severity: 'none', lineDiff: 0 },
      recommendations: []
    };

    try {
      // Phase 1: Source existence
      const yamlPath = this.resolve(this.yamlPath);
      const jsPath = this.resolve(this.jsPath);

      report.yaml.exists = existsSync(yamlPath);
      report.embedded.exists = existsSync(jsPath);

      if (!report.yaml.exists || !report.embedded.exists) {
        report.state = 'MISSING_SOURCE';
        report.drift.detected = report.yaml.exists !== report.embedded.exists;
        report.recommendations.push({
          severity: 'critical',
          action: report.yaml.exists ? 'extract_from_embedded' : 'restore_backup'
        });
        return report;
      }

      // Phase 2: Content extraction
      const yamlContent = readFileSync(yamlPath, 'utf8');
      const jsContent = readFileSync(jsPath, 'utf8');

      report.yaml.content = yamlContent.slice(0, 100); // Preview
      report.yaml.lines = yamlContent.split('\n').length;
      report.yaml.hash = DriftFormulas.computeHash(yamlContent);

      // Phase 3: Embedded extraction
      const embedded = this.extractEmbeddedYaml(jsContent);
      report.embedded.extractable = embedded.success;

      if (!embedded.success) {
        report.state = 'EXTRACTION_FAILED';
        report.drift.detected = true;
        report.recommendations.push({
          severity: 'critical',
          action: 'regenerate_fallback',
          reason: embedded.error
        });
        return report;
      }

      report.embedded.lines = embedded.content.split('\n').length;
      report.embedded.hash = DriftFormulas.computeHash(embedded.content);

      // Phase 4: Drift calculation
      report.drift.detected = DriftFormulas.isDrift(report.yaml.hash, report.embedded.hash);
      report.drift.lineDiff = report.yaml.lines - report.embedded.lines;
      report.drift.severity = DriftFormulas.calculateSeverity(report.drift.lineDiff);

      report.duration = Date.now() - startTime;

      if (report.drift.detected) {
        report.state = 'DRIFT_DETECTED';
        report.recommendations.push({
          severity: report.drift.severity,
          action: 'run_sync_script',
          command: 'node scripts/sync-default-master.mjs',
          metadata: { 
            lineDiff: report.drift.lineDiff,
            yamlHash: report.yaml.hash,
            embeddedHash: report.embedded.hash 
          }
        });
      } else {
        report.state = 'HEALTHY';
      }

    } catch (error) {
      report.state = 'ERROR';
      report.error = error.message;
      report.recommendations.push({
        severity: 'critical',
        action: 'manual_investigation',
        reason: error.message
      });
    }

    report.duration = Date.now() - startTime;
    return report;
  }
}

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

// ═══════════════════════════════════════════════════════════════════
// TELEMETRY — Event Logging & Metrics
// ═══════════════════════════════════════════════════════════════════

export class DriftTelemetry {
  constructor(config = {}) {
    this.logPath = config.logPath || LOG_PATH;
    this.statePath = config.statePath || DEFAULT_STATE_PATH;
    this.ensureDirectories();
  }

  ensureDirectories() {
    const dir = path.dirname(this.logPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Append event to log
   * @param {Object} event 
   */
  log(event) {
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      ...event
    }) + '\n';

    try {
      writeFileSync(this.logPath, entry, { flag: 'a' });
    } catch (e) {
      console.error('Telemetry log failed:', e.message);
    }
  }

  /**
   * Persist state for history tracking
   * @param {Object} state 
   */
  saveState(state) {
    try {
      const existing = this.loadState();
      const updated = {
        ...existing,
        ...state,
        lastUpdated: new Date().toISOString()
      };
      writeFileSync(this.statePath, JSON.stringify(updated, null, 2));
    } catch (e) {
      console.error('State save failed:', e.message);
    }
  }

  loadState() {
    try {
      return JSON.parse(readFileSync(this.statePath, 'utf8'));
    } catch {
      return { version: VERSION, runs: [] };
    }
  }

  /**
   * Calculate trends from history
   * @returns {Object} trend analysis
   */
  analyzeTrends() {
    const state = this.loadState();
    const runs = state.runs || [];
    
    if (runs.length < 3) {
      return { insufficient: true, minRequired: 3, actual: runs.length };
    }

    const recent = runs.slice(-10);
    const driftRate = recent.filter(r => r.driftDetected).length / recent.length;
    const avgDuration = recent.reduce((a, r) => a + (r.duration || 0), 0) / recent.length;

    return {
      driftRate,
      avgDuration,
      totalRuns: runs.length,
      trend: driftRate > 0.3 ? 'DEGRADING' : driftRate === 0 ? 'STABLE' : 'FLUCTUATING'
    };
  }
}

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

// ═══════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════

export { VERSION, DEFAULT_STATE_PATH, LOG_PATH };
export default DriftGuard;

// Factory function for quick instantiation
export function createDriftGuard(config) {
  return new DriftGuard(config);
}
