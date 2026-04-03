/**
 * Seeds Server — Cross-Repository Health Monitor MCP Server
 *
 * Monitors the Seeds ecosystem (SEEDS_ROOT) providing:
 * - Per-repo health checks (git status, tests, dependencies)
 * - Cross-repo drift detection (stale branches, outdated deps)
 * - Ecosystem-wide summary and scoring
 * - Bookmark system for tracking important repos/files
 * - Activity timeline across all repos
 *
 * Follows the same patterns as echoes-server, grid-server, etc.
 */

import { emitAudit } from "@cascade/shared-types/audit-client";
import { generateId } from "@cascade/shared-types/id";
import { McpLogger } from "@cascade/shared-types/mcp-logger";
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

const SERVER_NAME = "seeds-server";
const VERSION = "1.0.0";
const logger = new McpLogger(SERVER_NAME);
const config = getConfig();
const SEEDS_ROOT = config.seedsRoot;
const SEEDS_ROOTS = config.seedsRoots;
const DATA_DIR = config.dataDir;
const BOOKMARKS_PATH = path.join(DATA_DIR, "bookmarks.json");
const SNAPSHOTS_DIR = path.join(DATA_DIR, "snapshots");

// Known repos in Seeds ecosystem — path overrides SEEDS_ROOT join when present
const KNOWN_REPOS: Record<string, { description: string; stack: string; path?: string }> = {
  GRID: {
    description: "Full-stack AI framework",
    stack: "Python 3.13+, FastAPI, ChromaDB",
    path: "/home/caraxes/roots/GRID",
  },
  afloat: {
    description: "Next.js workflow app",
    stack: "TypeScript, Next.js, Stripe",
    path: "/home/caraxes/CascadeProjects/Tools/MCPServers/afloat-server",
  },
  echoes: {
    description: "Audit & observability platform",
    stack: "Python 3.12+, FastAPI",
    path: "/home/caraxes/CascadeProjects/Tools/MCPServers/echoes-server",
  },
  "glimpse-engine": {
    description: "Cognitive rendering engine",
    stack: "JavaScript",
    path: "/home/caraxes/CascadeProjects/Applications/glimpse-engine",
  },
  apiguard: {
    description: "API security gateway",
    stack: "Python 3.13+",
    path: "/home/caraxes/roots/apiguard",
  },
  Vision: { description: "AI vision project", stack: "Python", path: "/home/caraxes/grove/Vision" },
  hogsmade: {
    description: "MCP server monorepo",
    stack: "TypeScript, Node.js",
    path: "/home/caraxes/CascadeProjects",
  },
};

// Rate limiting for expensive scans
const SCAN_COOLDOWN_MS = 30_000;
const lastScanTimes = new Map<string, number>();
const readLimiter = new SessionRateLimiter();

function checkScanRateLimit(scanType: string): string | null {
  const now = Date.now();
  const last = lastScanTimes.get(scanType);
  if (last && now - last < SCAN_COOLDOWN_MS) {
    const waitSec = Math.ceil((SCAN_COOLDOWN_MS - (now - last)) / 1000);
    return `Rate limited: ${scanType} was run ${Math.round((now - last) / 1000)}s ago. Wait ${waitSec}s.`;
  }
  lastScanTimes.set(scanType, now);
  return null;
}

// Alias repo names to actual directory names under SEEDS_ROOT (e.g. "grid" -> "GRID" for health checks)
const REPO_PATH_ALIASES: Record<string, string> = {
  grid: "GRID",
};

// Skip these discovered directory names in ecosystem_scan (no git or not tracked)
const REPO_SKIP_LIST = new Set([
  "scratch",
  "grid",
  "glimpse-core",
  "scripts",
  "archive",
  "templates",
]);

const PROJECT_MARKERS = [
  ".git",
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "Cargo.toml",
  "go.mod",
  ".python-version",
];

function getRepoCandidates(repoName: string): string[] {
  const resolvedDir = REPO_PATH_ALIASES[repoName] ?? repoName;
  return SEEDS_ROOTS.map((root) => path.join(root, resolvedDir));
}

async function resolveRepoPath(repoName: string): Promise<string> {
  const knownInfo = KNOWN_REPOS[repoName];
  if (knownInfo?.path) {
    return knownInfo.path;
  }

  for (const candidate of getRepoCandidates(repoName)) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return getRepoCandidates(repoName)[0] ?? path.join(SEEDS_ROOT, repoName);
}

