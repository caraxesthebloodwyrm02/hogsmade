/**
 * Maintain Server — System Optimization & Maintenance MCP Server
 *
 * Provides:
 * - Temp/cache directory scanning and cleanup
 * - Workspace hygiene checks (node_modules, build artifacts, pycache)
 * - Git repository health (loose objects, stale branches, gc recommendations)
 * - System-level metrics (RAM, disk, processes)
 * - Full diagnostic reports with trend analysis
 * - Safe cleanup execution with confirmation requirements
 *
 * Follows the same patterns as seeds-server, echoes-server, etc.
 */

import { emitAudit } from "@cascade/shared-types/audit-client";
import { ExecutionPolicyEngine } from "@cascade/shared-types/security-policy";
import { SessionRateLimiter } from "@cascade/shared-types/session-rate-limit";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execFile } from "child_process";
import crypto from "crypto";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";
import { promisify } from "util";
import * as z from "zod";
import { getConfig } from "./config.js";

const execFileAsync = promisify(execFile);

// ── Constants ──

const SERVER_NAME = "maintain-server";
const VERSION = "1.0.0";
const config = getConfig();
const DATA_DIR = config.dataDir;
const CONFIG_PATH = path.join(DATA_DIR, "config.json");
const REPORTS_DIR = path.join(DATA_DIR, "reports");
const CLEANUP_LOG_PATH = path.join(DATA_DIR, "cleanup-log.json");
const DEP_AUDIT_DIR = path.join(DATA_DIR, "dep-audit");

// Preview token for multi-step safety: execute requires a token from a prior dry-run (TTL 5 min)
const PREVIEW_TOKEN_TTL_MS = 5 * 60 * 1000;
let lastPreview: { token: string; expiresAt: number; actionHash: string } | null = null;

// Rate limiting for expensive scans
const SCAN_COOLDOWN_MS = 30_000; // 30 seconds between expensive scans
const lastScanTimes = new Map<string, number>();
const readLimiter = new SessionRateLimiter();

function checkScanRateLimit(scanType: string): string | null {
  const now = Date.now();
  const last = lastScanTimes.get(scanType);
  if (last && now - last < SCAN_COOLDOWN_MS) {
    const waitSec = Math.ceil((SCAN_COOLDOWN_MS - (now - last)) / 1000);
    return `Rate limited: ${scanType} was run ${Math.round(
      (now - last) / 1000,
    )}s ago. Wait ${waitSec}s.`;
  }
  lastScanTimes.set(scanType, now);
  return null;
}

// Execution policy for path validation
const executionPolicy = new ExecutionPolicyEngine(config.scanRoots);

function actionHash(
  actions: Array<{ type: string; target?: string; maxAgeDays?: number }>,
): string {
  return crypto.createHash("sha256").update(JSON.stringify(actions)).digest("hex");
}

// Platform-aware temp targets
function getPlatformTempTargets(): Record<string, string> {
  if (os.platform() === "win32") {
    return {
      user_temp: process.env.TEMP || path.join(os.homedir(), "AppData", "Local", "Temp"),
      npm_cache: path.join(os.homedir(), "AppData", "Local", "npm-cache"),
      pip_cache: path.join(os.homedir(), "AppData", "Local", "pip", "Cache"),
      prefetch: "C:\\Windows\\Prefetch",
    };
  }
  // Linux / macOS
  return {
    user_temp: process.env.TMPDIR || "/tmp",
    npm_cache: path.join(os.homedir(), ".npm", "_cacache"),
    pip_cache: path.join(os.homedir(), ".cache", "pip"),
  };
}

// Default config
const DEFAULT_CONFIG = {
  scanRoots: config.scanRoots,
  tempTargets: getPlatformTempTargets(),
  thresholds: {
    ramWarningPercent: 85,
    ramCriticalPercent: 95,
    diskWarningPercent: 10,
    diskCriticalPercent: 5,
    staleCommitDays: 30,
    tempStaleAgeDays: 7,
  },
};

// ── Types ──

interface TempScanResult {
  path: string;
  exists: boolean;
  totalSizeMB: number;
  fileCount: number;
  staleFileCount: number;
  staleSizeMB: number;
  accessible: boolean;
  recommendation: "clean" | "skip" | "review";
}

interface WorkspaceScanResult {
  path: string;
  name: string;
  totalSizeMB: number;
  nodeModulesSizeMB: number | null;
  buildArtifactsSizeMB: number;
  pycacheSizeMB: number;
  logFileCount: number;
  logSizeMB: number;
  issues: string[];
  reclaimableMB: number;
  healthScore: number;
}

interface GitRepoResult {
  name: string;
  path: string;
  branch: string;
  looseObjectsMB: number;
  staleBranches: string[];
  uncommittedCount: number;
  untrackedCount: number;
  largestFiles: { path: string; sizeMB: number }[];
  behindRemote: number;
  gcRecommended: boolean;
  issues: string[];
}

interface SystemMetrics {
  ram: { totalGB: number; freeGB: number; usedPercent: number };
  swap: { totalGB: number; usedGB: number };
  volumes: {
    drive: string;
    totalGB: number;
    freeGB: number;
    freePercent: number;
  }[];
  topProcesses: { name: string; pid: number; memoryMB: number }[];
  uptime: string;
  status: "healthy" | "warning" | "critical";
  warnings: string[];
}

interface DiagnosticReport {
  timestamp: string;
  tempScan: TempScanResult[];
  workspaceScan: WorkspaceScanResult[];
  gitScan: GitRepoResult[];
  systemMetrics: SystemMetrics;
  overallScore: number;
  totalIssues: number;
  reclaimableTotalMB: number;
}

interface CleanupLogEntry {
  timestamp: string;
  type: string;
  target: string;
  filesRemoved: number;
  bytesFreed: number;
  dryRun: boolean;
}

interface Config {
  scanRoots: string[];
  tempTargets: Record<string, string>;
  thresholds: typeof DEFAULT_CONFIG.thresholds;
}

// ── Dep-Audit Types (Phase 1) ──

type LockfileType = "npm" | "pnpm" | "uv" | "pip" | "none";

interface LockfileInfo {
  type: LockfileType;
  path: string;
  exists: boolean;
}

interface Vulnerability {
  name: string;
  version: string;
  severity: "info" | "low" | "moderate" | "high" | "critical";
  advisory: string;
  direct: boolean;
}

interface ProjectAuditResult {
  project: string;
  root: string;
  lockfile: LockfileInfo;
  vulnerabilities: Vulnerability[];
  totalDeps: number;
  error: string | null;
}

interface DepAuditResult {
  timestamp: string;
  projects: ProjectAuditResult[];
  summary: {
    totalProjects: number;
    totalVulnerabilities: number;
    bySeverity: Record<string, number>;
  };
  attention?: {
    directVulnerabilities: number;
    attentionList: { project: string; vuln: string; severity: string; cvss?: number }[];
  };
}

// ── Dep-Audit Helpers (Phase 1) ──

async function detectLockfile(rootPath: string): Promise<LockfileInfo> {
  const npmLock = path.join(rootPath, "package-lock.json");
  const pnpmLock = path.join(rootPath, "pnpm-lock.yaml");
  const uvLock = path.join(rootPath, "uv.lock");
  const reqTxt = path.join(rootPath, "requirements.txt");

  if (await fileExists(npmLock)) {
    return { type: "npm", path: npmLock, exists: true };
  }
  if (await fileExists(pnpmLock)) {
    return { type: "pnpm", path: pnpmLock, exists: true };
  }
  if (await fileExists(uvLock)) {
    return { type: "uv", path: uvLock, exists: true };
  }
  if (await fileExists(reqTxt)) {
    return { type: "pip", path: reqTxt, exists: true };
  }
  return { type: "none", path: "", exists: false };
}

