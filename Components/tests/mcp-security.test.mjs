/**
 * MCP Security Tests — TypeScript Server Layer
 *
 * Validates security hardening across CascadeProjects MCP infrastructure:
 * - AuditIntegrityGuard source & timestamp validation
 * - ExecutionPolicyEngine path traversal rejection
 * - generateId() uniqueness and CSPRNG usage
 * - Rate limiting enforcement
 *
 * Run: node --test tests/mcp-security.test.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateId } from "../shared-types/dist/id.js";
import {
  AuditIntegrityGuard,
  ExecutionPolicyEngine,
} from "../shared-types/dist/security-policy.js";
import { SessionRateLimiter } from "../shared-types/dist/session-rate-limit.js";

// =============================================================================
// 1. generateId() — CSPRNG Uniqueness
// =============================================================================

describe("generateId", () => {
  it("should produce unique IDs over 10000 iterations", () => {
    const ids = new Set();
    for (let i = 0; i < 10000; i++) {
      ids.add(generateId("test"));
    }
    assert.equal(ids.size, 10000, "All 10000 IDs should be unique");
  });

  it("should use hex format (not base36)", () => {
    const id = generateId("pfx");
    // Format: pfx-<timestamp>-<8 hex chars>
    assert.match(id, /^pfx-\d+-[0-9a-f]{8}$/, "ID should match expected CSPRNG format");
  });

  it("should include the prefix", () => {
    const id = generateId("aud");
    assert.ok(id.startsWith("aud-"), "ID should start with given prefix");
  });
});

// =============================================================================
// 2. AuditIntegrityGuard — Source Validation
// =============================================================================

describe("AuditIntegrityGuard", () => {
  it("should reject unknown source", () => {
    const result = AuditIntegrityGuard.validateEntry(
      "unknown-evil-server",
      new Date().toISOString()
    );
    assert.equal(result.verdict, "deny");
    assert.ok(result.reason.includes("unknown source"));
  });

  it("should accept all known sources including eligibility-server and glimpse-server", () => {
    const knownSources = [
      "grid-server", "lots-server", "maintain-server", "echoes-server",
      "pulse-server", "seeds-server", "afloat-server", "overview-server",
      "grid-main", "eligibility-server", "glimpse-server",
    ];
    for (const source of knownSources) {
      const result = AuditIntegrityGuard.validateEntry(source, new Date().toISOString());
      assert.notEqual(result.verdict, "deny", `Source ${source} should be accepted`);
    }
  });

  it("should reject stale timestamps (>24h)", () => {
    const staleDate = new Date(Date.now() - 2 * 86_400_000).toISOString(); // 2 days ago
    const result = AuditIntegrityGuard.validateEntry("grid-server", staleDate);
    assert.equal(result.verdict, "deny");
  });
});

// =============================================================================
// 3. ExecutionPolicyEngine — Path Traversal
// =============================================================================

describe("ExecutionPolicyEngine", () => {
  it("should reject ../../ in script paths", () => {
    const engine = new ExecutionPolicyEngine(["/home/caraxes/CascadeProjects/experiments"]);
    const result = engine.validateScriptPath("../../etc/passwd");
    assert.equal(result.verdict, "deny");
  });

  it("should reject absolute paths outside roots", () => {
    const engine = new ExecutionPolicyEngine(["/home/caraxes/CascadeProjects/experiments"]);
    const result = engine.validateScriptPath("/etc/shadow");
    assert.equal(result.verdict, "deny");
  });
});

// =============================================================================
// 4. Rate Limiter — Window Enforcement
// =============================================================================

describe("SessionRateLimiter", () => {
  it("should enforce calls-per-window limit", () => {
    const limiter = new SessionRateLimiter({ maxCalls: 3, windowMs: 60_000 });
    // check() returns null when allowed, string when rate-limited
    assert.equal(limiter.check("test-tool"), null, "1st call should pass");
    assert.equal(limiter.check("test-tool"), null, "2nd call should pass");
    assert.equal(limiter.check("test-tool"), null, "3rd call should pass");
    assert.notEqual(limiter.check("test-tool"), null, "4th call should be rate-limited");
  });
});
