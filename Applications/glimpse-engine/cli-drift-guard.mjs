#!/usr/bin/env node
/**
 * @file cli-drift-guard.mjs
 * @description Comprehensive CLI demonstration of DriftGuard capabilities
 * Use case: Development workflow with configuration integrity monitoring
 *
 * SCENARIO: A development team managing Glimpse configurations across
 * local development, staging, and production environments.
 */

import {
  DriftGuard,
  DriftFormulas,
  DRIFT_POLICIES,
  createDriftGuard,
} from "./core/drift-guard/index.js";

import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = path.join(__dirname, ".glimpse", "demo", Date.now().toString());

// ANSI colors for terminal output
const C = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
};

function section(title) {
  console.log(`\n${C.cyan}${"═".repeat(70)}${C.reset}`);
  console.log(`${C.bright}${C.cyan}  ${title}${C.reset}`);
  console.log(`${C.cyan}${"═".repeat(70)}${C.reset}\n`);
}

function subsection(title) {
  console.log(`\n${C.yellow}▸ ${title}${C.reset}`);
}

function success(msg) {
  console.log(`  ${C.green}✓${C.reset} ${msg}`);
}

function warning(msg) {
  console.log(`  ${C.yellow}⚠${C.reset} ${msg}`);
}

function error(msg) {
  console.log(`  ${C.red}✗${C.reset} ${msg}`);
}

function info(msg) {
  console.log(`  ${C.gray}ℹ${C.reset} ${msg}`);
}

function metric(label, value, status = "neutral") {
  const color = status === "good" ? C.green : status === "bad" ? C.red : C.yellow;
  console.log(`    ${C.dim}${label.padEnd(25)}${C.reset} ${color}${value}${C.reset}`);
}

// ═══════════════════════════════════════════════════════════════════
// SETUP: Create demo environment
// ═══════════════════════════════════════════════════════════════════

function setupDemoEnvironment() {
  section("SETUP: Creating Demo Environment");

  mkdirSync(TEMP_DIR, { recursive: true });
  info(`Created temp directory: ${path.relative(__dirname, TEMP_DIR)}`);

  // Create a master YAML configuration
  const masterYaml = `version: 2
defaults:
  active_preset: analyst
  secondary_lens_threshold: 0.2
  evidence_confidence_floor: 0.35

taxonomy:
  domains:
    - id: innovation
      label: Innovation & Science
      keywords:
        - invention
        - patent
        - technology
    - id: analytics
      label: Analytics
      keywords:
        - data
        - metrics
        - statistics

function_registry:
  field_exists:
    scope: [dataset, entity]
    returns: boolean
  taxonomy_score:
    scope: [dataset, entity]
    returns: score

rules:
  - id: innovation-keyword-support
    label: Innovation keywords support
    applies_to: entity
    enabled: true
    priority: 100
`;

  // Create initial JS fallback (in sync)
  const embeddedYaml = masterYaml;

  const jsFallback = `export const DEFAULT_MASTER_YAML = \`${embeddedYaml}\`;\n`;

  writeFileSync(path.join(TEMP_DIR, "glimpse.master.yaml"), masterYaml);
  writeFileSync(path.join(TEMP_DIR, "default-master.js"), jsFallback);

  success("Created synchronized configuration files");
  metric("YAML size", `${masterYaml.length} bytes`, "good");
  metric("JS fallback size", `${jsFallback.length} bytes`, "good");

  return {
    yamlPath: path.join(TEMP_DIR, "glimpse.master.yaml"),
    jsPath: path.join(TEMP_DIR, "default-master.js"),
  };
}

// ═══════════════════════════════════════════════════════════════════
// USE CASE 1: Developer Workflow - Manual Health Check
// ═══════════════════════════════════════════════════════════════════

async function useCase1_DeveloperHealthCheck(paths) {
  section("USE CASE 1: Developer Manual Health Check");
  subsection("Scenario: Developer wants to verify config integrity before committing");

  console.log(`\n  ${C.dim}$ glimpse-guard health${C.reset}\n`);

  const guard = createDriftGuard({
    yamlPath: paths.yamlPath,
    jsPath: paths.jsPath,
    root: TEMP_DIR,
  });

  const startTime = Date.now();
  const result = await guard.guard();
  const duration = Date.now() - startTime;

  console.log(`  ${C.cyan}┌─────────────────────────────────────────────┐`);
  console.log(`  │ DriftGuard Report                           │`);
  console.log(`  ├─────────────────────────────────────────────┤${C.reset}`);

  metric("Run ID", result.runId);
  metric("Duration", `${duration}ms`, duration < 50 ? "good" : "neutral");
  metric("State", result.report.state, result.report.state === "HEALTHY" ? "good" : "bad");

  if (result.healthy) {
    success("Configuration is synchronized");
    metric("YAML Hash", result.report.yaml.hash);
    metric("JS Hash", result.report.embedded.hash);
  } else {
    warning("Drift detected!");
  }

  console.log(`  ${C.cyan}└─────────────────────────────────────────────┘${C.reset}\n`);

  return result;
}

