/**
 * Runner adapters — parse stdout/stderr from each test framework
 * into a normalized TestRunSummary.
 */

import type { TestRunner, TestRunSummary } from "./types.js";

export interface RunnerAdapter {
  buildCommand(runner: TestRunner): { command: string; args: string[] };
  parseOutput(stdout: string, stderr: string): TestRunSummary;
}

// ── Pytest adapter ──

const pytestAdapter: RunnerAdapter = {
  buildCommand(runner) {
    // runner.command is "uv", args are ["run", "pytest", ...]
    return { command: runner.command, args: runner.args };
  },

  parseOutput(stdout, stderr) {
    const combined = stdout + "\n" + stderr;
    let passed = 0,
      failed = 0,
      skipped = 0,
      errors = 0;
    let durationMs = 0;

    // pytest short summary line: "5 passed, 2 failed, 1 skipped in 3.45s"
    // Also handles: "5 passed in 1.23s", "3 failed, 1 error in 2.00s"
    const summaryMatch = combined.match(/=+\s*((?:\d+\s+\w+(?:,\s*)?)+)\s+in\s+([\d.]+)s\s*=+/);
    if (summaryMatch) {
      const parts = summaryMatch[1];
      const passedMatch = parts.match(/(\d+)\s+passed/);
      const failedMatch = parts.match(/(\d+)\s+failed/);
      const skippedMatch = parts.match(/(\d+)\s+(?:skipped|deselected)/);
      const errorMatch = parts.match(/(\d+)\s+error/);
      if (passedMatch) passed = parseInt(passedMatch[1], 10);
      if (failedMatch) failed = parseInt(failedMatch[1], 10);
      if (skippedMatch) skipped = parseInt(skippedMatch[1], 10);
      if (errorMatch) errors = parseInt(errorMatch[1], 10);
      durationMs = Math.round(parseFloat(summaryMatch[2]) * 1000);
    }

    // Fallback: count individual test result lines
    if (passed === 0 && failed === 0 && errors === 0) {
      const passLines = combined.match(/PASSED/g);
      const failLines = combined.match(/FAILED/g);
      const errorLines = combined.match(/ERROR/g);
      if (passLines) passed = passLines.length;
      if (failLines) failed = failLines.length;
      if (errorLines) errors = errorLines.length;
    }

    return {
      passed,
      failed,
      skipped,
      errors,
      durationMs,
      timestamp: new Date().toISOString(),
    };
  },
};

// ── Vitest adapter ──

const vitestAdapter: RunnerAdapter = {
  buildCommand(runner) {
    return { command: runner.command, args: runner.args };
  },

  parseOutput(stdout, stderr) {
    const combined = stdout + "\n" + stderr;
    let passed = 0,
      failed = 0,
      skipped = 0,
      errors = 0;
    let durationMs = 0;

    // Vitest summary lines:
    //  "Tests  10 passed (10)"
    //  "Tests  3 failed | 7 passed (10)"
    //  "Tests  1 skipped | 9 passed (10)"
    const testsLine = combined.match(/Tests\s+((?:\d+\s+\w+(?:\s*\|\s*)?)+)\s*\(\d+\)/);
    if (testsLine) {
      const parts = testsLine[1];
      const passedMatch = parts.match(/(\d+)\s+passed/);
      const failedMatch = parts.match(/(\d+)\s+failed/);
      const skippedMatch = parts.match(/(\d+)\s+skipped/);
      if (passedMatch) passed = parseInt(passedMatch[1], 10);
      if (failedMatch) failed = parseInt(failedMatch[1], 10);
      if (skippedMatch) skipped = parseInt(skippedMatch[1], 10);
    }

    // Duration line: "Duration  285ms" or "Duration  1.23s"
    const durationMatch = combined.match(/Duration\s+([\d.]+)(ms|s)/);
    if (durationMatch) {
      const val = parseFloat(durationMatch[1]);
      durationMs = durationMatch[2] === "s" ? Math.round(val * 1000) : Math.round(val);
    }

    // "Test Files  2 passed (2)" or "Test Files  1 failed | 1 passed (2)"
    // If individual test counts weren't found, try test file counts as fallback
    if (passed === 0 && failed === 0) {
      const fileLine = combined.match(/Test Files\s+((?:\d+\s+\w+(?:\s*\|\s*)?)+)\s*\(\d+\)/);
      if (fileLine) {
        const parts = fileLine[1];
        const fp = parts.match(/(\d+)\s+passed/);
        const ff = parts.match(/(\d+)\s+failed/);
        if (fp) passed = parseInt(fp[1], 10);
        if (ff) failed = parseInt(ff[1], 10);
      }
    }

    return {
      passed,
      failed,
      skipped,
      errors,
      durationMs,
      timestamp: new Date().toISOString(),
    };
  },
};

// ── Node --test adapter ──

const nodeTestAdapter: RunnerAdapter = {
  buildCommand(runner) {
    return { command: runner.command, args: runner.args };
  },

  parseOutput(stdout, stderr) {
    const combined = stdout + "\n" + stderr;
    let passed = 0,
      failed = 0,
      skipped = 0,
      errors = 0;
    let durationMs = 0;

    // Node test runner TAP-like output:
    //  "# tests 10"
    //  "# pass 8"
    //  "# fail 2"
    //  "# skipped 0"
    //  "# duration_ms 1234"
    const passMatch = combined.match(/# pass\s+(\d+)/);
    const failMatch = combined.match(/# fail\s+(\d+)/);
    const skipMatch = combined.match(/# skipped\s+(\d+)/);
    const durMatch = combined.match(/# duration_ms\s+([\d.]+)/);

    if (passMatch) passed = parseInt(passMatch[1], 10);
    if (failMatch) failed = parseInt(failMatch[1], 10);
    if (skipMatch) skipped = parseInt(skipMatch[1], 10);
    if (durMatch) durationMs = Math.round(parseFloat(durMatch[1]));

    // Fallback: count "ok" / "not ok" TAP lines
    if (passed === 0 && failed === 0) {
      const okLines = combined.match(/^ok \d+/gm);
      const notOkLines = combined.match(/^not ok \d+/gm);
      if (okLines) passed = okLines.length;
      if (notOkLines) failed = notOkLines.length;
    }

    return {
      passed,
      failed,
      skipped,
      errors,
      durationMs,
      timestamp: new Date().toISOString(),
    };
  },
};

// ── Adapter lookup ──

const adapters: Record<string, RunnerAdapter> = {
  pytest: pytestAdapter,
  vitest: vitestAdapter,
  "node-test": nodeTestAdapter,
};

export function getAdapter(runnerType: string): RunnerAdapter {
  const adapter = adapters[runnerType];
  if (!adapter) {
    throw new Error(`No adapter for runner type: ${runnerType}`);
  }
  return adapter;
}
