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

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { promisify } from "util";
import * as z from "zod";
import { getConfig } from "./config.js";
import { emitAudit } from "@cascade/shared-types/audit-client";

const execFileAsync = promisify(execFile);

// ── Constants ──

const SERVER_NAME = "lots-server";
const VERSION = "1.0.0";
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

interface Catalog {
  experiments: Experiment[];
  lastUpdated: string;
}

// ── Data Layer ──

async function ensureDir(): Promise<void> {
  await fs.mkdir(EXPERIMENTS_DIR, { recursive: true });
}

async function loadCatalog(): Promise<Catalog> {
  try {
    const content = await fs.readFile(CATALOG_PATH, "utf-8");
    return JSON.parse(content) as Catalog;
  } catch {
    return { experiments: [], lastUpdated: new Date().toISOString() };
  }
}

async function saveCatalog(catalog: Catalog): Promise<void> {
  catalog.lastUpdated = new Date().toISOString();
  await fs.writeFile(CATALOG_PATH, JSON.stringify(catalog, null, 2), "utf-8");
}

function generateId(): string {
  return `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Server ──

export function buildServer(): McpServer {
const server = new McpServer({
  name: SERVER_NAME,
  version: VERSION,
});

// Health check
server.registerTool(
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
server.registerTool(
  "experiment_create",
  {
    description: "Register a new experiment in the catalog",
    inputSchema: z.object({
      name: z.string().min(1).max(100).describe("Experiment name"),
      description: z
        .string()
        .describe("What this experiment tests or explores"),
      script: z
        .string()
        .optional()
        .describe("Script content or file path to execute"),
      language: z
        .enum(["python", "node", "powershell", "bash"])
        .optional()
        .describe("Script language"),
      tags: z
        .array(z.string())
        .optional()
        .default([])
        .describe("Tags for categorization"),
    }),
  },
  async (args: {
    name: string;
    description: string;
    script?: string;
    language?: string;
    tags?: string[];
  }) => {
    await ensureDir();
    const catalog = await loadCatalog();
    const now = new Date().toISOString();
    const exp: Experiment = {
      id: generateId(),
      name: args.name,
      description: args.description,
      status: "draft",
      script: args.script,
      language: args.language,
      tags: args.tags ?? [],
      createdAt: now,
      updatedAt: now,
    };

    // Save script to file if inline content provided
    if (args.script && !args.script.includes(path.sep)) {
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
server.registerTool(
  "experiment_list",
  {
    description: "List experiments with optional filtering by status or tag",
    inputSchema: z.object({
      status: z
        .enum(["draft", "running", "complete", "failed", "archived"])
        .optional()
        .describe("Filter by status"),
      tag: z.string().optional().describe("Filter by tag"),
      limit: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .default(20)
        .describe("Max results"),
    }),
  },
  async (args: { status?: string; tag?: string; limit?: number }) => {
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

// Run experiment
server.registerTool(
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

    // Security: only allow scripts within experiments directory
    const resolvedScript = path.resolve(exp.script);
    if (!resolvedScript.startsWith(path.resolve(EXPERIMENTS_DIR))) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error:
                "Script path outside experiments directory — blocked for security",
            }),
          },
        ],
        isError: true,
      };
    }

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
      const { stdout, stderr } = await execFileAsync(
        command,
        [resolvedScript],
        {
          timeout,
          cwd: EXPERIMENTS_DIR,
          maxBuffer: 1024 * 1024,
        },
      );

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

// Get experiment details
server.registerTool(
  "experiment_get",
  {
    description: "Get full details and results of a specific experiment",
    inputSchema: z.object({
      experimentId: z.string().min(1).describe("Experiment ID"),
    }),
  },
  async (args: { experimentId: string }) => {
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
server.registerTool(
  "experiment_compare",
  {
    description: "Compare results of two experiments side by side",
    inputSchema: z.object({
      experimentA: z.string().min(1).describe("First experiment ID"),
      experimentB: z.string().min(1).describe("Second experiment ID"),
    }),
  },
  async (args: { experimentA: string; experimentB: string }) => {
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
                  a.results && b.results
                    ? `${(((b.results.durationMs - a.results.durationMs) / a.results.durationMs) * 100).toFixed(1)}%`
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

// ── Start ──

return server;
}

export async function startServer(): Promise<McpServer> {
  await ensureDir();
  console.error(
    `[${SERVER_NAME}] v${VERSION} starting — experiments: ${EXPERIMENTS_DIR}`,
  );
  const server = buildServer();
  await server.connect(new StdioServerTransport());
  return server;
}

const isEntrypoint = process.argv[1] != null
  && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isEntrypoint) {
  void startServer().catch((error) => {
    console.error(`[${SERVER_NAME}] failed to start`, error);
    process.exitCode = 1;
  });
}
