import test from "node:test";
import assert from "node:assert/strict";
import { OwnershipGovernance } from "../dist/security-policy.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test Data
// ─────────────────────────────────────────────────────────────────────────────

const SENSITIVE_FILE = "src/grid/auth/middleware.ts";
const SENSITIVE_SECURITY = "src/grid/security/policy.ts";
const NON_SENSITIVE_FILE = "src/utils/logger.ts";
const TEST_FILE = "tests/auth/middleware.test.ts";

const OWNERSHIP_MAP = {
  "src/grid/auth/": ["alice"],
  "src/grid/security/": ["alice", "bob"],
  "safety/auth/": ["alice"],
};

// ─────────────────────────────────────────────────────────────────────────────
// checkSensitivePR
// ─────────────────────────────────────────────────────────────────────────────

test("checkSensitivePR — sensitive paths with 0 reviewers → deny", () => {
  const result = OwnershipGovernance.checkSensitivePR([SENSITIVE_FILE], 0);
  assert.equal(result.verdict, "deny");
  assert.equal(result.policyId, "P-GOV-001");
  assert.equal(result.threatBasis, "OWN-001");
});

test("checkSensitivePR — sensitive paths with 2 reviewers → allow", () => {
  const result = OwnershipGovernance.checkSensitivePR([SENSITIVE_FILE], 2);
  assert.equal(result.verdict, "allow");
  assert.equal(result.policyId, "P-GOV-001");
});

test("checkSensitivePR — no sensitive paths → allow", () => {
  const result = OwnershipGovernance.checkSensitivePR([NON_SENSITIVE_FILE], 0);
  assert.equal(result.verdict, "allow");
});

// ─────────────────────────────────────────────────────────────────────────────
// checkSoleOwnership
// ─────────────────────────────────────────────────────────────────────────────

test("checkSoleOwnership — author is sole owner → escalate with OWN-002", () => {
  const result = OwnershipGovernance.checkSoleOwnership([SENSITIVE_FILE], "alice", OWNERSHIP_MAP);
  assert.equal(result.verdict, "escalate");
  assert.equal(result.policyId, "P-GOV-002");
  assert.equal(result.threatBasis, "OWN-002");
});

test("checkSoleOwnership — author is one of multiple owners → allow", () => {
  const result = OwnershipGovernance.checkSoleOwnership(
    [SENSITIVE_SECURITY],
    "alice",
    OWNERSHIP_MAP,
  );
  assert.equal(result.verdict, "allow");
  assert.equal(result.policyId, "P-GOV-002");
});

test("checkSoleOwnership — no sensitive paths → allow", () => {
  const result = OwnershipGovernance.checkSoleOwnership(
    [NON_SENSITIVE_FILE],
    "alice",
    OWNERSHIP_MAP,
  );
  assert.equal(result.verdict, "allow");
});

// ─────────────────────────────────────────────────────────────────────────────
// checkTestCoverage
// ─────────────────────────────────────────────────────────────────────────────

test("checkTestCoverage — security changes without tests → deny", () => {
  const result = OwnershipGovernance.checkTestCoverage([SENSITIVE_SECURITY]);
  assert.equal(result.verdict, "deny");
  assert.equal(result.policyId, "P-GOV-003");
});

test("checkTestCoverage — security changes with test file → allow", () => {
  const result = OwnershipGovernance.checkTestCoverage([SENSITIVE_SECURITY, TEST_FILE]);
  assert.equal(result.verdict, "allow");
});

// ─────────────────────────────────────────────────────────────────────────────
// getPolicyRules
// ─────────────────────────────────────────────────────────────────────────────

test("getPolicyRules — returns 3 rules with correct policyIds", () => {
  const rules = OwnershipGovernance.getPolicyRules();
  assert.equal(rules.length, 3);
  const ids = rules.map((r) => r.policyId);
  assert.deepEqual(ids, ["P-GOV-001", "P-GOV-002", "P-GOV-003"]);
});

// ─────────────────────────────────────────────────────────────────────────────
// SENSITIVE_PATHS
// ─────────────────────────────────────────────────────────────────────────────

test("SENSITIVE_PATHS — contains expected 5 paths", () => {
  assert.equal(OwnershipGovernance.SENSITIVE_PATHS.length, 5);
  assert.deepEqual(OwnershipGovernance.SENSITIVE_PATHS, [
    "src/grid/auth/",
    "safety/auth/",
    "src/application/mothership/security/",
    "tests/auth/",
    "src/grid/security/",
  ]);
});
