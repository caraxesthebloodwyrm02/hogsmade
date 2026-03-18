/**
 * MCP Security Policy Engine
 *
 * Provides reusable security guards for MCP servers derived from:
 * - TM-003: Local MCP tool abuse (execution, cleanup, file mutation)
 * - TM-004: Shared audit/snapshot poisoning
 * - TM-005: GATE envelope forgery / fail-open bypass
 * - TM-006: MCP read-tool reconnaissance
 * - SBP-001: Hard-coded secrets
 * - OWN-001/OWN-002: Governance triggers
 *
 * Usage:
 *   import { ExecutionPolicyEngine, AuditIntegrityGuard, ... } from '@cascade/shared-types/security-policy';
 */

import crypto from "crypto";
import path from "path";

// =============================================================================
// Types
// =============================================================================

export type PolicyVerdict = "allow" | "deny" | "warn" | "escalate";

export interface PolicyResult {
  policyId: string;
  verdict: PolicyVerdict;
  reason: string;
  threatBasis: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface PolicyRule {
  policyId: string;
  description: string;
  threatBasis: string;
  condition: (context: Record<string, unknown>) => boolean;
  verdictOnMatch: PolicyVerdict;
  reasonTemplate: string;
}

export interface SecurityTrigger {
  event: string;
  hooks: string[];
  description: string;
}

// =============================================================================
// Policy Engine
// =============================================================================

const VERDICT_PRIORITY: Record<PolicyVerdict, number> = {
  deny: 4,
  escalate: 3,
  warn: 2,
  allow: 1,
};

export class MCPPolicyEngine {
  private rules: PolicyRule[] = [];
  private evaluationLog: PolicyResult[] = [];
  private maxLog = 5000;

  register(rule: PolicyRule): void {
    this.rules.push(rule);
  }

  registerMany(rules: PolicyRule[]): void {
    for (const rule of rules) {
      this.register(rule);
    }
  }

  evaluate(context: Record<string, unknown>): PolicyResult[] {
    const triggered: PolicyResult[] = [];
    for (const rule of this.rules) {
      try {
        if (rule.condition(context)) {
          const result: PolicyResult = {
            policyId: rule.policyId,
            verdict: rule.verdictOnMatch,
            reason: rule.reasonTemplate,
            threatBasis: rule.threatBasis,
            metadata: { contextKeys: Object.keys(context) },
            timestamp: new Date().toISOString(),
          };
          triggered.push(result);
          this.evaluationLog.push(result);
          if (this.evaluationLog.length > this.maxLog) {
            this.evaluationLog = this.evaluationLog.slice(-this.maxLog);
          }
        }
      } catch (err) {
        const result: PolicyResult = {
          policyId: rule.policyId,
          verdict: "warn",
          reason: `Policy evaluation error: ${err instanceof Error ? err.message : String(err)}`,
          threatBasis: rule.threatBasis,
          timestamp: new Date().toISOString(),
        };
        triggered.push(result);
      }
    }
    return triggered;
  }

  evaluateStrict(context: Record<string, unknown>): PolicyResult | null {
    const triggered = this.evaluate(context);
    if (triggered.length === 0) return null;
    return triggered.reduce((most, r) =>
      (VERDICT_PRIORITY[r.verdict] ?? 0) > (VERDICT_PRIORITY[most.verdict] ?? 0) ? r : most
    );
  }

  getRecentEvaluations(limit = 50): PolicyResult[] {
    return this.evaluationLog.slice(-limit);
  }

  get ruleCount(): number {
    return this.rules.length;
  }
}

// =============================================================================
// Guard: Execution Policy Engine (TM-003)
// =============================================================================

export class ExecutionPolicyEngine {
  private allowedRoots: string[];
  private blockedShellOperators = ["|", "&&", "||", ";", "`", "$(", ">", "<", ">>"];
  private allowedInterpreters = ["node", "python", "powershell", "bash"];

