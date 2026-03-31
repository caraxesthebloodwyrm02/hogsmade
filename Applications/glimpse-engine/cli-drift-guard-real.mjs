#!/usr/bin/env node
/**
 * @file cli-drift-guard-real.mjs
 * @description Real CLI for DriftGuard operations
 * Usage: node cli-drift-guard.mjs <command> [options]
 */

import { DriftGuard, DRIFT_POLICIES, createDriftGuard } from './core/drift-guard/index.js';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const C = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

const args = process.argv.slice(2);
const command = args[0] || 'help';

async function health() {
  console.log('\n🔍 DriftGuard Health Check\n');
  
  const guard = createDriftGuard();
  const start = Date.now();
  const result = await guard.guard();
  const duration = Date.now() - start;
  
  console.log(`State:      ${result.healthy ? C.green + '✓ HEALTHY' : C.red + '✗ DRIFTED'}${C.reset}`);
  console.log(`Duration:   ${duration}ms`);
  console.log(`Policy:     ${guard.policy.id}`);
  
  if (!result.healthy) {
    console.log(`\nRecommendations:`);
    result.report.recommendations.forEach(r => {
      console.log(`  ${r.severity === 'critical' ? '🔴' : '🟡'} ${r.action}`);
    });
  }
  
  process.exit(result.healthy ? 0 : 1);
}

async function ci() {
  const strict = args.includes('--strict');
  const autoHeal = args.includes('--heal');
  
  console.log(`\n🔒 DriftGuard CI Check${strict ? ' (strict)' : ''}${autoHeal ? ' (auto-heal)' : ''}\n`);
  
  const policy = strict ? DRIFT_POLICIES.STRICT : DRIFT_POLICIES.ADAPTIVE;
  const guard = new DriftGuard({ policy });
  
  try {
    await guard.ci(strict);
    console.log(`${C.green}✓ CI check passed${C.reset}`);
    process.exit(0);
  } catch (err) {
    console.log(`${C.red}✗ CI check failed${C.reset}`);
    if (err.result) {
      console.log(`State: ${err.result.report.state}`);
    }
    process.exit(1);
  }
}

async function heal() {
  console.log('\n🔧 DriftGuard Auto-Heal\n');
  
  const guard = createDriftGuard({ policy: DRIFT_POLICIES.ADAPTIVE });
  const result = await guard.guard({ execute: true });
  
  if (result.report.healed) {
    console.log(`${C.green}✓ Successfully healed configuration${C.reset}`);
    process.exit(0);
  } else if (result.report.drift?.detected) {
    console.log(`${C.red}✗ Could not auto-heal${C.reset}`);
    process.exit(1);
  } else {
    console.log(`${C.green}✓ No drift detected (no healing needed)${C.reset}`);
    process.exit(0);
  }
}

async function trends() {
  console.log('\n📊 DriftGuard Trend Analysis\n');
  
  const guard = createDriftGuard();
  const trends = guard.telemetry.analyzeTrends();
  
  if (trends.insufficient) {
    console.log(`Need ${trends.minRequired} runs for trend analysis, have ${trends.actual}`);
    process.exit(0);
  }
  
  console.log(`Total Runs:    ${trends.totalRuns}`);
  console.log(`Drift Rate:    ${(trends.driftRate * 100).toFixed(1)}%`);
  console.log(`Avg Duration:  ${trends.avgDuration.toFixed(0)}ms`);
  console.log(`Trend:         ${trends.trend}`);
  
  if (trends.trend === 'DEGRADING') {
    console.log(`\n${C.yellow}⚠ System health is degrading${C.reset}`);
  }
  
  process.exit(0);
}

async function policies() {
  console.log('\n📋 Available Policies\n');
  
  Object.entries(DRIFT_POLICIES).forEach(([name, policy]) => {
    console.log(`${C.bright}${name}${C.reset}`);
    console.log(`  Coverage Threshold: ${(policy.thresholds.COVERAGE * 100).toFixed(0)}%`);
    console.log(`  Auto-Heal:          ${policy.autoHeal ? 'Yes' : 'No'}`);
    console.log(`  Fail-Closed:        ${policy.failClosed ? 'Yes' : 'No'}`);
    console.log(`  Escalation:         ${policy.escalation}`);
    console.log();
  });
  
  process.exit(0);
}

function help() {
  console.log(`
${C.cyan}${C.bright}DriftGuard CLI${C.reset} — Configuration Integrity Management

Usage: npm run glimpse:health|ci|heal|trends|policies

Commands:
  health      Check configuration health
  ci          CI/CD validation (use --strict for strict mode)
  heal        Auto-heal drift if detected
  trends      Show historical trend analysis
  policies    List available policies
  help        Show this help

Examples:
  npm run glimpse:health
  npm run glimpse:ci -- --strict
  npm run glimpse:heal
  npm run glimpse:trends
  npm run glimpse:policies
`);
  process.exit(0);
}

const commands = { health, ci, heal, trends, policies, help };

if (commands[command]) {
  commands[command]().catch(err => {
    console.error(`${C.red}Error:${C.reset}`, err.message);
    process.exit(99);
  });
} else {
  console.error(`Unknown command: ${command}`);
  help();
}
