/**
 * Vite dev-server plugin that serves lightweight API routes.
 *
 * Routes:
 *   GET /api/audit/events?limit=N  — reads ~/.echoes/audit.ndjson, returns JSON array
 *   GET /api/health/ecosystem       — lightweight filesystem health scan of CascadeProjects repos
 */

import type { Plugin } from "vite";
import { readFile, stat, readdir } from "node:fs/promises";
import path from "node:path";

// ── Config ──────────────────────────────────────────────────────────

const HOME = process.env["HOME"] ?? "/home/caraxes";

const AUDIT_NDJSON_PATH =
    process.env["ECHOES_AUDIT_PATH"] ??
    path.join(HOME, ".echoes", "audit.ndjson");

const CASCADE_ROOT =
    process.env["CASCADE_WORKSPACE_ROOT"] ??
    path.join(HOME, "CascadeProjects");

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
        return []; // File doesn't exist or is unreadable
    }

    const lines = raw.trim().split("\n").filter(Boolean);
    const entries: AuditEntry[] = [];

    // Parse from end (newest first) up to limit
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
    let score = 50; // Base score

    try {
        const repoStat = await stat(repoPath);
        if (!repoStat.isDirectory()) throw new Error("not a directory");
        score += 10; // Exists

        // Has git?
        try {
            await stat(path.join(repoPath, ".git"));
            score += 10;
        } catch { /* no git */ }

        // Has package.json or pyproject.toml?
        let hasDeps = false;
        for (const f of ["package.json", "pyproject.toml"]) {
            try {
                await stat(path.join(repoPath, f));
                hasDeps = true;
                score += 5;
                break;
            } catch { /* no dep file */ }
        }

        // Has src/ directory?
        try {
            await stat(path.join(repoPath, "src"));
            score += 5;
        } catch { /* no src */ }

        // Has tests?
        for (const d of ["tests", "test", "__tests__", "src/__tests__"]) {
            try {
                await stat(path.join(repoPath, d));
                score += 5;
                break;
            } catch { /* no tests dir */ }
        }

        // Has node_modules or .venv (deps installed)?
        for (const d of ["node_modules", ".venv"]) {
            try {
                await stat(path.join(repoPath, d));
                score += 5;
                break;
            } catch { /* deps not installed */ }
        }

        // Count files in src as a rough activity indicator
        if (hasDeps) {
            try {
                const srcItems = await readdir(path.join(repoPath, "src"), { recursive: false });
                if (srcItems.length > 3) score += 5;
                if (srcItems.length > 10) score += 5;
            } catch { /* can't read src */ }
        }
    } catch {
        score = 20; // Directory doesn't exist
    }

    score = Math.min(100, Math.max(0, score));

    const label =
        score >= 85 ? "Healthy" :
            score >= 70 ? "Good" :
                score >= 50 ? "Needs attention" :
                    "Critical";

    // Trend: deterministic from score range (no historical data yet)
    const trend: RepoHealthResult["trend"] =
        score >= 85 ? "up" :
            score >= 70 ? "stable" :
                "down";

    return { repoName, score, label, trend };
}

async function scanEcosystem(): Promise<RepoHealthResult[]> {
    return Promise.all(KNOWN_REPOS.map(scanRepoHealth));
}

// ── Plugin ──────────────────────────────────────────────────────────

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
                        .then((events) => {
                            res.setHeader("Content-Type", "application/json");
                            res.end(JSON.stringify(events));
                        })
                        .catch(() => {
                            res.statusCode = 500;
                            res.end(JSON.stringify({ error: "Failed to read audit events" }));
                        });
                    return;
                }

                if (url.pathname === "/api/health/ecosystem") {
                    scanEcosystem()
                        .then((repos) => {
                            res.setHeader("Content-Type", "application/json");
                            res.end(JSON.stringify(repos));
                        })
                        .catch(() => {
                            res.statusCode = 500;
                            res.end(JSON.stringify({ error: "Failed to scan ecosystem" }));
                        });
                    return;
                }

                next();
            });
        },
    };
}