async function runNpmAudit(
  rootPath: string,
): Promise<{ vulnerabilities: Vulnerability[]; totalDeps: number; error: string | null }> {
  try {
    const { stdout, stderr } = await execFileAsync("npm", ["audit", "--json"], {
      cwd: rootPath,
      timeout: 30000,
    });
    const result = JSON.parse(stdout);

    const vulnerabilities: Vulnerability[] = [];
    if (result.vulnerabilities) {
      for (const [name, data] of Object.entries(result.vulnerabilities)) {
        const vuln = data as any;
        const severity = vuln.severity as string;
        vulnerabilities.push({
          name,
          version: vuln.via?.[0]?.range || "unknown",
          severity: ["info", "low", "moderate", "high", "critical"].includes(severity)
            ? (severity as Vulnerability["severity"])
            : "low",
          advisory: vuln.via?.[0]?.url || "",
          direct: vuln.direct || false,
        });
      }
    }

    const metadata = result.metadata || {};
    const totalDeps = metadata.dependencies?.total || 0;

    return { vulnerabilities, totalDeps, error: null };
  } catch (error) {
    const err = error as any;
    const stdout = err.stdout || "";
    const stderr = err.stderr || "";

    // npm audit exits with code 1 when vulnerabilities found, but JSON is still valid
    if (stdout) {
      try {
        const result = JSON.parse(stdout);
        const vulnerabilities: Vulnerability[] = [];
        if (result.vulnerabilities) {
          for (const [name, data] of Object.entries(result.vulnerabilities)) {
            const vuln = data as any;
            const severity = vuln.severity as string;
            vulnerabilities.push({
              name,
              version: vuln.via?.[0]?.range || "unknown",
              severity: ["info", "low", "moderate", "high", "critical"].includes(severity)
                ? (severity as Vulnerability["severity"])
                : "low",
              advisory: vuln.via?.[0]?.url || "",
              direct: vuln.direct || false,
            });
          }
        }
        const metadata = result.metadata || {};
        const totalDeps = metadata.dependencies?.total || 0;
        return { vulnerabilities, totalDeps, error: null };
      } catch {
        // JSON parse failed, fall through to error handling
      }
    }

    const message = err.message || String(error);
    return {
      vulnerabilities: [],
      totalDeps: 0,
      error: `${message}${stderr ? ` | stderr: ${stderr}` : ""}`,
    };
  }
}

async function runPipAudit(
  rootPath: string,
): Promise<{ vulnerabilities: Vulnerability[]; totalDeps: number; error: string | null }> {
  try {
    const { stdout } = await execFileAsync(
      "uv",
      ["run", "--with", "pip-audit", "pip-audit", "--format", "json"],
      {
        cwd: rootPath,
        timeout: 30000,
      },
    );
    const result = JSON.parse(stdout);

    const vulnerabilities: Vulnerability[] = [];
    if (result.dependencies) {
      for (const dep of result.dependencies) {
        const vuln = dep.vulns?.[0];
        if (vuln) {
          const severityMap: Record<string, Vulnerability["severity"]> = {
            low: "low",
            medium: "moderate",
            high: "high",
            critical: "critical",
          };
          vulnerabilities.push({
            name: dep.name,
            version: dep.version,
            severity: severityMap[vuln.advisory.severity] || "moderate",
            advisory: vuln.advisory.url || "",
            direct: dep.is_direct || false,
          });
        }
      }
    }

    return { vulnerabilities, totalDeps: result.dependencies?.length || 0, error: null };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { vulnerabilities: [], totalDeps: 0, error: msg };
  }
}

async function auditProject(rootPath: string): Promise<ProjectAuditResult> {
  const project = getStableRootLabel(rootPath) || path.basename(rootPath);
  const lockfile = await detectLockfile(rootPath);

  if (lockfile.type === "none") {
    return {
      project,
      root: rootPath,
      lockfile,
      vulnerabilities: [],
      totalDeps: 0,
      error: "No lockfile found",
    };
  }

  if (lockfile.type === "npm" || lockfile.type === "pnpm") {
    const result = await runNpmAudit(rootPath);
    return {
      project,
      root: rootPath,
      lockfile,
      vulnerabilities: result.vulnerabilities,
      totalDeps: result.totalDeps,
      error: result.error,
    };
  }

  if (lockfile.type === "uv" || lockfile.type === "pip") {
    const result = await runPipAudit(rootPath);
    return {
      project,
      root: rootPath,
      lockfile,
      vulnerabilities: result.vulnerabilities,
      totalDeps: result.totalDeps,
      error: result.error,
    };
  }

  return {
    project,
    root: rootPath,
    lockfile,
    vulnerabilities: [],
    totalDeps: 0,
    error: "Unsupported lockfile type",
  };
}

// ── Data Layer ──

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(REPORTS_DIR, { recursive: true });
  await fs.mkdir(DEP_AUDIT_DIR, { recursive: true });
}

async function fileExists(filepath: string): Promise<boolean> {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}

async function loadConfig(): Promise<Config> {
  try {
    const content = await fs.readFile(CONFIG_PATH, "utf-8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(content) } as Config;
  } catch {
    return DEFAULT_CONFIG as Config;
  }
}

/** Atomic write: write to .tmp then rename to prevent corruption. */
async function atomicWriteJson(filepath: string, data: unknown): Promise<void> {
  const tmpPath = filepath + `.tmp.${process.pid}`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmpPath, filepath);
}

async function saveConfig(config: Config): Promise<void> {
  await atomicWriteJson(CONFIG_PATH, config);
}

async function saveDepAuditResult(result: DepAuditResult): Promise<void> {
  const timestamp = result.timestamp.replace(/[:.]/g, "-");
  const filename = `audit-${timestamp}.json`;
  const filepath = path.join(DEP_AUDIT_DIR, filename);
  await atomicWriteJson(filepath, result);
}

async function loadDepAuditResults(limit = 20): Promise<DepAuditResult[]> {
  try {
    const files = await fs.readdir(DEP_AUDIT_DIR);
    const jsonFiles = files
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse()
      .slice(0, limit);

    const results: DepAuditResult[] = [];
    for (const file of jsonFiles) {
      try {
        const content = await fs.readFile(path.join(DEP_AUDIT_DIR, file), "utf-8");
        results.push(JSON.parse(content) as DepAuditResult);
      } catch {
        // Skip corrupt files
      }
    }
    return results;
  } catch {
    return [];
  }
}

function getStableRootLabel(rootPath: string): string | undefined {
  const normalizedRoot = path.resolve(rootPath);

  if (normalizedRoot === config.workspaceRoot) {
    return path.basename(config.workspaceRoot) || "CascadeProjects";
  }

  if (normalizedRoot === config.seedsRoot) {
    return "Seeds";
  }

  return path.basename(normalizedRoot) || undefined;
}

function getCleanupRelatedRepo(
  actions: Array<{ target?: string }>,
  scanRoots: string[],
): string | undefined {
  const explicitRoots = actions
    .map((action) => action.target?.trim())
    .filter((target): target is string => Boolean(target))
    .map((target) => path.resolve(target));

  const candidateRoots =
    explicitRoots.length > 0
      ? [...new Set(explicitRoots)]
      : [...new Set(scanRoots.map((scanRoot) => path.resolve(scanRoot)))];

  if (candidateRoots.length !== 1) {
    return undefined;
  }

  return getStableRootLabel(candidateRoots[0]);
}

async function saveReport(report: DiagnosticReport): Promise<string> {
  const filename = `report-${Date.now()}.json`;
  const filepath = path.join(REPORTS_DIR, filename);
  await atomicWriteJson(filepath, report);
  return filepath;
}

async function loadReports(limit: number): Promise<DiagnosticReport[]> {
  try {
    const files = await fs.readdir(REPORTS_DIR);
    const jsonFiles = files
      .filter((f: string) => f.endsWith(".json"))
      .sort()
      .reverse()
      .slice(0, limit);

    const reports: DiagnosticReport[] = [];
    for (const file of jsonFiles) {
      try {
        const content = await fs.readFile(path.join(REPORTS_DIR, file), "utf-8");
        reports.push(JSON.parse(content));
      } catch {
        /* skip corrupt */
      }
    }
    return reports;
  } catch {
    return [];
  }
}