// ═══════════════════════════════════════════════════════════════════
// USE CASE 2: CI/CD Pipeline - Strict Mode Gate
// ═══════════════════════════════════════════════════════════════════

async function useCase2_CICDGate(paths) {
  section("USE CASE 2: CI/CD Pipeline Strict Gate");
  subsection("Scenario: Pre-commit hook blocks if configuration drift detected");

  console.log(`\n  ${C.dim}$ glimpse-guard ci --strict${C.reset}\n`);

  const guard = new DriftGuard({
    yamlPath: paths.yamlPath,
    jsPath: paths.jsPath,
    root: TEMP_DIR,
    policy: DRIFT_POLICIES.STRICT,
  });

  try {
    await guard.ci(true); // strict mode
    success("CI check passed - no drift detected");
    return true;
  } catch (err) {
    error("CI check FAILED - commit blocked");
    info(`Reason: ${err.result?.report?.state || err.message}`);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════
// USE CASE 3: Drift Detection with Auto-Healing
// ═══════════════════════════════════════════════════════════════════

async function useCase3_AutoHealing(paths) {
  section("USE CASE 3: Simulated Drift with Auto-Healing");
  subsection("Scenario: YAML updated but JS fallback not synced - auto-heal triggered");

  // Simulate developer editing YAML directly
  console.log(`\n  ${C.dim}// Developer edits YAML directly...${C.reset}`);

  const modifiedYaml =
    readFileSync(paths.yamlPath, "utf8") + "\n# New comment added by developer\nnew_field: value\n";
  writeFileSync(paths.yamlPath, modifiedYaml);

  warning("YAML modified but JS fallback is stale");
  metric("YAML size", `${modifiedYaml.length} bytes`);
  metric("Line diff", "+2 lines (added comment and field)", "bad");

  // Create guard with auto-heal policy
  const guard = createDriftGuard({
    yamlPath: paths.yamlPath,
    jsPath: paths.jsPath,
    root: TEMP_DIR,
    policy: DRIFT_POLICIES.ADAPTIVE, // autoHeal: true
  });

  console.log(`\n  ${C.dim}$ glimpse-guard heal${C.reset}\n`);

  const result = await guard.guard({ execute: true }); // Execute auto-heal

  console.log(`  ${C.cyan}┌─────────────────────────────────────────────┐`);
  console.log(`  │ Auto-Healing Report                         │`);
  console.log(`  ├─────────────────────────────────────────────┤${C.reset}`);

  metric(
    "Drift detected",
    result.report.drift.detected ? "YES" : "NO",
    result.report.drift.detected ? "bad" : "good",
  );
  metric(
    "Severity",
    result.report.drift.severity,
    result.report.drift.severity === "critical" ? "bad" : "neutral",
  );
  metric("Action taken", result.decision.action);

  if (result.resolution) {
    metric(
      "Resolution status",
      result.resolution.status,
      result.resolution.status === "SUCCESS" ? "good" : "bad",
    );

    if (result.report.healed) {
      success("Configuration successfully healed!");
      metric("Verification", "PASS", "good");
    } else if (result.resolution.status === "FAILED") {
      error("Auto-heal failed");
      info(`Error: ${result.resolution.error}`);
    }
  }

  console.log(`  ${C.cyan}└─────────────────────────────────────────────┘${C.reset}\n`);

  return result;
}

// ═══════════════════════════════════════════════════════════════════
// USE CASE 4: Formula Demonstration - Coverage Gap Analysis
// ═══════════════════════════════════════════════════════════════════

function useCase4_FormulaDemonstration() {
  section("USE CASE 4: Formula Demonstration - Coverage Analysis");
  subsection("Scenario: Analyzing entity coverage with policy thresholds");

  console.log(`\n${C.magenta}DriftFormulas Coverage Gap Analysis:${C.reset}\n`);

  // Simulate different coverage scenarios
  const scenarios = [
    { covered: 10, total: 10, threshold: 0.3, name: "Full Coverage" },
    { covered: 7, total: 10, threshold: 0.3, name: "Partial (70%)" },
    { covered: 2, total: 10, threshold: 0.3, name: "Low (20%)" },
    { covered: 0, total: 10, threshold: 0.3, name: "No Coverage" },
  ];

  scenarios.forEach((scenario) => {
    const gap = DriftFormulas.coverageGap(scenario.covered, scenario.total, scenario.threshold);

    console.log(`  ${C.bright}${scenario.name}${C.reset}`);
    metric("Coverage ratio", `${(gap.ratio * 100).toFixed(1)}%`, gap.detected ? "bad" : "good");
    metric("Threshold", `${(scenario.threshold * 100).toFixed(0)}%`);
    metric("Gap detected", gap.detected ? "YES" : "NO", gap.detected ? "bad" : "good");
    metric("Severity", gap.severity.toFixed(2), gap.severity > 0.5 ? "bad" : "neutral");

    if (gap.detected) {
      console.log(`    ${C.gray}→ ${gap.metadata.deficit} entities below threshold${C.reset}`);
    }
    console.log();
  });

  // Hash comparison demo
  console.log(`${C.magenta}DriftFormulas Hash Comparison:${C.reset}\n`);

  const content1 = "version: 2\nrules: []";
  const content2 = "version: 2\nrules:\n  - rule1";

  const hash1 = DriftFormulas.computeHash(content1);
  const hash2 = DriftFormulas.computeHash(content2);

  metric("Content A hash", hash1);
  metric("Content B hash", hash2);
  metric("Drift detected", DriftFormulas.isDrift(hash1, hash2) ? "YES" : "NO", "bad");
  metric("Same content", DriftFormulas.isDrift(hash1, hash1) ? "YES" : "NO", "good");
}

// ═══════════════════════════════════════════════════════════════════
// USE CASE 5: Historical Trend Analysis
// ═══════════════════════════════════════════════════════════════════

async function useCase5_TrendAnalysis(guard) {
  section("USE CASE 5: Historical Trend Analysis");
  subsection("Scenario: Reviewing configuration health over time");

  // Simulate multiple runs
  console.log(`\n${C.dim}// Simulating 10 historical runs...${C.reset}\n`);

  for (let i = 0; i < 10; i++) {
    // Simulate some runs with drift
    const hasDrift = i === 3 || i === 7;

    const mockRun = {
      runId: `run-${i}`,
      timestamp: new Date(Date.now() - (10 - i) * 3600000).toISOString(), // Spread over hours
      state: hasDrift ? "DRIFT_DETECTED" : "HEALTHY",
      driftDetected: hasDrift,
      severity: hasDrift ? "medium" : "none",
      duration: 20 + Math.random() * 30,
      action: hasDrift ? "AUTO_SYNC" : "HEALTHY",
    };

    guard.state.runs = guard.state.runs || [];
    guard.state.runs.push(mockRun);
  }

  // Trim to last 100
  guard.state.runs = guard.state.runs.slice(-100);

  const trends = guard.telemetry.analyzeTrends();

  console.log(`  ${C.cyan}┌─────────────────────────────────────────────┐`);
  console.log(`  │ Trend Analysis                              │`);
  console.log(`  ├─────────────────────────────────────────────┤${C.reset}`);

  metric("Total runs analyzed", trends.totalRuns.toString());
  metric(
    "Drift rate",
    `${(trends.driftRate * 100).toFixed(1)}%`,
    trends.driftRate > 0.2 ? "bad" : "good",
  );
  metric("Average duration", `${trends.avgDuration.toFixed(0)}ms`);
  metric(
    "Trend direction",
    trends.trend,
    trends.trend === "DEGRADING" ? "bad" : trends.trend === "STABLE" ? "good" : "neutral",
  );

  console.log(`  ${C.cyan}└─────────────────────────────────────────────┘${C.reset}\n`);

  if (trends.trend === "DEGRADING") {
    warning("System health is degrading over time");
    info("Recommendation: Enable stricter policies or investigate root cause");
  } else if (trends.trend === "STABLE") {
    success("System health is stable");
  }
}

// ═══════════════════════════════════════════════════════════════════
// USE CASE 6: Policy Comparison
// ═══════════════════════════════════════════════════════════════════

function useCase6_PolicyComparison() {
  section("USE CASE 6: Policy Comparison");
  subsection("Scenario: Choosing appropriate policy for different environments");

  console.log(`\n${C.magenta}Policy Configuration Matrix:${C.reset}\n`);

  const policies = [
    { name: "STRICT", policy: DRIFT_POLICIES.STRICT, env: "Production" },
    { name: "ADAPTIVE", policy: DRIFT_POLICIES.ADAPTIVE, env: "Development" },
    { name: "PERMISSIVE", policy: DRIFT_POLICIES.PERMISSIVE, env: "Research" },
  ];

  policies.forEach(({ name, policy, env }) => {
    console.log(`  ${C.bright}${name}${C.reset} ${C.gray}(for ${env})${C.reset}`);
    metric("Coverage threshold", `${(policy.thresholds.COVERAGE * 100).toFixed(0)}%`);
    metric("Line diff threshold", policy.thresholds.LINE_DIFF.toString());
    metric(
      "Auto-heal enabled",
      policy.autoHeal ? "YES" : "NO",
      policy.autoHeal ? "good" : "neutral",
    );
    metric("Fail-closed", policy.failClosed ? "YES" : "NO", policy.failClosed ? "good" : "neutral");
    metric("Escalation", policy.escalation, policy.escalation === "HALT" ? "good" : "neutral");
    console.log();
  });

  success("Choose STRICT for production, ADAPTIVE for development");
}

// ═══════════════════════════════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════════════════════════════

function cleanup() {
  section("CLEANUP");

  if (existsSync(TEMP_DIR)) {
    rmSync(TEMP_DIR, { recursive: true, force: true });
    success(`Removed demo directory: ${path.relative(__dirname, TEMP_DIR)}`);
  }

  info("Demo artifacts cleaned up");
  info("Real state preserved in: .glimpse/drift-guard/");
}

// ═══════════════════════════════════════════════════════════════════
// MAIN EXECUTION
// ═══════════════════════════════════════════════════════════════════

async function main() {
  console.log(`\n${C.bright}${C.cyan}╔══════════════════════════════════════════════════════════════════╗
║           DRIFTGUARD CLI DEMONSTRATION                           ║
║   Comprehensive Configuration Integrity Management               ║
╚══════════════════════════════════════════════════════════════════╝${C.reset}\n`);

  const paths = setupDemoEnvironment();

  try {
    // Run all use cases
    await useCase1_DeveloperHealthCheck(paths);
    await useCase2_CICDGate(paths);
    await useCase3_AutoHealing(paths);
    useCase4_FormulaDemonstration();

    const guard = createDriftGuard({ root: TEMP_DIR });
    await useCase5_TrendAnalysis(guard);
    useCase6_PolicyComparison();

    // Final summary
    section("DEMONSTRATION COMPLETE");

    console.log(`\n${C.green}✓${C.reset} All use cases executed successfully\n`);

    console.log(`${C.cyan}Key Capabilities Demonstrated:${C.reset}`);
    console.log(`  ${C.dim}1.${C.reset} Manual health checks with detailed reporting`);
    console.log(`  ${C.dim}2.${C.reset} CI/CD strict mode gating`);
    console.log(`  ${C.dim}3.${C.reset} Automatic drift detection and healing`);
    console.log(`  ${C.dim}4.${C.reset} Mathematical formula validation`);
    console.log(`  ${C.dim}5.${C.reset} Historical trend analysis`);
    console.log(`  ${C.dim}6.${C.reset} Policy-based decision matrices\n`);

    console.log(`${C.cyan}CLI Commands Available:${C.reset}`);
    console.log(`  ${C.dim}$${C.reset} glimpse-guard health`);
    console.log(`  ${C.dim}$${C.reset} glimpse-guard ci [--strict]`);
    console.log(`  ${C.dim}$${C.reset} glimpse-guard heal`);
    console.log(`  ${C.dim}$${C.reset} glimpse-guard trends`);
    console.log(`  ${C.dim}$${C.reset} glimpse-guard policies\n`);
  } catch (err) {
    error(`Demo failed: ${err.message}`);
    console.error(err);
  } finally {
    cleanup();
  }
}

// Run main
main()
  .then(() => {
    console.log(`\n${C.green}✨ Thank you for using DriftGuard${C.reset}\n`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(`\n${C.red}Fatal error:${C.reset}`, err);
    process.exit(1);
  });
