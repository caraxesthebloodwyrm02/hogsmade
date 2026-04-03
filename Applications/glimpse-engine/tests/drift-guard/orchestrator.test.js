/**
 * @file tests/drift-guard/orchestrator.test.js
 * @description Integration tests for mature DriftGuard architecture
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  DriftGuard,
  DriftFormulas,
  DriftDetector,
  DriftResolver,
  DRIFT_POLICIES,
  createDriftGuard,
} from "../../core/drift-guard/index.js";

// ═══════════════════════════════════════════════════════════════════
// FORMULA TESTS
// ═══════════════════════════════════════════════════════════════════

test("DriftFormulas.computeHash generates consistent 16-char hex", () => {
  const hash1 = DriftFormulas.computeHash("test content");
  const hash2 = DriftFormulas.computeHash("test content");

  assert.equal(hash1, hash2);
  assert.equal(hash1.length, 16);
  assert.match(hash1, /^[0-9a-f]+$/);
});

test("DriftFormulas.isDrift returns true for different hashes", () => {
  const h1 = DriftFormulas.computeHash("content A");
  const h2 = DriftFormulas.computeHash("content B");

  assert.equal(DriftFormulas.isDrift(h1, h2), true);
  assert.equal(DriftFormulas.isDrift(h1, h1), false);
});

test("DriftFormulas.calculateSeverity categorizes correctly", () => {
  assert.equal(DriftFormulas.calculateSeverity(0), "none");
  assert.equal(DriftFormulas.calculateSeverity(5), "medium");
  assert.equal(DriftFormulas.calculateSeverity(25), "high");
  assert.equal(DriftFormulas.calculateSeverity(100), "critical");
});

test("DriftFormulas.coverageGap detects gaps correctly", () => {
  const gap = DriftFormulas.coverageGap(2, 10, 0.3); // 20% coverage, threshold 30%

  assert.equal(gap.detected, true);
  assert.equal(gap.ratio, 0.2);
  assert.equal(gap.threshold, 0.3);
  assert.ok(gap.severity > 0.3);
});

test("DriftFormulas.coverageGap reports healthy when above threshold", () => {
  const gap = DriftFormulas.coverageGap(5, 10, 0.3); // 50% coverage

  assert.equal(gap.detected, false);
  assert.equal(gap.ratio, 0.5);
});

test("DriftFormulas.compoundSeverity calculates multi-modal score", () => {
  const severe = DriftFormulas.compoundSeverity({
    driftDetected: true,
    gapCount: 8,
    contractViolations: 1,
  });

  // 0.4 + 0.3 + 0.3 = 1.0 capped
  assert.ok(severe >= 0.7 && severe <= 1.0);

  const mild = DriftFormulas.compoundSeverity({
    driftDetected: false,
    gapCount: 2,
  });

  // Just gap contribution: 2 * 0.06 = 0.12
  assert.ok(mild < 0.5);
});

test("DriftFormulas.suggestAdjustment requires sufficient history", () => {
  const result = DriftFormulas.suggestAdjustment([1, 2], 0.05);

  assert.equal(result.canAdjust, false);
  assert.equal(result.reason, "insufficient_history");
});

test("DriftFormulas.suggestAdjustment suggests lowering when stable", () => {
  // Stable low-gap history
  const history = [0, 1, 0, 0, 1]; // avg < 1, trend stable
  const result = DriftFormulas.suggestAdjustment(history, 0.05);

  assert.equal(result.canAdjust, true);
  assert.equal(result.action, "lower");
  assert.equal(result.adjustment, -0.05);
  assert.ok(result.confidence > 0.5);
});

// ═══════════════════════════════════════════════════════════════════
// DETECTOR TESTS
// ═══════════════════════════════════════════════════════════════════

test("DriftDetector extracts embedded YAML successfully", () => {
  const detector = new DriftDetector();
  const jsContent = "export const DEFAULT_MASTER_YAML = `version: 2\nrules: []`;\n// other code";

  const extracted = detector.extractEmbeddedYaml(jsContent);

  assert.equal(extracted.success, true);
  assert.equal(extracted.content, "version: 2\nrules: []");
  assert.equal(extracted.error, null);
});

test("DriftDetector reports failure for non-matching content", () => {
  const detector = new DriftDetector();
  const jsContent = 'export const something = "not yaml template"';

  const extracted = detector.extractEmbeddedYaml(jsContent);

  assert.equal(extracted.success, false);
  assert.equal(extracted.error, "no_template_literal_found");
  assert.equal(extracted.content, null);
});

// ═══════════════════════════════════════════════════════════════════
// RESOLVER TESTS
// ═══════════════════════════════════════════════════════════════════

test("DriftResolver.decide returns HALT for critical severity with strict policy", () => {
  const resolver = new DriftResolver(DRIFT_POLICIES.STRICT);
  const report = {
    drift: { detected: true },
    gaps: new Array(10), // Many gaps
  };

  const decision = resolver.decide(report);

  assert.equal(decision.action, "HALT");
  assert.equal(decision.autoHeal, false);
  assert.equal(decision.notify, "ADMIN_ALERT");
});

test("DriftResolver.decide returns AUTO_SYNC for drift with adaptive policy", () => {
  const resolver = new DriftResolver(DRIFT_POLICIES.ADAPTIVE);
  const report = {
    drift: { detected: true },
    gaps: [],
  };

  const decision = resolver.decide(report);

  assert.equal(decision.action, "AUTO_SYNC");
  assert.equal(decision.autoHeal, true);
  assert.equal(decision.notify, "LOG_EVENT");
});

test("DriftResolver.decide returns HEALTHY when no issues", () => {
  const resolver = new DriftResolver();
  const report = {
    drift: { detected: false },
    gaps: [],
  };

  const decision = resolver.decide(report);

  assert.equal(decision.action, "HEALTHY");
  assert.equal(decision.autoHeal, false);
  assert.equal(decision.notify, "SILENT");
});

// ═══════════════════════════════════════════════════════════════════
// INTEGRATION: DriftGuard Orchestrator
// ═══════════════════════════════════════════════════════════════════

test("createDriftGuard factory creates functional instance", () => {
  const guard = createDriftGuard();

  assert.ok(guard.detector instanceof DriftDetector);
  assert.ok(guard.resolver instanceof DriftResolver);
  assert.ok(guard.telemetry);
});

test("DriftGuard.ci throws on drift in strict mode", async () => {
  const guard = createDriftGuard({
    yamlPath: "/nonexistent/yaml",
    jsPath: "/nonexistent/js",
  });

  try {
    await guard.ci(true); // strict mode
    assert.fail("Should have thrown");
  } catch (err) {
    assert.ok(err.message.includes("DRIFTGUARD_HALT"));
    assert.ok(err.result);
  }
});

test("DriftGuard.health returns false when drift detected", () => {
  const guard = createDriftGuard({
    yamlPath: "/nonexistent",
    jsPath: "/nonexistent",
  });

  const health = guard.health();
  assert.equal(health, false);
});

test("DRIFT_POLICIES exports correct policies", () => {
  assert.ok(DRIFT_POLICIES.STRICT);
  assert.ok(DRIFT_POLICIES.ADAPTIVE);
  assert.ok(DRIFT_POLICIES.PERMISSIVE);

  // Verify structure
  for (const policy of Object.values(DRIFT_POLICIES)) {
    assert.ok(policy.id);
    assert.ok(policy.thresholds);
    assert.ok(policy.thresholds.HASH_DIFF);
    assert.ok(typeof policy.autoHeal === "boolean");
    assert.ok(typeof policy.failClosed === "boolean");
  }
});

// ═══════════════════════════════════════════════════════════════════
// COMPLETE WORKFLOW
// ═══════════════════════════════════════════════════════════════════

test("Complete DriftGuard lifecycle", async () => {
  // Create a guard with permissive policy (won't fail on missing files)
  const guard = createDriftGuard({ policy: DRIFT_POLICIES.PERMISSIVE });

  // Ensure state is clean
  guard.state = { runs: [] };

  // Execute guard cycle
  const result = await guard.guard({ execute: false }); // Don't actually heal

  // Assertions
  assert.ok(result.runId);
  assert.ok(result.report);
  assert.ok(result.decision);
  assert.ok(result.trends);

  // State should be updated
  assert.equal(guard.state.runs.length, 1);
  assert.equal(guard.state.runs[0].runId, result.runId);

  // Even with errors, we got a complete result
  assert.ok(result.report.timestamp);
  assert.ok(typeof result.report.duration === "number");
});
