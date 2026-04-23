/**
 * Core type definitions for ori-server.
 */

export interface RiskPattern {
  id: string;
  label: string;
  regex: RegExp;
  severity: "critical" | "warning" | "info";
}

export type Severity = "critical" | "warning" | "info" | "unknown";

export interface LogEntry {
  id: string;
  timestamp: string;
  line: string;
  source: string;
  severity: Severity;
  matchedPatterns: string[];
  testFile?: string;
}

export interface ProbeResult {
  id: string;
  timestamp: string;
  totalLines: number;
  riskSignals: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  unknownCount: number;
  topPatterns: Array<{ patternId: string; label: string; count: number }>;
  timeWindow: { start: string; end: string };
  source: string;
}

export interface Recommendation {
  id: string;
  timestamp: string;
  title: string;
  read: string;
  reason: string;
  action: string;
  severity: "critical" | "warning" | "info";
  relatedPatterns: string[];
  reproducibility: string;
}

// ── Registry types (Phase 1b) ──

export interface TestRunner {
  type: "pytest" | "vitest" | "node-test";
  command: string;
  args: string[];
  cwd: string;
  envOverrides?: Record<string, string>;
  timeoutMs?: number;
}

export interface TestRunSummary {
  passed: number;
  failed: number;
  skipped: number;
  errors: number;
  durationMs: number;
  timestamp: string;
}

export interface ProjectEntry {
  id: string;
  name: string;
  location: string;
  runner: TestRunner;
  approxTestFiles: number;
  tags: string[];
  threatModelIds?: string[];
  healthStatus?: "healthy" | "degraded" | "failing" | "unknown";
  lastRunTimestamp?: string;
  lastRunSummary?: TestRunSummary;
}

export interface ProjectRegistry {
  schemaVersion: string;
  updatedAt: string;
  projects: ProjectEntry[];
}

// ── Signal Router types (Phase 3) ──

export type NoteCategory = "observation" | "decision" | "anomaly" | "trend" | "cross-run-context";

/**
 * An action the router executes when a route fires.
 *
 * - probe:     run probe_test_suite on accumulated source
 * - note:      add a notebook entry (templates expand {{count}}, {{patterns}},
 *              {{source}}, {{window}}, {{topLine}})
 * - recommend: generate recommendations from current logs
 * - audit:     emit an echoes audit event
 */
export type RouteAction =
  | { type: "probe"; source?: string }
  | {
      type: "note";
      category: NoteCategory;
      titleTemplate: string;
      bodyTemplate: string;
      tags: string[];
    }
  | { type: "recommend"; save: boolean }
  | { type: "audit"; tool: string; metadata?: Record<string, unknown> };

/**
 * Trigger condition for a signal route.
 */
export interface RouteTrigger {
  /** Risk pattern IDs to watch (empty = any pattern) */
  patternIds: string[];
  /** Optional severity filter */
  severities?: Severity[];
  /** Optional source filter (empty = any source) */
  sources?: string[];
  /** Hit count that fires the route */
  threshold: number;
  /** Sliding time window in minutes */
  windowMinutes: number;
  /** Minimum minutes between firings */
  cooldownMinutes: number;
}

/**
 * Runtime accumulator state for a route (not persisted in config).
 */
export interface RouteState {
  /** Timestamps of matched signals within the current window */
  hits: string[];
  /** ISO timestamp of last route fire, if any */
  lastFiredAt?: string;
  /**
   * Per-source timestamp lists for cross-source correlation routes.
   * Key: source identifier; value: ISO timestamps within the window.
   * Maintained in-memory; cleared on route fire.
   */
  sourcesInWindow?: Map<string, string[]>;
}

/**
 * A signal route: a programmed reaction to pattern accumulation.
 */
export interface SignalRoute {
  id: string;
  name: string;
  enabled: boolean;
  trigger: RouteTrigger;
  actions: RouteAction[];
}

/**
 * Persisted router configuration.
 */
export interface RouterConfig {
  schemaVersion: string;
  updatedAt: string;
  routes: SignalRoute[];
}

/**
 * Summary returned when a route fires.
 */
export interface RouteFiring {
  routeId: string;
  routeName: string;
  firedAt: string;
  matchedCount: number;
  matchedPatterns: string[];
  matchedSources: string[];
  actionsExecuted: string[];
  topLine?: string;
}

// ── Anti-pattern detection types (Protocol level) ──

/**
 * Machine-readable codes for protocol-level anti-patterns.
 *
 * AP_ prefix = anti-pattern; detected across the signal *sequence*,
 * not against individual lines.
 */
export type AntiPatternCode =
  | "AP_RETRY_STORM" // same source, same pattern, ≥3 hits in tight temporal bracket
  | "AP_ONSET_MASK" // warnings immediately preceding a critical from same source
  | "AP_REJECTION_CHAIN" // unhandled_rejection → type_error from same source (null-deref cascade)
  | "AP_SOURCE_OSCILLATION" // alternating critical/warning between exactly 2 sources
  | "AP_PATTERN_CONVERGENCE" // single entry matches ≥4 patterns (panic/crash message)
  | "AP_TEMPORAL_BURST" // ≥5 entries within 500 ms (loop flood or ingestion spike)
  | "AP_SILENT_REGRESSION"; // source transitions from critical/warning-active to info-only

/**
 * A single protocol-level anti-pattern finding.
 *
 * `window` is the deterministically narrowed slice of LogEntry IDs
 * that produced the finding — the minimum sufficient evidence set.
 */
export interface AntiPatternFinding {
  /** Deterministic machine code */
  code: AntiPatternCode;
  /** Human label */
  label: string;
  /** Severity of the finding itself */
  severity: "critical" | "warning";
  /** Narrowed evidence window — IDs of the LogEntries that triggered this */
  windowIds: string[];
  /** First line from the evidence window */
  topLine: string;
  /** Source(s) involved */
  sources: string[];
  /** Patterns involved */
  patterns: string[];
  /** Precise, imperative action to take */
  action: string;
}

/**
 * Full result of a signal evaluation pass, combining route firings
 * with protocol-level anti-pattern findings.
 */
export interface EvaluationResult {
  routeFirings: RouteFiring[];
  antiPatterns: AntiPatternFinding[];
}

// ── Execution types (Phase 2) ──

export interface TestRunResult {
  id: string;
  projectId: string;
  timestamp: string;
  summary: TestRunSummary;
  rawStdoutPath: string;
  rawStderrPath: string;
  logEntriesCreated: number;
  status: "passed" | "failed" | "error" | "timeout";
  errorMessage?: string;
}
