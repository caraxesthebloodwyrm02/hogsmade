import { execSync } from "child_process";
import * as fs from "fs";
import { readBridge } from "./bridge-writer.js";

export interface ProbeResult {
  name: string;
  status: "pass" | "fail" | "error";
  durationMs: number;
  detail: Record<string, unknown>;
}

/**
 * Probe 1: TypeScript compilation check
 * Runs `npm run typecheck` in the Glass app directory.
 */
export async function probeTypecheck(appPath: string): Promise<ProbeResult> {
  const startMs = Date.now();
  try {
    execSync("npm run typecheck", {
      cwd: appPath,
      timeout: 30_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return {
      name: "typecheck",
      status: "pass",
      durationMs: Date.now() - startMs,
      detail: { command: "npm run typecheck", exit_code: 0 },
    };
  } catch (err) {
    return {
      name: "typecheck",
      status: "fail",
      durationMs: Date.now() - startMs,
      detail: {
        command: "npm run typecheck",
        error: String(err).slice(0, 200),
      },
    };
  }
}

/**
 * Probe 2: Test suite execution
 * Runs `npm test` in the Glass app directory.
 * Exit code 0 = pass; non-zero = fail.
 */
export async function probeTests(appPath: string): Promise<ProbeResult> {
  const startMs = Date.now();
  try {
    const stdout = execSync("npm test", {
      cwd: appPath,
      timeout: 120_000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    // Parse test count from Vitest output (e.g., "✓ 26 tests passed")
    const match = stdout.match(/(\d+)\s+tests?\s+passed/i);
    const testCount = match ? parseInt(match[1], 10) : 0;
    return {
      name: "tests",
      status: "pass",
      durationMs: Date.now() - startMs,
      detail: { command: "npm test", exit_code: 0, test_count: testCount },
    };
  } catch (err) {
    return {
      name: "tests",
      status: "fail",
      durationMs: Date.now() - startMs,
      detail: {
        command: "npm test",
        error: String(err).slice(0, 200),
      },
    };
  }
}

/**
 * Probe 3: Bridge file validation
 * Reads and parses the bridge file, validates structure.
 */
export async function probeBridge(): Promise<ProbeResult> {
  const startMs = Date.now();
  try {
    const state = await readBridge();
    const blocks = Array.isArray(state.blocks) ? state.blocks.length : 0;
    const conversation = Array.isArray(state.conversation) ? state.conversation.length : 0;
    const thresholdState =
      typeof state.threshold_state === "string" ? state.threshold_state : "unknown";

    return {
      name: "bridge",
      status: "pass",
      durationMs: Date.now() - startMs,
      detail: {
        block_count: blocks,
        conversation_count: conversation,
        threshold_state: thresholdState,
      },
    };
  } catch (err) {
    return {
      name: "bridge",
      status: "error",
      durationMs: Date.now() - startMs,
      detail: {
        error: String(err).slice(0, 200),
      },
    };
  }
}

/**
 * Probe 4: Ceremony gate eligibility check
 * Compares signals.iteration_count against _ceremony_eval_threshold.
 */
export async function probeCeremonyGate(): Promise<ProbeResult> {
  const startMs = Date.now();
  try {
    const state = await readBridge();
    const signals =
      state.signals && typeof state.signals === "object"
        ? (state.signals as Record<string, unknown>)
        : {};
    const iterCount = typeof signals.iteration_count === "number" ? signals.iteration_count : 0;
    const threshold =
      typeof state._ceremony_eval_threshold === "number" ? state._ceremony_eval_threshold : 15;
    const pct = threshold > 0 ? Math.round((iterCount / threshold) * 100) : 0;
    const eligible = iterCount >= threshold;

    return {
      name: "ceremony_gate",
      status: "pass",
      durationMs: Date.now() - startMs,
      detail: {
        iteration_count: iterCount,
        threshold,
        progress_percent: pct,
        eligible,
      },
    };
  } catch (err) {
    return {
      name: "ceremony_gate",
      status: "error",
      durationMs: Date.now() - startMs,
      detail: {
        error: String(err).slice(0, 200),
      },
    };
  }
}
