/**
 * Merit Policy Types — Shared Python/TypeScript contract for Merit-Driven AUTH
 *
 * This module provides the TypeScript types that mirror the Python merit_standing.py
 * implementation, ensuring HTTP/MCP consistency.
 */

/**
 * Merit badge levels based on standing score thresholds.
 */
export enum Badge {
  B0_RESTRICTED = "B0_RESTRICTED",
  B1_TRUSTED = "B1_TRUSTED",
  B2_VERIFIED = "B2_VERIFIED",
  B3_PRIVILEGED = "B3_PRIVILEGED",
}

/**
 * Action classes that map to badge requirements.
 */
export enum ActionClass {
  PUBLIC_BASIC = "public_basic",
  ANALYSIS_READ = "analysis_read",
  ACTION_WRITE = "action_write",
  CONTROL_ADMIN = "control_admin",
}

/**
 * Eligible scopes that can be unlocked through merit standing.
 */
export enum Scope {
  READ = "read",
  WRITE = "write",
  ADMIN = "admin",
  ANALYSIS = "analysis",
  CONTROL = "control",
}

/**
 * Badge thresholds (inclusive minimums)
 */
export const BADGE_THRESHOLDS: Record<Badge, number> = {
  [Badge.B3_PRIVILEGED]: 80,
  [Badge.B2_VERIFIED]: 65,
  [Badge.B1_TRUSTED]: 45,
  [Badge.B0_RESTRICTED]: 0,
};

/**
 * Action class to required badge mapping
 */
export const ACTION_CLASS_BADGE_REQUIREMENTS: Record<ActionClass, Badge> = {
  [ActionClass.PUBLIC_BASIC]: Badge.B0_RESTRICTED,
  [ActionClass.ANALYSIS_READ]: Badge.B1_TRUSTED,
  [ActionClass.ACTION_WRITE]: Badge.B2_VERIFIED,
  [ActionClass.CONTROL_ADMIN]: Badge.B3_PRIVILEGED,
};

/**
 * Action class to required scope mapping
 */
export const ACTION_CLASS_SCOPE_REQUIREMENTS: Record<ActionClass, Scope[]> = {
  [ActionClass.PUBLIC_BASIC]: [],
  [ActionClass.ANALYSIS_READ]: [Scope.READ],
  [ActionClass.ACTION_WRITE]: [Scope.READ, Scope.WRITE],
  [ActionClass.CONTROL_ADMIN]: [Scope.READ, Scope.WRITE, Scope.ADMIN],
};

/**
 * Score calculation constants
 */
export const MERIT_CONSTANTS = {
  DEFAULT_BASE_SCORE: 100,
  CRITICAL_PENALTY_DEDUCTION: 25,
  CLEAN_STREAK_BONUS_PER_20: 1,
  MAX_CLEAN_STREAK_BONUS: 15,
  REVIEW_ADJUSTMENT_MIN: -10,
  REVIEW_ADJUSTMENT_MAX: 10,
  CRITICAL_EVENT_WINDOW_DAYS: 14,
  B3_CLEAN_WINDOW_DAYS: 30,
} as const;

/**
 * Merit standing data transfer object
 */
export interface MeritStandingDTO {
  entity_id: string;
  badge: Badge;
  score: number;
  roll_number: number;
  total_penalty_points: number;
  recent_critical_penalty: number;
  clean_streak: number;
  clean_streak_bonus: number;
  review_adjustment: number;
  last_reviewed_at: string | null;
  eligible_scopes: Scope[];
  first_seen_at: string | null;
  last_seen_at: string | null;
  last_critical_at: string | null;
  violation_count: number;
}

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  allowed: boolean;
  entity_id: string;
  action_class: ActionClass;
  required_badge: Badge;
  actual_badge: Badge;
  has_badge: boolean;
  required_scopes: Scope[];
  eligible_scopes: Scope[];
  has_scopes: boolean;
  required_scope?: Scope;
  has_specific_scope: boolean;
  score: number;
  roll_number: number;
}

/**
 * Merit policy decision for audit logging
 */
export interface MeritAuditEntry {
  timestamp: string;
  entity_id: string;
  action_class: ActionClass;
  required_badge: Badge;
  actual_badge: Badge;
  verdict: "allowed" | "denied";
  penalty_delta: number;
  roll_number: number;
  score: number;
  source: "http" | "mcp";
  session_id?: string;
}

/**
 * MCP session identity format
 * Format: `mcp:{server_name}:{session_id}`
 * Fallback: `mcp:{server_name}:unknown` (deterministic)
 */
export function generateMcpIdentity(serverName: string, sessionId?: string): string {
  const sid = sessionId || "unknown";
  return `mcp:${serverName}:${sid}`;
}

/**
 * Parse an MCP identity string
 */
export function parseMcpIdentity(identity: string): { server: string; sessionId: string } | null {
  const match = identity.match(/^mcp:([^:]+):(.+)$/);
  if (!match) return null;
  return { server: match[1], sessionId: match[2] };
}
