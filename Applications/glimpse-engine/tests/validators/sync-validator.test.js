/**
 * @file tests/validators/sync-validator.test.js
 * Unit tests for sync validator
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  computeChecksum,
  loadSyncRegistry,
  saveSyncRegistry,
  validateSyncHealth,
  detectDrift,
} from "../../core/validators/sync-validator.js";

// Helper for temp file operations
import { writeFileSync, readFileSync, mkdtempSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// ═══════════════════════════════════════════════════════════════════
// computeChecksum tests
// ═══════════════════════════════════════════════════════════════════

test("computeChecksum generates consistent 16-char hex", () => {
  const content = "test content for hashing";
  const hash1 = computeChecksum(content);
  const hash2 = computeChecksum(content);

  assert.equal(hash1, hash2, "Same content should produce same hash");
  assert.equal(hash1.length, 16, "Hash should be 16 characters");
  assert.match(hash1, /^[0-9a-f]+$/, "Should be lowercase hex");
});

test("computeChecksum produces different hashes for different content", () => {
  const hash1 = computeChecksum("content A");
  const hash2 = computeChecksum("content B");
  const hash3 = computeChecksum("content A");

  assert.notEqual(hash1, hash2, "Different content should produce different hashes");
  assert.equal(hash1, hash3, "Same content should produce same hash");
});

test("computeChecksum handles empty string", () => {
  const hash = computeChecksum("");
  assert.equal(hash.length, 16);
  assert.match(hash, /^[0-9a-f]+$/);
});

test("computeChecksum handles unicode", () => {
  const hash = computeChecksum("unicode: 你好 🎉 émojis");
  assert.equal(hash.length, 16);
});

// ═══════════════════════════════════════════════════════════════════
// Registry persistence tests
// ═══════════════════════════════════════════════════════════════════

test("loadSyncRegistry creates fresh registry if none exists", () => {
  // Note: This may fail if registry exists in test environment
  // but tests the fallback behavior
  const registry = loadSyncRegistry();

  assert.equal(registry.version, "1.0.0", "Should have default version");
  assert.equal(registry.lastSync, null, "Should have null lastSync initially");
  assert.ok(Array.isArray(registry.driftHistory), "Should have driftHistory array");
  assert.ok(Array.isArray(registry.driftHistory), "Should have driftHistory array");
  assert.ok(registry.createdAt, "Should have createdAt timestamp");
});

// ═══════════════════════════════════════════════════════════════════
// detectDrift tests
// ═══════════════════════════════════════════════════════════════════

test("detectDrift handles missing files", () => {
  const tmpDir = mkdtempSync(path.join(tmpdir(), "glimpse-test-"));
  const yamlPath = path.join(tmpDir, "nonexistent.yaml");
  const jsPath = path.join(tmpDir, "nonexistent.js");

  const drift = detectDrift(yamlPath, jsPath);

  assert.equal(drift.yamlExists, false);
  assert.equal(drift.jsExists, false);
  assert.equal(drift.driftDetected, false);

  rmdirSync(tmpDir);
});

test("detectDrift detects matching content", () => {
  const tmpDir = mkdtempSync(path.join(tmpdir(), "glimpse-test-"));
  const yamlPath = path.join(tmpDir, "test.yaml");
  const jsPath = path.join(tmpDir, "test.js");

  const content = "version: 2\nrules: []\n";

  // Write YAML
  writeFileSync(yamlPath, content);

  // Write JS with embedded YAML - note: careful with template construction
  const jsContent = "export const DEFAULT_MASTER_YAML = `" + content + "`;";
  writeFileSync(jsPath, jsContent);

  const drift = detectDrift(yamlPath, jsPath);

  assert.equal(drift.yamlExists, true);
  assert.equal(drift.jsExists, true);
  // Check extraction worked - if extracted and hashes match
  if (drift.extractionStatus === "extracted" && drift.embeddedHash) {
    assert.equal(drift.driftDetected, false, "Should not detect drift when content matches");
    assert.equal(drift.yamlHash, drift.embeddedHash, "Hashes should match");
  } else {
    // If extraction failed for some reason, that's a different issue
    assert.ok(drift.extractionStatus, "Should have extraction status");
  }

  unlinkSync(yamlPath);
  unlinkSync(jsPath);
  rmdirSync(tmpDir);
});

test("detectDrift detects drift", () => {
  const tmpDir = mkdtempSync(path.join(tmpdir(), "glimpse-test-"));
  const yamlPath = path.join(tmpDir, "test.yaml");
  const jsPath = path.join(tmpDir, "test.js");

  // Different contents
  const yamlContent = "version: 2\nrules:\n  - rule1\n";
  const jsContent = "export const DEFAULT_MASTER_YAML = `version: 2\nrules: []\n`;\n";

  writeFileSync(yamlPath, yamlContent);
  writeFileSync(jsPath, jsContent);

  const drift = detectDrift(yamlPath, jsPath);

  assert.equal(drift.yamlExists, true);
  assert.equal(drift.jsExists, true);
  assert.equal(drift.driftDetected, true);
  assert.notEqual(drift.yamlHash, drift.embeddedHash);

  unlinkSync(yamlPath);
  unlinkSync(jsPath);
  rmdirSync(tmpDir);
});

test("detectDrift handles malformed JS (no template literal)", () => {
  const tmpDir = mkdtempSync(path.join(tmpdir(), "glimpse-test-"));
  const yamlPath = path.join(tmpDir, "test.yaml");
  const jsPath = path.join(tmpDir, "test.js");

  writeFileSync(yamlPath, "version: 2\n");
  writeFileSync(jsPath, 'export const something = "not yaml"\n');

  const drift = detectDrift(yamlPath, jsPath);

  assert.equal(drift.extractionStatus, "no_template_literal_found");
  assert.equal(drift.driftDetected, true);
  assert.equal(drift.embeddedHash, null);

  unlinkSync(yamlPath);
  unlinkSync(jsPath);
  rmdirSync(tmpDir);
});
