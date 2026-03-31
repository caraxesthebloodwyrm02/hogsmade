/**
 * @file core/validators/sync-validator.js
 * @description Detects and reports configuration drift between YAML and JS fallback
 * Agentic capability: Self-checking configuration with drift detection and auto-healing
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REGISTRY_PATH = '.glimpse-sync-registry.json';
const DRIFT_LOG_PATH = '.glimpse/drift-log.ndjson';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

/**
 * Generates content-addressable hash (SHA-256 truncated for readability)
 * @param {string} content - Content to hash
 * @returns {string} 16-char hex hash
 */
export function computeChecksum(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 16);
}

/**
 * Ensures directory exists
 * @param {string} dirPath - Directory path
 */
function ensureDir(dirPath) {
  if (!existsSync(dirPath)) {
    const parent = path.dirname(dirPath);
    if (parent !== dirPath) ensureDir(parent);
    try {
      require('node:fs').mkdirSync(dirPath);
    } catch {
      // May already exist from concurrent calls
    }
  }
}

/**
 * Loads or creates sync registry
 * @returns {Object} Registry state with drift tracking
 */
export function loadSyncRegistry() {
  const registryPath = path.join(REPO_ROOT, REGISTRY_PATH);
  
  if (!existsSync(registryPath)) {
    return {
      version: '1.0.0',
      lastSync: null,
      entries: {},
      driftHistory: [],
      autoHealAttempts: 0,
      createdAt: new Date().toISOString()
    };
  }
  
  try {
    return JSON.parse(readFileSync(registryPath, 'utf8'));
  } catch (err) {
    console.warn('Registry corrupted, initializing fresh:', err.message);
    return {
      version: '1.0.0',
      lastSync: null,
      entries: {},
      driftHistory: [],
      autoHealAttempts: 0,
      createdAt: new Date().toISOString(),
      recoveredAt: new Date().toISOString()
    };
  }
}

/**
 * Saves sync registry with atomic write
 * @param {Object} registry - Registry state
 */
export function saveSyncRegistry(registry) {
  const registryPath = path.join(REPO_ROOT, REGISTRY_PATH);
  const tmpPath = `${registryPath}.tmp`;
  
  try {
    writeFileSync(tmpPath, JSON.stringify(registry, null, 2));
    // Atomic rename (on most systems)
    require('node:fs').renameSync(tmpPath, registryPath);
  } catch (err) {
    // Fallback: direct write
    writeFileSync(registryPath, JSON.stringify(registry, null, 2));
  }
}

/**
 * Logs drift to append-only log
 * @param {Object} driftEvent - Drift event to log
 */
function logDrift(driftEvent) {
  ensureDir(path.join(REPO_ROOT, '.glimpse'));
  const logPath = path.join(REPO_ROOT, DRIFT_LOG_PATH);
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...driftEvent
  }) + '\n';
  
  try {
    const fs = require('node:fs');
    fs.appendFileSync(logPath, entry);
  } catch {
    // Silent fail - logging is best effort
  }
}

/**
 * Extracts file modification timestamps
 * @param {string} filePath - Path to check
 * @returns {Object|null} Stats or null
 */
function getFileStats(filePath) {
  try {
    const stats = statSync(filePath);
    return {
      mtime: stats.mtime.toISOString(),
      size: stats.size,
      exists: true
    };
  } catch {
    return { exists: false };
  }
}

/**
 * Detects configuration drift between YAML and embedded JS
 * @param {string} yamlPath - Path to YAML source
 * @param {string} jsPath - Path to JS fallback
 * @returns {Object} Detailed drift report
 */
export function detectDrift(yamlPath, jsPath) {
  const report = {
    yamlExists: false,
    jsExists: false,
    yamlHash: null,
    embeddedHash: null,
    driftDetected: false,
    yamlStats: null,
    jsStats: null,
    extractionStatus: 'not_attempted'
  };
  
  // Check YAML
  report.yamlStats = getFileStats(yamlPath);
  report.yamlExists = report.yamlStats.exists;
  
  // Check JS
  report.jsStats = getFileStats(jsPath);
  report.jsExists = report.jsStats.exists;
  
  if (!report.yamlExists || !report.jsExists) {
    report.driftDetected = report.yamlExists !== report.jsExists;
    return report;
  }
  
  // Read YAML
  let yamlContent;
  try {
    yamlContent = readFileSync(yamlPath, 'utf8');
    report.yamlHash = computeChecksum(yamlContent);
    report.yamlLines = yamlContent.split('\n').length;
  } catch (err) {
    report.yamlError = err.message;
    return report;
  }
  
  // Extract embedded YAML from JS
  let jsContent;
  try {
    jsContent = readFileSync(jsPath, 'utf8');
  } catch (err) {
    report.jsError = err.message;
    return report;
  }
  
  const yamlMatch = jsContent.match(/export const DEFAULT_MASTER_YAML = `([\\s\\S]*?)`;?$/m);
  
  if (!yamlMatch) {
    report.extractionStatus = 'no_template_literal_found';
    report.embeddedHash = null;
    report.driftDetected = true;
    return report;
  }
  
  const embeddedYaml = yamlMatch[1];
  report.extractionStatus = 'extracted';
  report.embeddedHash = computeChecksum(embeddedYaml);
  report.embeddedLines = embeddedYaml.split('\n').length;
  
  // Compare
  report.driftDetected = report.yamlHash !== report.embeddedHash;
  
  if (report.driftDetected) {
    // Compute line count diff
    report.lineDiff = report.yamlLines - report.embeddedLines;
  }
  
  return report;
}

