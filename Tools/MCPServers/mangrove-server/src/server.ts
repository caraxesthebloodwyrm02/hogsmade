/**
 * Mangrove Server — Ecosystem Navigation & Operational Awareness MCP Server
 *
 * The Mangrove is the ecosystem's navigation layer. Like a hiker clearing dried
 * leaves from the path, Mangrove interprets and optimizes the path currently being
 * navigated, applying best practices and ecosystem-level orientation.
 *
 * This server provides:
 * - Ecosystem health awareness via health_check
 * - Path-clearing and orientation signal collection (future)
 * - Best-practice enforcement across the Mangrove ecosystem (future)
 *
 * Intentionally minimal right now — tools will be added as ecosystem navigation
 * patterns emerge. The Mangrove grows with the forest.
 *
 * Built by Prince (Irfan Kabir)
 */

import { emitAudit } from "@cascade/shared-types/audit-client";
import { generateId } from "@cascade/shared-types/id";
import { McpLogger } from "@cascade/shared-types/mcp-logger";
import {
  type TraceContext,
  createRootSpan,
  extractTrace,
} from "@cascade/shared-types/trace-context";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execFile } from "child_process";
import path from "path";
import { pathToFileURL } from "url";
import { promisify } from "util";
import * as z from "zod";
import { getConfig } from "./config.js";

// ── Constants ──

const SERVER_NAME = "mangrove-server";
const VERSION = "1.0.0";
const logger = new McpLogger(SERVER_NAME);
const config = getConfig();
const MANGROVE_WORKSPACE_ROOT = config.mangroveWorkspaceRoot;
const GRUFF_WORKSPACE_PATH = config.gruffWorkspacePath;
const execFileAsync = promisify(execFile);
const targetSchema = z.object({
  targetPath: z.string().optional(),
});

interface GitStatusSummary {
  targetPath: string;
  isGitRepo: boolean;
  branch?: string;
  ahead?: number;
  behind?: number;
  staged: number;
  modified: number;
  untracked: number;
  clean: boolean;
  issues: string[];
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveTargetPath(targetPath?: string): string {
  const resolved = path.resolve(targetPath || MANGROVE_WORKSPACE_ROOT);
  const allowedRoots = [MANGROVE_WORKSPACE_ROOT, GRUFF_WORKSPACE_PATH];
  if (!allowedRoots.some((root) => isInside(root, resolved))) {
    throw new Error(`targetPath must be inside an allowed Mangrove root`);
  }
  return resolved;
}

async function runGit(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
  });
  return stdout.trim();
}

