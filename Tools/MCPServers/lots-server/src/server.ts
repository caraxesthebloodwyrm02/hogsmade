/**
 * Lots Server — Light of the Seven — Experiment Runner MCP Server
 *
 * Lightweight experiment management:
 * - Register and catalog experiments
 * - Execute scripts with captured output
 * - Compare experiment results
 * - Manage experiment lifecycle (draft → running → complete → archived)
 *
 * Port: 8001 (per GATE/agent_schema.json)
 */

import { emitAudit } from "@cascade/shared-types/audit-client";
import { generateId } from "@cascade/shared-types/id";
import { ExecutionPolicyEngine } from "@cascade/shared-types/security-policy";
import { SessionRateLimiter } from "@cascade/shared-types/session-rate-limit";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { promisify } from "util";
import * as z from "zod";
import { getConfig } from "./config.js";

const execFileAsync = promisify(execFile);

// ── Constants ──

const SERVER_NAME = "lots-server";
const VERSION = "1.0.0";
const readLimiter = new SessionRateLimiter();
const config = getConfig();
const EXPERIMENTS_DIR = config.experimentsDir;
const CATALOG_PATH = path.join(EXPERIMENTS_DIR, ".catalog.json");

// ── Types ──

interface Experiment {
  id: string;
  name: string;
  description: string;
  status: "draft" | "running" | "complete" | "failed" | "archived";
  script?: string;
  language?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  results?: {
    exitCode: number;
    stdout: string;
    stderr: string;
    durationMs: number;
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

interface Catalog {
  experiments: Experiment[];
  lastUpdated: string;
}

// ── Catalog Schema (runtime validation) ──

const CatalogSchema = z.object({
  experiments: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      status: z.enum(["draft", "running", "complete", "failed", "archived"]),
      script: z.string().optional(),
      language: z.string().optional(),
      tags: z.array(z.string()),
      createdAt: z.string(),
      updatedAt: z.string(),
      results: z
        .object({
          exitCode: z.number(),
          stdout: z.string(),
          stderr: z.string(),
          durationMs: z.number(),
        })
        .optional(),
    }),
  ),
  lastUpdated: z.string(),
});

// ── Data Layer ──

async function ensureDir(): Promise<void> {
  await fs.mkdir(EXPERIMENTS_DIR, { recursive: true });
}

async function loadCatalog(): Promise<Catalog> {
  let content: string;
  try {
    content = await fs.readFile(CATALOG_PATH, "utf-8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { experiments: [], lastUpdated: new Date().toISOString() };
    }
    throw new Error(`Catalog unreadable: ${(err as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Catalog contains invalid JSON — manual repair required before mutations");
  }

  const result = CatalogSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Catalog schema invalid: ${result.error.issues
        .map((i: { message: string }) => i.message)
        .join("; ")}`,
    );
  }
  return result.data;
}

/** Atomic write: write to .tmp then rename to prevent corruption. */
async function atomicWriteJson(filepath: string, data: unknown): Promise<void> {
  const tmpPath = filepath + `.tmp.${process.pid}`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmpPath, filepath);
}

const executionPolicy = new ExecutionPolicyEngine([path.resolve(EXPERIMENTS_DIR)]);

async function saveCatalog(catalog: Catalog): Promise<void> {
  catalog.lastUpdated = new Date().toISOString();
  await atomicWriteJson(CATALOG_PATH, catalog);
}

function generateExpId(): string {
  return generateId("exp");
}

function toDashboardStatus(status: Experiment["status"]): DashboardExperiment["status"] | null {
  if (status === "draft") return "queued";
  if (status === "complete") return "completed";
  if (status === "archived") return null;
  return status;
}

