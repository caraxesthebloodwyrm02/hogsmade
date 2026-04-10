export { AuditEventSchema, AuditQuerySchema, AuditStatusSchema } from "./audit.js";
export type { AuditEvent, AuditQuery, AuditStatus } from "./audit.js";

export { HealthCheckResponseSchema } from "./health.js";
export type { HealthCheckResponse } from "./health.js";

export {
  ACTION_CLASS_BADGE_REQUIREMENTS,
  ACTION_CLASS_SCOPE_REQUIREMENTS,
  ActionClass,
  BADGE_THRESHOLDS,
  Badge,
  MERIT_CONSTANTS,
  Scope,
  generateMcpIdentity,
  parseMcpIdentity,
} from "./merit-policy.js";
export type {
  MeritAuditEntry,
  MeritStandingDTO,
  NoiseClassification,
  PermissionCheckResult,
  PermissionSemantic,
} from "./merit-policy.js";

// Hardened MCP guard (recommended)
export { HardenedMcpMeritGuard, createHardenedMeritGuard } from "./mcp-guard-hardened.js";
export type {
  GuardedToolOptions as HardenedGuardedToolOptions,
  HardenedMeritGuardConfig,
} from "./mcp-guard-hardened.js";

// Legacy/Standard MCP guard
export { McpMeritGuard, createMeritGuard } from "./mcp-guard.js";
export type { GuardedToolOptions, MeritGuardConfig } from "./mcp-guard.js";

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
  AuditIntegrityGuard,
  ExecutionPolicyEngine,
  GateSecurityPolicy,
  MCPPolicyEngine,
  OwnershipGovernance,
  ReadScopePolicy,
  SECURITY_TRIGGERS,
  buildMCPPolicyEngine,
} from "./security-policy.js";
export type {
  PolicyResult,
  PolicyRule,
  PolicyVerdict,
  SecurityTrigger,
} from "./security-policy.js";

// Runtime protection
export { RuntimeErrorBoundary, createRuntimeBoundary } from "./runtime-guard.js";

// Monitoring
export {
  MeritGuardMonitor,
  createMeritGuardMonitor,
  getGlobalMonitor,
  resetGlobalMonitor,
} from "./monitoring.js";
export type { Alert, AlertLevel, MonitoringConfig } from "./monitoring.js";

// Circuit Breaker
export {
  CircuitBreakerOpenError,
  CircuitState,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  GuardCircuitBreaker,
  getAllCircuitBreakerStats,
  getCircuitBreaker,
  resetAllCircuitBreakers,
} from "./circuit-breaker.js";
export type { CircuitBreakerConfig, CircuitBreakerStats } from "./circuit-breaker.js";

// Guard Runtime Configuration
export {
  DEFAULT_RUNTIME_CONFIG,
  MITIGATION_SCOPES,
  createScopedConfig,
  loadRuntimeConfig,
  validateGuardStartup,
  validateRuntimeConfig,
} from "./guard-config.js";
export type {
  GuardFeatures,
  GuardRuntimeConfig,
  MitigationScope,
  PrintTarget,
} from "./guard-config.js";

// Guard Logger
export {
  GuardLogWriter,
  PrintLevel,
  createConsoleLogger,
  createCorrelationId,
  createGuardLogger,
  createLogger,
  createSilentLogger,
  shouldPrint,
} from "./guard-logger.js";
export type { GuardLogger, GuardPrintEvent } from "./guard-logger.js";

// Void Pattern Mitigation Guards (from mcp-guard.ts)
export {
  createGuardConfig,
  guardedAuditEmit,
  guardedFileWrite,
  guardedOperation,
  guardedServerStartup,
} from "./mcp-guard.js";
export type { GuardConfig, OperationResult } from "./mcp-guard.js";
