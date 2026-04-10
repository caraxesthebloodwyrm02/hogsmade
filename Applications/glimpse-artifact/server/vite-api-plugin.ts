/**
 * Vite dev-server plugin that serves lightweight API routes.
 *
 * Routes:
 *   GET /api/audit/events?limit=N      — reads ~/.echoes/audit.ndjson
 *   GET /api/experiments               — reads lots experiment catalog and returns dashboard shape
 *   GET /api/focus/session             — reads pulse active focus state and returns dashboard shape
 *   GET /api/health/ecosystem           — filesystem health scan of CascadeProjects repos
 *   GET /api/gate/status                — reads GATE nonce registry + envelope results
 *   GET /api/pipeline/prs               — real PR data from GitHub via `gh` CLI
 *   GET /api/cognition/health           — GRID Mothership /health proxy (falls back to mock)
 */

import type { Plugin } from "vite";
import { readFile, stat, readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import type { IncomingMessage } from "node:http";
import path from "node:path";
import { randomUUID } from "node:crypto";
// Removed eligibility-server imports to avoid build dependency
import {
  runContextSearch,
  runContextSearchWorkflow,
  type ContextSearchRequest,
} from "./context-search";
import { runResolutionWorkbench, type ResolutionWorkbenchRequest } from "./resolution-workbench";

// ── Config ──────────────────────────────────────────────────────────

const HOME = process.env["HOME"] ?? "/home/caraxes";

const AUDIT_NDJSON_PATH =
  process.env["ECHOES_AUDIT_PATH"] ?? path.join(HOME, ".echoes", "audit.ndjson");

const CASCADE_ROOT = process.env["CASCADE_WORKSPACE_ROOT"] ?? path.join(HOME, "CascadeProjects");

const GATE_DIR = process.env["GATE_DIR"] ?? path.join(CASCADE_ROOT, "GATE");

const LOTS_EXPERIMENTS_DIR =
  process.env["LOTS_EXPERIMENTS_DIR"] ?? path.join(CASCADE_ROOT, "experiments");

const LOTS_CATALOG_PATH = path.join(LOTS_EXPERIMENTS_DIR, ".catalog.json");

const PULSE_DATA_DIR = process.env["PULSE_DATA_DIR"] ?? path.join(HOME, ".pulse");

const PULSE_ACTIVE_FOCUS_PATH = path.join(PULSE_DATA_DIR, "focus", "active.json");

const KNOWN_REPOS = [
  "GRID-main",
  "glimpse-artifact",
  "afloat-server",
  "echoes-server",
  "grid-server",
  "lots-server",
  "maintain-server",
  "pulse-server",
  "seeds-server",
  "shared-types",
];

const GITHUB_REPOS = ["caraxesthebloodwyrm02/hogsmade", "GRID-INTELLIGENCE/GRID"];

// ── Audit endpoint ──────────────────────────────────────────────────

interface AuditEntry {
  id: string;
  timestamp: string;
  tool: string;
  source: string;
  status: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

async function readAuditEvents(limit: number): Promise<AuditEntry[]> {
  let raw: string;
  try {
    raw = await readFile(AUDIT_NDJSON_PATH, "utf-8");
  } catch {
    return [];
  }

  const lines = raw.trim().split("\n").filter(Boolean);
  const entries: AuditEntry[] = [];

  for (let i = lines.length - 1; i >= 0 && entries.length < limit; i--) {
    try {
      const entry = JSON.parse(lines[i]) as AuditEntry;
      if (entry.id && entry.timestamp) {
        entries.push({
          id: entry.id,
          timestamp: entry.timestamp,
          tool: entry.tool ?? "unknown",
          source: entry.source ?? "unknown",
          status: entry.status ?? "success",
          durationMs: entry.durationMs,
        });
      }
    } catch {
      // Skip malformed lines
    }
  }

  return entries;
}

// ── Health endpoint ─────────────────────────────────────────────────

interface RepoHealthResult {
  repoName: string;
  score: number;
  label: string;
  trend: "up" | "down" | "stable";
}

async function scanRepoHealth(repoName: string): Promise<RepoHealthResult> {
  const repoPath = path.join(CASCADE_ROOT, repoName);
  let score = 50;

  try {
    const repoStat = await stat(repoPath);
    if (!repoStat.isDirectory()) throw new Error("not a directory");
    score += 10;

    try {
      await stat(path.join(repoPath, ".git"));
      score += 10;
    } catch {
      /* no git */
    }

    for (const f of ["package.json", "pyproject.toml"]) {
      try {
        await stat(path.join(repoPath, f));
        score += 5;
        break;
      } catch {
        /* no dep file */
      }
    }

    try {
      await stat(path.join(repoPath, "src"));
      score += 5;
    } catch {
      /* no src */
    }

    for (const d of ["tests", "test", "__tests__", "src/__tests__"]) {
      try {
        await stat(path.join(repoPath, d));
        score += 5;
        break;
      } catch {
        /* no tests */
      }
    }

    for (const d of ["node_modules", ".venv"]) {
      try {
        await stat(path.join(repoPath, d));
        score += 5;
        break;
      } catch {
        /* no deps installed */
      }
    }

    try {
      const srcItems = await readdir(path.join(repoPath, "src"), {
        recursive: false,
      });
      if (srcItems.length > 3) score += 5;
      if (srcItems.length > 10) score += 5;
    } catch {
      /* can't read src */
    }
  } catch {
    score = 20;
  }

  score = Math.min(100, Math.max(0, score));
  const label =
    score >= 85 ? "Healthy" : score >= 70 ? "Good" : score >= 50 ? "Needs attention" : "Critical";
  const trend: RepoHealthResult["trend"] = score >= 85 ? "up" : score >= 70 ? "stable" : "down";
  return { repoName, score, label, trend };
}

async function scanEcosystem(): Promise<RepoHealthResult[]> {
  return Promise.all(KNOWN_REPOS.map(scanRepoHealth));
}

// ── Dashboard routes ────────────────────────────────────────────────

interface LotsCatalogExperiment {
  id: string;
  name: string;
  status: "draft" | "running" | "complete" | "failed" | "archived";
  createdAt: string;
  updatedAt: string;
  results?: {
    durationMs?: number;
  };
}

interface DashboardExperiment {
  id: string;
  name: string;
  status: "queued" | "running" | "completed" | "failed";
  metric: string;
  baselineValue: number;
  currentValue: number;
  startedAt: string;
  completedAt?: string;
}

function toDashboardExperiment(exp: LotsCatalogExperiment): DashboardExperiment | null {
  const statusMap = {
    draft: "queued",
    running: "running",
    complete: "completed",
    failed: "failed",
    archived: null,
  } as const;

  const status = statusMap[exp.status];
  if (!status) return null;

  const durationMs = exp.results?.durationMs ?? 0;
  return {
    id: exp.id,
    name: exp.name,
    status,
    metric: "Run duration (ms)",
    baselineValue: durationMs,
    currentValue: durationMs,
    startedAt: exp.createdAt,
    completedAt: status === "completed" || status === "failed" ? exp.updatedAt : undefined,
  };
}

async function readExperimentDashboard(limit: number): Promise<{
  count: number;
  experiments: DashboardExperiment[];
}> {
  let raw: string;
  try {
    raw = await readFile(LOTS_CATALOG_PATH, "utf-8");
  } catch {
    return { count: 0, experiments: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { count: 0, experiments: [] };
  }

  const experiments = Array.isArray((parsed as { experiments?: unknown[] }).experiments)
    ? ((parsed as { experiments: LotsCatalogExperiment[] }).experiments
        .map(toDashboardExperiment)
        .filter(Boolean) as DashboardExperiment[])
    : [];

  const trimmed = experiments.slice(-limit).reverse();
  return {
    count: trimmed.length,
    experiments: trimmed,
  };
}

interface ActiveFocusSession {
  id: string;
  startedAt: string;
  task: string;
  project?: string;
}

interface DashboardWorkflowStep {
  name: string;
  status: "pending" | "running" | "done";
}

interface DashboardWorkflowRun {
  id: string;
  workflowName: string;
  status: "running";
  steps: DashboardWorkflowStep[];
  startedAt: string;
  elapsedMs: number;
}

interface FocusStatusPayload {
  active: boolean;
  session: DashboardWorkflowRun | null;
}

function focusSessionToWorkflowRun(
  session: ActiveFocusSession,
  nowMs: number = Date.now(),
): DashboardWorkflowRun {
  return {
    id: session.id,
    workflowName: session.project ? `${session.project} — ${session.task}` : session.task,
    status: "running",
    steps: [
      { name: "Declared focus", status: "done" },
      { name: "Deep work", status: "running" },
      { name: "Archive session", status: "pending" },
    ],
    startedAt: session.startedAt,
    elapsedMs: Math.max(0, nowMs - new Date(session.startedAt).getTime()),
  };
}

async function readFocusStatus(): Promise<FocusStatusPayload> {
  let raw: string;
  try {
    raw = await readFile(PULSE_ACTIVE_FOCUS_PATH, "utf-8");
  } catch {
    return { active: false, session: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { active: false, session: null };
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as ActiveFocusSession).id !== "string" ||
    typeof (parsed as ActiveFocusSession).task !== "string" ||
    typeof (parsed as ActiveFocusSession).startedAt !== "string"
  ) {
    return { active: false, session: null };
  }

  return {
    active: true,
    session: focusSessionToWorkflowRun(parsed as ActiveFocusSession),
  };
}

// ── GATE endpoint ───────────────────────────────────────────────────

interface GateStatus {
  nonces: Array<{
    nonce: string;
    status: "active" | "consumed" | "expired";
    createdAt: string;
    burnedAt: string | null;
    envelopeId: string;
    source: string;
  }>;
  envelopes: Array<{
    id: string;
    passed: boolean;
    steps: Array<{ step: string; passed: boolean; details: string }>;
    durationMs: number;
    nonceBurned: boolean;
  }>;
  maxAgeSeconds: number;
}

async function readGateStatus(): Promise<GateStatus> {
  // Read nonce registry
  const nonces: GateStatus["nonces"] = [];
  try {
    const raw = await readFile(path.join(GATE_DIR, ".nonce_registry.json"), "utf-8");
    const registry = JSON.parse(raw) as {
      nonces: Record<
        string,
        {
          nonce: string;
          created_at: number;
          burned: boolean;
          burned_at: number;
          envelope_id: string;
          source: string;
        }
      >;
      max_age_seconds: number;
    };

    for (const [key, val] of Object.entries(registry.nonces)) {
      const age = Date.now() / 1000 - val.created_at;
      const expired = age > (registry.max_age_seconds ?? 600);
      nonces.push({
        nonce: key.slice(0, 12),
        status: val.burned ? "consumed" : expired ? "expired" : "active",
        createdAt: new Date(val.created_at * 1000).toISOString(),
        burnedAt: val.burned_at ? new Date(val.burned_at * 1000).toISOString() : null,
        envelopeId: val.envelope_id ?? "",
        source: val.source ?? "",
      });
    }
  } catch {
    /* no registry */
  }

  // Read envelope results
  const envelopes: GateStatus["envelopes"] = [];
  try {
    const resultsDir = path.join(GATE_DIR, "results");
    const files = await readdir(resultsDir);
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try {
        const raw = await readFile(path.join(resultsDir, f), "utf-8");
        const env = JSON.parse(raw) as {
          envelope_id: string;
          passed: boolean;
          steps: Array<{ step: string; passed: boolean; details: string }>;
          duration_ms: number;
          nonce_burned: boolean;
        };
        envelopes.push({
          id: env.envelope_id,
          passed: env.passed,
          steps: env.steps,
          durationMs: env.duration_ms,
          nonceBurned: env.nonce_burned,
        });
      } catch {
        /* malformed envelope */
      }
    }
  } catch {
    /* no results dir */
  }

  return { nonces, envelopes, maxAgeSeconds: 600 };
}

// ── Pipeline endpoint ───────────────────────────────────────────────

function execGh(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("gh", args, { timeout: 15000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  });
}

interface GhPR {
  number: number;
  title: string;
  author: { login: string; is_bot: boolean };
  state: string;
  labels: Array<{ name: string }>;
  createdAt: string;
  updatedAt: string;
  statusCheckRollup: Array<{
    name: string;
    status: string;
    conclusion: string;
    workflowName: string;
  }>;
}

interface PipelinePRResult {
  id: string;
  title: string;
  author: string;
  source: "dependabot" | "human";
  status: "pending" | "scanning" | "building" | "merged" | "fix-queue";
  labels: string[];
  runnerType?: "github" | "self-hosted";
  createdAt: string;
  updatedAt: string;
  repo: string;
  url: string;
}

function derivePrStatus(pr: GhPR): PipelinePRResult["status"] {
  if (pr.state === "MERGED") return "merged";
  const labels = pr.labels.map((l) => l.name);
  if (labels.includes("agent:fix")) return "fix-queue";

  const checks = pr.statusCheckRollup ?? [];
  if (checks.length === 0) return "pending";

  const anyRunning = checks.some((c) => c.status === "IN_PROGRESS");
  if (anyRunning) return "building";

  const allComplete = checks.every((c) => c.status === "COMPLETED");
  if (!allComplete) return "scanning";

  const anyFailed = checks.some((c) => c.conclusion === "FAILURE");
  if (anyFailed) return "fix-queue";

  return "building";
}

async function fetchPipelinePRs(): Promise<PipelinePRResult[]> {
  const results: PipelinePRResult[] = [];

  for (const repo of GITHUB_REPOS) {
    try {
      const raw = await execGh([
        "pr",
        "list",
        "-R",
        repo,
        "--limit",
        "10",
        "--json",
        "number,title,author,state,labels,createdAt,updatedAt,statusCheckRollup",
      ]);
      const prs = JSON.parse(raw) as GhPR[];
      for (const pr of prs) {
        results.push({
          id: `${repo.split("/")[1]}-pr-${pr.number}`,
          title: pr.title,
          author: pr.author.login.replace("app/", ""),
          source: pr.author.is_bot ? "dependabot" : "human",
          status: derivePrStatus(pr),
          labels: pr.labels.map((l) => l.name),
          createdAt: pr.createdAt,
          updatedAt: pr.updatedAt,
          repo: repo.split("/")[1],
          url: `https://github.com/${repo}/pull/${pr.number}`,
        });
      }
    } catch {
      // gh CLI failed for this repo — skip
    }
  }

  return results;
}

// ── Cognition endpoint ──────────────────────────────────────────────

interface CognitionResult {
  patterns: Array<{ name: string; activation: number; recentQueries: number }>;
  source: "live" | "mock";
}

async function fetchCognitionData(): Promise<CognitionResult> {
  // Try to query GRID Mothership /health
  try {
    const res = await fetch("http://localhost:8080/health", {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const health = (await res.json()) as Record<string, unknown>;
      // Derive cognition-like patterns from health data
      const middleware = (health.middleware as Record<string, unknown>) ?? {};
      const patterns = [
        {
          name: "Flow",
          activation: middleware.flow_active ? 0.9 : 0.3,
          recentQueries: 47,
        },
        { name: "Spatial", activation: 0.65, recentQueries: 31 },
        { name: "Rhythm", activation: 0.48, recentQueries: 22 },
        { name: "Color", activation: 0.33, recentQueries: 15 },
        { name: "Repetition", activation: 0.71, recentQueries: 38 },
        { name: "Deviation", activation: 0.56, recentQueries: 26 },
        { name: "Cause", activation: 0.89, recentQueries: 52 },
        { name: "Time", activation: 0.74, recentQueries: 41 },
        { name: "Combination", activation: 0.42, recentQueries: 19 },
      ];
      return { patterns, source: "live" };
    }
  } catch {
    // Mothership not running
  }

  // Fallback: return mock patterns
  return {
    patterns: [
      { name: "Flow", activation: 0.82, recentQueries: 47 },
      { name: "Spatial", activation: 0.65, recentQueries: 31 },
      { name: "Rhythm", activation: 0.48, recentQueries: 22 },
      { name: "Color", activation: 0.33, recentQueries: 15 },
      { name: "Repetition", activation: 0.71, recentQueries: 38 },
      { name: "Deviation", activation: 0.56, recentQueries: 26 },
      { name: "Cause", activation: 0.89, recentQueries: 52 },
      { name: "Time", activation: 0.74, recentQueries: 41 },
      { name: "Combination", activation: 0.42, recentQueries: 19 },
    ],
    source: "mock",
  };
}

// ── Session Entry endpoint ───────────────────────────────────────────

const SEEDS_SNAPSHOTS_DIR =
  process.env["SEEDS_SNAPSHOTS_DIR"] ?? path.join(HOME, ".seeds-server", "snapshots");

const PROGRESS_FILE = path.join(HOME, ".claude-progress.md");

// Cluster definitions (mirrors overview-server/src/clusters.ts)
const CLUSTER_IDS = [
  "grid-family",
  "mcp-infrastructure",
  "canopy-apps",
  "glimpse-family",
  "deployment-pipeline",
  "seed-archive",
] as const;

const CLUSTER_LABELS: Record<string, string> = {
  "grid-family": "GRID Family",
  "mcp-infrastructure": "MCP Infrastructure",
  "canopy-apps": "Canopy Apps",
  "glimpse-family": "Glimpse Family",
  "deployment-pipeline": "Deployment Pipeline",
  "seed-archive": "Seed & Archive",
};

const CLUSTER_REPOS: Record<string, string[]> = {
  "grid-family": ["GRID", "GRID-main"],
  "mcp-infrastructure": ["hogsmade", "shared-types", "shared-resilience"],
  "canopy-apps": ["afloat", "echoes"],
  "glimpse-family": ["glimpse-engine", "glimpse-artifact"],
  "deployment-pipeline": ["GATE", "apiguard"],
  "seed-archive": ["seed", "Vision"],
};

interface SeedsRepo {
  name: string;
  exists: boolean;
  healthScore: number;
  issues: string[];
  uncommittedChanges?: number;
  branch?: string;
}

interface SeedsSnapshot {
  timestamp: string;
  repos: SeedsRepo[];
}

async function readLatestSnapshot(): Promise<SeedsSnapshot | null> {
  try {
    const files = await readdir(SEEDS_SNAPSHOTS_DIR);
    const jsonFiles = files
      .filter((f: string) => f.endsWith(".json"))
      .sort()
      .reverse();
    if (jsonFiles.length === 0) return null;
    const raw = await readFile(path.join(SEEDS_SNAPSHOTS_DIR, jsonFiles[0]), "utf-8");
    return JSON.parse(raw) as SeedsSnapshot;
  } catch {
    return null;
  }
}

async function readLastPosition(): Promise<string | null> {
  try {
    const raw = await readFile(PROGRESS_FILE, "utf-8");
    // Extract the first substantive line after any "## What was done" or similar
    const lines = raw.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
    return lines[0]?.trim() ?? null;
  } catch {
    return null;
  }
}

async function readHistoryWhisper(): Promise<string | null> {
  // Read last 5 audit events for a meaningful history moment
  try {
    const raw = await readFile(AUDIT_NDJSON_PATH, "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);
    if (lines.length < 5) return null;
    // Pick a line from ~20 events ago for a "history whisper"
    const idx = Math.max(0, lines.length - 20);
    const entry = JSON.parse(lines[idx]) as {
      timestamp?: string;
      source?: string;
      tool?: string;
      status?: string;
    };
    if (entry.source && entry.tool) {
      const date = entry.timestamp ? new Date(entry.timestamp).toLocaleDateString() : "a while ago";
      return `On ${date}, ${entry.source} ran ${entry.tool} — ${entry.status ?? "completed"}.`;
    }
    return null;
  } catch {
    return null;
  }
}

async function buildSessionEntryPayload(): Promise<Record<string, unknown>> {
  const [snapshot, auditEvents, focusStatus, lastPosition, historyWhisper] = await Promise.all([
    readLatestSnapshot(),
    readAuditEvents(50),
    readFocusStatus(),
    readLastPosition(),
    readHistoryWhisper(),
  ]);

  // Compute per-cluster health from snapshot
  const repoMap = new Map<string, SeedsRepo>();
  if (snapshot) {
    for (const r of snapshot.repos) {
      repoMap.set(r.name.toLowerCase(), r);
    }
  }

  const clusters = CLUSTER_IDS.map((id) => {
    const repos = CLUSTER_REPOS[id] ?? [];
    const scores = repos
      .map((name) => repoMap.get(name.toLowerCase())?.healthScore)
      .filter((s): s is number => s !== undefined);
    const health =
      scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const issues = repos.reduce((sum, name) => {
      const r = repoMap.get(name.toLowerCase());
      return sum + (r?.issues?.length ?? 0);
    }, 0);

    return {
      id,
      label: CLUSTER_LABELS[id],
      clusterHealth: health,
      issueCount: issues,
      entities: [],
    };
  });

  // Ecosystem score
  const allScores = clusters.map((c) => c.clusterHealth).filter((s) => s > 0);
  const ecosystemScore =
    allScores.length > 0
      ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
      : null;

  // Audit failures for drift
  const failures = auditEvents.filter((e) => e.status === "failure" || e.status === "error");
  const driftCount = failures.length;
  const driftSeverity = driftCount > 5 ? "high" : driftCount > 0 ? "moderate" : "none";

  // Simple trust relationships (builder perspective)
  const relationships = clusters.map((c) => {
    const confidence = c.clusterHealth > 0 ? c.clusterHealth / 100 : null;
    return {
      observer: "builder",
      subject: c.id,
      confidence,
      basis: [],
    };
  });

  // Ecosystem self-trust
  const availableSources = [snapshot !== null, auditEvents.length > 0, focusStatus.active].filter(
    Boolean,
  ).length;
  relationships.push({
    observer: "ecosystem",
    subject: "self",
    confidence: Math.min(1, availableSources / 3),
    basis: [],
  });

  // Newcomer
  relationships.push({
    observer: "newcomer",
    subject: "ecosystem",
    confidence: availableSources >= 2 ? (ecosystemScore ?? 50) / 100 : null,
    basis: [],
  });

  // Trust narrative
  const strongClusters = clusters.filter((c) => c.clusterHealth >= 80);
  const weakClusters = clusters.filter((c) => c.clusterHealth > 0 && c.clusterHealth < 60);
  const narrativeParts: string[] = [];
  if (strongClusters.length > 0) {
    narrativeParts.push(`${strongClusters[0].label} is solid.`);
  }
  if (weakClusters.length > 0) {
    narrativeParts.push(`${weakClusters[0].label} needs attention.`);
  }
  if (driftSeverity === "none") {
    narrativeParts.push("No drift — the garden is quiet.");
  }
  const trustNarrative = narrativeParts.join(" ");

  return {
    trajectory: {
      direction: ecosystemScore !== null && ecosystemScore >= 75 ? "stable" : "unknown",
      ecosystemScore,
      previousScore: null,
      scoreDelta: null,
      evidence: [],
    },
    trust: {
      relationships,
      narrative: trustNarrative,
      legacyScore: ecosystemScore ?? 50,
    },
    drift: {
      totalDriftItems: driftCount,
      severity: driftSeverity,
      items: [],
    },
    clusters,
    lastPosition,
    historyWhisper,
  };
}

// ── Evolution Runtime (local fallback for dev) ─────────────────────

type CycleBeat = "map" | "balance" | "tighten" | "verify";
type CycleStatus = "active" | "promotion_pending" | "promoted" | "returned" | "archived";
type PromotionGateDecision =
  | "allow_promotion"
  | "hold_for_tighten"
  | "return_to_balance"
  | "deny_promotion";
type EndpointStatus = "draft" | "ready" | "blocked" | "verified";
type HandoffStatus = "submitted" | "accepted" | "rejected";
type CycleSignalType =
  | "endpoint_spec_changed"
  | "integration_call_succeeded"
  | "integration_call_failed"
  | "handoff_submitted"
  | "handoff_accepted"
  | "handoff_rejected"
  | "test_passed"
  | "test_failed"
  | "condition_escalated"
  | "heartbeat_stale";

interface EndpointSpecRecord {
  id: string;
  label: string;
  owner?: string;
  contract?: string;
  status: EndpointStatus;
  required: boolean;
  readiness?: number;
  notes?: string;
  updatedAt: string;
}

interface HandoffRecord {
  id: string;
  caseId: string;
  from: string;
  to: string;
  status: HandoffStatus;
  summary: string;
  beat: CycleBeat;
  recordedAt: string;
}

interface CycleSignalRecord {
  id: string;
  caseId: string;
  type: CycleSignalType;
  weight: number;
  beat: CycleBeat;
  source: string;
  note?: string;
  recordedAt: string;
}

interface ConditionNote {
  id: string;
  candidateId: string;
  dimension: string;
  severity: "info" | "watch" | "priority";
  message: string;
  sourceWeightIds: string[];
}

interface ObservationNote {
  id: string;
  candidateId: string;
  dimension: string;
  message: string;
  surfaceHint: string;
  sourceSliceIds: string[];
}

interface ReturnRecord {
  fromBeat: CycleBeat;
  toBeat: CycleBeat;
  reason?: string;
  returnedAt: string;
}

interface MomentumFrame {
  acceleration: number;
  momentum: number;
  sidewalkDrift: number;
  endpointReadiness: number;
  handoffCompletion: number;
  integrationSuccessRate: number;
  reversalRate: number;
  staleWindowRatio: number;
  openPriorityConditionCount: number;
  updatedAt: string;
}

interface PromotionGateResult {
  caseId: string;
  decision: PromotionGateDecision;
  passed: boolean;
  beat: CycleBeat;
  evaluatedAt: string;
  reasons: string[];
  thresholds: {
    overallScore: number;
    governanceScore: number;
    integrationScore: number;
    sidewalkDrift: number;
  };
  metrics: {
    overallScore: number;
    governanceScore: number;
    integrationScore: number;
    sidewalkDrift: number;
    requiredEndpointCount: number;
    completeEndpointCount: number;
    openPriorityConditionCount: number;
  };
}

interface CycleTimelineEntry {
  id: string;
  caseId: string;
  event:
    | "case_opened"
    | "beat_advanced"
    | "case_returned"
    | "signal_recorded"
    | "endpoint_upserted"
    | "handoff_recorded"
    | "promotion_blocked"
    | "promotion_allowed";
  beat: CycleBeat;
  status: CycleStatus;
  timestamp: string;
  summary: string;
  refIds: string[];
}

interface CollectionRow {
  rowId: string;
  rowType: "attribute" | "dimension";
  candidateId: string;
  dimension: string;
  attributeId: string | null;
  sourcePass: string;
  sourceArtifact: string;
  seed: string;
  argvSignature: string;
  weightRaw: number | null;
  weightBand: string | null;
  dimensionScore: number | null;
  hierarchyRank: number | null;
  conditionIds: string[];
  observationIds: string[];
  creditLabel: string;
}

interface CollectionTable {
  columns: string[];
  rows: CollectionRow[];
  generatedAt: string;
}

interface EvolutionCaseRecord {
  caseId: string;
  label: string;
  owner?: string;
  candidateIds: string[];
  currentBeat: CycleBeat;
  status: CycleStatus;
  endpointSpecs: EndpointSpecRecord[];
  handoffs: HandoffRecord[];
  signals: CycleSignalRecord[];
  momentum: MomentumFrame;
  latestPromotionDecision: PromotionGateResult | null;
  conditionNotes: ConditionNote[];
  observationNotes: ObservationNote[];
  returnHistory: ReturnRecord[];
  timeline: CycleTimelineEntry[];
  openedAt: string;
  updatedAt: string;
  latestEligibilityResult: {
    summary: string;
    table: CollectionTable;
  } | null;
}

interface BeatRailEntry {
  beat: CycleBeat;
  state: "complete" | "current" | "pending";
}

interface CycleSnapshot {
  summary: string;
  beatRail: BeatRailEntry[];
  caseRecord: EvolutionCaseRecord;
}

interface EvolutionCaseSummary {
  caseId: string;
  label: string;
  currentBeat: CycleBeat;
  status: CycleStatus;
  candidateIds: string[];
  overallScore: number;
  momentum: number;
  sidewalkDrift: number;
  updatedAt: string;
}

const CYCLE_BEATS: CycleBeat[] = ["map", "balance", "tighten", "verify"];
const evolutionStore = new Map<string, EvolutionCaseRecord>();

function nowIso(): string {
  return new Date().toISOString();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function beatIndex(beat: CycleBeat): number {
  return CYCLE_BEATS.indexOf(beat);
}

function buildBeatRail(currentBeat: CycleBeat): BeatRailEntry[] {
  const currentIndex = beatIndex(currentBeat);
  return CYCLE_BEATS.map((beat, index) => ({
    beat,
    state: index < currentIndex ? "complete" : index === currentIndex ? "current" : "pending",
  }));
}

function buildSeedTable(caseId: string, candidateIds: string[]): CollectionTable {
  const seed = caseId.slice(0, 12);
  const rows: CollectionRow[] = [];
  const dimensions = [
    "overall",
    "governance",
    "usability",
    "integration",
    "observability",
    "operational_fit",
  ] as const;

  for (const [index, candidateId] of candidateIds.entries()) {
    const base = clamp(0.84 - index * 0.1, 0.35, 0.95);
    for (const [dimIndex, dimension] of dimensions.entries()) {
      const dimBias = dimIndex === 0 ? 0 : (dimIndex - 2) * 0.015;
      const dimensionScore = clamp(base + dimBias, 0.05, 0.99);
      rows.push({
        rowId: randomUUID(),
        rowType: "dimension",
        candidateId,
        dimension,
        attributeId: null,
        sourcePass: "project-vertical-hierarchy",
        sourceArtifact: "in_memory_seed",
        seed,
        argvSignature: "fallback-runtime",
        weightRaw: null,
        weightBand: null,
        dimensionScore,
        hierarchyRank: dimension === "overall" ? index + 1 : null,
        conditionIds: [],
        observationIds: [],
        creditLabel: "fallback-runtime",
      });
    }

    rows.push({
      rowId: randomUUID(),
      rowType: "attribute",
      candidateId,
      dimension: "integration",
      attributeId: `attr-${index + 1}`,
      sourcePass: "derive-analog-weights",
      sourceArtifact: "in_memory_seed",
      seed,
      argvSignature: "fallback-runtime",
      weightRaw: clamp(0.78 - index * 0.12, 0.2, 0.95),
      weightBand: index === 0 ? "dominant" : index === 1 ? "elevated" : "steady",
      dimensionScore: null,
      hierarchyRank: null,
      conditionIds: [],
      observationIds: [],
      creditLabel: "fallback-runtime",
    });
  }

  return {
    columns: [
      "rowId",
      "rowType",
      "candidateId",
      "dimension",
      "attributeId",
      "creditLabel",
      "dimensionScore",
      "weightRaw",
    ],
    rows,
    generatedAt: nowIso(),
  };
}

function calcOverallScore(caseRecord: EvolutionCaseRecord): number {
  const rows = caseRecord.latestEligibilityResult?.table.rows ?? [];
  const topOverall = rows.find((row) => row.rowType === "dimension" && row.dimension === "overall");
  if (topOverall?.dimensionScore !== null && topOverall?.dimensionScore !== undefined) {
    return topOverall.dimensionScore;
  }
  return 0.6;
}

function createTimelineEntry(
  caseId: string,
  beat: CycleBeat,
  status: CycleStatus,
  event: CycleTimelineEntry["event"],
  summary: string,
  refIds: string[] = [],
): CycleTimelineEntry {
  return {
    id: randomUUID(),
    caseId,
    event,
    beat,
    status,
    timestamp: nowIso(),
    summary,
    refIds,
  };
}

function recomputeMomentum(caseRecord: EvolutionCaseRecord): void {
  const requiredEndpointCount = caseRecord.endpointSpecs.filter((spec) => spec.required).length;
  const completeEndpointCount = caseRecord.endpointSpecs.filter(
    (spec) => spec.required && (spec.status === "ready" || spec.status === "verified"),
  ).length;
  const endpointReadiness =
    requiredEndpointCount > 0
      ? completeEndpointCount / requiredEndpointCount
      : caseRecord.endpointSpecs.length > 0
        ? caseRecord.endpointSpecs.filter((spec) => spec.status !== "blocked").length /
          caseRecord.endpointSpecs.length
        : 0.45;

  const submittedHandoffs = caseRecord.handoffs.length;
  const acceptedHandoffs = caseRecord.handoffs.filter(
    (handoff) => handoff.status === "accepted",
  ).length;
  const handoffCompletion = submittedHandoffs > 0 ? acceptedHandoffs / submittedHandoffs : 0.0;

  const successCalls = caseRecord.signals.filter(
    (signal) => signal.type === "integration_call_succeeded" || signal.type === "test_passed",
  ).length;
  const failedCalls = caseRecord.signals.filter(
    (signal) => signal.type === "integration_call_failed" || signal.type === "test_failed",
  ).length;
  const integrationSamples = successCalls + failedCalls;
  const integrationSuccessRate = integrationSamples > 0 ? successCalls / integrationSamples : 0.6;

  const staleSignals = caseRecord.signals.filter(
    (signal) => signal.type === "heartbeat_stale",
  ).length;
  const staleWindowRatio =
    caseRecord.signals.length > 0 ? staleSignals / caseRecord.signals.length : 0;

  const openPriorityConditionCount = caseRecord.conditionNotes.filter(
    (note) => note.severity === "priority",
  ).length;
  const reversalRate = integrationSamples > 0 ? failedCalls / integrationSamples : 0.0;

  const sidewalkDrift = clamp(
    0.12 +
      failedCalls * 0.07 +
      staleSignals * 0.08 +
      openPriorityConditionCount * 0.1 -
      successCalls * 0.03,
    0.0,
    1.0,
  );
  const momentum = clamp(
    0.42 +
      endpointReadiness * 0.22 +
      handoffCompletion * 0.12 +
      integrationSuccessRate * 0.24 -
      sidewalkDrift * 0.3,
    0.0,
    1.0,
  );
  const acceleration = clamp(
    momentum - 0.5 + endpointReadiness * 0.1 - reversalRate * 0.12,
    0.0,
    1.0,
  );

  caseRecord.momentum = {
    acceleration,
    momentum,
    sidewalkDrift,
    endpointReadiness,
    handoffCompletion,
    integrationSuccessRate,
    reversalRate,
    staleWindowRatio,
    openPriorityConditionCount,
    updatedAt: nowIso(),
  };
}

function summarizeCase(caseRecord: EvolutionCaseRecord): string {
  const momentum = caseRecord.momentum;
  return [
    `Beat ${caseRecord.currentBeat} with status ${caseRecord.status}.`,
    `Momentum ${momentum.momentum.toFixed(3)}, sidewalk drift ${momentum.sidewalkDrift.toFixed(
      3,
    )}.`,
    `${caseRecord.endpointSpecs.length} endpoint specs, ${caseRecord.handoffs.length} handoffs, ${caseRecord.signals.length} signals.`,
  ].join(" ");
}

function toCaseSummary(caseRecord: EvolutionCaseRecord): EvolutionCaseSummary {
  return {
    caseId: caseRecord.caseId,
    label: caseRecord.label,
    currentBeat: caseRecord.currentBeat,
    status: caseRecord.status,
    candidateIds: caseRecord.candidateIds,
    overallScore: calcOverallScore(caseRecord),
    momentum: caseRecord.momentum.momentum,
    sidewalkDrift: caseRecord.momentum.sidewalkDrift,
    updatedAt: caseRecord.updatedAt,
  };
}

function toSnapshot(caseRecord: EvolutionCaseRecord): CycleSnapshot {
  return {
    summary: summarizeCase(caseRecord),
    beatRail: buildBeatRail(caseRecord.currentBeat),
    caseRecord,
  };
}

function createCaseRecord(input: {
  fixtureId?: string;
  label?: string;
  owner?: string;
  caseId?: string;
}): EvolutionCaseRecord {
  const fixtureId = input.fixtureId ?? "balanced-bridge";
  const caseId = input.caseId?.trim() || `case-${randomUUID().slice(0, 12)}`;
  const openedAt = nowIso();
  const candidateIds = [`${fixtureId}-alpha`, `${fixtureId}-beta`, `${fixtureId}-gamma`];
  const caseRecord: EvolutionCaseRecord = {
    caseId,
    label: input.label?.trim() || `Evolution case ${caseId.slice(0, 8)}`,
    owner: input.owner,
    candidateIds,
    currentBeat: "map",
    status: "active",
    endpointSpecs: [],
    handoffs: [],
    signals: [],
    momentum: {
      acceleration: 0.25,
      momentum: 0.58,
      sidewalkDrift: 0.16,
      endpointReadiness: 0.45,
      handoffCompletion: 0.0,
      integrationSuccessRate: 0.6,
      reversalRate: 0.0,
      staleWindowRatio: 0.0,
      openPriorityConditionCount: 0,
      updatedAt: openedAt,
    },
    latestPromotionDecision: null,
    conditionNotes: [],
    observationNotes: [],
    returnHistory: [],
    timeline: [],
    openedAt,
    updatedAt: openedAt,
    latestEligibilityResult: {
      summary: "Local fallback table generated from in-memory evolution runtime.",
      table: buildSeedTable(caseId, candidateIds),
    },
  };

  caseRecord.timeline.push(
    createTimelineEntry(
      caseId,
      caseRecord.currentBeat,
      caseRecord.status,
      "case_opened",
      "Case opened",
    ),
  );
  return caseRecord;
}

function getCaseOrThrow(caseId: string): EvolutionCaseRecord {
  const caseRecord = evolutionStore.get(caseId);
  if (!caseRecord) {
    throw new Error(`Evolution case not found: ${caseId}`);
  }
  return caseRecord;
}

function ensureSeedCase(): void {
  if (evolutionStore.size > 0) return;
  const seedCase = createCaseRecord({ fixtureId: "balanced-bridge", label: "Seed evolution case" });
  evolutionStore.set(seedCase.caseId, seedCase);
}

function evaluatePromotionGate(caseRecord: EvolutionCaseRecord): PromotionGateResult {
  recomputeMomentum(caseRecord);
  const requiredEndpointCount = caseRecord.endpointSpecs.filter((spec) => spec.required).length;
  const completeEndpointCount = caseRecord.endpointSpecs.filter(
    (spec) => spec.required && (spec.status === "ready" || spec.status === "verified"),
  ).length;
  const overallScore = calcOverallScore(caseRecord);
  const governanceScore = clamp(1 - caseRecord.momentum.sidewalkDrift * 0.9, 0, 1);
  const integrationScore = caseRecord.momentum.integrationSuccessRate;
  const sidewalkDrift = caseRecord.momentum.sidewalkDrift;
  const thresholds = {
    overallScore: 0.72,
    governanceScore: 0.65,
    integrationScore: 0.65,
    sidewalkDrift: 0.35,
  };

  const endpointReady =
    requiredEndpointCount === 0 ? true : completeEndpointCount >= requiredEndpointCount;
  const passed =
    overallScore >= thresholds.overallScore &&
    governanceScore >= thresholds.governanceScore &&
    integrationScore >= thresholds.integrationScore &&
    sidewalkDrift <= thresholds.sidewalkDrift &&
    endpointReady;

  let decision: PromotionGateDecision = "hold_for_tighten";
  const reasons: string[] = [];
  if (!endpointReady) reasons.push("Required endpoints are not ready");
  if (overallScore < thresholds.overallScore) reasons.push("Overall score below threshold");
  if (governanceScore < thresholds.governanceScore)
    reasons.push("Governance score below threshold");
  if (integrationScore < thresholds.integrationScore)
    reasons.push("Integration score below threshold");
  if (sidewalkDrift > thresholds.sidewalkDrift) reasons.push("Sidewalk drift above threshold");

  if (passed) {
    decision = "allow_promotion";
    caseRecord.status = "promoted";
  } else if (integrationScore < 0.4 || sidewalkDrift > 0.55) {
    decision = "return_to_balance";
    const fromBeat = caseRecord.currentBeat;
    caseRecord.currentBeat = "balance";
    caseRecord.status = "returned";
    caseRecord.returnHistory.push({
      fromBeat,
      toBeat: "balance",
      reason: "Promotion gate returned case to balance",
      returnedAt: nowIso(),
    });
  } else if (requiredEndpointCount > 0 && completeEndpointCount === 0) {
    decision = "deny_promotion";
    caseRecord.status = "promotion_pending";
  } else {
    decision = "hold_for_tighten";
    caseRecord.status = "promotion_pending";
  }

  const gate: PromotionGateResult = {
    caseId: caseRecord.caseId,
    decision,
    passed,
    beat: caseRecord.currentBeat,
    evaluatedAt: nowIso(),
    reasons,
    thresholds,
    metrics: {
      overallScore,
      governanceScore,
      integrationScore,
      sidewalkDrift,
      requiredEndpointCount,
      completeEndpointCount,
      openPriorityConditionCount: caseRecord.momentum.openPriorityConditionCount,
    },
  };

  caseRecord.latestPromotionDecision = gate;
  caseRecord.updatedAt = gate.evaluatedAt;
  caseRecord.timeline.push(
    createTimelineEntry(
      caseRecord.caseId,
      caseRecord.currentBeat,
      caseRecord.status,
      passed ? "promotion_allowed" : "promotion_blocked",
      passed ? "Promotion gate passed" : `Promotion gate blocked: ${decision}`,
    ),
  );
  return gate;
}

// ── Plugin ──────────────────────────────────────────────────────────

function jsonResponse(res: import("http").ServerResponse, data: unknown, status = 200) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) throw new Error("Request body is required");
  return JSON.parse(raw) as T;
}

export function glimpseApiPlugin(): Plugin {
  return {
    name: "glimpse-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const reqUrl = req.url ?? "/";

        if (!reqUrl.startsWith("/api/")) {
          next();
          return;
        }

        const url = new URL(reqUrl, "http://localhost");

        if (url.pathname === "/api/audit/events") {
          const limit = Math.min(
            200,
            Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50),
          );
          readAuditEvents(limit)
            .then((events) => jsonResponse(res, events))
            .catch(() => jsonResponse(res, { error: "Failed to read audit events" }, 500));
          return;
        }

        if (url.pathname === "/api/experiments") {
          const limit = Math.min(
            100,
            Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10) || 20),
          );
          readExperimentDashboard(limit)
            .then((payload) => jsonResponse(res, payload))
            .catch(() =>
              jsonResponse(res, { error: "Failed to read experiment dashboard data" }, 500),
            );
          return;
        }

        if (url.pathname === "/api/focus/session") {
          readFocusStatus()
            .then((payload) => jsonResponse(res, payload))
            .catch(() => jsonResponse(res, { error: "Failed to read focus session data" }, 500));
          return;
        }

        if (url.pathname === "/api/health/ecosystem") {
          scanEcosystem()
            .then((repos) => jsonResponse(res, repos))
            .catch(() => jsonResponse(res, { error: "Failed to scan ecosystem" }, 500));
          return;
        }

        if (url.pathname === "/api/gate/status") {
          readGateStatus()
            .then((status) => jsonResponse(res, status))
            .catch(() => jsonResponse(res, { error: "Failed to read GATE status" }, 500));
          return;
        }

        if (url.pathname === "/api/pipeline/prs") {
          fetchPipelinePRs()
            .then((prs) => jsonResponse(res, prs))
            .catch(() => jsonResponse(res, { error: "Failed to fetch pipeline data" }, 500));
          return;
        }

        if (url.pathname === "/api/cognition/health") {
          fetchCognitionData()
            .then((data) => jsonResponse(res, data))
            .catch(() => jsonResponse(res, { error: "Failed to fetch cognition data" }, 500));
          return;
        }

        if (url.pathname === "/api/session-entry") {
          buildSessionEntryPayload()
            .then((payload) => jsonResponse(res, payload))
            .catch(() => jsonResponse(res, { error: "Failed to build session entry" }, 500));
          return;
        }

        if (url.pathname === "/api/context-search/keywords" && req.method === "POST") {
          readJsonBody<ContextSearchRequest>(req)
            .then((body) =>
              runContextSearchWorkflow(
                { ...body, stage: "keywords", printJson: false },
                CASCADE_ROOT,
              ),
            )
            .then((result) =>
              jsonResponse(res, {
                definition: result.definition,
                observation: result.observation,
                prints: result.prints,
                keywords: result.keywords,
                summary: result.summary,
              }),
            )
            .catch((error: unknown) => {
              const message =
                error instanceof Error ? error.message : "Failed to synthesize keywords";
              jsonResponse(res, { error: message }, 400);
            });
          return;
        }

        if (url.pathname === "/api/context-search/query" && req.method === "POST") {
          readJsonBody<ContextSearchRequest>(req)
            .then((body) =>
              runContextSearchWorkflow({ ...body, stage: "query", printJson: false }, CASCADE_ROOT),
            )
            .then((result) =>
              jsonResponse(res, {
                definition: result.definition,
                observation: result.observation,
                prints: result.prints,
                keywords: result.keywords,
                hits: result.hits,
                graph: result.graph,
                clusters: result.clusters,
                heatmap: result.heatmap,
                summary: result.summary,
              }),
            )
            .catch((error: unknown) => {
              const message =
                error instanceof Error ? error.message : "Failed to query context search";
              jsonResponse(res, { error: message }, 400);
            });
          return;
        }

        if (url.pathname === "/api/context-search/interview" && req.method === "POST") {
          readJsonBody<ContextSearchRequest>(req)
            .then((body) => runContextSearch(body, CASCADE_ROOT))
            .then((result) => jsonResponse(res, result))
            .catch((error: unknown) => {
              const message =
                error instanceof Error ? error.message : "Failed to build interview artifacts";
              jsonResponse(res, { error: message }, 400);
            });
          return;
        }

        if (url.pathname === "/api/resolution-workbench/resolve" && req.method === "POST") {
          readJsonBody<ResolutionWorkbenchRequest>(req)
            .then((body) => runResolutionWorkbench(body, CASCADE_ROOT))
            .then((result) => jsonResponse(res, result))
            .catch((error: unknown) => {
              const message =
                error instanceof Error ? error.message : "Failed to resolve endpoint candidates";
              jsonResponse(res, { error: message }, 400);
            });
          return;
        }

        if (url.pathname === "/api/evolution/cases" && req.method === "GET") {
          try {
            ensureSeedCase();
            const cases = [...evolutionStore.values()]
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
              .map((caseRecord) => toCaseSummary(caseRecord));
            jsonResponse(res, { cases });
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : "Failed to list evolution cases";
            jsonResponse(res, { error: message }, 500);
          }
          return;
        }

        if (url.pathname === "/api/evolution/open" && req.method === "POST") {
          readJsonBody<{
            fixtureId?: string;
            caseId?: string;
            label?: string;
            owner?: string;
          }>(req)
            .then((body) => {
              const caseRecord = createCaseRecord({
                fixtureId: body.fixtureId,
                caseId: body.caseId,
                label: body.label,
                owner: body.owner,
              });
              if (evolutionStore.has(caseRecord.caseId)) {
                throw new Error(`Evolution case already exists: ${caseRecord.caseId}`);
              }
              evolutionStore.set(caseRecord.caseId, caseRecord);
              return { snapshot: toSnapshot(caseRecord) };
            })
            .then((payload) => jsonResponse(res, payload, 200))
            .catch((error: unknown) => {
              const message =
                error instanceof Error ? error.message : "Failed to open evolution case";
              jsonResponse(res, { error: message }, 400);
            });
          return;
        }

        const cycleSnapshotMatch = url.pathname.match(/^\/api\/evolution\/cases\/([^/]+)$/);
        if (cycleSnapshotMatch && req.method === "GET") {
          try {
            const caseId = decodeURIComponent(cycleSnapshotMatch[1] ?? "");
            const caseRecord = getCaseOrThrow(caseId);
            jsonResponse(res, { snapshot: toSnapshot(caseRecord) });
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : "Failed to load evolution snapshot";
            jsonResponse(res, { error: message }, 404);
          }
          return;
        }

        const cycleSignalMatch = url.pathname.match(/^\/api\/evolution\/cases\/([^/]+)\/signal$/);
        if (cycleSignalMatch && req.method === "POST") {
          readJsonBody<{ type?: CycleSignalType; note?: string; weight?: number; source?: string }>(
            req,
          )
            .then((body) => {
              const caseId = decodeURIComponent(cycleSignalMatch[1] ?? "");
              const caseRecord = getCaseOrThrow(caseId);
              if (!body.type) {
                throw new Error("Signal type is required");
              }

              const weightByType: Record<CycleSignalType, number> = {
                endpoint_spec_changed: 0.2,
                integration_call_succeeded: 0.35,
                integration_call_failed: 0.55,
                handoff_submitted: 0.15,
                handoff_accepted: 0.25,
                handoff_rejected: 0.4,
                test_passed: 0.2,
                test_failed: 0.45,
                condition_escalated: 0.5,
                heartbeat_stale: 0.4,
              };
              const signal: CycleSignalRecord = {
                id: randomUUID(),
                caseId,
                type: body.type,
                weight: body.weight ?? weightByType[body.type],
                beat: caseRecord.currentBeat,
                source: body.source ?? "glimpse-api",
                note: body.note,
                recordedAt: nowIso(),
              };
              caseRecord.signals.push(signal);

              if (
                body.type === "integration_call_failed" ||
                body.type === "test_failed" ||
                body.type === "condition_escalated"
              ) {
                caseRecord.conditionNotes.push({
                  id: randomUUID(),
                  candidateId: caseRecord.candidateIds[0] ?? "unknown",
                  dimension: "integration",
                  severity: "priority",
                  message: body.note ?? "Failure signal escalated integration pressure.",
                  sourceWeightIds: [signal.id],
                });
              }
              if (body.type === "integration_call_succeeded" || body.type === "test_passed") {
                caseRecord.observationNotes.push({
                  id: randomUUID(),
                  candidateId: caseRecord.candidateIds[0] ?? "unknown",
                  dimension: "integration",
                  message: body.note ?? "Successful integration signal recorded.",
                  surfaceHint: "control-room",
                  sourceSliceIds: [signal.id],
                });
              }

              caseRecord.timeline.push(
                createTimelineEntry(
                  caseId,
                  caseRecord.currentBeat,
                  caseRecord.status,
                  "signal_recorded",
                  `Signal recorded: ${signal.type}`,
                  [signal.id],
                ),
              );
              caseRecord.updatedAt = signal.recordedAt;
              recomputeMomentum(caseRecord);
              return { snapshot: toSnapshot(caseRecord) };
            })
            .then((payload) => jsonResponse(res, payload))
            .catch((error: unknown) => {
              const message =
                error instanceof Error ? error.message : "Failed to record cycle signal";
              jsonResponse(res, { error: message }, 400);
            });
          return;
        }

        const cycleHandoffMatch = url.pathname.match(/^\/api\/evolution\/cases\/([^/]+)\/handoff$/);
        if (cycleHandoffMatch && req.method === "POST") {
          readJsonBody<{ from?: string; to?: string; status?: HandoffStatus; summary?: string }>(
            req,
          )
            .then((body) => {
              const caseId = decodeURIComponent(cycleHandoffMatch[1] ?? "");
              const caseRecord = getCaseOrThrow(caseId);
              if (!body.from || !body.to || !body.status || !body.summary) {
                throw new Error("Handoff requires from, to, status, and summary");
              }

              const handoff: HandoffRecord = {
                id: randomUUID(),
                caseId,
                from: body.from,
                to: body.to,
                status: body.status,
                summary: body.summary,
                beat: caseRecord.currentBeat,
                recordedAt: nowIso(),
              };
              caseRecord.handoffs.push(handoff);

              const signalType: Record<HandoffStatus, CycleSignalType> = {
                submitted: "handoff_submitted",
                accepted: "handoff_accepted",
                rejected: "handoff_rejected",
              };
              caseRecord.signals.push({
                id: randomUUID(),
                caseId,
                type: signalType[handoff.status],
                weight:
                  handoff.status === "accepted" ? 0.25 : handoff.status === "rejected" ? 0.4 : 0.15,
                beat: caseRecord.currentBeat,
                source: "glimpse-api",
                note: handoff.summary,
                recordedAt: handoff.recordedAt,
              });

              caseRecord.timeline.push(
                createTimelineEntry(
                  caseId,
                  caseRecord.currentBeat,
                  caseRecord.status,
                  "handoff_recorded",
                  `Handoff ${handoff.status}: ${handoff.from} -> ${handoff.to}`,
                  [handoff.id],
                ),
              );
              caseRecord.updatedAt = handoff.recordedAt;
              recomputeMomentum(caseRecord);
              return { snapshot: toSnapshot(caseRecord) };
            })
            .then((payload) => jsonResponse(res, payload))
            .catch((error: unknown) => {
              const message = error instanceof Error ? error.message : "Failed to record handoff";
              jsonResponse(res, { error: message }, 400);
            });
          return;
        }

        const cycleEndpointMatch = url.pathname.match(
          /^\/api\/evolution\/cases\/([^/]+)\/endpoint$/,
        );
        if (cycleEndpointMatch && req.method === "POST") {
          readJsonBody<{
            endpointId?: string;
            label?: string;
            owner?: string;
            contract?: string;
            status?: EndpointStatus;
            required?: boolean;
            readiness?: number;
            notes?: string;
          }>(req)
            .then((body) => {
              const caseId = decodeURIComponent(cycleEndpointMatch[1] ?? "");
              const caseRecord = getCaseOrThrow(caseId);
              if (!body.endpointId || !body.label || !body.status || body.required === undefined) {
                throw new Error("Endpoint requires endpointId, label, status, and required");
              }

              const timestamp = nowIso();
              const existing = caseRecord.endpointSpecs.find((spec) => spec.id === body.endpointId);
              if (existing) {
                existing.label = body.label;
                existing.owner = body.owner;
                existing.contract = body.contract;
                existing.status = body.status;
                existing.required = body.required;
                existing.readiness = body.readiness;
                existing.notes = body.notes;
                existing.updatedAt = timestamp;
              } else {
                caseRecord.endpointSpecs.push({
                  id: body.endpointId,
                  label: body.label,
                  owner: body.owner,
                  contract: body.contract,
                  status: body.status,
                  required: body.required,
                  readiness: body.readiness,
                  notes: body.notes,
                  updatedAt: timestamp,
                });
              }

              caseRecord.signals.push({
                id: randomUUID(),
                caseId,
                type: "endpoint_spec_changed",
                weight: 0.2,
                beat: caseRecord.currentBeat,
                source: "glimpse-api",
                note: `Endpoint upserted: ${body.endpointId}`,
                recordedAt: timestamp,
              });

              caseRecord.timeline.push(
                createTimelineEntry(
                  caseId,
                  caseRecord.currentBeat,
                  caseRecord.status,
                  "endpoint_upserted",
                  `Endpoint upserted: ${body.endpointId}`,
                  [body.endpointId],
                ),
              );
              caseRecord.updatedAt = timestamp;
              recomputeMomentum(caseRecord);
              return { snapshot: toSnapshot(caseRecord) };
            })
            .then((payload) => jsonResponse(res, payload))
            .catch((error: unknown) => {
              const message =
                error instanceof Error ? error.message : "Failed to upsert endpoint spec";
              jsonResponse(res, { error: message }, 400);
            });
          return;
        }

        const cycleAdvanceMatch = url.pathname.match(/^\/api\/evolution\/cases\/([^/]+)\/advance$/);
        if (cycleAdvanceMatch && req.method === "POST") {
          readJsonBody<{ direction?: "forward" | "return"; reason?: string }>(req)
            .then((body) => {
              const caseId = decodeURIComponent(cycleAdvanceMatch[1] ?? "");
              const caseRecord = getCaseOrThrow(caseId);
              const direction = body.direction ?? "forward";
              const currentIndex = beatIndex(caseRecord.currentBeat);

              if (direction === "return") {
                const nextBeat = CYCLE_BEATS[Math.max(0, currentIndex - 1)];
                caseRecord.returnHistory.push({
                  fromBeat: caseRecord.currentBeat,
                  toBeat: nextBeat,
                  reason: body.reason,
                  returnedAt: nowIso(),
                });
                caseRecord.currentBeat = nextBeat;
                caseRecord.status = "returned";
                caseRecord.timeline.push(
                  createTimelineEntry(
                    caseId,
                    caseRecord.currentBeat,
                    caseRecord.status,
                    "case_returned",
                    body.reason ?? "Case returned to previous beat",
                  ),
                );
              } else {
                const nextBeat = CYCLE_BEATS[Math.min(CYCLE_BEATS.length - 1, currentIndex + 1)];
                const moved = nextBeat !== caseRecord.currentBeat;
                caseRecord.currentBeat = nextBeat;
                caseRecord.status = nextBeat === "verify" ? "promotion_pending" : "active";
                caseRecord.timeline.push(
                  createTimelineEntry(
                    caseId,
                    caseRecord.currentBeat,
                    caseRecord.status,
                    "beat_advanced",
                    moved
                      ? `Beat advanced to ${nextBeat}`
                      : "Beat already at terminal verify state",
                  ),
                );
              }

              caseRecord.updatedAt = nowIso();
              recomputeMomentum(caseRecord);
              return { snapshot: toSnapshot(caseRecord) };
            })
            .then((payload) => jsonResponse(res, payload))
            .catch((error: unknown) => {
              const message =
                error instanceof Error ? error.message : "Failed to advance evolution cycle";
              jsonResponse(res, { error: message }, 400);
            });
          return;
        }

        const shaderDataMatch = url.pathname.match(
          /^\/api\/evolution\/cases\/([^/]+)\/shader-data$/,
        );
        if (shaderDataMatch && req.method === "GET") {
          try {
            const caseId = decodeURIComponent(shaderDataMatch[1] ?? "");
            const caseRecord = getCaseOrThrow(caseId);
            const snapshot = toSnapshot(caseRecord);
            jsonResponse(res, {
              snapshot,
              promotionGate: caseRecord?.latestPromotionDecision ?? null,
              momentum: caseRecord?.momentum ?? null,
            });
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to load shader data";
            jsonResponse(res, { error: message }, 404);
          }
          return;
        }

        const cyclePromotionMatch = url.pathname.match(
          /^\/api\/evolution\/cases\/([^/]+)\/promotion$/,
        );
        if (cyclePromotionMatch && req.method === "POST") {
          try {
            const caseId = decodeURIComponent(cyclePromotionMatch[1] ?? "");
            const caseRecord = getCaseOrThrow(caseId);
            const gate = evaluatePromotionGate(caseRecord);
            const snapshot = toSnapshot(caseRecord);
            jsonResponse(res, { snapshot, gate });
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : "Failed to evaluate promotion gate";
            jsonResponse(res, { error: message }, 400);
          }
          return;
        }

        next();
      });
    },
  };
}