function toDashboardExperiment(exp: Experiment): DashboardExperiment | null {
  const status = toDashboardStatus(exp.status);
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

function isInsideDir(candidate: string, root: string): boolean {
  const resolvedCandidate = path.resolve(candidate);
  const resolvedRoot = path.resolve(root);
  return (
    resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(resolvedRoot + path.sep)
  );
}

// ── Server ──

export function buildServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: VERSION,
  });
  // Avoid deep generic instantiation with large Zod schemas.
  const registerTool = server.registerTool.bind(server) as any;

  // Health check
  registerTool(
    "health_check",
    { description: "Check lots-server health and experiment catalog status" },
    async () => {
      await ensureDir();
      const catalog = await loadCatalog();
      const byStatus: Record<string, number> = {};
      for (const exp of catalog.experiments) {
        byStatus[exp.status] = (byStatus[exp.status] || 0) + 1;
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                status: "ok",
                server: SERVER_NAME,
                version: VERSION,
                experimentsDir: EXPERIMENTS_DIR,
                totalExperiments: catalog.experiments.length,
                byStatus,
                lastUpdated: catalog.lastUpdated,
                timestamp: new Date().toISOString(),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // Register experiment
  registerTool(
    "experiment_create",
    {
      description: "Register a new experiment in the catalog",
      inputSchema: z.object({
        name: z.string().min(1).max(100).describe("Experiment name"),
        description: z.string().describe("What this experiment tests or explores"),
        script: z
          .string()
          .optional()
          .describe("Inline script content or file path (see scriptMode)"),
        scriptMode: z
          .enum(["inline", "file"])
          .optional()
          .default("inline")
          .describe(
            "'inline' = script content saved as new file; 'file' = existing path relative to experiments dir",
          ),
        language: z
          .enum(["python", "node", "powershell", "bash"])
          .optional()
          .describe("Script language"),
        tags: z.array(z.string()).optional().default([]).describe("Tags for categorization"),
      }),
    },
    async (args: {
      name: string;
      description: string;
      script?: string;
      scriptMode?: "inline" | "file";
      language?: string;
      tags?: string[];
    }) => {
      await ensureDir();
      const catalog = await loadCatalog();
      const now = new Date().toISOString();
      const exp: Experiment = {
        id: generateExpId(),
        name: args.name,
        description: args.description,
        status: "draft",
        script: args.script,
        language: args.language,
        tags: args.tags ?? [],
        createdAt: now,
        updatedAt: now,
      };

      if (args.script) {
        if (args.scriptMode === "file") {
          const resolved = path.resolve(EXPERIMENTS_DIR, args.script);
          if (!isInsideDir(resolved, EXPERIMENTS_DIR)) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error:
                      "Script file path resolves outside experiments directory — blocked for security",
                  }),
                },
              ],
              isError: true,
            };
          }
          // Security: reject symlinks at creation time (symlink traversal prevention)
          try {
            const scriptStat = await fs.lstat(resolved);
            if (scriptStat.isSymbolicLink()) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify({
                      error:
                        "Script is a symlink — blocked for security (symlink traversal prevention)",
                    }),
                  },
                ],
                isError: true,
              };
            }
          } catch {
            // File doesn't exist yet — will fail at run time
          }
          exp.script = resolved;
        } else {
          const ext =
            args.language === "python"
              ? ".py"
              : args.language === "node"
                ? ".js"
                : args.language === "powershell"
                  ? ".ps1"
                  : ".sh";
          const scriptPath = path.join(EXPERIMENTS_DIR, `${exp.id}${ext}`);
          await fs.writeFile(scriptPath, args.script, "utf-8");
          exp.script = scriptPath;
        }
      }

      catalog.experiments.push(exp);
      await saveCatalog(catalog);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ created: true, experiment: exp }, null, 2),
          },
        ],
      };
    },
  );

  // List experiments
  registerTool(
    "experiment_list",
    {
      description: "List experiments with optional filtering by status or tag",
      inputSchema: z.object({
        status: z
          .enum(["draft", "running", "complete", "failed", "archived"])
          .optional()
          .describe("Filter by status"),
        tag: z.string().optional().describe("Filter by tag"),
        limit: z.number().min(1).max(100).optional().default(20).describe("Max results"),
      }),
    },
    async (args: { status?: string; tag?: string; limit?: number }) => {
      const rlMsg = readLimiter.check("experiment_list");
      if (rlMsg)
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rlMsg }) }],
          isError: true,
        };
      await ensureDir();
      const catalog = await loadCatalog();
      let filtered = catalog.experiments;

      if (args.status) {
        filtered = filtered.filter((e) => e.status === args.status);
      }
      if (args.tag) {
        filtered = filtered.filter((e) => e.tags.includes(args.tag!));
      }

      filtered = filtered.slice(-(args.limit ?? 20)).reverse();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                count: filtered.length,
                total: catalog.experiments.length,
                experiments: filtered.map((e) => ({
                  id: e.id,
                  name: e.name,
                  status: e.status,
                  tags: e.tags,
                  updatedAt: e.updatedAt,
                  hasResults: !!e.results,
                })),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  registerTool(
    "experiment_dashboard_list",
    {
      description: "List experiments in the dashboard-friendly shape used by glimpse-artifact",
      inputSchema: z.object({
        status: z
          .enum(["queued", "running", "completed", "failed"])
          .optional()
          .describe("Optional dashboard status filter"),
        limit: z.number().min(1).max(100).optional().default(20).describe("Max results"),
      }),
    },
    async (args: { status?: DashboardExperiment["status"]; limit?: number }) => {
      const rlMsg = readLimiter.check("experiment_dashboard_list");
      if (rlMsg) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rlMsg }) }],
          isError: true,
        };
      }

      await ensureDir();
      const catalog = await loadCatalog();
      let experiments = catalog.experiments
        .map(toDashboardExperiment)
        .filter(Boolean) as DashboardExperiment[];

      if (args.status) {
        experiments = experiments.filter((exp) => exp.status === args.status);
      }

      experiments = experiments.slice(-(args.limit ?? 20)).reverse();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                count: experiments.length,
                experiments,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // Run experiment
  registerTool(
    "experiment_run",
    {
      description:
        "Execute an experiment script and capture output. Only runs scripts in the experiments directory.",
      inputSchema: z.object({
        experimentId: z.string().min(1).describe("Experiment ID to run"),
        timeoutSeconds: z
          .number()
          .min(1)
          .max(300)
          .optional()
          .default(30)
          .describe("Execution timeout in seconds"),
      }),
    },
    async (args: { experimentId: string; timeoutSeconds?: number }) => {
      if (!config.enableExperimentRun) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error:
                  "Experiment execution is disabled (set LOTS_ENABLE_EXPERIMENT_RUN=true to enable)",
              }),
            },
          ],
          isError: true,
        };
      }

      await ensureDir();
      const catalog = await loadCatalog();
      const exp = catalog.experiments.find((e) => e.id === args.experimentId);

      if (!exp) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `Experiment ${args.experimentId} not found`,
              }),
            },
          ],
          isError: true,
        };
      }
      if (!exp.script) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "No script defined for this experiment",
              }),
            },
          ],
          isError: true,
        };
      }

      // P-MCP-001: Validate script path against allowed roots
      const pathPolicy = executionPolicy.validateScriptPath(exp.script);
      if (pathPolicy.verdict === "deny") {
        console.error(
          `[${SERVER_NAME}] policy denial: ${pathPolicy.policyId} — ${pathPolicy.reason}`,
        );
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Script path blocked by security policy",
              }),
            },
          ],
          isError: true,
        };
      }
      const resolvedScript = path.resolve(exp.script);

      const commandMap: Record<string, string> = {
        python: "python",
        node: "node",
        powershell: "powershell",
        bash: "bash",
      };

      const command = commandMap[exp.language ?? "node"] ?? "node";
      const timeout = (args.timeoutSeconds ?? 30) * 1000;

      exp.status = "running";
      exp.updatedAt = new Date().toISOString();
      await saveCatalog(catalog);

      const start = Date.now();
      try {
        const { stdout, stderr } = await execFileAsync(command, [resolvedScript], {
          timeout,
          cwd: EXPERIMENTS_DIR,
          maxBuffer: 1024 * 1024,
          env: {
            PATH: process.env.PATH ?? "",
            HOME: process.env.HOME,
            USERPROFILE: process.env.USERPROFILE,
            SYSTEMROOT: process.env.SYSTEMROOT,
            TEMP: process.env.TEMP,
            TMP: process.env.TMP,
          },
        });

        exp.status = "complete";
        exp.results = {
          exitCode: 0,
          stdout: stdout.slice(0, 10000),
          stderr: stderr.slice(0, 5000),
          durationMs: Date.now() - start,
        };
      } catch (err: unknown) {
        exp.status = "failed";
        const e = err as {
          code?: number;
          stdout?: string;
          stderr?: string;
          message?: string;
        };
        exp.results = {
          exitCode: e.code ?? 1,
          stdout: (e.stdout ?? "").slice(0, 10000),
          stderr: (e.stderr ?? e.message ?? "Unknown error").slice(0, 5000),
          durationMs: Date.now() - start,
        };
      }

      exp.updatedAt = new Date().toISOString();
      await saveCatalog(catalog);

      try {
        emitAudit({
          source: "lots-server",
          tool: "experiment_run",
          status: exp.status === "complete" ? "success" : "failure",
          durationMs: exp.results?.durationMs,
          metadata: {
            experimentId: exp.id,
            name: exp.name,
            language: exp.language,
            tags: exp.tags,
            relatedRepo: exp.tags.find((tag) => tag.startsWith("repo:"))?.slice(5),
            exitCode: exp.results?.exitCode,
          },
        });
      } catch (auditErr) {
        console.error(`[${SERVER_NAME}] audit write failed for experiment_run:`, auditErr);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ experiment: exp }, null, 2),
          },
        ],
      };
    },
  );

  // NEXT: ExperimentProposal → anticipation synthesis output consumer

  // Get experiment details
  registerTool(
    "experiment_get",
    {
      description: "Get full details and results of a specific experiment",
      inputSchema: z.object({
        experimentId: z.string().min(1).describe("Experiment ID"),
      }),
    },
    async (args: { experimentId: string }) => {
      const rlMsg = readLimiter.check("experiment_get");
      if (rlMsg)
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rlMsg }) }],
          isError: true,
        };
      await ensureDir();
      const catalog = await loadCatalog();
      const exp = catalog.experiments.find((e) => e.id === args.experimentId);

      if (!exp) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `Experiment ${args.experimentId} not found`,
              }),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(exp, null, 2) }],
      };
    },
  );

  // Compare experiments
  registerTool(
    "experiment_compare",
    {
      description: "Compare results of two experiments side by side",
      inputSchema: z.object({
        experimentA: z.string().min(1).describe("First experiment ID"),
        experimentB: z.string().min(1).describe("Second experiment ID"),
      }),
    },
    async (args: { experimentA: string; experimentB: string }) => {
      const rlMsg = readLimiter.check("experiment_compare");
      if (rlMsg)
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rlMsg }) }],
          isError: true,
        };
      await ensureDir();
      const catalog = await loadCatalog();
      const a = catalog.experiments.find((e) => e.id === args.experimentA);
      const b = catalog.experiments.find((e) => e.id === args.experimentB);

      if (!a || !b) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "One or both experiments not found",
              }),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                comparison: {
                  a: {
                    id: a.id,
                    name: a.name,
                    status: a.status,
                    exitCode: a.results?.exitCode,
                    durationMs: a.results?.durationMs,
                  },
                  b: {
                    id: b.id,
                    name: b.name,
                    status: b.status,
                    exitCode: b.results?.exitCode,
                    durationMs: b.results?.durationMs,
                  },
                  speedDiff:
                    a.results && b.results && a.results.durationMs > 0
                      ? `${(
                          ((b.results.durationMs - a.results.durationMs) / a.results.durationMs) *
                          100
                        ).toFixed(1)}%`
                      : "N/A",
                },
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── Pattern Detection (Phase 3.2) ──

  interface PatternSignal {
    type: "repeated_failure" | "low_health_trend" | "workflow_retry_failure";
    confidence: number;
    sourceSignals: string[];
    targetRepo?: string;
    title: string;
    hypothesis: string;
    suggestedScript?: string;
    language?: string;
    tags: string[];
  }

  interface ExperimentProposal {
    title: string;
    description: string;
    hypothesis: string;
    expectedOutcome: string;
    suggestedScript?: string;
    language?: string;
    tags: string[];
    sourceSignals: string[];
    confidence: number;
    status: "draft";
    createdFrom: "pattern-detection";
    targetRepo?: string;
  }

  interface TelemetryReadResult {
    data: Array<Record<string, any>>;
    parseErrors: number;
  }

  async function readAuditEntries(limit: number): Promise<TelemetryReadResult> {
    try {
      const raw = await fs.readFile(config.echoesAuditPath, "utf-8");
      let parseErrors = 0;
      const data = raw
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            parseErrors++;
            return null;
          }
        })
        .filter(Boolean)
        .reverse()
        .slice(0, limit);
      return { data, parseErrors };
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return { data: [], parseErrors: 0 };
      }
      return { data: [], parseErrors: 1 };
    }
  }

  async function readLatestSnapshots(limit: number): Promise<TelemetryReadResult> {
    try {
      const files = (await fs.readdir(config.seedsSnapshotsDir))
        .filter((f: string) => f.endsWith(".json"))
        .sort()
        .reverse()
        .slice(0, limit);
      let parseErrors = 0;
      const data: Array<Record<string, any>> = [];
      for (const file of files) {
        try {
          const content = await fs.readFile(path.join(config.seedsSnapshotsDir, file), "utf-8");
          data.push(JSON.parse(content));
        } catch {
          parseErrors++;
        }
      }
      return { data, parseErrors };
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return { data: [], parseErrors: 0 };
      }
      return { data: [], parseErrors: 1 };
    }
  }

  async function readWorkflowHistory(limit: number): Promise<TelemetryReadResult> {
    try {
      const files = (await fs.readdir(config.afloatHistoryDir))
        .filter((f: string) => f.endsWith(".json"))
        .sort()
        .reverse()
        .slice(0, limit);
      let parseErrors = 0;
      const data: Array<Record<string, any>> = [];
      for (const file of files) {
        try {
          const content = await fs.readFile(path.join(config.afloatHistoryDir, file), "utf-8");
          data.push(JSON.parse(content));
        } catch {
          parseErrors++;
        }
      }
      return { data, parseErrors };
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return { data: [], parseErrors: 0 };
      }
      return { data: [], parseErrors: 1 };
    }
  }

  function hoursSince(timestamp?: string): number | null {
    if (!timestamp) return null;
    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) return null;
    return (Date.now() - parsed.getTime()) / (1000 * 60 * 60);
  }

  function detectRepeatedFailures(
    auditEntries: Array<Record<string, any>>,
    windowHours: number,
    minCount: number,
    targetSource?: string,
  ): PatternSignal[] {
    const signals: PatternSignal[] = [];
    const groups = new Map<string, Array<Record<string, any>>>();

    for (const entry of auditEntries) {
      const age = hoursSince(entry.timestamp);
      if (age === null || age > windowHours) continue;
      const status = entry.status;
      if (status !== "failure" && status !== "error" && status !== "blocked") continue;
      if (targetSource && entry.source !== targetSource) continue;

      const key = `${entry.source ?? "unknown"}:${entry.tool ?? "unknown"}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(entry);
    }

    for (const [key, group] of groups) {
      if (group.length < minCount) continue;
      const latest = group[0];
      const meta =
        latest.metadata && typeof latest.metadata === "object"
          ? (latest.metadata as Record<string, unknown>)
          : {};
      const repo = typeof meta.relatedRepo === "string" ? meta.relatedRepo : undefined;

      signals.push({
        type: "repeated_failure",
        confidence: Math.min(0.9, 0.4 + group.length * 0.15),
        sourceSignals: group.map((e) => `${e.source}/${e.tool} @ ${e.timestamp}`).slice(0, 5),
        targetRepo: repo,
        title: `Repeated ${key} failures (${group.length}x in ${windowHours}h)`,
        hypothesis: `The ${key} path has a recurring issue causing ${group.length} failures. An experiment could isolate the root cause.`,
        tags: ["auto-detected", "repeated-failure", ...(repo ? [repo] : [])],
        language: "node",
      });
    }

    return signals;
  }

  function detectLowHealthTrend(
    snapshots: Array<Record<string, any>>,
    threshold: number,
    targetRepo?: string,
  ): PatternSignal[] {
    const signals: PatternSignal[] = [];
    if (snapshots.length < 2) return signals;

    const repoScores = new Map<string, number[]>();
    for (const snapshot of snapshots) {
      if (!Array.isArray(snapshot.repos)) continue;
      for (const repo of snapshot.repos) {
        if (typeof repo.name !== "string" || typeof repo.healthScore !== "number") continue;
        if (targetRepo && repo.name !== targetRepo) continue;
        if (!repoScores.has(repo.name)) repoScores.set(repo.name, []);
        repoScores.get(repo.name)!.push(repo.healthScore);
      }
    }

    for (const [name, scores] of repoScores) {
      const belowThreshold = scores.filter((s) => s < threshold).length;
      if (belowThreshold < 2) continue;
      const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

      signals.push({
        type: "low_health_trend",
        confidence: Math.min(0.85, 0.3 + belowThreshold * 0.2),
        sourceSignals: [
          `${name}: avg score ${avgScore}/100 across ${scores.length} snapshots`,
          `Below ${threshold} in ${belowThreshold}/${scores.length} snapshots`,
        ],
        targetRepo: name,
        title: `Persistent low health: ${name} (avg ${avgScore}/100)`,
        hypothesis: `${name} has been below ${threshold}/100 in ${belowThreshold} of the last ${scores.length} snapshots. An experiment could test a targeted fix.`,
        tags: ["auto-detected", "low-health-trend", name],
        language: "node",
      });
    }

    return signals;
  }

  function detectWorkflowRetryFailures(
    executions: Array<Record<string, any>>,
    minRetries: number,
  ): PatternSignal[] {
    const signals: PatternSignal[] = [];
    const groups = new Map<string, Array<Record<string, any>>>();

    for (const exec of executions) {
      const id = exec.workflowId ?? exec.executionId;
      if (!id || !exec.status || exec.status === "completed") continue;
      const wfKey = exec.workflowId ?? "unknown";
      if (!groups.has(wfKey)) groups.set(wfKey, []);
      groups.get(wfKey)!.push(exec);
    }

    for (const [wfId, group] of groups) {
      if (group.length < minRetries) continue;
      signals.push({
        type: "workflow_retry_failure",
        confidence: Math.min(0.85, 0.35 + group.length * 0.15),
        sourceSignals: group
          .map((e) => `${wfId} status=${e.status} @ ${e.startedAt ?? "unknown"}`)
          .slice(0, 5),
        title: `Workflow ${wfId} failing repeatedly (${group.length}x)`,
        hypothesis: `Workflow ${wfId} has failed ${group.length} times. An experiment could test the workflow in isolation or with modified parameters.`,
        tags: ["auto-detected", "workflow-retry", wfId],
        language: "node",
      });
    }

    return signals;
  }

  interface TelemetryDegradation {
    auditParseErrors: number;
    snapshotParseErrors: number;
    workflowParseErrors: number;
    isDegraded: boolean;
  }

  async function detectLocalPatterns(
    targetRepo?: string,
    targetSource?: string,
  ): Promise<{ signals: PatternSignal[]; degradation: TelemetryDegradation }> {
    const [audit, snapshots, workflows] = await Promise.all([
      readAuditEntries(200),
      readLatestSnapshots(5),
      readWorkflowHistory(30),
    ]);

    const degradation: TelemetryDegradation = {
      auditParseErrors: audit.parseErrors,
      snapshotParseErrors: snapshots.parseErrors,
      workflowParseErrors: workflows.parseErrors,
      isDegraded: audit.parseErrors > 0 || snapshots.parseErrors > 0 || workflows.parseErrors > 0,
    };

    const signals: PatternSignal[] = [
      ...detectRepeatedFailures(audit.data, 72, 2, targetSource),
      ...detectLowHealthTrend(snapshots.data, 70, targetRepo),
      ...detectWorkflowRetryFailures(workflows.data, 2),
    ];

    signals.sort((a, b) => b.confidence - a.confidence);
    return { signals, degradation };
  }

  function proposalFromPattern(signal: PatternSignal): ExperimentProposal {
    return {
      title: signal.title,
      description: signal.hypothesis,
      hypothesis: signal.hypothesis,
      expectedOutcome: `Identify or confirm root cause of: ${signal.title}`,
      suggestedScript: signal.suggestedScript,
      language: signal.language,
      tags: signal.tags,
      sourceSignals: signal.sourceSignals,
      confidence: signal.confidence,
      status: "draft",
      createdFrom: "pattern-detection",
      targetRepo: signal.targetRepo,
    };
  }

  // Experiment suggest tool
  registerTool(
    "experiment_suggest",
    {
      description:
        "Generate experiment proposals from detected patterns in audit failures, repo health trends, and workflow retries. " +
        "Returns ranked proposals. Set saveAsDraft: true to persist as draft experiments.",
      inputSchema: z.object({
        repo: z.string().optional().describe("Narrow suggestions to a specific repo"),
        source: z
          .string()
          .optional()
          .describe("Narrow to a specific audit source (e.g. 'maintain-server')"),
        saveAsDraft: z
          .boolean()
          .optional()
          .default(false)
          .describe("Persist proposals as draft experiments"),
        maxProposals: z
          .number()
          .min(1)
          .max(10)
          .optional()
          .default(5)
          .describe("Maximum proposals to return"),
      }),
    },
    async (args: {
      repo?: string;
      source?: string;
      saveAsDraft?: boolean;
      maxProposals?: number;
    }) => {
      const rlMsg = readLimiter.check("experiment_suggest");
      if (rlMsg)
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rlMsg }) }],
          isError: true,
        };
      await ensureDir();
      const maxProposals = args.maxProposals ?? 5;
      const { signals, degradation } = await detectLocalPatterns(args.repo, args.source);
      const proposals = signals.slice(0, maxProposals).map(proposalFromPattern);

      let savedDrafts: Array<{ id: string; title: string }> = [];
      if (args.saveAsDraft && proposals.length > 0) {
        const catalog = await loadCatalog();
        for (const proposal of proposals) {
          const now = new Date().toISOString();
          const exp: Experiment = {
            id: generateExpId(),
            name: proposal.title,
            description: `[auto-suggested] ${proposal.description}`,
            status: "draft",
            script: proposal.suggestedScript,
            language: proposal.language,
            tags: [...proposal.tags, "suggested"],
            createdAt: now,
            updatedAt: now,
          };
          catalog.experiments.push(exp);
          savedDrafts.push({ id: exp.id, title: exp.name });
        }
        await saveCatalog(catalog);
      }

      try {
        emitAudit({
          source: "lots-server",
          tool: "experiment_suggest",
          status: proposals.length > 0 ? "success" : "success",
          metadata: {
            proposalCount: proposals.length,
            savedAsDraft: args.saveAsDraft ?? false,
            draftCount: savedDrafts.length,
            targetRepo: args.repo,
            targetSource: args.source,
          },
        });
      } catch (auditErr) {
        console.error(`[${SERVER_NAME}] audit write failed for experiment_suggest:`, auditErr);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                generatedAt: new Date().toISOString(),
                patternsDetected: signals.length,
                proposals,
                ...(savedDrafts.length > 0 ? { savedDrafts } : {}),
                ...(degradation.isDegraded ? { telemetryDegradation: degradation } : {}),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── Start ──

  return server;
}

export async function startServer(): Promise<McpServer> {
  await ensureDir();
  console.error(`[${SERVER_NAME}] v${VERSION} starting — experiments: ${EXPERIMENTS_DIR}`);
  const server = buildServer();
  await server.connect(new StdioServerTransport());
  return server;
}

const isEntrypoint =
  process.argv[1] != null && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isEntrypoint) {
  async function main() {
    try {
      await startServer();
    } catch (error) {
      console.error(`[${SERVER_NAME}] failed to start`, error);
      process.exit(1);
    }
  }

  void main();
}