async function appendCleanupLog(entry: CleanupLogEntry): Promise<void> {
  let logs: CleanupLogEntry[] = [];
  try {
    const content = await fs.readFile(CLEANUP_LOG_PATH, "utf-8");
    logs = JSON.parse(content);
  } catch {
    /* empty */
  }
  logs.push(entry);
  await atomicWriteJson(CLEANUP_LOG_PATH, logs);
}

// ── Directory Size Calculation ──

const MAX_DIR_WALK_DEPTH = 20;

async function getDirSize(
  dirPath: string,
  depth = 0,
  visited?: Set<bigint>,
): Promise<{ size: number; count: number }> {
  if (depth > MAX_DIR_WALK_DEPTH) return { size: 0, count: 0 };
  const seen = visited ?? new Set<bigint>();
  let size = 0;
  let count = 0;

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      // Symlink guard: skip symlinks to prevent traversal and loop attacks
      try {
        const lst = await fs.lstat(fullPath);
        if (lst.isSymbolicLink()) continue;
        // Cycle detection via inode
        if (lst.isDirectory()) {
          const ino = BigInt(lst.ino);
          if (seen.has(ino)) continue;
          seen.add(ino);
        }
      } catch {
        continue;
      }

      if (entry.isDirectory()) {
        const sub = await getDirSize(fullPath, depth + 1, seen);
        size += sub.size;
        count += sub.count;
      } else if (entry.isFile()) {
        try {
          const stat = await fs.stat(fullPath);
          size += stat.size;
          count++;
        } catch {
          /* skip inaccessible */
        }
      }
    }
  } catch {
    /* permission denied or not exists */
  }

  return { size, count };
}

async function getStaleFiles(
  dirPath: string,
  maxAgeDays: number,
): Promise<{ count: number; size: number }> {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  let count = 0;
  let size = 0;

  async function walk(dir: string, depth = 0): Promise<void> {
    if (depth > MAX_DIR_WALK_DEPTH) return;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        // Symlink guard
        try {
          const lst = await fs.lstat(fullPath);
          if (lst.isSymbolicLink()) continue;
        } catch {
          continue;
        }

        if (entry.isDirectory()) {
          await walk(fullPath, depth + 1);
        } else if (entry.isFile()) {
          try {
            const stat = await fs.stat(fullPath);
            if (stat.mtimeMs < cutoff) {
              count++;
              size += stat.size;
            }
          } catch {
            /* skip */
          }
        }
      }
    } catch {
      /* permission denied */
    }
  }

  await walk(dirPath);
  return { count, size };
}

// ── Temp Scan ──

async function scanTempDir(
  name: string,
  dirPath: string,
  maxAgeDays: number,
): Promise<TempScanResult> {
  const exists = await fileExists(dirPath);
  if (!exists) {
    return {
      path: dirPath,
      exists: false,
      totalSizeMB: 0,
      fileCount: 0,
      staleFileCount: 0,
      staleSizeMB: 0,
      accessible: false,
      recommendation: "skip",
    };
  }

  const { size, count } = await getDirSize(dirPath);
  const stale = await getStaleFiles(dirPath, maxAgeDays);

  let recommendation: "clean" | "skip" | "review" = "review";
  if (stale.size > 100 * 1024 * 1024) {
    recommendation = "clean";
  } else if (stale.size < 10 * 1024 * 1024) {
    recommendation = "skip";
  }

  return {
    path: dirPath,
    exists: true,
    totalSizeMB: Math.round(size / (1024 * 1024)),
    fileCount: count,
    staleFileCount: stale.count,
    staleSizeMB: Math.round(stale.size / (1024 * 1024)),
    accessible: true,
    recommendation,
  };
}

// ── Workspace Scan ──

async function scanWorkspace(
  workspacePath: string,
  maxDepth: number,
): Promise<WorkspaceScanResult> {
  const name = path.basename(workspacePath);
  const issues: string[] = [];
  let totalSize = 0;
  let nodeModulesSize: number | null = null;
  let buildArtifactsSize = 0;
  let pycacheSize = 0;
  let logFileCount = 0;
  let logSize = 0;

  const buildArtifactNames = ["dist", "build", ".next", "out", "target", "bin", "obj"];
  const { size } = await getDirSize(workspacePath);
  totalSize = size;

  // Check node_modules
  const nmPath = path.join(workspacePath, "node_modules");
  if (await fileExists(nmPath)) {
    const nm = await getDirSize(nmPath);
    nodeModulesSize = nm.size;
    if (nm.size > 500 * 1024 * 1024) {
      issues.push(
        `Large node_modules (${Math.round(nm.size / (1024 * 1024))}MB) — consider pruning`,
      );
    }
  }

  // Check build artifacts
  for (const artifact of buildArtifactNames) {
    const artifactPath = path.join(workspacePath, artifact);
    if (await fileExists(artifactPath)) {
      const art = await getDirSize(artifactPath);
      buildArtifactsSize += art.size;
    }
  }

  // Check __pycache__ recursively
  async function findPycache(dir: string, depth: number): Promise<number> {
    if (depth > maxDepth) return 0;
    let size = 0;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.name === "__pycache__" && entry.isDirectory()) {
          const pc = await getDirSize(fullPath);
          size += pc.size;
        } else if (entry.isDirectory() && !entry.name.startsWith(".")) {
          size += await findPycache(fullPath, depth + 1);
        }
      }
    } catch {
      /* skip */
    }
    return size;
  }
  pycacheSize = await findPycache(workspacePath, 0);

  // Check log files
  async function findLogs(dir: string, depth: number): Promise<{ count: number; size: number }> {
    if (depth > maxDepth) return { count: 0, size: 0 };
    let count = 0;
    let size = 0;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isFile() && entry.name.endsWith(".log")) {
          try {
            const stat = await fs.stat(fullPath);
            count++;
            size += stat.size;
          } catch {
            /* skip */
          }
        } else if (entry.isDirectory() && !entry.name.startsWith(".")) {
          const sub = await findLogs(fullPath, depth + 1);
          count += sub.count;
          size += sub.size;
        }
      }
    } catch {
      /* skip */
    }
    return { count, size };
  }
  const logs = await findLogs(workspacePath, 0);
  logFileCount = logs.count;
  logSize = logs.size;

  // Health score
  let score = 100;
  if (nodeModulesSize && nodeModulesSize > 500 * 1024 * 1024) score -= 15;
  if (buildArtifactsSize > 200 * 1024 * 1024) score -= 10;
  if (pycacheSize > 50 * 1024 * 1024) score -= 5;
  if (logFileCount > 20) score -= 5;

  const reclaimable =
    (nodeModulesSize ? nodeModulesSize * 0.1 : 0) + buildArtifactsSize + pycacheSize + logSize;

  return {
    path: workspacePath,
    name,
    totalSizeMB: Math.round(totalSize / (1024 * 1024)),
    nodeModulesSizeMB: nodeModulesSize ? Math.round(nodeModulesSize / (1024 * 1024)) : null,
    buildArtifactsSizeMB: Math.round(buildArtifactsSize / (1024 * 1024)),
    pycacheSizeMB: Math.round(pycacheSize / (1024 * 1024)),
    logFileCount,
    logSizeMB: Math.round(logSize / (1024 * 1024)),
    issues,
    reclaimableMB: Math.round(reclaimable / (1024 * 1024)),
    healthScore: Math.max(0, score),
  };
}

// ── Git Scan ──