function parseBranchLine(line: string): Pick<GitStatusSummary, "branch" | "ahead" | "behind"> {
  const branch = line
    .replace(/^##\s+/, "")
    .split("...")[0]
    ?.trim();
  const ahead = Number(line.match(/ahead (\d+)/)?.[1] ?? 0);
  const behind = Number(line.match(/behind (\d+)/)?.[1] ?? 0);
  return { branch, ahead, behind };
}

async function inspectGitHygiene(targetPath?: string): Promise<GitStatusSummary> {
  const resolved = resolveTargetPath(targetPath);
  try {
    await runGit(["rev-parse", "--is-inside-work-tree"], resolved);
  } catch {
    return {
      targetPath: resolved,
      isGitRepo: false,
      staged: 0,
      modified: 0,
      untracked: 0,
      clean: false,
      issues: ["not_git_repository"],
    };
  }

  const status = await runGit(["status", "--porcelain=v1", "-b"], resolved);
  const lines = status.split("\n").filter(Boolean);
  const branchInfo = lines[0]?.startsWith("## ") ? parseBranchLine(lines[0]) : {};
  const entries = lines.filter((line) => !line.startsWith("## "));
  const staged = entries.filter((line) => line[0] !== " " && line[0] !== "?").length;
  const modified = entries.filter((line) => line[1] !== " " && line[0] !== "?").length;
  const untracked = entries.filter((line) => line.startsWith("??")).length;
  const issues = [
    ...(staged > 0 ? ["staged_changes"] : []),
    ...(modified > 0 ? ["modified_files"] : []),
    ...(untracked > 0 ? ["untracked_files"] : []),
    ...((branchInfo.behind ?? 0) > 0 ? ["behind_remote"] : []),
  ];

  return {
    targetPath: resolved,
    isGitRepo: true,
    ...branchInfo,
    staged,
    modified,
    untracked,
    clean: issues.length === 0,
    issues,
  };
}

async function inspectLooseObjects(targetPath?: string) {
  const resolved = resolveTargetPath(targetPath);
  await runGit(["rev-parse", "--is-inside-work-tree"], resolved);
  const output = await runGit(["count-objects", "-v"], resolved);
  const counts = Object.fromEntries(
    output.split("\n").map((line) => {
      const [key, value] = line.split(": ");
      return [key, Number(value)];
    }),
  ) as Record<string, number>;

  return {
    targetPath: resolved,
    looseObjects: counts.count ?? 0,
    looseSizeKiB: counts.size ?? 0,
    inPack: counts["in-pack"] ?? 0,
    packs: counts.packs ?? 0,
    prunePackable: counts["prune-packable"] ?? 0,
    garbage: counts.garbage ?? 0,
    issue: (counts.count ?? 0) > 1000 || (counts.garbage ?? 0) > 0,
  };
}

// ── Server Builder ──

export function buildServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: VERSION,
  });
  // Avoid deep generic inference cost from complex schemas.
  const registerTool = server.registerTool.bind(server) as any;

  // Health check — the compass bearing of the Mangrove
  registerTool(
    "health_check",
    { description: "Check mangrove-server health and operational readiness" },
    async (_params: unknown) => {
      const span = createRootSpan();

      const id = generateId("mangrove");
      const timestamp = new Date().toISOString();

      await emitAudit({
        traceId: span.traceId,
        spanId: span.spanId,
        source: SERVER_NAME,
        tool: "health_check",
        status: "success",
        metadata: {
          correlationId: id,
        },
      });

      const payload = {
        status: "ok",
        server: SERVER_NAME,
        version: VERSION,
        mangroveWorkspaceRoot: MANGROVE_WORKSPACE_ROOT,
        gruffWorkspacePath: GRUFF_WORKSPACE_PATH,
        timestamp,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
      };
    },
  );

  registerTool(
    "check_git_hygiene",
    {
      description: "Read-only Git hygiene inspection for an allowed Mangrove ecosystem path",
      inputSchema: targetSchema.shape,
    },
    async (params: z.infer<typeof targetSchema>) => {
      const incomingTrace: TraceContext | null = extractTrace(params as Record<string, unknown>);
      const span = incomingTrace ?? createRootSpan();
      const timestamp = new Date().toISOString();
      const payload = await inspectGitHygiene(params.targetPath);

      await emitAudit({
        traceId: span.traceId,
        spanId: span.spanId,
        source: SERVER_NAME,
        tool: "check_git_hygiene",
        status: "success",
        metadata: {
          correlationId: generateId("mangrove"),
          targetPath: payload.targetPath,
          clean: payload.clean,
        },
      });

      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ ...payload, timestamp }, null, 2) },
        ],
      };
    },
  );

  registerTool(
    "find_loose_objects",
    {
      description: "Read-only Git loose-object inspection for an allowed Mangrove ecosystem path",
      inputSchema: targetSchema.shape,
    },
    async (params: z.infer<typeof targetSchema>) => {
      const incomingTrace: TraceContext | null = extractTrace(params as Record<string, unknown>);
      const span = incomingTrace ?? createRootSpan();
      const timestamp = new Date().toISOString();
      const payload = await inspectLooseObjects(params.targetPath);

      await emitAudit({
        traceId: span.traceId,
        spanId: span.spanId,
        source: SERVER_NAME,
        tool: "find_loose_objects",
        status: "success",
        metadata: {
          correlationId: generateId("mangrove"),
          targetPath: payload.targetPath,
          looseObjects: payload.looseObjects,
        },
      });

      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ ...payload, timestamp }, null, 2) },
        ],
      };
    },
  );

  registerTool(
    "janitor_scan",
    {
      description:
        "Aggregate read-only git hygiene and loose-object scan across Mangrove ecosystem paths. Scans both allowed roots when no targetPath is given.",
      inputSchema: targetSchema.shape,
    },
    async (params: z.infer<typeof targetSchema>) => {
      const incomingTrace: TraceContext | null = extractTrace(params as Record<string, unknown>);
      const span = incomingTrace ?? createRootSpan();
      const timestamp = new Date().toISOString();

      const pathsToScan: string[] = params.targetPath
        ? [resolveTargetPath(params.targetPath)]
        : [MANGROVE_WORKSPACE_ROOT, GRUFF_WORKSPACE_PATH];

      const results = await Promise.all(
        pathsToScan.map(async (p) => {
          const hygiene = await inspectGitHygiene(p);
          let looseObjects: Awaited<ReturnType<typeof inspectLooseObjects>> | null = null;
          if (hygiene.isGitRepo) {
            try {
              looseObjects = await inspectLooseObjects(p);
            } catch {
              // non-blocking if loose object check fails
            }
          }
          const hasIssues = (hygiene.isGitRepo && !hygiene.clean) || looseObjects?.issue === true;
          return { targetPath: p, gitHygiene: hygiene, looseObjects, hasIssues };
        }),
      );

      const totalIssues = results.filter((r) => r.hasIssues).length;
      const payload = { scanTs: timestamp, paths: results, totalIssues, clean: totalIssues === 0 };

      await emitAudit({
        traceId: span.traceId,
        spanId: span.spanId,
        source: SERVER_NAME,
        tool: "janitor_scan",
        status: "success",
        metadata: {
          correlationId: generateId("mangrove"),
          scannedPaths: results.length,
          totalIssues,
        },
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
      };
    },
  );

  // NEXT: path_orient — ecosystem navigation signal collection
  // NEXT: clear_path — best-practice enforcement activation

  return server;
}

// ── Server Lifecycle ──

export async function startServer(): Promise<McpServer> {
  logger.info(
    `v${VERSION} starting — workspace: ${MANGROVE_WORKSPACE_ROOT}, gruff: ${GRUFF_WORKSPACE_PATH}`,
  );
  const server = buildServer();
  await server.connect(new StdioServerTransport());
  return server;
}

// ── Entrypoint ──

const isEntrypoint =
  process.argv[1] != null && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isEntrypoint) {
  async function main() {
    try {
      await startServer();
    } catch (error) {
      logger.error(`failed to start`, { error: String(error) });
      process.exit(1);
    }
  }

  main();
}