/**
 * Validates complete sync health
 * @param {Object} options - Validation options
 * @returns {Object} Comprehensive health report
 */
export function validateSyncHealth(options = {}) {
  const yamlPath = path.join(REPO_ROOT, 'glimpse.master.yaml');
  const jsPath = path.join(REPO_ROOT, 'default-master.js');
  
  const startTime = Date.now();
  
  // Basic file existence checks
  if (!existsSync(yamlPath) && !existsSync(jsPath)) {
    return {
      healthy: false,
      critical: true,
      reason: 'BOTH_SOURCES_MISSING',
      action: 'emergency_restore',
      message: 'CRITICAL: Neither YAML nor JS fallback found. Configuration lost.',
      recommendations: [
        { severity: 'critical', action: 'restore_from_version_control' },
        { severity: 'critical', action: 'regenerate_from_backup' }
      ],
      durationMs: Date.now() - startTime
    };
  }
  
  if (!existsSync(yamlPath)) {
    return {
      healthy: false,
      critical: true,
      reason: 'YAML_SOURCE_MISSING',
      action: 'restore_from_embedded',
      message: 'CRITICAL: YAML source missing but JS fallback exists.',
      recommendations: [
        { severity: 'critical', action: 'extract_yaml_from_embedded' },
        { severity: 'high', action: 'verify_embedded_is_current' }
      ],
      durationMs: Date.now() - startTime
    };
  }
  
  if (!existsSync(jsPath)) {
    return {
      healthy: false,
      critical: false,
      reason: 'JS_FALLBACK_MISSING',
      action: 'regenerate_fallback',
      message: 'WARNING: JS fallback missing. Sync required.',
      recommendations: [
        { severity: 'high', action: 'run_sync_script' }
      ],
      durationMs: Date.now() - startTime
    };
  }
  
  // Content drift detection
  const drift = detectDrift(yamlPath, jsPath);
  const registry = loadSyncRegistry();
  
  const report = {
    healthy: !drift.driftDetected,
    critical: false,
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    ...drift,
    lastSuccessfulSync: registry.lastSync,
    syncCount: Object.keys(registry.entries).length,
    driftHistoryCount: registry.driftHistory.length,
    recommendations: []
  };
  
  if (drift.driftDetected) {
    // Build contextual recommendations
    if (report.lineDiff && report.lineDiff > 50) {
      report.recommendations.push({
        severity: 'high',
        message: `Significant drift detected: ${report.lineDiff} lines difference`,
        action: 'run_sync_script',
        command: 'node scripts/sync-default-master.mjs'
      });
    } else if (report.lineDiff && report.lineDiff > 0) {
      report.recommendations.push({
        severity: 'medium',
        message: `YAML has ${report.lineDiff} more lines than embedded version`,
        action: 'run_sync_script'
      });
    } else if (report.lineDiff && report.lineDiff < 0) {
      report.recommendations.push({
        severity: 'warning',
        message: `Embedded version larger by ${Math.abs(report.lineDiff)} lines - unusual`,
        action: 'manual_review_recommended'
      });
    }
    
    if (report.extractionStatus === 'no_template_literal_found') {
      report.recommendations.push({
        severity: 'critical',
        message: 'Could not extract embedded YAML - file may be corrupted',
        action: 'regenerate_fallback'
      });
    }
    
    // Log to drift history
    registry.driftHistory.push({
      timestamp: report.timestamp,
      yamlHash: report.yamlHash,
      embeddedHash: report.embeddedHash,
      lineDiff: report.lineDiff
    });
    
    // Keep only last 50 entries
    if (registry.driftHistory.length > 50) {
      registry.driftHistory = registry.driftHistory.slice(-50);
    }
    
    saveSyncRegistry(registry);
    
    // Log to append-only file
    logDrift({
      yamlHash: report.yamlHash,
      embeddedHash: report.embeddedHash,
      lineDiff: report.lineDiff,
      recommendations: report.recommendations.length
    });
  }
  
  // Store successful sync checkpoint
  if (!drift.driftDetected) {
    registry.lastSync = report.timestamp;
    registry.entries[report.yamlHash] = {
      timestamp: report.timestamp,
      jsHash: report.embeddedHash
    };
    saveSyncRegistry(registry);
  }
  
  return report;
}

