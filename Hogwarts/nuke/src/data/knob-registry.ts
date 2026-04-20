import type { NukeKnob } from "../types/nuke.ts";

/* ── Q-row: Quick Scans (read-only diagnostics) ─────────────────── */

const quickPulse: NukeKnob = {
  id: "quick-pulse",
  key: "q",
  row: "scan",
  label: "Quick Pulse",
  description: "Ecosystem health snapshot — seeds scan + overview checkpoint",
  calls: [
    { server: "seeds-server", tool: "ecosystem_scan", params: { saveSnapshot: false } },
    { server: "overview-server", tool: "checkpoint", params: { depth: "summary" } },
  ],
  status: "idle",
  lastRun: null,
  lastDurationMs: null,
  lastError: null,
};

const workspaceScan: NukeKnob = {
  id: "workspace-scan",
  key: "w",
  row: "scan",
  label: "Workspace Scan",
  description: "node_modules bloat, build artifacts, pycache, log files",
  calls: [{ server: "maintain-server", tool: "scan_workspaces" }],
  status: "idle",
  lastRun: null,
  lastDurationMs: null,
  lastError: null,
};

const enforcement: NukeKnob = {
  id: "enforcement",
  key: "e",
  row: "scan",
  label: "Enforcement",
  description: "Recurrence patterns, escalation levels, precedent status",
  calls: [
    { server: "echoes-server", tool: "enforcement_status" },
    { server: "echoes-server", tool: "query_precedents", params: { limit: 10 } },
  ],
  status: "idle",
  lastRun: null,
  lastDurationMs: null,
  lastError: null,
};

const repoTrends: NukeKnob = {
  id: "repo-trends",
  key: "r",
  row: "scan",
  label: "Repo Trends",
  description: "Compare recent ecosystem snapshots — find degrading repos",
  calls: [{ server: "seeds-server", tool: "ecosystem_trend", params: { limit: 5 } }],
  status: "idle",
  lastRun: null,
  lastDurationMs: null,
  lastError: null,
};

const testGaps: NukeKnob = {
  id: "test-gaps",
  key: "t",
  row: "scan",
  label: "Test Gaps",
  description: "Threats without test coverage, projects under threat without healthy runs",
  calls: [{ server: "ori-server", tool: "get_coverage_gaps" }],
  status: "idle",
  lastRun: null,
  lastDurationMs: null,
  lastError: null,
};

/* ── A-row: Analysis (deeper inspection) ─────────────────────────── */

const auditTrail: NukeKnob = {
  id: "audit-trail",
  key: "a",
  row: "analysis",
  label: "Audit Trail",
  description: "Recent failures in the echoes audit log",
  calls: [
    { server: "echoes-server", tool: "query_audit", params: { status: "failure", limit: 20 } },
  ],
  status: "idle",
  lastRun: null,
  lastDurationMs: null,
  lastError: null,
};

const systemScan: NukeKnob = {
  id: "system-scan",
  key: "s",
  row: "analysis",
  label: "System Scan",
  description: "RAM, disk volumes, top processes by memory, uptime",
  calls: [{ server: "maintain-server", tool: "scan_system", params: { topProcesses: 10 } }],
  status: "idle",
  lastRun: null,
  lastDurationMs: null,
  lastError: null,
};

const fullDiagnostic: NukeKnob = {
  id: "full-diagnostic",
  key: "d",
  row: "analysis",
  label: "Full Diagnostic",
  description: "Unified report: temp + workspace + git + system with health score",
  calls: [{ server: "maintain-server", tool: "full_diagnostic", params: { saveReport: true } }],
  status: "idle",
  lastRun: null,
  lastDurationMs: null,
  lastError: null,
};

const filterSignals: NukeKnob = {
  id: "filter-signals",
  key: "f",
  row: "analysis",
  label: "Filter Signals",
  description: "Surface warning and critical risk signals from test runs",
  calls: [
    {
      server: "ori-server",
      tool: "filter_logs",
      params: { severity: ["critical", "warning"], limit: 50 },
    },
  ],
  status: "idle",
  lastRun: null,
  lastDurationMs: null,
  lastError: null,
};

