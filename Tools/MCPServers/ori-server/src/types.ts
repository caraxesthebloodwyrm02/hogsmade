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