async function getDiscoveredRepoNames(): Promise<string[]> {
  const discovered = new Set<string>();

  for (const root of SEEDS_ROOTS) {
    try {
      const entries = await fs.readdir(root, { withFileTypes: true });
      for (const entry of entries as { isDirectory(): boolean; name: string }[]) {
        if (!entry.isDirectory()) continue;
        if (KNOWN_REPOS[entry.name] || entry.name.startsWith(".") || REPO_SKIP_LIST.has(entry.name)) {
          continue;
        }

        const candidatePath = path.join(root, entry.name);
        const markerChecks = await Promise.all(
          PROJECT_MARKERS.map((marker) => fileExists(path.join(candidatePath, marker))),
        );

        if (markerChecks.some(Boolean)) {
          discovered.add(entry.name);
        }
      }
    } catch {
      /* configured root may not exist */
    }
  }

  return [...discovered].sort();
}

// ── Types ──

interface RepoHealth {
  name: string;
  path: string;
  exists: boolean;
  hasGit: boolean;
  branch?: string;
  uncommittedChanges?: number;
  lastCommitAge?: string;
  lastCommitMessage?: string;
  hasDependencyFile: boolean;
  dependencyFile?: string;
  hasTests: boolean;
  healthScore: number;
  issues: string[];
}

interface EcosystemSnapshot {
  timestamp: string;
  repos: RepoHealth[];
  overallScore: number;
  activeCount: number;
  staleCount: number;
  issueCount: number;
}

interface Bookmark {
  id: string;
  repo: string;
  filepath?: string;
  note: string;
  createdAt: string;
  tags: string[];
}

// ── Data Layer ──

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(SNAPSHOTS_DIR, { recursive: true });
}

async function fileExists(filepath: string): Promise<boolean> {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}

async function runGitCommand(repoPath: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd: repoPath,
      timeout: 10000,
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

async function findGitRoot(repoPath: string): Promise<string | null> {
  return runGitCommand(repoPath, ["rev-parse", "--show-toplevel"]);
}

async function checkRepoHealth(repoName: string): Promise<RepoHealth> {
  const knownInfo = KNOWN_REPOS[repoName];
  const repoPath = await resolveRepoPath(repoName);
  const health: RepoHealth = {
    name: repoName,
    path: repoPath,
    exists: false,
    hasGit: false,
    hasDependencyFile: false,
    hasTests: false,
    healthScore: 0,
    issues: [],
  };

  // Check existence
  health.exists = await fileExists(repoPath);
  if (!health.exists) {
    health.issues.push("Repository directory not found");
    return health;
  }

  // Check git
  const gitRoot = await findGitRoot(repoPath);
  health.hasGit = gitRoot !== null;
  if (health.hasGit) {
    health.branch = (await runGitCommand(repoPath, ["branch", "--show-current"])) ?? undefined;

    const statusOutput = await runGitCommand(repoPath, ["status", "--porcelain", "--", "."]);
    if (statusOutput !== null) {
      const lines = statusOutput.split("\n").filter(Boolean);
      health.uncommittedChanges = lines.length;
    }

    const lastCommit = await runGitCommand(repoPath, ["log", "-1", "--format=%cr|||%s", "--", "."]);
    if (lastCommit) {
      const [age, message] = lastCommit.split("|||");
      health.lastCommitAge = age;
      health.lastCommitMessage = message;
    }
  } else {
    health.issues.push("No git repository found");
  }

  // Check dependency files
  const depFiles = ["pyproject.toml", "requirements.txt", "package.json", "Cargo.toml"];
  for (const dep of depFiles) {
    if (await fileExists(path.join(repoPath, dep))) {
      health.hasDependencyFile = true;
      health.dependencyFile = dep;
      break;
    }
  }

  // Check for tests
  const testDirs = ["tests", "test", "__tests__", "src/tests"];
  for (const td of testDirs) {
    if (await fileExists(path.join(repoPath, td))) {
      health.hasTests = true;
      break;
    }
  }

  // Calculate health score (0-100)
  let score = 0;
  if (health.exists) score += 20;
  if (health.hasGit) score += 15;
  if (health.hasDependencyFile) score += 15;
  if (health.hasTests) score += 15;
  if (health.branch) score += 5;
  if (health.uncommittedChanges === 0) score += 10;
  if (health.uncommittedChanges !== undefined && health.uncommittedChanges > 10) {
    health.issues.push(`${health.uncommittedChanges} uncommitted changes — consider committing`);
  }

  // Freshness bonus
  if (health.lastCommitAge) {
    if (
      health.lastCommitAge.includes("hour") ||
      health.lastCommitAge.includes("minute") ||
      health.lastCommitAge.includes("second")
    ) {
      score += 20; // Very recent
    } else if (health.lastCommitAge.includes("day")) {
      const dayMatch = health.lastCommitAge.match(/(\d+)\s*day/);
      const days = dayMatch ? parseInt(dayMatch[1]) : 999;
      if (days <= 7) score += 15;
      else if (days <= 30) score += 10;
      else {
        score += 5;
        health.issues.push(`Last commit ${health.lastCommitAge} — may be stale`);
      }
    } else if (health.lastCommitAge.includes("month") || health.lastCommitAge.includes("year")) {
      health.issues.push(`Last commit ${health.lastCommitAge} — likely stale`);
    }
  }

  health.healthScore = Math.min(100, score);
  return health;
}

async function loadBookmarks(): Promise<Bookmark[]> {
  try {
    const content = await fs.readFile(BOOKMARKS_PATH, "utf-8");
    return JSON.parse(content) as Bookmark[];
  } catch {
    return [];
  }
}

/** Atomic write: write to .tmp then rename to prevent corruption. */
async function atomicWriteJson(filepath: string, data: unknown): Promise<void> {
  const tmpPath = filepath + `.tmp.${process.pid}`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmpPath, filepath);
}

