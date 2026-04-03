/**
 * Precedent-Based Enforcement — Type definitions and fingerprinting.
 *
 * A precedent is an institutional memory of a recurring failure pattern.
 * When the same tool fails for the same reason repeatedly, the system
 * escalates its response: observe → flag → restrict → block.
 *
 * Fingerprinting identifies "same failure, same reason" by hashing
 * stable metadata fields (stripping timestamps, session IDs, durations).
 */

import { createHash } from "node:crypto";
import type { AuditStatus } from "./audit.js";

// ── Escalation ──

/**
 * Escalation levels, ordered by severity.
 * - observed:   1st occurrence — silent, precedent created
 * - flagged:    2nd-3rd — warning emitted in PostToolUse output
 * - restricted: 4th-6th — HOOK WARN, forces acknowledgment
 * - blocked:    7th+ — PreToolUse exits(2) for mutating tools only
 */
export type EscalationLevel = "observed" | "flagged" | "restricted" | "blocked";

const ESCALATION_ORDER: EscalationLevel[] = ["observed", "flagged", "restricted", "blocked"];

export function escalationSeverity(level: EscalationLevel): number {
  return ESCALATION_ORDER.indexOf(level);
}

/**
 * Compute escalation level from occurrence count.
 * 1     → observed
 * 2-3   → flagged
 * 4-6   → restricted
 * 7+    → blocked
 */
export function computeEscalationLevel(occurrenceCount: number): EscalationLevel {
  if (occurrenceCount <= 1) return "observed";
  if (occurrenceCount <= 3) return "flagged";
  if (occurrenceCount <= 6) return "restricted";
  return "blocked";
}

// ── Fingerprint ──

export type PrecedentCategory =
  | "tool_failure"
  | "policy_violation"
  | "gate_block"
  | "integrity_error";

export interface PrecedentFingerprint {
  source: string;
  tool: string;
  status: AuditStatus;
  category: PrecedentCategory;
  contextHash: string;
}

/**
 * Fields stripped from metadata before hashing.
 * These are volatile — they change per invocation and don't
 * contribute to "same failure, same reason" identity.
 */
const VOLATILE_KEYS = new Set([
  "timestamp",
  "ts",
  "date",
  "sessionId",
  "session_id",
  "requestId",
  "request_id",
  "durationMs",
  "duration_ms",
  "duration",
  "elapsed",
  "auditId",
  "audit_id",
  "id",
  "_logged_at",
  "traceId",
  "trace_id",
  "correlationId",
  "correlation_id",
]);

function stripVolatile(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (VOLATILE_KEYS.has(k)) continue;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      const nested = stripVolatile(v as Record<string, unknown>);
      if (Object.keys(nested).length > 0) out[k] = nested;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function hashObject(obj: Record<string, unknown>): string {
  const sorted = JSON.stringify(obj, Object.keys(obj).sort());
  return createHash("sha256").update(sorted).digest("hex").slice(0, 16);
}

function deriveCategory(
  status: AuditStatus,
  tool: string,
  metadata?: Record<string, unknown>,
): PrecedentCategory {
  if (status === "blocked") {
    if (tool.includes("admission") || tool.includes("gate") || tool.includes("promotion")) {
      return "gate_block";
    }
    return "policy_violation";
  }
  if (status === "error") return "integrity_error";
  if (metadata && ("policyId" in metadata || "policy_id" in metadata)) {
    return "policy_violation";
  }
  return "tool_failure";
}

export interface FingerprintInput {
  source: string;
  tool: string;
  status: AuditStatus;
  metadata?: Record<string, unknown>;
}

/**
 * Compute a stable fingerprint for an audit event.
 *
 * Two events with the same fingerprint represent "the same tool
 * failing for the same reason." Volatile fields (timestamps, IDs,
 * durations) are stripped before hashing so that repeat occurrences
 * across sessions still match.
 */
export function computeFingerprint(input: FingerprintInput): PrecedentFingerprint {
  const category = deriveCategory(input.status, input.tool, input.metadata);
  const stable = input.metadata ? stripVolatile(input.metadata) : {};
  const contextHash = Object.keys(stable).length > 0 ? hashObject(stable) : "empty";

  return {
    source: input.source,
    tool: input.tool,
    status: input.status,
    category,
    contextHash,
  };
}

/**
 * Serialize a fingerprint to a string key for map lookups.
 */
export function fingerprintKey(fp: PrecedentFingerprint): string {
  return `${fp.source}::${fp.tool}::${fp.status}::${fp.category}::${fp.contextHash}`;
}

// ── Precedent Records ──

export interface PrecedentOccurrence {
  timestamp: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface PrecedentResolution {
  resolvedAt: string;
  resolvedBy: string;
  action: string;
  cooldownUntil: string;
}

export interface PrecedentRecord {
  id: string;
  fingerprint: PrecedentFingerprint;
  fingerprintKey: string;
  firstSeen: string;
  lastSeen: string;
  occurrenceCount: number;
  escalationLevel: EscalationLevel;
  occurrences: PrecedentOccurrence[];
  resolution: PrecedentResolution | null;
  consecutiveSuccesses: number;
}

// ── Enforcement ──

export type EnforcementAction = "log" | "warn" | "restrict" | "block";

export interface RecurrenceCheckResult {
  isRecurrence: boolean;
  precedentId: string | null;
  occurrenceNumber: number;
  previousLevel: EscalationLevel | null;
  currentLevel: EscalationLevel;
  action: EnforcementAction;
  message: string;
}

/**
 * Map escalation level to enforcement action.
 * @param level - The escalation level
 * @param isMutating - Whether the tool is mutating (in the "ask" permission list)
 */
export function levelToAction(level: EscalationLevel, isMutating: boolean): EnforcementAction {
  switch (level) {
    case "observed":
      return "log";
    case "flagged":
      return "warn";
    case "restricted":
      return "restrict";
    case "blocked":
      return isMutating ? "block" : "restrict";
  }
}

// ── Constants ──

/** Max occurrences stored per precedent (ring buffer) */
export const MAX_OCCURRENCES_PER_RECORD = 20;

/** Consecutive successes needed to de-escalate by one level */
export const SUCCESS_DEESCALATION_THRESHOLD = 5;

/** Default cooldown after resolution (7 days in ms) */
export const DEFAULT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/** Time-decay threshold: no occurrences for 14 days → drop one level */
export const DECAY_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000;

/** Archive threshold: no occurrences for 28 days after resolution → prune */
export const ARCHIVE_THRESHOLD_MS = 28 * 24 * 60 * 60 * 1000;

/** Statuses that create or update precedents */
export const PRECEDENT_TRIGGER_STATUSES: Set<AuditStatus> = new Set([
  "failure",
  "blocked",
  "error",
]);
