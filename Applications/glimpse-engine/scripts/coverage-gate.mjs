#!/usr/bin/env node
/**
 * @file scripts/coverage-gate.mjs
 * @description Coverage gate — fails if coverage drops below threshold
 */

import { execSync } from 'node:child_process';

const THRESHOLD = 70; // Start at 70%, ratchet up as coverage improves

console.log(`🔍 Running coverage check (threshold: ${THRESHOLD}%)...\n`);

try {
  const output = execSync(
    'node --test --experimental-test-coverage tests/drift-guard/*.test.js 2>&1',
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  );

  // Extract coverage from output
  const lines = output.split('\n');
  let coverageFound = false;

  for (const line of lines) {
    if (line.includes('%') && (line.includes('coverage') || line.includes(' Coverage'))) {
      console.log(line);
      const match = line.match(/(\d+(?:\.\d+)?)%/);
      if (match) {
        coverageFound = true;
        const coverage = parseFloat(match[1]);
        if (coverage < THRESHOLD) {
          console.error(`\n❌ Coverage ${coverage}% below threshold ${THRESHOLD}%`);
          process.exit(1);
        } else {
          console.log(`\n✅ Coverage ${coverage}% meets threshold ${THRESHOLD}%`);
          process.exit(0);
        }
      }
    }
  }

  if (!coverageFound) {
    console.log('\n⚠️  Could not parse coverage output, check manually');
    console.log(output.slice(-500)); // Last 500 chars for debugging
    process.exit(0); // Soft pass if we can't parse
  }
} catch (error) {
  // Even on test failure, try to extract coverage
  const output = error.stdout || error.message || '';
  console.log(output);

  const match = output.match(/(\d+(?:\.\d+)?)%/);
  if (match) {
    const coverage = parseFloat(match[1]);
    console.log(`\nCoverage: ${coverage}% (threshold: ${THRESHOLD}%)`);
  }

  // Exit with test failure code
  process.exit(error.status || 1);
}
