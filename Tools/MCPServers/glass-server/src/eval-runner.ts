import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  probeTypecheck,
  probeBridge,
  probeCeremonyGate,
  probeTests,
  type ProbeResult,
} from "./probes.js";
import { readBridge } from "./bridge-writer.js";
import { isPathAllowed } from "./profile-reader.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface EvalReport {
  id: string;
  timestamp: string;
  durationMs: number;
  probes: ProbeResult[];
  summary: {
    passed: number;
    failed: number;
    errored: number;
    total: number;
  };
}

export type SchedulerState = "idle" | "armed" | "disarmed";

export interface EvalRunnerState {
  schedulerState: SchedulerState;
  armedAt?: string;
  intervalSeconds?: number;
  lastReport?: EvalReport;
}

// Module-level state
let evalTimer: ReturnType<typeof setInterval> | null = null;
let schedulerState: SchedulerState = "idle";
let armedAt: string | null = null;
let currentIntervalSeconds = 300;
let lastReport: EvalReport | null = null;

/**
 * Resolve the Glass app path from bridge _profile_workspace, env var, or relative fallback.
 */
function getGlassAppPath(): string {
  // Try env var first
  if (process.env.GLASS_APP_PATH) {
    return process.env.GLASS_APP_PATH;
  }

  // Try to read from bridge
  try {
    // This is synchronous-ish by importing dynamically; simpler to use a file read for bridge
    const bridgePath =
      process.env.GLASS_BRIDGE_PATH ||
      path.join(process.env.HOME || "/root", ".caraxes", "field-bridge.json");
    if (fs.existsSync(bridgePath)) {
      const bridgeText = fs.readFileSync(bridgePath, "utf-8");
      const bridgeState = JSON.parse(bridgeText);
      if (typeof bridgeState._profile_workspace === "string") {
        const candidate = bridgeState._profile_workspace;
        if (isPathAllowed(candidate)) {
          return candidate;
        }
        console.warn(
          `[glass-eval] _profile_workspace blocked (outside allowed roots): ${candidate}`,
        );
      }
    }
  } catch {
    // Fall through to relative path
  }

  // Fallback: relative path from glass-server/src to Applications/glass
  // glass-server is at: CascadeProjects/Tools/MCPServers/glass-server/src
  // Applications/glass is at: CascadeProjects/Applications/glass
  // Relative: ../../../../../Applications/glass
  return path.resolve(__dirname, "../../../../../Applications/glass");
}

/**
 * Get the eval log file path.
 */
function getEvalLogPath(): string {
  const home = process.env.HOME || "/root";
  return path.join(home, ".caraxes", "glass-eval-log.ndjson");
}

/**
 * Append EvalReport to NDJSON log, keeping max 100 entries.
 */
function appendEvalLog(report: EvalReport): void {
  const logPath = getEvalLogPath();
  const dir = path.dirname(logPath);

  // Ensure directory exists
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Read existing log
  let entries: EvalReport[] = [];
  if (fs.existsSync(logPath)) {
    try {
      const lines = fs.readFileSync(logPath, "utf-8").trim().split("\n");
      entries = lines
        .filter((line) => line.length > 0)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter((e) => e !== null) as EvalReport[];
    } catch {
      entries = [];
    }
  }

  // Add new entry and trim to max 100
  entries.push(report);
  if (entries.length > 100) {
    entries = entries.slice(-100);
  }

  // Write back
  const ndjson = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  fs.writeFileSync(logPath, ndjson, "utf-8");
}

/**
 * Run all probes and assemble an EvalReport.
 */
export async function runAllProbes(): Promise<EvalReport> {
  const startMs = Date.now();
  const appPath = getGlassAppPath();

  // Run all probes in parallel
  const [probe1, probe2, probe3, probe4] = await Promise.all([
    probeTypecheck(appPath),
    probeTests(appPath),
    probeBridge(),
    probeCeremonyGate(),
  ]);

  const probes = [probe1, probe2, probe3, probe4];
  const passed = probes.filter((p) => p.status === "pass").length;
  const failed = probes.filter((p) => p.status === "fail").length;
  const errored = probes.filter((p) => p.status === "error").length;

  const report: EvalReport = {
    id: `eval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startMs,
    probes,
    summary: {
      passed,
      failed,
      errored,
      total: probes.length,
    },
  };

  // Store and log
  lastReport = report;
  appendEvalLog(report);

  return report;
}

/**
 * Arm the eval scheduler.
 */
export async function armEval(intervalSeconds: number = 300): Promise<EvalRunnerState> {
  if (evalTimer) {
    clearInterval(evalTimer);
  }

  currentIntervalSeconds = intervalSeconds;
  schedulerState = "armed";
  armedAt = new Date().toISOString();

  evalTimer = setInterval(async () => {
    try {
      await runAllProbes();
    } catch (err) {
      console.error("[glass-eval] eval cycle failed:", err);
    }
  }, intervalSeconds * 1000);

  return {
    schedulerState,
    armedAt,
    intervalSeconds,
    lastReport: lastReport ?? undefined,
  };
}

/**
 * Disarm the eval scheduler.
 */
export async function disarmEval(): Promise<EvalRunnerState> {
  if (evalTimer) {
    clearInterval(evalTimer);
    evalTimer = null;
  }

  schedulerState = "disarmed";

  return {
    schedulerState,
    intervalSeconds: currentIntervalSeconds,
    lastReport: lastReport ?? undefined,
  };
}

/**
 * Get current scheduler status.
 */
export async function getEvalStatus(): Promise<EvalRunnerState & { log_path: string }> {
  return {
    schedulerState,
    armedAt: armedAt ?? undefined,
    intervalSeconds: currentIntervalSeconds,
    lastReport: lastReport ?? undefined,
    log_path: getEvalLogPath(),
  };
}
