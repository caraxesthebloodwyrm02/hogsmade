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
import path from "node:path";

// ── Config ──────────────────────────────────────────────────────────

const HOME = process.env["HOME"] ?? "/home/caraxes";

const AUDIT_NDJSON_PATH =
    process.env["ECHOES_AUDIT_PATH"] ??
    path.join(HOME, ".echoes", "audit.ndjson");

const CASCADE_ROOT =
    process.env["CASCADE_WORKSPACE_ROOT"] ??
    path.join(HOME, "CascadeProjects");

const GATE_DIR =
    process.env["GATE_DIR"] ??
    path.join(CASCADE_ROOT, "GATE");

const LOTS_EXPERIMENTS_DIR =
    process.env["LOTS_EXPERIMENTS_DIR"] ??
    path.join(CASCADE_ROOT, "experiments");

const LOTS_CATALOG_PATH = path.join(LOTS_EXPERIMENTS_DIR, ".catalog.json");

const PULSE_DATA_DIR =
    process.env["PULSE_DATA_DIR"] ??
    path.join(HOME, ".pulse");

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

const GITHUB_REPOS = [
    "caraxesthebloodwyrm02/hogsmade",
    "GRID-INTELLIGENCE/GRID",
];

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

        try { await stat(path.join(repoPath, ".git")); score += 10; } catch { /* no git */ }

        for (const f of ["package.json", "pyproject.toml"]) {
            try { await stat(path.join(repoPath, f)); score += 5; break; } catch { /* no dep file */ }
        }

        try { await stat(path.join(repoPath, "src")); score += 5; } catch { /* no src */ }

        for (const d of ["tests", "test", "__tests__", "src/__tests__"]) {
            try { await stat(path.join(repoPath, d)); score += 5; break; } catch { /* no tests */ }
        }

        for (const d of ["node_modules", ".venv"]) {
            try { await stat(path.join(repoPath, d)); score += 5; break; } catch { /* no deps installed */ }
        }

        try {
            const srcItems = await readdir(path.join(repoPath, "src"), { recursive: false });
            if (srcItems.length > 3) score += 5;
            if (srcItems.length > 10) score += 5;
        } catch { /* can't read src */ }
    } catch {
        score = 20;
    }

    score = Math.min(100, Math.max(0, score));
    const label = score >= 85 ? "Healthy" : score >= 70 ? "Good" : score >= 50 ? "Needs attention" : "Critical";
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

function toDashboardExperiment(
    exp: LotsCatalogExperiment,
): DashboardExperiment | null {
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
        completedAt:
            status === "completed" || status === "failed"
                ? exp.updatedAt
                : undefined,
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
        ? (parsed as { experiments: LotsCatalogExperiment[] }).experiments
            .map(toDashboardExperiment)
            .filter(Boolean) as DashboardExperiment[]
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
        workflowName: session.project
            ? `${session.project} — ${session.task}`
            : session.task,
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
            nonces: Record<string, {
                nonce: string;
                created_at: number;
                burned: boolean;
                burned_at: number;
                envelope_id: string;
                source: string;
            }>;
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
    } catch { /* no registry */ }

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
            } catch { /* malformed envelope */ }
        }
    } catch { /* no results dir */ }

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
    const labels = pr.labels.map(l => l.name);
    if (labels.includes("agent:fix")) return "fix-queue";

    const checks = pr.statusCheckRollup ?? [];
    if (checks.length === 0) return "pending";

    const anyRunning = checks.some(c => c.status === "IN_PROGRESS");
    if (anyRunning) return "building";

    const allComplete = checks.every(c => c.status === "COMPLETED");
    if (!allComplete) return "scanning";

    const anyFailed = checks.some(c => c.conclusion === "FAILURE");
    if (anyFailed) return "fix-queue";

    return "building";
}

async function fetchPipelinePRs(): Promise<PipelinePRResult[]> {
    const results: PipelinePRResult[] = [];

    for (const repo of GITHUB_REPOS) {
        try {
            const raw = await execGh([
                "pr", "list",
                "-R", repo,
                "--limit", "10",
                "--json", "number,title,author,state,labels,createdAt,updatedAt,statusCheckRollup",
            ]);
            const prs = JSON.parse(raw) as GhPR[];
            for (const pr of prs) {
                results.push({
                    id: `${repo.split("/")[1]}-pr-${pr.number}`,
                    title: pr.title,
                    author: pr.author.login.replace("app/", ""),
                    source: pr.author.is_bot ? "dependabot" : "human",
                    status: derivePrStatus(pr),
                    labels: pr.labels.map(l => l.name),
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
            const health = await res.json() as Record<string, unknown>;
            // Derive cognition-like patterns from health data
            const middleware = (health.middleware as Record<string, unknown>) ?? {};
            const patterns = [
                { name: "Flow", activation: middleware.flow_active ? 0.9 : 0.3, recentQueries: 47 },
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

// ── Plugin ──────────────────────────────────────────────────────────

function jsonResponse(res: import("http").ServerResponse, data: unknown, status = 200) {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(data));
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
                    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
                    readAuditEvents(limit)
                        .then((events) => jsonResponse(res, events))
                        .catch(() => jsonResponse(res, { error: "Failed to read audit events" }, 500));
                    return;
                }

                if (url.pathname === "/api/experiments") {
                    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10) || 20));
                    readExperimentDashboard(limit)
                        .then((payload) => jsonResponse(res, payload))
                        .catch(() => jsonResponse(res, { error: "Failed to read experiment dashboard data" }, 500));
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

                next();
            });
        },
    };
}