async function saveBookmarks(bookmarks: Bookmark[]): Promise<void> {
  await atomicWriteJson(BOOKMARKS_PATH, bookmarks);
}

async function saveSnapshot(snapshot: EcosystemSnapshot): Promise<string> {
  const filename = `${generateId("snapshot")}.json`;
  const filepath = path.join(SNAPSHOTS_DIR, filename);
  await atomicWriteJson(filepath, snapshot);
  return filepath;
}

async function listSnapshots(limit: number): Promise<EcosystemSnapshot[]> {
  try {
    const files = await fs.readdir(SNAPSHOTS_DIR);
    const jsonFiles = files
      .filter((f: string) => f.endsWith(".json"))
      .sort()
      .reverse()
      .slice(0, limit);

    const snapshots: EcosystemSnapshot[] = [];
    for (const file of jsonFiles) {
      try {
        const content = await fs.readFile(path.join(SNAPSHOTS_DIR, file), "utf-8");
        snapshots.push(JSON.parse(content));
      } catch {
        /* skip corrupt */
      }
    }
    return snapshots;
  } catch {
    return [];
  }
}

// ── Server ──

export function buildServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: VERSION,
  });
  // Avoid deep generic inference cost from complex schemas.
  const registerTool = server.registerTool.bind(server) as any;

  // Health check
  registerTool(
    "health_check",
    { description: "Check seeds-server health and data store status" },
    async () => {
      await ensureDataDir();
      const rootsStatus = await Promise.all(
        SEEDS_ROOTS.map(async (root) => ({
          root,
          exists: await fileExists(root),
        })),
      );
      const seedsExists = rootsStatus.some((root) => root.exists);
      let repoCount = 0;
      if (seedsExists) {
        repoCount = (await getDiscoveredRepoNames()).length;
      }
      const bookmarks = await loadBookmarks();
      let snapshotCount = 0;
      try {
        const files = await fs.readdir(SNAPSHOTS_DIR);
        snapshotCount = files.filter((f: string) => f.endsWith(".json")).length;
      } catch {
        /* empty */
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                status: seedsExists ? "ok" : "seeds_root_missing",
                server: SERVER_NAME,
                version: VERSION,
                seedsRoot: SEEDS_ROOT,
                seedsRoots: SEEDS_ROOTS,
                rootsStatus,
                dataDir: DATA_DIR,
                reposDetected: repoCount,
                knownRepos: Object.keys(KNOWN_REPOS),
                bookmarkCount: bookmarks.length,
                snapshotCount,
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

  // Scan all repos
  registerTool(
    "ecosystem_scan",
    {
      description:
        "Scan all repositories under the configured Seeds root and return health scores, git status, and issues for each. " +
        "Optionally saves a snapshot for longitudinal tracking.",
      inputSchema: z.object({
        saveSnapshot: z
          .boolean()
          .optional()
          .default(false)
          .describe("If true, persist this scan as a snapshot for trend analysis"),
      }),
    },
    async (args: { saveSnapshot?: boolean }) => {
      const rlMsg = readLimiter.check("ecosystem_scan");
      if (rlMsg)
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rlMsg }) }],
          isError: true,
        };
      if (process.env.NODE_ENV !== "test") {
        const rateLimitMsg = checkScanRateLimit("ecosystem_scan");
        if (rateLimitMsg) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: rateLimitMsg }) }],
          };
        }
      }
      await ensureDataDir();
      const repos: RepoHealth[] = [];

      // Scan known repos
      for (const repoName of Object.keys(KNOWN_REPOS)) {
        repos.push(await checkRepoHealth(repoName));
      }

      // Also discover unknown repos (skip REPO_SKIP_LIST so e.g. "scratch" without git is not reported)
      for (const repoName of await getDiscoveredRepoNames()) {
        repos.push(await checkRepoHealth(repoName));
      }

      const existingRepos = repos.filter((r) => r.exists);
      const overallScore =
        existingRepos.length > 0
          ? Math.round(
              existingRepos.reduce((sum, r) => sum + r.healthScore, 0) / existingRepos.length,
            )
          : 0;
      const activeCount = existingRepos.filter((r) => r.healthScore >= 60).length;
      const staleCount = existingRepos.filter((r) => r.healthScore < 40 && r.exists).length;
      const issueCount = repos.reduce((sum, r) => sum + r.issues.length, 0);

      const snapshot: EcosystemSnapshot = {
        timestamp: new Date().toISOString(),
        repos,
        overallScore,
        activeCount,
        staleCount,
        issueCount,
      };

      let savedPath: string | undefined;
      if (args.saveSnapshot) {
        savedPath = await saveSnapshot(snapshot);
      }

      emitAudit({
        source: SERVER_NAME,
        tool: "ecosystem_scan",
        status: overallScore >= 50 ? "success" : "failure",
        durationMs: Date.now() - Date.parse(snapshot.timestamp),
        metadata: {
          overallScore,
          totalRepos: repos.length,
          active: activeCount,
          stale: staleCount,
          totalIssues: issueCount,
          snapshotSaved: !!args.saveSnapshot,
        },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                summary: {
                  overallScore,
                  totalRepos: repos.length,
                  existing: existingRepos.length,
                  active: activeCount,
                  stale: staleCount,
                  totalIssues: issueCount,
                  ...(savedPath ? { snapshotSaved: savedPath } : {}),
                },
                repos: repos.map((r) => ({
                  name: r.name,
                  healthScore: r.healthScore,
                  branch: r.branch,
                  uncommitted: r.uncommittedChanges,
                  lastCommit: r.lastCommitAge,
                  issues: r.issues,
                  stack: KNOWN_REPOS[r.name]?.stack ?? "unknown",
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

  // Single repo detail
  registerTool(
    "repo_detail",
    {
      description: "Get detailed health information for a single Seeds repository",
      inputSchema: z.object({
        repoName: z
          .string()
          .min(1)
          .describe('Repository name under the configured Seeds root (e.g. "GRID-main", "afloat")'),
      }),
    },
    async (args: { repoName: string }) => {
      const rlMsg = readLimiter.check("repo_detail");
      if (rlMsg)
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rlMsg }) }],
          isError: true,
        };
      const health = await checkRepoHealth(args.repoName);
      const knownInfo = KNOWN_REPOS[args.repoName];

      emitAudit({
        source: SERVER_NAME,
        tool: "repo_detail",
        status: health.exists ? "success" : "failure",
        metadata: { repo: args.repoName, healthScore: health.healthScore },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                ...health,
                known: !!knownInfo,
                description: knownInfo?.description ?? "Not in known repos registry",
                stack: knownInfo?.stack ?? "unknown",
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // Bookmark management — add
  registerTool(
    "bookmark_add",
    {
      description:
        "Bookmark a repository or file for quick reference — useful for tracking important locations across the Seeds ecosystem",
      inputSchema: z.object({
        repo: z.string().min(1).describe("Repository name"),
        filepath: z.string().optional().describe("Optional file path within the repo"),
        note: z.string().min(1).describe("What to remember about this bookmark"),
        tags: z.array(z.string()).optional().default([]).describe("Tags for categorization"),
      }),
    },
    async (args: { repo: string; filepath?: string; note: string; tags?: string[] }) => {
      await ensureDataDir();
      const bookmarks = await loadBookmarks();
      const bookmark: Bookmark = {
        id: generateId("bk"),
        repo: args.repo,
        filepath: args.filepath,
        note: args.note,
        createdAt: new Date().toISOString(),
        tags: args.tags ?? [],
      };
      bookmarks.push(bookmark);
      await saveBookmarks(bookmarks);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ created: true, bookmark }, null, 2),
          },
        ],
      };
    },
  );

  // Bookmark management — list
  registerTool(
    "bookmark_list",
    {
      description: "List bookmarks with optional filtering by repo or tag",
      inputSchema: z.object({
        repo: z.string().optional().describe("Filter by repository name"),
        tag: z.string().optional().describe("Filter by tag"),
        limit: z
          .number()
          .min(1)
          .max(100)
          .optional()
          .default(20)
          .describe("Max bookmarks to return"),
      }),
    },
    async (args: { repo?: string; tag?: string; limit?: number }) => {
      const rlMsg = readLimiter.check("bookmark_list");
      if (rlMsg)
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rlMsg }) }],
          isError: true,
        };
      await ensureDataDir();
      let bookmarks = await loadBookmarks();

      if (args.repo) {
        bookmarks = bookmarks.filter((b) => b.repo === args.repo);
      }
      if (args.tag) {
        bookmarks = bookmarks.filter((b) => b.tags.includes(args.tag!));
      }

      bookmarks = bookmarks.slice(-(args.limit ?? 20)).reverse();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ count: bookmarks.length, bookmarks }, null, 2),
          },
        ],
      };
    },
  );

  // Trend analysis
  registerTool(
    "ecosystem_trend",
    {
      description:
        "Compare recent ecosystem snapshots to detect trends — improving repos, degrading repos, and persistent issues",
      inputSchema: z.object({
        limit: z
          .number()
          .min(2)
          .max(20)
          .optional()
          .default(5)
          .describe("Number of recent snapshots to compare"),
      }),
    },
    async (args: { limit?: number }) => {
      const rlMsg = readLimiter.check("ecosystem_trend");
      if (rlMsg)
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rlMsg }) }],
          isError: true,
        };
      await ensureDataDir();
      const snapshots = await listSnapshots(args.limit ?? 5);

      if (snapshots.length < 2) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                message:
                  "Not enough snapshots for trend analysis. Run ecosystem_scan with saveSnapshot=true at least twice.",
                snapshotsAvailable: snapshots.length,
              }),
            },
          ],
        };
      }

      const latest = snapshots[0];
      const previous = snapshots[1];

      // Compare scores
      const trends: Record<string, { current: number; previous: number; delta: number }> = {};
      for (const repo of latest.repos) {
        const prevRepo = previous.repos.find((r) => r.name === repo.name);
        if (prevRepo) {
          trends[repo.name] = {
            current: repo.healthScore,
            previous: prevRepo.healthScore,
            delta: repo.healthScore - prevRepo.healthScore,
          };
        }
      }

      const improving = Object.entries(trends)
        .filter(([, t]) => t.delta > 0)
        .map(([name, t]) => ({ name, delta: `+${t.delta}` }));
      const degrading = Object.entries(trends)
        .filter(([, t]) => t.delta < 0)
        .map(([name, t]) => ({ name, delta: `${t.delta}` }));
      const stable = Object.entries(trends)
        .filter(([, t]) => t.delta === 0)
        .map(([name]) => name);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                snapshotsCompared: snapshots.length,
                overallScoreTrend: {
                  current: latest.overallScore,
                  previous: previous.overallScore,
                  delta: latest.overallScore - previous.overallScore,
                },
                improving,
                degrading,
                stable,
                latestTimestamp: latest.timestamp,
                previousTimestamp: previous.timestamp,
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
  await ensureDataDir();
  logger.info(`v${VERSION} starting — seeds: ${SEEDS_ROOTS.join(", ")}`);
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
      logger.error(`failed to start`, { error: String(error) });
      process.exit(1);
    }
  }

  void main();
}