/**
 * Performs auto-healing sync if drift detected
 * @param {Object} options - { autoHeal: boolean, timeout: number }
 * @returns {Promise<Object>} Result with status
 */
export async function autoSync(options = { autoHeal: false, timeout: 30000 }) {
  const health = validateSyncHealth();
  
  if (health.healthy) {
    return {
      status: 'healthy',
      action: 'none_needed',
      timestamp: new Date().toISOString(),
      health
    };
  }
  
  if (!options.autoHeal) {
    return {
      status: 'drift_detected',
      action: 'manual_sync_required',
      timestamp: new Date().toISOString(),
      health,
      instructions: 'Run: node scripts/sync-default-master.mjs'
    };
  }
  
  // Attempt auto-heal
  const registry = loadSyncRegistry();
  registry.autoHealAttempts = (registry.autoHealAttempts || 0) + 1;
  saveSyncRegistry(registry);
  
  const { exec } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execAsync = promisify(exec);
  
  const startTime = Date.now();
  
  try {
    const { stdout, stderr } = await execAsync(
      'node scripts/sync-default-master.mjs --verbose',
      { 
        cwd: REPO_ROOT,
        timeout: options.timeout 
      }
    );
    
    const durationMs = Date.now() - startTime;
    
    // Verify sync worked
    const postHealth = validateSyncHealth();
    
    return {
      status: postHealth.healthy ? 'healed' : 'heal_partial',
      action: 'sync_attempted',
      timestamp: new Date().toISOString(),
      durationMs,
      output: stdout,
      errors: stderr || null,
      health: postHealth,
      success: postHealth.healthy
    };
    
  } catch (error) {
    const durationMs = Date.now() - startTime;
    
    return {
      status: 'heal_failed',
      action: 'manual_intervention_required',
      timestamp: new Date().toISOString(),
      durationMs,
      error: error.message,
      exitCode: error.code,
      health
    };
  }
}

/**
 * CI/CD validation - fails build on drift
 * @param {Object} options - { strict: boolean, allowHeal: boolean }
 * @returns {Promise<boolean>} True if healthy
 * @throws {Error} If drift detected in strict mode
 */
export async function ciCheck(options = { strict: true, allowHeal: false }) {
  console.log('🔍 Running Glimpse CI Configuration Check\n');
  
  const startTime = Date.now();
  
  let health = validateSyncHealth();
  
  // Attempt auto-heal if allowed and drift detected
  if (!health.healthy && options.allowHeal) {
    console.log('⚠️  Drift detected, attempting auto-heal...');
    const result = await autoSync({ autoHeal: true });
    
    if (result.success) {
      console.log('✅ Auto-heal successful\n');
      health = result.health;
    } else {
      console.error('❌ Auto-heal failed:', result.error);
    }
  }
  
  const durationMs = Date.now() - startTime;
  
  if (!health.healthy) {
    console.error('\n❌ CONFIGURATION DRIFT DETECTED');
    console.error('═'.repeat(50));
    
    if (health.yamlHash) {
      console.error(`YAML hash:     ${health.yamlHash}`);
    }
    if (health.embeddedHash) {
      console.error(`JS hash:       ${health.embeddedHash}`);
    }
    if (health.lineDiff) {
      console.error(`Line diff:     ${health.lineDiff} lines`);
    }
    
    if (health.recommendations?.length) {
      console.error('\nRecommendations:');
      health.recommendations.forEach(rec => {
        const icon = rec.severity === 'critical' ? '🔴' : 
                     rec.severity === 'high' ? '🟠' : 
                     rec.severity === 'medium' ? '🟡' : '🔵';
        console.error(`   ${icon} [${rec.severity.toUpperCase()}] ${rec.message || rec.action}`);
        if (rec.command) {
          console.error(`      → Run: ${rec.command}`);
        }
      });
    }
    
    console.error(`\nCompleted in ${durationMs}ms`);
    
    if (options.strict) {
      throw new Error('CI_CHECK_FAILED: Configuration sync validation failed');
    }
    
    return false;
  }
  
  console.log('✅ Configuration sync healthy');
  console.log(`   YAML hash: ${health.yamlHash}`);
  console.log(`   Last sync: ${health.lastSuccessfulSync || 'N/A'}`);
  console.log(`\nCompleted in ${durationMs}ms`);
  
  return true;
}
