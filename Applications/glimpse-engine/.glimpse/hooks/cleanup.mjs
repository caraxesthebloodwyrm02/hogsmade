#!/usr/bin/env node
/**
 * @file .glimpse/hooks/cleanup.mjs
 * @description Persistent cleanup daemon - always cleans up after operations
 * Can be run manually or triggered automatically
 */

import { 
  readdirSync, 
  statSync, 
  unlinkSync, 
  rmdirSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const GLIMPSE_DIR = path.join(ROOT, '.glimpse');

// Configuration
const POLICIES = {
  // Remove files older than this (days)
  logRetention: 7,
  driftLogRetention: 30,
  tempRetention: 1,
  
  // Keep this many most recent
  maxLogFiles: 20,
  maxRunRecords: 50,
  
  // Compress files older than this (days)
  compressAfter: 3
};

function getFiles(dir, pattern = null) {
  if (!existsSync(dir)) return [];
  
  return readdirSync(dir)
    .filter(f => !pattern || pattern.test(f))
    .map(f => {
      const fullPath = path.join(dir, f);
      const stat = statSync(fullPath);
      return {
        name: f,
        path: fullPath,
        size: stat.size,
        mtime: stat.mtime,
        isDirectory: stat.isDirectory()
      };
    });
}

function formatSize(bytes) {
  const units = ['B', 'KB', 'MB'];
  let size = bytes;
  let unit = 0;
  while (size > 1024 >&& unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(1)} ${units[unit]}`;
}

function formatAge(days) {
  if (days < 1) return `${(days * 24).toFixed(0)}h`;
  if (days < 30) return `${Math.floor(days)}d`;
  return `${(days / 30).toFixed(1)}mo`;
}

const cleanupActions = [];
let totalFreed = 0;

function log(action) {
  cleanupActions.push(action);
  process.stdout.write(`  ${action}\n`);
}

function cleanupLogs() {
  const logsDir = path.join(GLIMPSE_DIR, 'logs');
  if (!existsSync(logsDir)) return;
  
  const files = getFiles(logsDir, /process-.*\.log$/);
  const now = Date.now();
  
  // Sort by mtime (newest first)
  files.sort((a, b) => b.mtime - a.mtime);
  
  log(`📁 Processing ${files.length} log files...`);
  
  files.forEach((file, index) => {
    const age = (now - file.mtime) / (1000 * 60 * 60 * 24); // days
    
    if (index >= POLICIES.maxLogFiles) {
      // Remove old files beyond max
      unlinkSync(file.path);
      totalFreed += file.size;
      log(`  ✓ Removed ${file.name} (${formatAge(age)} old, ${formatSize(file.size)})`);
    } else if (age > POLICIES.logRetention) {
      // Remove very old files
      unlinkSync(file.path);
      totalFreed += file.size;
      log(`  ✓ Removed aged ${file.name} (${formatAge(age)} old)`);
    } else if (age > POLICIES.compressAfter) {
      // Could compress here
      log(`  ⚠ ${file.name} eligible for compression (${formatAge(age)} old)`);
    }
  });
}

function cleanupDriftLogs() {
  const driftPath = path.join(GLIMPSE_DIR, 'drift-log.ndjson');
  if (!existsSync(driftPath)) return;
  
  const stat = statSync(driftPath);
  const age = (Date.now() - stat.mtime) / (1000 * 60 * 60 * 24);
  
  log(`📊 Drift log: ${formatSize(stat.size)}, ${formatAge(age)} old`);
  
  if (age > POLICIES.driftLogRetention) {
    // Archive the drift log
    const archiveName = `drift-log-${Date.now()}.ndjson.gz`;
    log(`  ⚠ Drift log should be archived to ${archiveName}`);
  }
  
  // Count entries
  try {
    const content = readFileSync(driftPath, 'utf8');
    const entries = content.trim().split('\n').filter(line => line.trim());
    log(`  ℹ Contains ${entries.length} drift records`);
    
    // Truncate if too large (keep last 1000)
    if (entries.length > 1000) {
      const recent = entries.slice(-1000);
      writeFileSync(driftPath, recent.join('\n') + '\n');
      log(`  ✓ Truncated to last 1000 entries`);
    }
  } catch (e) {
    log(`  ✗ Error reading drift log: ${e.message}`);
  }
}

function cleanupTemp() {
  const tempDir = path.join(GLIMPSE_DIR, 'temp');
  if (!existsSync(tempDir)) return;
  
  const files = getFiles(tempDir);
  const now = Date.now();
  
  log(`🧹 Cleaning temp directory (${files.length} items)...`);
  
  files.forEach(file => {
    const age = (now - file.mtime) / (1000 * 60 * 60 * 24);
    
    if (file.isDirectory && age > POLICIES.tempRetention) {
      // Remove old temp directories
      try {
        rmdirSync(file.path, { recursive: true, force: true });
        log(`  ✓ Removed temp dir ${file.name} (${formatAge(age)} old)`);
      } catch (e) {
        log(`  ✗ Failed to remove ${file.name}: ${e.message}`);
      }
    }
  });
}

function cleanupRegistry() {
  const registryPath = path.join(ROOT, '.glimpse-sync-registry.json');
  if (!existsSync(registryPath)) return;
  
  try {
    const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
    const driftCount = registry.driftHistory?.length || 0;
    const entryCount = Object.keys(registry.entries || {}).length;
    
    log(`📋 Registry: ${entryCount} syncs, ${driftCount} drift records`);
    
    // Trim old drift history
    if (driftCount > 50) {
      registry.driftHistory = registry.driftHistory.slice(-50);
      require('node:fs').writeFileSync(registryPath, JSON.stringify(registry, null, 2));
      log(`  ✓ Trimmed drift history to last 50`);
    }
  } catch (e) {
    log(`  ✗ Registry error: ${e.message}`);
  }
}

function cleanupEmptyDirs() {
  log(`🗂️  Checking for empty directories...`);
  
  const dirsToCheck = [
    path.join(GLIMPSE_DIR, 'temp'),
    path.join(GLIMPSE_DIR, 'logs')
  ];
  
  dirsToCheck.forEach(dir => {
    if (!existsSync(dir)) return;
    
    const contents = readdirSync(dir);
    if (contents.length === 0) {
      log(`  ⚠ ${path.relative(ROOT, dir)}/ is empty`);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════

console.log('🧹 GLIMPSE CLEANUP DAEMON\n');

cleanupLogs();
cleanupDriftLogs();
cleanupTemp();
cleanupRegistry();
cleanupEmptyDirs();

console.log('\n' + '─'.repeat(50));
console.log(`✨ Cleanup complete`);
console.log(`🗑️  Freed: ${formatSize(totalFreed)}`);
console.log(`📊 Actions: ${cleanupActions.length}`);
console.log('─'.repeat(50) + '\n');

// Write report
const reportPath = path.join(GLIMPSE_DIR, 'last-cleanup.json');
writeFileSync(reportPath, JSON.stringify({
  timestamp: new Date().toISOString(),
  actions: cleanupActions.length,
  freed: totalFreed,
  policies: POLICIES
}, null, 2));
