/**
 * Test execution orchestrator — spawn test runners, capture output,
 * feed results into the classification pipeline.
 *
 * Security: follows the lots-server sandbox pattern —
 * restricted env, path validation via ExecutionPolicyEngine, timeout enforcement.
 */

import { generateId } from "@cascade/shared-types/id";
import { ExecutionPolicyEngine } from "@cascade/shared-types/security-policy";
import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";
import { getConfig } from "./config.js";
import { classifyLine, extractTestFile } from "./patterns.js";
import { loadRegistry, updateProjectHealth } from "./registry.js";
import { getAdapter } from "./runner-adapters.js";
import { appendLogEntries, ensureDataDirs } from "./storage.js";
import type { LogEntry, TestRunResult, TestRunSummary } from "./types.js";

const execFileAsync = promisify(execFile);
const config = getConfig();

// Allow execution within CascadeProjects, canopy, roots, grove
const executionPolicy = new ExecutionPolicyEngine([
  config.cascadeRoot,
  path.resolve(config.cascadeRoot, ".."), // parent of CASCADE_WORKSPACE_ROOT — covers canopy/, roots/, grove/
]);

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_BUFFER = 5 * 1024 * 1024; // 5 MB

/**
 * Execute a single project's test suite.
 */
export async function runTestSuite(
  projectId: string,
  options?: { timeoutMs?: number; filter?: string },
): Promise<TestRunResult> {
  await ensureDataDirs();

  const registry = await loadRegistry();
  const project = registry.projects.find((p) => p.id === projectId);
  if (!project) {
    throw new Error(`Project "${projectId}" not found in registry`);
  }

  // Security: validate the cwd is within allowed roots
  const cwdCheck = executionPolicy.validateTargetPath(project.runner.cwd);
  if (cwdCheck.verdict === "deny") {
    throw new Error(`Security policy blocked execution: ${cwdCheck.reason}`);
  }

  const adapter = getAdapter(project.runner.type);
  const { command, args } = adapter.buildCommand(project.runner);

  // If a filter is provided, append it to args (e.g. specific test file)
  const finalArgs = options?.filter ? [...args, options.filter] : args;

  // Security: validate the command doesn't contain shell operators
  const cmdCheck = executionPolicy.validateCommand(
    [command, ...finalArgs].join(" "),
  );
  if (cmdCheck.verdict === "deny") {
    throw new Error(`Security policy blocked command: ${cmdCheck.reason}`);
  }

  const timeoutMs = options?.timeoutMs ?? project.runner.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const runId = generateId("run");
  const start = Date.now();

  // Restricted env — only essentials + project-specific overrides
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    LANG: process.env.LANG ?? "en_US.UTF-8",
    TERM: "dumb",
    NO_COLOR: "1",
    CI: "true",
    ...project.runner.envOverrides,
  };

  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  let status: TestRunResult["status"] = "passed";
  let errorMessage: string | undefined;

  try {
    const result = await execFileAsync(command, finalArgs, {
      timeout: timeoutMs,
      cwd: project.runner.cwd,
      maxBuffer: MAX_BUFFER,
      env,
    });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (err: unknown) {
    const e = err as {
      code?: string | number;
      killed?: boolean;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    stdout = e.stdout ?? "";
    stderr = e.stderr ?? "";

    if (e.killed || e.code === "ETIMEDOUT") {
      status = "timeout";
      errorMessage = `Process killed after ${timeoutMs}ms timeout`;
    } else {
      // Non-zero exit code — tests may have failed (not an execution error)
      exitCode = typeof e.code === "number" ? e.code : 1;
      status = "failed";
      errorMessage = e.message;
    }
  }

  const durationMs = Date.now() - start;

  // Parse output through the adapter to get summary
  const summary: TestRunSummary = adapter.parseOutput(stdout, stderr);
  summary.durationMs = durationMs;

  // Determine final status from summary
  if (status !== "timeout") {
    if (summary.errors > 0) {
      status = "error";
    } else if (summary.failed > 0) {
      status = "failed";
    } else if (summary.passed > 0) {
      status = "passed";
    }
  }

  // Save raw output to disk
  const stdoutPath = path.join(config.runsDir, `${runId}.stdout`);
  const stderrPath = path.join(config.runsDir, `${runId}.stderr`);
  await fs.writeFile(stdoutPath, stdout, "utf-8");
  await fs.writeFile(stderrPath, stderr, "utf-8");

  // Feed stdout+stderr into classification pipeline
  const allLines = (stdout + "\n" + stderr)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const now = new Date().toISOString();
  const logEntries: LogEntry[] = allLines.map((line) => {
    const classification = classifyLine(line);
    return {
      id: generateId("log"),
      timestamp: now,
      line,
      source: projectId,
      severity: classification.severity,
      matchedPatterns: classification.matchedPatterns,
      testFile: extractTestFile(line),
    };
  });

  // Only persist lines that matched at least one pattern (avoid noise)
  const signalEntries = logEntries.filter((e) => e.matchedPatterns.length > 0);
  if (signalEntries.length > 0) {
    await appendLogEntries(signalEntries);
  }

  // Build result
  const runResult: TestRunResult = {
    id: runId,
    projectId,
    timestamp: now,
    summary,
    rawStdoutPath: stdoutPath,
    rawStderrPath: stderrPath,
    logEntriesCreated: signalEntries.length,
    status,
    errorMessage,
  };

  // Save structured result
  const resultPath = path.join(config.runsDir, `${runId}.json`);
  await fs.writeFile(resultPath, JSON.stringify(runResult, null, 2), "utf-8");

  // Update registry health
  await updateProjectHealth(projectId, {
    healthStatus: status === "passed" ? "healthy" : status === "timeout" ? "degraded" : "failing",
    lastRunTimestamp: now,
    lastRunSummary: summary,
  });

  return runResult;
}

/**
 * Execute test suites for multiple projects sequentially.
 */
export async function runAllTests(
  projectIds?: string[],
  options?: { stopOnFailure?: boolean; timeoutMs?: number },
): Promise<TestRunResult[]> {
  const registry = await loadRegistry();
  const ids = projectIds ?? registry.projects.map((p) => p.id);
  const results: TestRunResult[] = [];

  for (const id of ids) {
    try {
      const result = await runTestSuite(id, { timeoutMs: options?.timeoutMs });
      results.push(result);

      if (options?.stopOnFailure && result.status !== "passed") {
        break;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        id: generateId("run"),
        projectId: id,
        timestamp: new Date().toISOString(),
        summary: { passed: 0, failed: 0, skipped: 0, errors: 1, durationMs: 0, timestamp: new Date().toISOString() },
        rawStdoutPath: "",
        rawStderrPath: "",
        logEntriesCreated: 0,
        status: "error",
        errorMessage: msg,
      });

      if (options?.stopOnFailure) break;
    }
  }

  return results;
}

