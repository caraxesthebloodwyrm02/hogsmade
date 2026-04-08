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
