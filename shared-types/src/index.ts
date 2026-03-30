export {
    AuditEventSchema,
    AuditQuerySchema,
    AuditStatusSchema
} from "./audit.js";
export type { AuditEvent, AuditQuery, AuditStatus } from "./audit.js";

export { HealthCheckResponseSchema } from "./health.js";
export type { HealthCheckResponse } from "./health.js";

export {
  ACTION_CLASS_BADGE_REQUIREMENTS,
  ACTION_CLASS_SCOPE_REQUIREMENTS,
  BADGE_THRESHOLDS,
  MERIT_CONSTANTS,
  Badge,
  ActionClass,
  Scope,
  generateMcpIdentity,
  parseMcpIdentity,
} from "./merit-policy.js";
export type {
  MeritStandingDTO,
  PermissionCheckResult,
  MeritAuditEntry,
} from "./merit-policy.js";

export {
  createMeritGuard,
  McpMeritGuard,
} from "./mcp-guard.js";
export type { MeritGuardConfig, GuardedToolOptions } from "./mcp-guard.js";

export { TelemetrySnapshotSchema } from "./telemetry.js";
export type { TelemetrySnapshot } from "./telemetry.js";

export { emitAudit } from "./audit-client.js";

export { generateId } from "./id.js";

export { McpLogger } from "./mcp-logger.js";

export {
    ARCHIVE_THRESHOLD_MS,
    DECAY_THRESHOLD_MS,
    DEFAULT_COOLDOWN_MS,
    MAX_OCCURRENCES_PER_RECORD,
    PRECEDENT_TRIGGER_STATUSES,
    SUCCESS_DEESCALATION_THRESHOLD,
    computeEscalationLevel,
    computeFingerprint,
    escalationSeverity,
    fingerprintKey,
    levelToAction,
} from "./precedent.js";
export type {
    EnforcementAction,
    EscalationLevel,
    FingerprintInput,
    PrecedentCategory,
    PrecedentFingerprint,
    PrecedentOccurrence,
    PrecedentRecord,
    PrecedentResolution,
    RecurrenceCheckResult,
} from "./precedent.js";

export {
    AuditIntegrityGuard, ExecutionPolicyEngine, GateSecurityPolicy, MCPPolicyEngine, OwnershipGovernance, ReadScopePolicy, SECURITY_TRIGGERS, buildMCPPolicyEngine
} from "./security-policy.js";
export type {
    PolicyResult,
    PolicyRule, PolicyVerdict, SecurityTrigger
} from "./security-policy.js";