async function runGitCommand(repoPath: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd: repoPath,
      timeout: 15000,
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

async function scanGitRepo(repoPath: string): Promise<GitRepoResult> {
  const name = path.basename(repoPath);
  const issues: string[] = [];

  const hasGit = await fileExists(path.join(repoPath, ".git"));
  if (!hasGit) {
    return {
      name,
      path: repoPath,
      branch: "none",
      looseObjectsMB: 0,
      staleBranches: [],
      uncommittedCount: 0,
      untrackedCount: 0,
      largestFiles: [],
      behindRemote: 0,
      gcRecommended: false,
      issues: ["Not a git repository"],
    };
  }

  // Branch
  const branch = (await runGitCommand(repoPath, ["branch", "--show-current"])) || "unknown";

  // Loose objects
  const countOutput = await runGitCommand(repoPath, ["count-objects", "-v"]);
  let looseObjectsMB = 0;
  if (countOutput) {
    const match = countOutput.match(/size:\s*(\d+)/);
    if (match) {
      looseObjectsMB = Math.round(parseInt(match[1]) / 1024);
    }
  }

  // Uncommitted/untracked
  const statusOutput = await runGitCommand(repoPath, ["status", "--porcelain"]);
  let uncommittedCount = 0;
  let untrackedCount = 0;
  if (statusOutput) {
    const lines = statusOutput.split("\n").filter(Boolean);
    for (const line of lines) {
      if (line.startsWith("??")) untrackedCount++;
      else uncommittedCount++;
    }
  }

  // Stale branches
  const branchList = await runGitCommand(repoPath, [
    "for-each-ref",
    "--sort=committerdate",
    "--format=%(refname:short) %(committerdate:unix)",
    "refs/heads/",
  ]);
  const staleBranches: string[] = [];
  const staleThreshold = Date.now() / 1000 - 30 * 24 * 60 * 60;
  if (branchList) {
    for (const line of branchList.split("\n")) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2) {
        const branchName = parts[0];
        const timestamp = parseInt(parts[1]);
        if (timestamp < staleThreshold && branchName !== branch) {
          staleBranches.push(branchName);
        }
      }
    }
  }

  // Behind remote
  let behindRemote = 0;
  await runGitCommand(repoPath, ["fetch", "--quiet"]);
  const behindOutput = await runGitCommand(repoPath, ["rev-list", "--count", "HEAD..@{u}"]);
  if (behindOutput) {
    behindRemote = parseInt(behindOutput) || 0;
  }

  // GC recommendation
  const gcRecommended = looseObjectsMB > 10;

  if (uncommittedCount > 10) {
    issues.push(`${uncommittedCount} uncommitted changes`);
  }
  if (staleBranches.length > 0) {
    issues.push(`${staleBranches.length} stale branches (>30 days)`);
  }
  if (behindRemote > 20) {
    issues.push(`Behind remote by ${behindRemote} commits`);
  }

  return {
    name,
    path: repoPath,
    branch,
    looseObjectsMB,
    staleBranches,
    uncommittedCount,
    untrackedCount,
    largestFiles: [], // Would require expensive rev-list walk
    behindRemote,
    gcRecommended,
    issues,
  };
}

// ── System Metrics ──