/**
 * Retrieve a past run result by ID.
 */
export async function getRunResult(runId: string): Promise<TestRunResult | null> {
  const resultPath = path.join(config.runsDir, `${runId}.json`);
  try {
    const raw = await fs.readFile(resultPath, "utf-8");
    return JSON.parse(raw) as TestRunResult;
  } catch {
    return null;
  }
}

/**
 * Retrieve raw stdout from a past run.
 */
export async function getRunStdout(runId: string): Promise<string | null> {
  const p = path.join(config.runsDir, `${runId}.stdout`);
  try {
    return await fs.readFile(p, "utf-8");
  } catch {
    return null;
  }
}

/**
 * List all past run results, sorted by timestamp descending.
 */
export async function listRuns(options?: {
  projectId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ total: number; runs: TestRunResult[] }> {
  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;

  try {
    const files = await fs.readdir(config.runsDir);
    const jsonFiles = files.filter((f) => f.endsWith(".json")).sort().reverse();

    const allRuns: TestRunResult[] = [];
    for (const file of jsonFiles) {
      try {
        const raw = await fs.readFile(path.join(config.runsDir, file), "utf-8");
        allRuns.push(JSON.parse(raw) as TestRunResult);
      } catch {
        /* skip corrupt */
      }
    }

    let filtered = allRuns;
    if (options?.projectId) {
      filtered = filtered.filter((r) => r.projectId === options.projectId);
    }
    if (options?.status) {
      filtered = filtered.filter((r) => r.status === options.status);
    }

    // Sort by timestamp descending
    filtered.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    return {
      total: filtered.length,
      runs: filtered.slice(offset, offset + limit),
    };
  } catch {
    return { total: 0, runs: [] };
  }
}