  constructor(allowedRoots: string[]) {
    this.allowedRoots = allowedRoots.map((r) => path.resolve(r));
  }

  /**
   * P-MCP-001: IF script path outside allowlist → THEN block.
   */
  validateScriptPath(scriptPath: string): PolicyResult {
    const resolved = path.resolve(scriptPath);
    const withinAllowed = this.allowedRoots.some((root) => resolved.startsWith(root));

    if (!withinAllowed) {
      return {
        policyId: "P-MCP-001",
        verdict: "deny",
        reason: `Script path '${resolved}' is outside allowed roots`,
        threatBasis: "TM-003",
        metadata: { scriptPath: resolved, allowedRoots: this.allowedRoots },
        timestamp: new Date().toISOString(),
      };
    }

    return {
      policyId: "P-MCP-001",
      verdict: "allow",
      reason: "Script path within allowed roots",
      threatBasis: "TM-003",
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * P-MCP-003: IF command contains shell operators → THEN block.
   */
  validateCommand(command: string): PolicyResult {
    for (const op of this.blockedShellOperators) {
      if (command.includes(op)) {
        return {
          policyId: "P-MCP-003",
          verdict: "deny",
          reason: `Command contains blocked shell operator '${op}'`,
          threatBasis: "TM-003",
          metadata: { command, blockedOperator: op },
          timestamp: new Date().toISOString(),
        };
      }
    }

    return {
      policyId: "P-MCP-003",
      verdict: "allow",
      reason: "Command passed shell operator check",
      threatBasis: "TM-003",
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * P-MCP-005: IF tool targets path outside workspace roots → THEN block.
   */
  validateTargetPath(targetPath: string): PolicyResult {
    const resolved = path.resolve(targetPath);
    const withinAllowed = this.allowedRoots.some((root) => resolved.startsWith(root));

    if (!withinAllowed) {
      return {
        policyId: "P-MCP-005",
        verdict: "deny",
        reason: `Target path '${resolved}' is outside workspace roots`,
        threatBasis: "TM-003",
        metadata: { targetPath: resolved },
        timestamp: new Date().toISOString(),
      };
    }

    return {
      policyId: "P-MCP-005",
      verdict: "allow",
      reason: "Target path within workspace roots",
      threatBasis: "TM-003",
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * P-MCP-002: Require dry-run confirmation for destructive ops.
   */
  requireApproval(
    dryRun: boolean,
    previewToken: string | undefined,
    confirmPhrase: string | undefined,
    expectedPhrase: string = "CONFIRM-CLEANUP",
  ): PolicyResult {
    if (!dryRun && confirmPhrase !== expectedPhrase) {
      return {
        policyId: "P-MCP-002",
        verdict: "deny",
        reason: "Destructive operation requires confirmation phrase",
        threatBasis: "TM-003",
        timestamp: new Date().toISOString(),
      };
    }

    if (!dryRun && !previewToken) {
      return {
        policyId: "P-MCP-002",
        verdict: "deny",
        reason: "Destructive operation requires preview token from prior dry-run",
        threatBasis: "TM-003",
        timestamp: new Date().toISOString(),
      };
    }

    return {
      policyId: "P-MCP-002",
      verdict: "allow",
      reason: dryRun ? "Dry-run mode — no destructive action" : "Approval confirmed",
      threatBasis: "TM-003",
      timestamp: new Date().toISOString(),
    };
  }

  static getPolicyRules(allowedRoots: string[]): PolicyRule[] {
    const resolvedRoots = allowedRoots.map((r) => path.resolve(r));
    return [
      {
        policyId: "P-MCP-001",
        description: "Block scripts outside allowed roots",
        threatBasis: "TM-003",
        condition: (ctx) => {
          const sp = ctx["scriptPath"] as string | undefined;
          if (!sp) return false;
          return !resolvedRoots.some((root) => path.resolve(sp).startsWith(root));
        },
        verdictOnMatch: "deny",
        reasonTemplate: "Script path outside allowed experiments directory",
      },
      {
        policyId: "P-MCP-002",
        description: "Require dry-run before destructive execution",
        threatBasis: "TM-003",
        condition: (ctx) => ctx["dryRun"] === false && !ctx["previewToken"],
        verdictOnMatch: "deny",
        reasonTemplate: "Destructive operation requires prior dry-run preview token",
      },
      {
        policyId: "P-MCP-005",
        description: "Block operations targeting paths outside workspace roots",
        threatBasis: "TM-003",
        condition: (ctx) => {
          const tp = ctx["targetPath"] as string | undefined;
          if (!tp) return false;
          return !resolvedRoots.some((root) => path.resolve(tp).startsWith(root));
        },
        verdictOnMatch: "deny",
        reasonTemplate: "Target path outside allowed workspace roots",
      },
    ];
  }
}

// =============================================================================
// Guard: Audit Integrity (TM-004)
// =============================================================================

export class AuditIntegrityGuard {
  static readonly KNOWN_SOURCES = new Set([
    "grid-server",
    "lots-server",
    "maintain-server",
    "echoes-server",
    "pulse-server",
    "seeds-server",
    "afloat-server",
    "grid-main",
  ]);

  static readonly MAX_TIMESTAMP_DRIFT_MS = 86_400_000; // 24 hours
  static readonly MAX_SCORE_DELTA = 40;

  /**
   * P-INT-001 + P-INT-002: Validate audit entry timestamp and source.
   */
  static validateEntry(source: string, timestamp: string): PolicyResult {
    // Source check
    if (!AuditIntegrityGuard.KNOWN_SOURCES.has(source)) {
      return {
        policyId: "P-INT-002",
        verdict: "deny",
        reason: `Audit entry from unknown source '${source}'`,
        threatBasis: "TM-004",
        metadata: { source, knownSources: [...AuditIntegrityGuard.KNOWN_SOURCES] },
        timestamp: new Date().toISOString(),
      };
    }

    // Timestamp check
    const entryTime = new Date(timestamp).getTime();
    const now = Date.now();

    if (isNaN(entryTime)) {
      return {
        policyId: "P-INT-001",
        verdict: "deny",
        reason: `Invalid timestamp format: '${timestamp}'`,
        threatBasis: "TM-004",
        timestamp: new Date().toISOString(),
      };
    }

    if (entryTime > now + 60_000) {
      // Allow 60s clock skew
      return {
        policyId: "P-INT-001",
        verdict: "deny",
        reason: `Audit entry timestamp is in the future`,
        threatBasis: "TM-004",
        metadata: { entryTimestamp: timestamp, driftMs: entryTime - now },
        timestamp: new Date().toISOString(),
      };
    }

    if (now - entryTime > AuditIntegrityGuard.MAX_TIMESTAMP_DRIFT_MS) {
      return {
        policyId: "P-INT-001",
        verdict: "deny",
        reason: `Audit entry is ${Math.round((now - entryTime) / 3600_000)}h stale`,
        threatBasis: "TM-004",
        metadata: { entryTimestamp: timestamp, ageMs: now - entryTime },
        timestamp: new Date().toISOString(),
      };
    }

    return {
      policyId: "P-INT-001",
      verdict: "allow",
      reason: "Audit entry integrity check passed",
      threatBasis: "TM-004",
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * P-INT-003: Flag anomalous snapshot score deltas.
   */
  static validateSnapshotDelta(
    previousScore: number | null,
    currentScore: number,
  ): PolicyResult {
    if (previousScore !== null) {
      const delta = Math.abs(currentScore - previousScore);
      if (delta > AuditIntegrityGuard.MAX_SCORE_DELTA) {
        return {
          policyId: "P-INT-003",
          verdict: "escalate",
          reason: `Snapshot score delta ${delta.toFixed(1)} exceeds threshold ${AuditIntegrityGuard.MAX_SCORE_DELTA}`,
          threatBasis: "TM-004",
          metadata: { previousScore, currentScore, delta },
          timestamp: new Date().toISOString(),
        };
      }
    }

    return {
      policyId: "P-INT-003",
      verdict: "allow",
      reason: "Snapshot delta within acceptable range",
      threatBasis: "TM-004",
      timestamp: new Date().toISOString(),
    };
  }

  static getPolicyRules(): PolicyRule[] {
    return [
      {
        policyId: "P-INT-001",
        description: "Reject audit entries with impossible timestamps",
        threatBasis: "TM-004",
        condition: (ctx) => {
          const drift = ctx["timestampDriftMs"] as number | undefined;
          return drift != null && Math.abs(drift) > AuditIntegrityGuard.MAX_TIMESTAMP_DRIFT_MS;
        },
        verdictOnMatch: "deny",
        reasonTemplate: "Audit entry timestamp exceeds drift threshold",
      },
      {
        policyId: "P-INT-002",
        description: "Reject audit entries from unknown sources",
        threatBasis: "TM-004",
        condition: (ctx) => !AuditIntegrityGuard.KNOWN_SOURCES.has(ctx["source"] as string),
        verdictOnMatch: "deny",
        reasonTemplate: "Audit entry from unknown source",
      },
      {
        policyId: "P-INT-003",
        description: "Flag anomalous snapshot score deltas",
        threatBasis: "TM-004",
        condition: (ctx) =>
          Math.abs((ctx["scoreDelta"] as number) ?? 0) > AuditIntegrityGuard.MAX_SCORE_DELTA,
        verdictOnMatch: "escalate",
        reasonTemplate: "Snapshot score delta exceeds threshold",
      },
    ];
  }
}

// =============================================================================
// Guard: GATE Security Policy (TM-005)
// =============================================================================

export class GateSecurityPolicy {
  static readonly KNOWN_TEST_SECRETS = new Set([
    "test-secret-for-grid-main-2026",
    "grid-main-secret",
    "TransitionGate",
    "test-secret",
    "secret",
    "GRID-main-2026",
  ]);

  /**
   * P-INT-004: Nonce must be registered and not burned.
   */
  static validateNonce(
    nonce: string | undefined,
    registry: Record<string, { burned?: boolean }>,
  ): PolicyResult {
    if (!nonce) {
      return {
        policyId: "P-INT-004",
        verdict: "deny",
        reason: "Envelope missing nonce",
        threatBasis: "TM-005",
        timestamp: new Date().toISOString(),
      };
    }

    const entry = registry[nonce];
    if (!entry) {
      return {
        policyId: "P-INT-004",
        verdict: "deny",
        reason: "Nonce not found in registry",
        threatBasis: "TM-005",
        metadata: { nonce: nonce.slice(0, 12) + "..." },
        timestamp: new Date().toISOString(),
      };
    }

    if (entry.burned) {
      return {
        policyId: "P-INT-004",
        verdict: "deny",
        reason: "Nonce already burned — replay attempt blocked",
        threatBasis: "TM-005",
        metadata: { nonce: nonce.slice(0, 12) + "..." },
        timestamp: new Date().toISOString(),
      };
    }

    return {
      policyId: "P-INT-004",
      verdict: "allow",
      reason: "Nonce valid and not burned",
      threatBasis: "TM-005",
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * P-INT-005: Fail closed when remote validation unavailable for production targets.
   */
  static failClosedPolicy(
    remoteAvailable: boolean,
    targetPartition: string,
    productionTargets: string[] = ["production", "staging"],
  ): PolicyResult {
    if (!remoteAvailable && productionTargets.includes(targetPartition)) {
      return {
        policyId: "P-INT-005",
        verdict: "deny",
        reason: `Remote validation unavailable for production target '${targetPartition}' — fail closed`,
        threatBasis: "TM-005",
        metadata: { targetPartition, remoteAvailable },
        timestamp: new Date().toISOString(),
      };
    }

    return {
      policyId: "P-INT-005",
      verdict: "allow",
      reason: remoteAvailable
        ? "Remote validation available"
        : `Non-production target '${targetPartition}' — local validation sufficient`,
      threatBasis: "TM-005",
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * P-INT-006: Reject known test secrets in non-test environments.
   */
  static validateSecret(secret: string, environment: string): PolicyResult {
    if (environment === "test" || environment === "testing") {
      return {
        policyId: "P-INT-006",
        verdict: "allow",
        reason: "Test environment — secret validation relaxed",
        threatBasis: "SBP-001",
        timestamp: new Date().toISOString(),
      };
    }

    if (GateSecurityPolicy.KNOWN_TEST_SECRETS.has(secret)) {
      return {
        policyId: "P-INT-006",
        verdict: "deny",
        reason: "GATE_USER_SECRET matches a known test secret — rotate immediately",
        threatBasis: "SBP-001",
        metadata: { environment },
        timestamp: new Date().toISOString(),
      };
    }

    if (secret.length < 32) {
      return {
        policyId: "P-INT-006",
        verdict: "warn",
        reason: `GATE_USER_SECRET is only ${secret.length} chars — recommend ≥32`,
        threatBasis: "SBP-001",
        metadata: { secretLength: secret.length },
        timestamp: new Date().toISOString(),
      };
    }

    return {
      policyId: "P-INT-006",
      verdict: "allow",
      reason: "Secret hygiene check passed",
      threatBasis: "SBP-001",
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Verify HMAC-SHA256 user fingerprint (mirrors Python + existing TS implementation).
   */
  static verifyFingerprint(
    secret: string,
    payloadHash: string,
    machineFingerprint: string,
    nonce: string,
    declaredFingerprint: string,
  ): boolean {
    const message = `${payloadHash}:${machineFingerprint}:${nonce}`;
    const expected = crypto
      .createHmac("sha256", secret)
      .update(message)
      .digest("hex");

    try {
      return crypto.timingSafeEqual(
        Buffer.from(expected, "hex"),
        Buffer.from(declaredFingerprint, "hex"),
      );
    } catch {
      return false;
    }
  }

  static getPolicyRules(): PolicyRule[] {
    return [
      {
        policyId: "P-INT-004",
        description: "Reject replayed or unregistered nonces",
        threatBasis: "TM-005",
        condition: (ctx) =>
          !ctx["nonceRegistered"] || ctx["nonceBurned"] === true,
        verdictOnMatch: "deny",
        reasonTemplate: "Nonce not registered or already burned",
      },
      {
        policyId: "P-INT-005",
        description: "Fail closed for production when remote validation unavailable",
        threatBasis: "TM-005",
        condition: (ctx) =>
          ctx["remoteAvailable"] === false &&
          (ctx["targetPartition"] === "production" || ctx["targetPartition"] === "staging"),
        verdictOnMatch: "deny",
        reasonTemplate: "Remote validation unavailable for production target — fail closed",
      },
      {
        policyId: "P-INT-006",
        description: "Reject known test secrets in non-test environments",
        threatBasis: "SBP-001",
        condition: (ctx) =>
          ctx["environment"] !== "test" &&
          ctx["environment"] !== "testing" &&
          GateSecurityPolicy.KNOWN_TEST_SECRETS.has(ctx["gateSecret"] as string),
        verdictOnMatch: "deny",
        reasonTemplate: "Known test secret detected in non-test environment",
      },
    ];
  }
}

// =============================================================================
// Guard: Read Scope Policy (TM-006)
// =============================================================================

export class ReadScopePolicy {
  private callCounts = new Map<string, { count: number; windowStart: number }>();
  private windowMs: number;
  private maxCallsPerWindow: number;

  constructor(windowMs = 60_000, maxCallsPerWindow = 20) {
    this.windowMs = windowMs;
    this.maxCallsPerWindow = maxCallsPerWindow;
  }

  /**
   * P-MCP-004: Throttle bulk read operations.
   */
  checkReadThrottle(sessionId: string, toolName: string): PolicyResult {
    const key = `${sessionId}:${toolName}`;
    const now = Date.now();
    const entry = this.callCounts.get(key);

    if (this.callCounts.size > 1000) {
      for (const [k, v] of this.callCounts) {
        if (now - v.windowStart > this.windowMs) {
          this.callCounts.delete(k);
        }
      }
    }

    if (!entry || now - entry.windowStart > this.windowMs) {
      this.callCounts.set(key, { count: 1, windowStart: now });
      return {
        policyId: "P-MCP-004",
        verdict: "allow",
        reason: "Read operation within rate limits",
        threatBasis: "TM-006",
        timestamp: new Date().toISOString(),
      };
    }

    entry.count++;

    if (entry.count > this.maxCallsPerWindow) {
      return {
        policyId: "P-MCP-004",
        verdict: "warn",
        reason: `Bulk read activity detected: ${entry.count} calls to '${toolName}' in ${this.windowMs / 1000}s window (threshold: ${this.maxCallsPerWindow})`,
        threatBasis: "TM-006",
        metadata: {
          sessionId,
          toolName,
          callCount: entry.count,
          windowMs: this.windowMs,
        },
        timestamp: new Date().toISOString(),
      };
    }

    return {
      policyId: "P-MCP-004",
      verdict: "allow",
      reason: "Read operation within rate limits",
      threatBasis: "TM-006",
      timestamp: new Date().toISOString(),
    };
  }

  static getPolicyRules(maxCallsPerWindow = 20): PolicyRule[] {
    return [
      {
        policyId: "P-MCP-004",
        description: "Throttle bulk read/scan operations",
        threatBasis: "TM-006",
        condition: (ctx) =>
          (ctx["readCallCount"] as number) > maxCallsPerWindow,
        verdictOnMatch: "warn",
        reasonTemplate: "Bulk read activity exceeds threshold — possible reconnaissance",
      },
    ];
  }
}

// =============================================================================
// Guard: Ownership Governance (OWN-001, OWN-002)
// =============================================================================

export class OwnershipGovernance {
  static readonly SENSITIVE_PATHS = [
    "src/grid/auth/",
    "safety/auth/",
    "src/application/mothership/security/",
    "tests/auth/",
    "src/grid/security/",
  ];

  /**
   * P-GOV-001: Require additional review for sensitive path changes.
   */
  static checkSensitivePR(
    changedPaths: string[],
    reviewerCount: number,
    requiredReviewers = 2,
  ): PolicyResult {
    const sensitiveChanges = changedPaths.filter((p) =>
      OwnershipGovernance.SENSITIVE_PATHS.some((sp) => p.includes(sp)),
    );

    if (sensitiveChanges.length > 0 && reviewerCount < requiredReviewers) {
      return {
        policyId: "P-GOV-001",
        verdict: "deny",
        reason: `PR modifies ${sensitiveChanges.length} sensitive path(s) but has only ${reviewerCount}/${requiredReviewers} reviewers`,
        threatBasis: "OWN-001",
        metadata: { sensitiveChanges, reviewerCount, requiredReviewers },
        timestamp: new Date().toISOString(),
      };
    }

    return {
      policyId: "P-GOV-001",
      verdict: "allow",
      reason: sensitiveChanges.length > 0
        ? `Sensitive paths changed with sufficient review (${reviewerCount}/${requiredReviewers})`
        : "No sensitive paths modified",
      threatBasis: "OWN-001",
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * P-GOV-003: Require test coverage for security changes.
   */
  static checkTestCoverage(
    changedPaths: string[],
  ): PolicyResult {
    const securityChanges = changedPaths.filter(
      (p) => p.includes("security/") || p.includes("auth/"),
    );
    const testChanges = changedPaths.filter(
      (p) => p.includes("test") || p.includes("spec"),
    );

    if (securityChanges.length > 0 && testChanges.length === 0) {
      return {
        policyId: "P-GOV-003",
        verdict: "deny",
        reason: `Security paths modified (${securityChanges.length} file(s)) without corresponding test changes`,
        threatBasis: "OWN-001",
        metadata: { securityChanges },
        timestamp: new Date().toISOString(),
      };
    }

    return {
      policyId: "P-GOV-003",
      verdict: "allow",
      reason: securityChanges.length > 0
        ? "Security changes include test coverage"
        : "No security paths modified",
      threatBasis: "OWN-001",
      timestamp: new Date().toISOString(),
    };
  }

  static getPolicyRules(): PolicyRule[] {
    return [
      {
        policyId: "P-GOV-001",
        description: "Require 2 reviewers for sensitive path changes",
        threatBasis: "OWN-001",
        condition: (ctx) => {
          const changed = ctx["changedPaths"] as string[] | undefined;
          if (!changed) return false;
          const hasSensitive = changed.some((p) =>
            OwnershipGovernance.SENSITIVE_PATHS.some((sp) => p.includes(sp)),
          );
          return hasSensitive && ((ctx["reviewerCount"] as number) ?? 0) < 2;
        },
        verdictOnMatch: "deny",
        reasonTemplate: "Sensitive paths require 2 reviewers",
      },
      {
        policyId: "P-GOV-003",
        description: "Require tests when modifying security code",
        threatBasis: "OWN-001",
        condition: (ctx) => {
          const changed = ctx["changedPaths"] as string[] | undefined;
          if (!changed) return false;
          const hasSecurityChanges = changed.some(
            (p) => p.includes("security/") || p.includes("auth/"),
          );
          const hasTestChanges = changed.some(
            (p) => p.includes("test") || p.includes("spec"),
          );
          return hasSecurityChanges && !hasTestChanges;
        },
        verdictOnMatch: "deny",
        reasonTemplate: "Security changes require test coverage",
      },
    ];
  }
}

// =============================================================================
// Factory: Build default MCP policy engine
// =============================================================================

export function buildMCPPolicyEngine(
  allowedRoots: string[] = [],
): MCPPolicyEngine {
  const engine = new MCPPolicyEngine();
  engine.registerMany(ExecutionPolicyEngine.getPolicyRules(allowedRoots));
  engine.registerMany(AuditIntegrityGuard.getPolicyRules());
  engine.registerMany(GateSecurityPolicy.getPolicyRules());
  engine.registerMany(ReadScopePolicy.getPolicyRules());
  engine.registerMany(OwnershipGovernance.getPolicyRules());
  return engine;
}

// =============================================================================
// Trigger Definitions
// =============================================================================

export const SECURITY_TRIGGERS: SecurityTrigger[] = [
  {
    event: "on_mcp_tool_call",
    hooks: ["ExecutionPolicyEngine.evaluate", "ReadScopePolicy.checkReadThrottle"],
    description: "Evaluate execution policies and read throttling on every MCP tool call",
  },
  {
    event: "on_audit_write",
    hooks: ["AuditIntegrityGuard.validateEntry"],
    description: "Validate audit entry integrity before persistence",
  },
  {
    event: "on_snapshot_write",
    hooks: ["AuditIntegrityGuard.validateSnapshotDelta"],
    description: "Check snapshot score delta for anomalies",
  },
  {
    event: "on_gate_validate",
    hooks: ["GateSecurityPolicy.validateNonce", "GateSecurityPolicy.failClosedPolicy", "GateSecurityPolicy.validateSecret"],
    description: "Full GATE envelope security validation",
  },
  {
    event: "on_cleanup_execute",
    hooks: ["ExecutionPolicyEngine.requireApproval"],
    description: "Enforce multi-step approval for destructive cleanup",
  },
  {
    event: "on_sensitive_pr",
    hooks: ["OwnershipGovernance.checkSensitivePR", "OwnershipGovernance.checkTestCoverage"],
    description: "Enforce review and test requirements on sensitive code changes",
  },
];
