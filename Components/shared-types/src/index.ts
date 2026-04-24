export { AuditEventSchema, AuditQuerySchema, AuditStatusSchema } from "./audit.js";
export type { AuditEvent, AuditQuery, AuditStatus } from "./audit.js";

export { HealthCheckResponseSchema } from "./health.js";
export type { HealthCheckResponse } from "./health.js";

export {
  ACTION_CLASS_BADGE_REQUIREMENTS,
  ACTION_CLASS_SCOPE_REQUIREMENTS,
  ActionClass,
  Badge,
  BADGE_THRESHOLDS,
  generateMcpIdentity,
  MERIT_CONSTANTS,
  parseMcpIdentity,
  Scope,
} from "./merit-policy.js";
export type {
  MeritAuditEntry,
  MeritStandingDTO,
  NoiseClassification,
  PermissionCheckResult,
  PermissionSemantic,
} from "./merit-policy.js";

// Hardened MCP guard (recommended)
export { createHardenedMeritGuard, HardenedMcpMeritGuard } from "./mcp-guard-hardened.js";
export type {
  GuardedToolOptions as HardenedGuardedToolOptions,
  HardenedMeritGuardConfig,
} from "./mcp-guard-hardened.js";

// Legacy/Standard MCP guard
export { createMeritGuard, McpMeritGuard } from "./mcp-guard.js";
export type { GuardedToolOptions, MeritGuardConfig } from "./mcp-guard.js";

export { TelemetrySnapshotSchema } from "./telemetry.js";
export type { TelemetrySnapshot } from "./telemetry.js";

export { emitAudit } from "./audit-client.js";

export { generateId } from "./id.js";

export { McpLogger } from "./mcp-logger.js";

export {
  createChildSpan,
  createRootSpan,
  extractTrace,
  formatTraceparent,
  generateSpanId,
  generateTraceId,
  parseTraceparent,
} from "./trace-context.js";
export type { TraceContext } from "./trace-context.js";

export {
  ARCHIVE_THRESHOLD_MS,
  computeEscalationLevel,
  computeFingerprint,
  DECAY_THRESHOLD_MS,
  DEFAULT_COOLDOWN_MS,
  escalationSeverity,
  fingerprintKey,
  levelToAction,
  MAX_OCCURRENCES_PER_RECORD,
  PRECEDENT_TRIGGER_STATUSES,
  SUCCESS_DEESCALATION_THRESHOLD,
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
  buildMCPPolicyEngine,
  ExecutionPolicyEngine,
  GateSecurityPolicy,
  MCPPolicyEngine,
  OwnershipGovernance,
  ReadScopePolicy,
  SECURITY_TRIGGERS,
} from "./security-policy.js";
export type {
  PolicyResult,
  PolicyRule,
  PolicyVerdict,
  SecurityTrigger,
} from "./security-policy.js";

// Runtime protection
export { createRuntimeBoundary, RuntimeErrorBoundary } from "./runtime-guard.js";

// Command Bus
export { CommandEnvelopeSchema, dispatch, NamespaceSchema, subscribe } from "./command-bus.js";
export type { CommandEnvelope, CommandHandler, Namespace, Subscription } from "./command-bus.js";

// Signal model — canonical token weights, zone multipliers, compute functions, barter ledger
export {
  buildBarterRecord,
  classifyStability,
  computeBarterRate,
  computeSignalStrength,
  TOKEN_TYPE_WEIGHTS,
  ZONE_MULTIPLIERS,
  zoneMultiplierForStep,
} from "./signal-model.js";
export type {
  BarterRecord,
  QuantizationZone,
  SignalComputeInput,
  SignalComputeResult,
  StabilityClassification,
  TokenType,
} from "./signal-model.js";

// Monitoring
export {
  createMeritGuardMonitor,
  getGlobalMonitor,
  MeritGuardMonitor,
  resetGlobalMonitor,
} from "./monitoring.js";
export type { Alert, AlertLevel, MonitoringConfig } from "./monitoring.js";

// Circuit Breaker
export {
  CircuitBreakerOpenError,
  CircuitState,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  getAllCircuitBreakerStats,
  getCircuitBreaker,
  GuardCircuitBreaker,
  resetAllCircuitBreakers,
} from "./circuit-breaker.js";
export type { CircuitBreakerConfig, CircuitBreakerStats } from "./circuit-breaker.js";

// Guard Runtime Configuration
export {
  createScopedConfig,
  DEFAULT_RUNTIME_CONFIG,
  loadRuntimeConfig,
  MITIGATION_SCOPES,
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
  createConsoleLogger,
  createCorrelationId,
  createGuardLogger,
  createLogger,
  createSilentLogger,
  GuardLogWriter,
  PrintLevel,
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