async function getSystemMetrics(topN: number): Promise<SystemMetrics> {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedPercent = Math.round(((totalMem - freeMem) / totalMem) * 100);

  const warnings: string[] = [];
  let status: "healthy" | "warning" | "critical" = "healthy";

  if (usedPercent > 95) {
    status = "critical";
    warnings.push(`Critical RAM usage: ${usedPercent}%`);
  } else if (usedPercent > 85) {
    status = "warning";
    warnings.push(`High RAM usage: ${usedPercent}%`);
  }

  // Get volumes — platform-aware
  let volumes: SystemMetrics["volumes"] = [];
  if (os.platform() === "win32") {
    try {
      const { stdout } = await execFileAsync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          "Get-Volume | Where-Object {$_.DriveLetter} | Select-Object DriveLetter,SizeRemaining,Size | ConvertTo-Json",
        ],
        { timeout: 30000 },
      );
      const volData = JSON.parse(stdout);
      const vols = Array.isArray(volData) ? volData : [volData];
      for (const v of vols) {
        const totalGB = Math.round((v.Size || 0) / 1024 ** 3);
        const freeGB = Math.round((v.SizeRemaining || 0) / 1024 ** 3);
        const freePercent = totalGB > 0 ? Math.round((freeGB / totalGB) * 100) : 0;
        volumes.push({ drive: v.DriveLetter, totalGB, freeGB, freePercent });
        if (freePercent < 5) {
          status = "critical";
          warnings.push(`Critical disk space on ${v.DriveLetter}:\\ (${freePercent}% free)`);
        } else if (freePercent < 10) {
          if (status !== "critical") status = "warning";
          warnings.push(`Low disk space on ${v.DriveLetter}:\\ (${freePercent}% free)`);
        }
      }
    } catch {
      /* PowerShell not available */
    }
  } else {
    // Linux/macOS: use df
    try {
      const { stdout } = await execFileAsync("df", ["-BG", "--output=target,size,avail"], {
        timeout: 10000,
      });
      const lines = stdout.trim().split("\n").slice(1);
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3 && (parts[0] === "/" || parts[0]?.startsWith("/home"))) {
          const totalGB = parseInt(parts[1]) || 0;
          const freeGB = parseInt(parts[2]) || 0;
          const freePercent = totalGB > 0 ? Math.round((freeGB / totalGB) * 100) : 0;
          volumes.push({ drive: parts[0], totalGB, freeGB, freePercent });
          if (freePercent < 5) {
            status = "critical";
            warnings.push(`Critical disk space on ${parts[0]} (${freePercent}% free)`);
          } else if (freePercent < 10) {
            if (status !== "critical") status = "warning";
            warnings.push(`Low disk space on ${parts[0]} (${freePercent}% free)`);
          }
        }
      }
    } catch {
      /* df not available */
    }
  }

  // Top processes — platform-aware
  let topProcesses: SystemMetrics["topProcesses"] = [];
  if (os.platform() === "win32") {
    try {
      const { stdout } = await execFileAsync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First ${topN} Name,Id,WorkingSet64 | ConvertTo-Json`,
        ],
        { timeout: 30000 },
      );
      const procData = JSON.parse(stdout);
      const procs = Array.isArray(procData) ? procData : [procData];
      topProcesses = procs.map((p: { Name: string; Id: number; WorkingSet64: number }) => ({
        name: p.Name,
        pid: p.Id,
        memoryMB: Math.round(p.WorkingSet64 / (1024 * 1024)),
      }));
    } catch {
      /* PowerShell not available */
    }
  } else {
    try {
      const { stdout } = await execFileAsync(
        "ps",
        ["axo", "comm,pid,rss", "--sort=-rss", "--no-headers"],
        { timeout: 10000 },
      );
      const lines = stdout.trim().split("\n").slice(0, topN);
      topProcesses = lines.map((line) => {
        const parts = line.trim().split(/\s+/);
        return {
          name: parts[0] ?? "unknown",
          pid: parseInt(parts[1]) || 0,
          memoryMB: Math.round((parseInt(parts[2]) || 0) / 1024),
        };
      });
    } catch {
      /* ps not available */
    }
  }

  // Swap — platform-aware
  let swapTotal = 0;
  let swapUsed = 0;
  if (os.platform() === "win32") {
    try {
      const { stdout } = await execFileAsync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          "Get-CimInstance Win32_PageFileUsage | Select-Object AllocatedBaseSize,CurrentUsage | ConvertTo-Json",
        ],
        { timeout: 30000 },
      );
      const swapData = JSON.parse(stdout);
      if (swapData) {
        swapTotal = swapData.AllocatedBaseSize || 0;
        swapUsed = swapData.CurrentUsage || 0;
      }
    } catch {
      /* No pagefile or PowerShell unavailable */
    }
  } else {
    try {
      const meminfo = await fs.readFile("/proc/meminfo", "utf-8");
      const swapTotalMatch = meminfo.match(/SwapTotal:\s+(\d+)/);
      const swapFreeMatch = meminfo.match(/SwapFree:\s+(\d+)/);
      if (swapTotalMatch) swapTotal = Math.round(parseInt(swapTotalMatch[1]) / (1024 * 1024));
      if (swapTotalMatch && swapFreeMatch) {
        swapUsed = Math.round(
          (parseInt(swapTotalMatch[1]) - parseInt(swapFreeMatch[1])) / (1024 * 1024),
        );
      }
    } catch {
      /* /proc/meminfo not available */
    }
  }

  const uptimeSec = os.uptime();
  const days = Math.floor(uptimeSec / 86400);
  const hours = Math.floor((uptimeSec % 86400) / 3600);
  const uptime = `${days}d ${hours}h`;

  return {
    ram: {
      totalGB: Math.round(totalMem / 1024 ** 3),
      freeGB: Math.round(freeMem / 1024 ** 3),
      usedPercent,
    },
    swap: { totalGB: swapTotal, usedGB: swapUsed },
    volumes,
    topProcesses,
    uptime,
    status,
    warnings,
  };
}

// ── Cleanup Execution ──

async function cleanupTemp(
  dirPath: string,
  maxAgeDays: number,
  dryRun: boolean,
): Promise<{ filesRemoved: number; bytesFreed: number; errors: string[] }> {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  let filesRemoved = 0;
  let bytesFreed = 0;
  const errors: string[] = [];

  async function walkAndClean(dir: string, depth = 0): Promise<void> {
    if (depth > MAX_DIR_WALK_DEPTH) return;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        // Symlink guard: never follow or delete symlinks
        try {
          const lst = await fs.lstat(fullPath);
          if (lst.isSymbolicLink()) continue;
        } catch {
          continue;
        }

        if (entry.isDirectory()) {
          await walkAndClean(fullPath, depth + 1);
          // Try to remove empty dir
          if (!dryRun) {
            try {
              await fs.rmdir(fullPath);
            } catch {
              /* not empty or permission denied */
            }
          }
        } else if (entry.isFile()) {
          try {
            const stat = await fs.stat(fullPath);
            if (stat.mtimeMs < cutoff) {
              bytesFreed += stat.size;
              filesRemoved++;
              if (!dryRun) {
                await fs.unlink(fullPath);
              }
            }
          } catch (e) {
            errors.push(`${fullPath}: ${(e as Error).message}`);
          }
        }
      }
    } catch (e) {
      errors.push(`${dir}: ${(e as Error).message}`);
    }
  }

  await walkAndClean(dirPath);
  return { filesRemoved, bytesFreed, errors };
}

async function cleanupNpmCache(
  dryRun: boolean,
): Promise<{ filesRemoved: number; bytesFreed: number; errors: string[] }> {
  const errors: string[] = [];
  let bytesFreed = 0;
  let filesRemoved = 0;

  const cachePath =
    os.platform() === "win32"
      ? path.join(os.homedir(), "AppData", "Local", "npm-cache")
      : path.join(os.homedir(), ".npm", "_cacache");
  if (!dryRun) {
    try {
      const before = await getDirSize(cachePath);
      await execFileAsync("npm", ["cache", "clean", "--force"], {
        timeout: 60000,
      });
      const after = await getDirSize(cachePath);
      bytesFreed = before.size - after.size;
      filesRemoved = before.count - after.count;
    } catch (e) {
      errors.push((e as Error).message);
    }
  } else {
    const { size, count } = await getDirSize(cachePath);
    bytesFreed = size;
    filesRemoved = count;
  }

  return { filesRemoved, bytesFreed, errors };
}

async function cleanupPipCache(
  dryRun: boolean,
): Promise<{ filesRemoved: number; bytesFreed: number; errors: string[] }> {
  const errors: string[] = [];
  let bytesFreed = 0;
  let filesRemoved = 0;

  const cachePath =
    os.platform() === "win32"
      ? path.join(os.homedir(), "AppData", "Local", "pip", "Cache")
      : path.join(os.homedir(), ".cache", "pip");
  if (!dryRun) {
    try {
      const before = await getDirSize(cachePath);
      await execFileAsync("pip", ["cache", "purge"], { timeout: 60000 });
      const after = await getDirSize(cachePath);
      bytesFreed = before.size - after.size;
      filesRemoved = before.count - after.count;
    } catch (e) {
      // pip cache purge may not be available
      errors.push((e as Error).message);
    }
  } else {
    const { size, count } = await getDirSize(cachePath);
    bytesFreed = size;
    filesRemoved = count;
  }

  return { filesRemoved, bytesFreed, errors };
}

async function cleanupPycache(
  workspaceRoot: string,
  dryRun: boolean,
): Promise<{ filesRemoved: number; bytesFreed: number; errors: string[] }> {
  let filesRemoved = 0;
  let bytesFreed = 0;
  const errors: string[] = [];

  async function walk(dir: string, depth = 0): Promise<void> {
    if (depth > MAX_DIR_WALK_DEPTH) return;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        // Symlink guard
        try {
          const lst = await fs.lstat(fullPath);
          if (lst.isSymbolicLink()) continue;
        } catch {
          continue;
        }

        if (entry.name === "__pycache__" && entry.isDirectory()) {
          const { size, count } = await getDirSize(fullPath);
          bytesFreed += size;
          filesRemoved += count;
          if (!dryRun) {
            try {
              await fs.rm(fullPath, { recursive: true });
            } catch (e) {
              errors.push(`${fullPath}: ${(e as Error).message}`);
            }
          }
        } else if (entry.isDirectory() && !entry.name.startsWith(".")) {
          await walk(fullPath, depth + 1);
        }
      }
    } catch {
      /* skip */
    }
  }

  await walk(workspaceRoot);
  return { filesRemoved, bytesFreed, errors };
}

async function gitGc(
  repoPath: string,
  dryRun: boolean,
): Promise<{ filesRemoved: number; bytesFreed: number; errors: string[] }> {
  const errors: string[] = [];
  let bytesFreed = 0;

  const before = await getDirSize(path.join(repoPath, ".git", "objects"));

  if (!dryRun) {
    try {
      await execFileAsync("git", ["gc", "--aggressive"], {
        cwd: repoPath,
        timeout: 120000,
      });
    } catch (e) {
      errors.push((e as Error).message);
    }
  }

  const after = await getDirSize(path.join(repoPath, ".git", "objects"));
  bytesFreed = Math.max(0, before.size - after.size);

  return { filesRemoved: 0, bytesFreed, errors };
}

// ── Server ──

export function buildServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: VERSION,
  });
  // Avoid deep generic instantiation with complex Zod schemas.
  const registerTool = server.registerTool.bind(server) as any;

  // Tool 1: health_check
  registerTool(
    "health_check",
    { description: "Check maintain-server health and data store status" },
    async () => {
      await ensureDataDir();
      const config = await loadConfig();
      let reportCount = 0;
      try {
        const files = await fs.readdir(REPORTS_DIR);
        reportCount = files.filter((f: string) => f.endsWith(".json")).length;
      } catch {
        /* empty */
      }

      const totalMem = os.totalmem();
      const freeMem = os.freemem();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                status: "ok",
                server: SERVER_NAME,
                version: VERSION,
                dataDir: DATA_DIR,
                reportCount,
                scanRoots: config.scanRoots,
                system: {
                  platform: os.platform(),
                  arch: os.arch(),
                  uptime: os.uptime(),
                  totalRamGB: Math.round(totalMem / 1024 ** 3),
                  freeRamGB: Math.round(freeMem / 1024 ** 3),
                  ramUsedPercent: Math.round(((totalMem - freeMem) / totalMem) * 100),
                },
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

  // Tool 2: scan_temp
  registerTool(
    "scan_temp",
    {
      description:
        "Scan temporary and cache directories for cleanup opportunities. Reports sizes, file counts, and staleness.",
      inputSchema: z.object({
        maxAgeDays: z
          .number()
          .min(1)
          .max(365)
          .optional()
          .default(7)
          .describe("Files older than this many days are considered stale"),
      }),
    },
    async (args: { maxAgeDays?: number }) => {
      const rlMsg = readLimiter.check("scan_temp");
      if (rlMsg)
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rlMsg }) }],
          isError: true,
        };
      const rateLimitMsg = checkScanRateLimit("scan_temp");
      if (rateLimitMsg) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rateLimitMsg }) }],
          isError: true,
        };
      }
      await ensureDataDir();
      const config = await loadConfig();
      const maxAge = args.maxAgeDays ?? config.thresholds.tempStaleAgeDays;

      const results: TempScanResult[] = [];
      for (const [name, dirPath] of Object.entries(config.tempTargets)) {
        const result = await scanTempDir(name, dirPath, maxAge);
        results.push(result);
      }

      const reclaimableTotal = results.reduce((sum, r) => sum + r.staleSizeMB, 0);
      const topTarget = results
        .filter((r) => r.staleSizeMB > 0)
        .sort((a, b) => b.staleSizeMB - a.staleSizeMB)[0];

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                scanType: "temp",
                maxAgeDays: maxAge,
                targets: results,
                _tailFunction: {
                  name: "summarize_temp_savings",
                  reclaimableTotalMB: reclaimableTotal,
                  topTarget: topTarget
                    ? { path: topTarget.path, sizeMB: topTarget.staleSizeMB }
                    : null,
                  recommendation:
                    reclaimableTotal > 500
                      ? "Run cleanup_execute with actions: [temp_clean]"
                      : reclaimableTotal > 100
                        ? "Consider cleanup_execute with dryRun: true"
                        : "No significant cleanup needed",
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

  // Tool 3: scan_workspaces
  registerTool(
    "scan_workspaces",
    {
      description:
        "Scan developer workspaces for hygiene issues: node_modules, build artifacts, pycache, log files.",
      inputSchema: z.object({
        roots: z
          .array(z.string())
          .optional()
          .describe("Workspace roots to scan (defaults to config.scanRoots)"),
        maxDepth: z
          .number()
          .min(1)
          .max(10)
          .optional()
          .default(3)
          .describe("Maximum directory depth to traverse"),
      }),
    },
    async (args: { roots?: string[]; maxDepth?: number }) => {
      const rlMsg = readLimiter.check("scan_workspaces");
      if (rlMsg)
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rlMsg }) }],
          isError: true,
        };
      const rateLimitMsg = checkScanRateLimit("scan_workspaces");
      if (rateLimitMsg) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rateLimitMsg }) }],
        };
      }
      await ensureDataDir();
      const config = await loadConfig();
      const roots = args.roots ?? config.scanRoots;
      const maxDepth = args.maxDepth ?? 3;

      const results: WorkspaceScanResult[] = [];

      for (const root of roots) {
        if (!(await fileExists(root))) continue;

        // Scan immediate subdirectories as projects
        try {
          const entries = await fs.readdir(root, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory() && !entry.name.startsWith(".")) {
              const projectPath = path.join(root, entry.name);
              results.push(await scanWorkspace(projectPath, maxDepth));
            }
          }
          // Also scan the root itself if it has project files
          const hasPackageJson = await fileExists(path.join(root, "package.json"));
          const hasPyproject = await fileExists(path.join(root, "pyproject.toml"));
          if (hasPackageJson || hasPyproject) {
            results.push(await scanWorkspace(root, maxDepth));
          }
        } catch {
          /* skip inaccessible */
        }
      }

      const ranked = [...results].sort((a, b) => b.reclaimableMB - a.reclaimableMB);
      const totalReclaimable = results.reduce((sum, r) => sum + r.reclaimableMB, 0);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                scanType: "workspaces",
                roots,
                maxDepth,
                workspaces: results,
                _tailFunction: {
                  name: "workspace_ranking",
                  totalReclaimableMB: totalReclaimable,
                  topReclaimable: ranked.slice(0, 3).map((r) => ({
                    name: r.name,
                    reclaimableMB: r.reclaimableMB,
                    issues: r.issues.length,
                  })),
                  recommendation:
                    totalReclaimable > 500
                      ? "Run cleanup_execute with actions: [pycache, build_artifacts]"
                      : "Workspaces reasonably clean",
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

  // Tool 4: scan_git_repos
  registerTool(
    "scan_git_repos",
    {
      description:
        "Scan git repositories for health issues: loose objects, stale branches, uncommitted changes, sync status.",
      inputSchema: z.object({
        roots: z
          .array(z.string())
          .optional()
          .describe("Repository roots to scan (defaults to config.scanRoots)"),
      }),
    },
    async (args: { roots?: string[] }) => {
      const rlMsg = readLimiter.check("scan_git_repos");
      if (rlMsg)
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rlMsg }) }],
          isError: true,
        };
      const rateLimitMsg = checkScanRateLimit("scan_git_repos");
      if (rateLimitMsg) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rateLimitMsg }) }],
        };
      }
      await ensureDataDir();
      const config = await loadConfig();
      const roots = args.roots ?? config.scanRoots;

      const results: GitRepoResult[] = [];

      for (const root of roots) {
        if (!(await fileExists(root))) continue;

        try {
          const entries = await fs.readdir(root, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory() && !entry.name.startsWith(".")) {
              const repoPath = path.join(root, entry.name);
              if (await fileExists(path.join(repoPath, ".git"))) {
                results.push(await scanGitRepo(repoPath));
              }
            }
          }
        } catch {
          /* skip */
        }
      }

      const gcCandidates = results.filter((r) => r.gcRecommended);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                scanType: "git",
                roots,
                repos: results,
                _tailFunction: {
                  name: "git_gc_candidates",
                  gcCandidates: gcCandidates.map((r) => ({
                    name: r.name,
                    looseObjectsMB: r.looseObjectsMB,
                  })),
                  totalIssues: results.reduce((sum, r) => sum + r.issues.length, 0),
                  recommendation:
                    gcCandidates.length > 0
                      ? `Run cleanup_execute with actions: [git_gc] for ${gcCandidates.length} repos`
                      : "Git repositories healthy",
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

  // Tool 5: scan_system
  registerTool(
    "scan_system",
    {
      description:
        "Get system-level metrics: RAM, disk volumes, top processes by memory, uptime, and health status.",
      inputSchema: z.object({
        topProcesses: z
          .number()
          .min(1)
          .max(50)
          .optional()
          .default(10)
          .describe("Number of top memory-consuming processes to list"),
      }),
    },
    async (args: { topProcesses?: number }) => {
      const rlMsg = readLimiter.check("scan_system");
      if (rlMsg)
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rlMsg }) }],
          isError: true,
        };
      await ensureDataDir();
      const metrics = await getSystemMetrics(args.topProcesses ?? 10);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                scanType: "system",
                ...metrics,
                _tailFunction: {
                  name: "system_health_summary",
                  status: metrics.status,
                  warnings: metrics.warnings,
                  recommendation:
                    metrics.status === "critical"
                      ? "Immediate action required: free RAM or disk space"
                      : metrics.status === "warning"
                        ? "Monitor system resources closely"
                        : "System healthy",
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

  // Tool 6: full_diagnostic
  registerTool(
    "full_diagnostic",
    {
      description:
        "Run all scans (temp, workspaces, git, system) and produce a unified diagnostic report with overall health score.",
      inputSchema: z.object({
        saveReport: z
          .boolean()
          .optional()
          .default(true)
          .describe("Persist report for trend analysis"),
        roots: z.array(z.string()).optional().describe("Override scan roots"),
      }),
    },
    async (args: { saveReport?: boolean; roots?: string[] }) => {
      const rlMsg = readLimiter.check("full_diagnostic");
      if (rlMsg)
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rlMsg }) }],
          isError: true,
        };
      const rateLimitMsg = checkScanRateLimit("full_diagnostic");
      if (rateLimitMsg) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rateLimitMsg }) }],
        };
      }
      await ensureDataDir();
      const config = await loadConfig();
      const roots = args.roots ?? config.scanRoots;

      // Run all scans
      const tempResults: TempScanResult[] = [];
      for (const [name, dirPath] of Object.entries(config.tempTargets)) {
        tempResults.push(await scanTempDir(name, dirPath, config.thresholds.tempStaleAgeDays));
      }

      const workspaceResults: WorkspaceScanResult[] = [];
      for (const root of roots) {
        if (!(await fileExists(root))) continue;
        try {
          const entries = await fs.readdir(root, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory() && !entry.name.startsWith(".")) {
              workspaceResults.push(await scanWorkspace(path.join(root, entry.name), 3));
            }
          }
        } catch {
          /* skip */
        }
      }

      const gitResults: GitRepoResult[] = [];
      for (const root of roots) {
        if (!(await fileExists(root))) continue;
        try {
          const entries = await fs.readdir(root, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const repoPath = path.join(root, entry.name);
              if (await fileExists(path.join(repoPath, ".git"))) {
                gitResults.push(await scanGitRepo(repoPath));
              }
            }
          }
        } catch {
          /* skip */
        }
      }

      const systemMetrics = await getSystemMetrics(10);

      // Calculate overall score
      let score = 100;
      score -= systemMetrics.ram.usedPercent > 85 ? 15 : 0;
      score -= systemMetrics.ram.usedPercent > 95 ? 15 : 0;
      for (const v of systemMetrics.volumes) {
        score -= v.freePercent < 10 ? 10 : 0;
        score -= v.freePercent < 5 ? 10 : 0;
      }
      score -= Math.min(20, workspaceResults.filter((w) => w.healthScore < 60).length * 5);
      score -= Math.min(15, gitResults.filter((g) => g.issues.length > 2).length * 5);

      const totalIssues =
        workspaceResults.reduce((s, w) => s + w.issues.length, 0) +
        gitResults.reduce((s, g) => s + g.issues.length, 0) +
        systemMetrics.warnings.length;

      const reclaimableTotal =
        tempResults.reduce((s, t) => s + t.staleSizeMB, 0) +
        workspaceResults.reduce((s, w) => s + w.reclaimableMB, 0);

      const report: DiagnosticReport = {
        timestamp: new Date().toISOString(),
        tempScan: tempResults,
        workspaceScan: workspaceResults,
        gitScan: gitResults,
        systemMetrics,
        overallScore: Math.max(0, score),
        totalIssues,
        reclaimableTotalMB: Math.round(reclaimableTotal),
      };

      let savedPath: string | undefined;
      if (args.saveReport ?? true) {
        savedPath = await saveReport(report);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                reportId: savedPath ? path.basename(savedPath) : undefined,
                overallScore: report.overallScore,
                status: systemMetrics.status,
                totalIssues,
                reclaimableTotalMB: report.reclaimableTotalMB,
                tempScan: {
                  targets: tempResults.length,
                  staleMB: tempResults.reduce((s, t) => s + t.staleSizeMB, 0),
                },
                workspaceScan: {
                  count: workspaceResults.length,
                  avgHealth: Math.round(
                    workspaceResults.reduce((s, w) => s + w.healthScore, 0) /
                      Math.max(1, workspaceResults.length),
                  ),
                },
                gitScan: {
                  count: gitResults.length,
                  gcCandidates: gitResults.filter((g) => g.gcRecommended).length,
                },
                system: {
                  ramUsed: systemMetrics.ram.usedPercent,
                  volumes: systemMetrics.volumes.length,
                },
                _tailFunction: {
                  name: "generate_action_plan",
                  actions: [
                    ...(report.reclaimableTotalMB > 100
                      ? [
                          {
                            priority: "high",
                            action: "cleanup_execute",
                            params: { actions: ["temp_clean", "pycache"] },
                            estimatedSavingsMB: report.reclaimableTotalMB,
                          },
                        ]
                      : []),
                    ...(gitResults.filter((g) => g.gcRecommended).length > 0
                      ? [
                          {
                            priority: "medium",
                            action: "git_gc",
                            repos: gitResults.filter((g) => g.gcRecommended).map((g) => g.name),
                          },
                        ]
                      : []),
                    ...(systemMetrics.status !== "healthy"
                      ? [
                          {
                            priority: "high",
                            action: "address_system_warnings",
                            warnings: systemMetrics.warnings,
                          },
                        ]
                      : []),
                  ],
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

  // Tool 7: cleanup_execute
  registerTool(
    "cleanup_execute",
    {
      description:
        "Execute cleanup actions. Step 1: run with dryRun: true (default) to get previewToken. Step 2: pass that previewToken with confirmPhrase='CONFIRM-CLEANUP' and dryRun: false to execute. Token expires in 5 minutes.",
      inputSchema: z.object({
        actions: z
          .array(
            z.object({
              type: z.enum([
                "temp_clean",
                "npm_cache",
                "pip_cache",
                "pycache",
                "build_artifacts",
                "log_files",
                "git_gc",
                "prefetch",
              ]),
              target: z.string().optional().describe("Specific path override"),
              maxAgeDays: z.number().optional().describe("For temp_clean (default 7)"),
            }),
          )
          .min(1)
          .describe("Cleanup actions to perform"),
        dryRun: z.boolean().optional().default(true).describe("Preview only (default true)"),
        confirmPhrase: z
          .string()
          .optional()
          .describe("Set to 'CONFIRM-CLEANUP' to execute non-dry-run"),
        previewToken: z
          .string()
          .optional()
          .describe(
            "Token from a prior dry-run; required for execute to enforce multi-step safety",
          ),
      }),
    },
    async (args: {
      actions: Array<{ type: string; target?: string; maxAgeDays?: number }>;
      dryRun?: boolean;
      confirmPhrase?: string;
      previewToken?: string;
    }) => {
      await ensureDataDir();
      const config = await loadConfig();

      const isDryRun = args.dryRun !== false;
      const isConfirmed = args.confirmPhrase === "CONFIRM-CLEANUP";

      // P-MCP-002: Policy engine approval check for destructive ops
      const approvalPolicy = executionPolicy.requireApproval(
        isDryRun,
        args.previewToken,
        args.confirmPhrase,
      );

      // P-MCP-005: Validate cleanup targets stay within workspace roots
      for (const action of args.actions) {
        if (action.target) {
          const targetPolicy = executionPolicy.validateTargetPath(action.target);
          if (targetPolicy.verdict === "deny") {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      error: `${targetPolicy.policyId}: ${targetPolicy.reason}`,
                      blocked: true,
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }
        }
      }

      if (!isDryRun && !isConfirmed) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: "Safety check failed",
                  message: "Set confirmPhrase='CONFIRM-CLEANUP' to execute non-dry-run cleanup",
                  dryRun: true,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // Multi-step safety: execute requires a preview token from a prior dry-run
      if (!isDryRun && isConfirmed) {
        const hash = actionHash(args.actions);
        const valid =
          args.previewToken &&
          lastPreview &&
          lastPreview.token === args.previewToken &&
          Date.now() < lastPreview.expiresAt &&
          lastPreview.actionHash === hash;
        if (!valid) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error: "Multi-step safety: run dry-run first",
                    message:
                      "Run cleanup_execute with dryRun: true (default), then pass the returned previewToken with confirmPhrase='CONFIRM-CLEANUP' to execute. Token expires in 5 minutes.",
                    dryRun: true,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }
        lastPreview = null;
      }

      const results: Array<{
        type: string;
        target: string;
        filesRemoved: number;
        bytesFreed: number;
        errors: string[];
        duration_ms: number;
      }> = [];

      for (const action of args.actions) {
        const start = Date.now();
        let result = { filesRemoved: 0, bytesFreed: 0, errors: [] as string[] };

        switch (action.type) {
          case "temp_clean": {
            const tempPath = action.target ?? config.tempTargets.user_temp;
            result = await cleanupTemp(tempPath, action.maxAgeDays ?? 7, isDryRun);
            break;
          }
          case "npm_cache": {
            result = await cleanupNpmCache(isDryRun);
            break;
          }
          case "pip_cache": {
            result = await cleanupPipCache(isDryRun);
            break;
          }
          case "pycache": {
            const workspaceRoot = action.target ?? config.scanRoots[0];
            result = await cleanupPycache(workspaceRoot, isDryRun);
            break;
          }
          case "git_gc": {
            const repoPath = action.target ?? config.scanRoots[0];
            result = await gitGc(repoPath, isDryRun);
            break;
          }
          default:
            result.errors.push(`Unknown action type: ${action.type}`);
        }

        const duration = Date.now() - start;
        const entry: CleanupLogEntry = {
          timestamp: new Date().toISOString(),
          type: action.type,
          target: action.target ?? "default",
          filesRemoved: result.filesRemoved,
          bytesFreed: result.bytesFreed,
          dryRun: isDryRun,
        };

        if (!isDryRun) {
          await appendCleanupLog(entry);
        }

        results.push({
          type: action.type,
          target: action.target ?? "default",
          filesRemoved: result.filesRemoved,
          bytesFreed: result.bytesFreed,
          errors: result.errors,
          duration_ms: duration,
        });
      }

      const totalBytesFreed = results.reduce((sum, r) => sum + r.bytesFreed, 0);
      const totalFilesRemoved = results.reduce((sum, r) => sum + r.filesRemoved, 0);
      const hasErrors = results.some((r) => r.errors.length > 0);
      const relatedRepo = getCleanupRelatedRepo(args.actions, config.scanRoots);

      let previewToken: string | undefined;
      if (isDryRun) {
        previewToken = crypto.randomBytes(16).toString("hex");
        lastPreview = {
          token: previewToken,
          expiresAt: Date.now() + PREVIEW_TOKEN_TTL_MS,
          actionHash: actionHash(args.actions),
        };
      }

      emitAudit({
        source: "maintain-server",
        tool: "cleanup_execute",
        status: isDryRun ? "dry_run" : hasErrors ? "failure" : "success",
        durationMs: results.reduce((sum, r) => sum + r.duration_ms, 0),
        metadata: {
          mode: isDryRun ? "dry-run" : "executed",
          actionsCount: results.length,
          totalFilesRemoved,
          totalBytesFreedMB: Math.round(totalBytesFreed / (1024 * 1024)),
          relatedRepo,
        },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                mode: isDryRun ? "dry-run" : "executed",
                actions: results,
                totalBytesFreed,
                totalFilesRemoved,
                totalBytesFreedMB: Math.round(totalBytesFreed / (1024 * 1024)),
                ...(isDryRun && previewToken
                  ? { previewToken, previewTokenExpiresInMinutes: 5 }
                  : {}),
                _tailFunction: {
                  name: "post_cleanup_verify",
                  executed: !isDryRun,
                  recommendation: isDryRun
                    ? "Run again with the same actions, confirmPhrase='CONFIRM-CLEANUP', and previewToken from this response to execute"
                    : "Cleanup complete. Run scan_* tools to verify.",
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

  // Tool 8: report_history
  registerTool(
    "report_history",
    {
      description: "Query past diagnostic reports for trend analysis.",
      inputSchema: z.object({
        limit: z
          .number()
          .min(1)
          .max(50)
          .optional()
          .default(5)
          .describe("Number of recent reports to retrieve"),
        metric: z
          .enum(["ram", "disk", "score", "all"])
          .optional()
          .default("all")
          .describe("Which metric to focus on"),
      }),
    },
    async (args: { limit?: number; metric?: string }) => {
      const rlMsg = readLimiter.check("report_history");
      if (rlMsg)
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rlMsg }) }],
          isError: true,
        };
      await ensureDataDir();
      const reports = await loadReports(args.limit ?? 5);

      if (reports.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                message: "No reports found. Run full_diagnostic with saveReport=true first.",
              }),
            },
          ],
        };
      }

      const history = reports.map((r) => ({
        timestamp: r.timestamp,
        overallScore: r.overallScore,
        ramUsedPercent: r.systemMetrics.ram.usedPercent,
        volumes: r.systemMetrics.volumes.map((v) => ({
          drive: v.drive,
          freePercent: v.freePercent,
        })),
        totalIssues: r.totalIssues,
        reclaimableMB: r.reclaimableTotalMB,
      }));

      // Trend analysis
      let trend: "improving" | "degrading" | "stable" = "stable";
      if (reports.length >= 2) {
        const latest = reports[0].overallScore;
        const previous = reports[1].overallScore;
        if (latest > previous + 5) trend = "improving";
        else if (latest < previous - 5) trend = "degrading";
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                reportsAvailable: reports.length,
                trend,
                history,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // Tool 9: dep_audit
  registerTool(
    "dep_audit",
    {
      description:
        "Run dependency vulnerability audit (npm audit / pip-audit) across configured scan roots. Detects lockfile type, executes appropriate audit tool, and returns structured vulnerability data with severity mapping.",
      inputSchema: z.object({
        roots: z
          .array(z.string())
          .optional()
          .describe("Root paths to audit (defaults to config.scanRoots if omitted)"),
        maxAgeDays: z
          .number()
          .min(1)
          .max(365)
          .optional()
          .default(7)
          .describe("Filter: only report advisories published within this window (future use)"),
      }),
    },
    async (args: { roots?: string[]; maxAgeDays?: number }) => {
      const rlMsg = readLimiter.check("dep_audit");
      if (rlMsg)
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rlMsg }) }],
          isError: true,
        };

      const rateLimitMsg = checkScanRateLimit("dep_audit");
      if (rateLimitMsg) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rateLimitMsg }) }],
          isError: true,
        };
      }

      // Safety: validate roots against scanRoots allowlist (RED-4 mitigation)
      const requestedRoots = args.roots || config.scanRoots;
      const validatedRoots: string[] = [];
      const seenRoots = new Set<string>();

      for (const root of requestedRoots) {
        const normalized = path.resolve(root);
        // Deduplicate roots
        if (seenRoots.has(normalized)) {
          continue;
        }
        seenRoots.add(normalized);

        const policyResult = executionPolicy.validateTargetPath(normalized);
        if (policyResult.verdict === "deny") {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: policyResult.reason,
                }),
              },
            ],
            isError: true,
          };
        }
        validatedRoots.push(normalized);
      }

      // Run audit for each validated root
      const projectResults: ProjectAuditResult[] = [];
      for (const root of validatedRoots) {
        const result = await auditProject(root);
        projectResults.push(result);
      }

      // Build summary with attention mechanism
      const bySeverity: Record<string, number> = {
        info: 0,
        low: 0,
        moderate: 0,
        high: 0,
        critical: 0,
      };
      let totalVulnerabilities = 0;
      let directVulnerabilities = 0;
      const attentionList: { project: string; vuln: string; severity: string; cvss?: number }[] =
        [];

      for (const project of projectResults) {
        for (const vuln of project.vulnerabilities) {
          bySeverity[vuln.severity] = (bySeverity[vuln.severity] || 0) + 1;
          totalVulnerabilities++;
          if (vuln.direct) {
            directVulnerabilities++;
            // Attention mechanism: prioritize direct vulnerabilities
            attentionList.push({
              project: project.project,
              vuln: vuln.name,
              severity: vuln.severity,
            });
          }
        }
      }

      const auditResult: DepAuditResult = {
        timestamp: new Date().toISOString(),
        projects: projectResults,
        summary: {
          totalProjects: projectResults.length,
          totalVulnerabilities,
          bySeverity,
        },
        attention: {
          directVulnerabilities,
          attentionList,
        },
      };

      // Save audit result for history
      await saveDepAuditResult(auditResult);

      // Emit audit event
      emitAudit({
        source: "maintain-server",
        tool: "dep_audit",
        status: "success",
        durationMs: 0,
        metadata: {
          projectsScanned: projectResults.length,
          totalVulnerabilities,
          bySeverity,
        },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(auditResult, null, 2),
          },
        ],
      };
    },
  );

  // Tool 10: dep_audit_history
  registerTool(
    "dep_audit_history",
    {
      description: "Retrieve historical dependency audit results with trend analysis.",
      inputSchema: z.object({
        limit: z
          .number()
          .min(1)
          .max(50)
          .optional()
          .default(20)
          .describe("Number of recent audit results to retrieve"),
      }),
    },
    async (args: { limit?: number }) => {
      const rlMsg = readLimiter.check("dep_audit_history");
      if (rlMsg)
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rlMsg }) }],
          isError: true,
        };

      await ensureDataDir();
      const results = await loadDepAuditResults(args.limit ?? 20);

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                message: "No audit history found. Run dep_audit first.",
              }),
            },
          ],
        };
      }

      // Trend analysis
      let trend: "improving" | "degrading" | "stable" = "stable";
      if (results.length >= 2) {
        const latest = results[0].summary.totalVulnerabilities;
        const previous = results[1].summary.totalVulnerabilities;
        if (latest < previous) trend = "improving";
        else if (latest > previous) trend = "degrading";
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                available: results.length,
                trend,
                history: results,
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
  console.error(`[${SERVER_NAME}] v${VERSION} starting — data: ${DATA_DIR}`);
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