const gitHealth: NukeKnob = {
  id: "git-health",
  key: "g",
  row: "analysis",
  label: "Git Health",
  description: "Loose objects, stale branches, uncommitted changes, sync status",
  calls: [{ server: "maintain-server", tool: "scan_git_repos" }],
  status: "idle",
  lastRun: null,
  lastDurationMs: null,
  lastError: null,
};

/* ── Z-row: Zap (active remediation) ─────────────────────────────── */

const zapTemp: NukeKnob = {
  id: "zap-temp",
  key: "z",
  row: "zap",
  label: "Zap Temp",
  description: "Dry-run purge of stale temp and cache files",
  calls: [
    {
      server: "maintain-server",
      tool: "cleanup_execute",
      params: { actions: [{ type: "temp_clean" }], dryRun: true },
    },
  ],
  status: "idle",
  lastRun: null,
  lastDurationMs: null,
  lastError: null,
};

const xrayLine: NukeKnob = {
  id: "xray-line",
  key: "x",
  row: "zap",
  label: "X-Ray Line",
  description:
    "Structural audit — detect import mismatches, barrel gaps, specifier drift; then auto-fix",
  calls: [
    { server: "eligibility-server", tool: "check_the_line" },
    { server: "eligibility-server", tool: "hold_the_line" },
  ],
  status: "idle",
  lastRun: null,
  lastDurationMs: null,
  lastError: null,
};

const cleanCaches: NukeKnob = {
  id: "clean-caches",
  key: "c",
  row: "zap",
  label: "Clean Caches",
  description: "Dry-run purge of npm cache, pip cache, and __pycache__",
  calls: [
    {
      server: "maintain-server",
      tool: "cleanup_execute",
      params: {
        actions: [{ type: "npm_cache" }, { type: "pip_cache" }, { type: "pycache" }],
        dryRun: true,
      },
    },
  ],
  status: "idle",
  lastRun: null,
  lastDurationMs: null,
  lastError: null,
};

const validateSuite: NukeKnob = {
  id: "validate-suite",
  key: "v",
  row: "zap",
  label: "Validate Suite",
  description: "Run all registered test suites across projects",
  calls: [{ server: "ori-server", tool: "run_all_tests" }],
  status: "idle",
  lastRun: null,
  lastDurationMs: null,
  lastError: null,
};

const branchReport: NukeKnob = {
  id: "branch-report",
  key: "b",
  row: "zap",
  label: "Branch Report",
  description: "Stale branch inventory across all git repositories",
  calls: [{ server: "maintain-server", tool: "scan_git_repos" }],
  status: "idle",
  lastRun: null,
  lastDurationMs: null,
  lastError: null,
};

const depCheck: NukeKnob = {
  id: "dep-check",
  key: "1",
  row: "analysis",
  label: "Dep Check",
  description:
    "Dependency audit — scan Python (pip-audit) and JS (npm audit) for known vulnerabilities",
  calls: [
    { server: "maintain-server", tool: "scan_workspaces", params: { maxDepth: 2 } },
    { server: "seeds-server", tool: "ecosystem_scan", params: { saveSnapshot: false } },
  ],
  status: "idle",
  lastRun: null,
  lastDurationMs: null,
  lastError: null,
};

/* ── Registry ────────────────────────────────────────────────────── */

export const KNOB_REGISTRY: readonly NukeKnob[] = [
  /* Q-row */
  quickPulse,
  workspaceScan,
  enforcement,
  repoTrends,
  testGaps,
  /* A-row */
  auditTrail,
  systemScan,
  fullDiagnostic,
  filterSignals,
  gitHealth,
  depCheck,
  /* Z-row */
  zapTemp,
  xrayLine,
  cleanCaches,
  validateSuite,
  branchReport,
] as const;

/** Lookup by hotkey for keyboard handler */
export const KNOB_BY_KEY = new Map(KNOB_REGISTRY.map((k) => [k.key, k]));
