#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { createPreflightReport } from "./grid-admission-preflight.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const DEFAULT_GRID_MAIN_CWD = path.join(repoRoot, "GRID-main");
const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_STARTUP_TIMEOUT_MS = 45000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5000;

function usage() {
  console.error(
    [
      "Usage:",
      "  node scripts/grid-admission-runtime.mjs [options] -- <command> [args...]",
      "",
      "Options:",
      "  --ensure-grid-main          Start GRID-main automatically if admission is unavailable",
      "  --keep-grid-main            Leave GRID-main running if this harness started it",
      "  --grid-main-cwd <path>      Override the GRID-main working directory",
      "  --startup-timeout-ms <ms>   How long to wait for GRID-main readiness (default: 45000)",
      "  --poll-interval-ms <ms>     How often to re-run preflight while waiting (default: 1000)",
      "  --report <path>             Write the runtime session report to a JSON file",
      "  --help                      Show this help",
      "",
      "Examples:",
      "  node scripts/grid-admission-runtime.mjs --ensure-grid-main -- node -e \"console.log('ready')\"",
      "  node scripts/grid-admission-runtime.mjs --ensure-grid-main --report /tmp/admission-runtime.json -- npm --prefix grid-server run start",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const options = {
    ensureGridMain: false,
    keepGridMain: false,
    gridMainCwd: DEFAULT_GRID_MAIN_CWD,
    startupTimeoutMs: DEFAULT_STARTUP_TIMEOUT_MS,
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    reportPath: null,
    help: false,
  };

  const args = [...argv];
  const separator = args.indexOf("--");
  const optionArgs = separator >= 0 ? args.slice(0, separator) : args;
  const commandArgs = separator >= 0 ? args.slice(separator + 1) : [];

  for (let index = 0; index < optionArgs.length; index += 1) {
    const value = optionArgs[index];

    if (value === "--help" || value === "-h") {
      options.help = true;
      continue;
    }

    if (value === "--ensure-grid-main") {
      options.ensureGridMain = true;
      continue;
    }

    if (value === "--keep-grid-main") {
      options.keepGridMain = true;
      continue;
    }

    if (value === "--grid-main-cwd") {
      options.gridMainCwd = optionArgs[index + 1];
      index += 1;
      continue;
    }

    if (value === "--startup-timeout-ms") {
      options.startupTimeoutMs = Number(optionArgs[index + 1]);
      index += 1;
      continue;
    }

    if (value === "--poll-interval-ms") {
      options.pollIntervalMs = Number(optionArgs[index + 1]);
      index += 1;
      continue;
    }

    if (value === "--report") {
      options.reportPath = optionArgs[index + 1];
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${value}`);
  }

  return { options, commandArgs };
}

function runCommand(command, args) {
  const startedAt = Date.now();
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });

  return {
    command,
    args,
    durationMs: Date.now() - startedAt,
    exitCode: typeof result.status === "number" ? result.status : 1,
    signal: result.signal ?? null,
    error: result.error ? result.error.message : null,
  };
}

function pipeWithPrefix(stream, prefix, target) {
  if (!stream) {
    return;
  }

  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      target.write(`${prefix}${line}\n`);
    }
  });
  stream.on("end", () => {
    if (buffer.length > 0) {
      target.write(`${prefix}${buffer}\n`);
    }
  });
}

function findExecutable(name) {
  const entries = (process.env.PATH || "").split(path.delimiter).filter(Boolean);

  for (const entry of entries) {
    const candidate = path.join(entry, name);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function resolveGridMainLauncher(gridMainCwd) {
  const uvPath = findExecutable("uv");
  if (uvPath) {
    return {
      label: "uv",
      command: uvPath,
      args: ["run", "python", "-m", "application.mothership.main"],
    };
  }

  const venvPython = path.join(gridMainCwd, ".venv", "bin", "python");
  if (existsSync(venvPython)) {
    return {
      label: "venv-python",
      command: venvPython,
      args: ["-m", "application.mothership.main"],
    };
  }

  return null;
}

function startGridMain(gridMainCwd) {
  const launcher = resolveGridMainLauncher(gridMainCwd);
  if (!launcher) {
    return {
      child: null,
      launcher: null,
      error: "Could not find 'uv' in PATH or GRID-main/.venv/bin/python",
    };
  }

  const child = spawn(launcher.command, launcher.args, {
    cwd: gridMainCwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  pipeWithPrefix(child.stdout, "[grid-main] ", process.stderr);
  pipeWithPrefix(child.stderr, "[grid-main] ", process.stderr);

  child.on("error", (error) => {
    process.stderr.write(`[grid-main] launcher error: ${error.message}\n`);
  });

  return {
    child,
    launcher,
    error: null,
  };
}

async function waitForAdmissionReady({ startupTimeoutMs, pollIntervalMs, child }) {
  const startedAt = Date.now();
  let attempts = 0;
  let lastReport = null;

  while (Date.now() - startedAt <= startupTimeoutMs) {
    attempts += 1;
    lastReport = await createPreflightReport();
    if (lastReport.pass) {
      return {
        ready: true,
        attempts,
        elapsedMs: Date.now() - startedAt,
        report: lastReport,
      };
    }

    if (child && child.exitCode !== null) {
      return {
        ready: false,
        attempts,
        elapsedMs: Date.now() - startedAt,
        report: lastReport,
      };
    }

    await sleep(pollIntervalMs);
  }

  return {
    ready: false,
    attempts,
    elapsedMs: Date.now() - startedAt,
    report: lastReport,
  };
}

async function shutdownChild(child) {
  if (!child || child.exitCode !== null) {
    return {
      attempted: false,
      exitCode: child?.exitCode ?? null,
      signal: child?.signalCode ?? null,
    };
  }

  child.kill("SIGINT");
  const deadline = Date.now() + DEFAULT_SHUTDOWN_TIMEOUT_MS;

  while (child.exitCode === null && Date.now() < deadline) {
    await sleep(100);
  }

  if (child.exitCode === null) {
    child.kill("SIGTERM");
    await sleep(250);
  }

  return {
    attempted: true,
    exitCode: child.exitCode,
    signal: child.signalCode ?? null,
  };
}

async function maybeWriteReport(reportPath, report) {
  if (!reportPath) {
    return null;
  }

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportPath;
}

function buildSummary(report) {
  if (report.gridMain.launchError) {
    return `GRID-main auto-start failed before admission became ready: ${report.gridMain.launchError}`;
  }

  if (!report.before.pass && !report.gridMain.startedByHarness) {
    return "Admission backend unavailable and GRID-main auto-start was not enabled.";
  }

  if (report.gridMain.startedByHarness && !report.gridMain.ready) {
    return "GRID-main was started by the harness but admission never became ready.";
  }

  if (report.command.exitCode !== 0) {
    return "Admission runtime became ready, but the guarded command failed.";
  }

  if (!report.after.pass) {
    return "Guarded command completed, but admission drifted unhealthy by the end of the session.";
  }

  return report.gridMain.startedByHarness
    ? "GRID-main was cold-started, admission became ready, and the guarded command completed cleanly."
    : "Admission was already healthy and the guarded command completed cleanly.";
}

async function main() {
  const { options, commandArgs } = parseArgs(process.argv.slice(2));

  if (options.help) {
    usage();
    process.exit(0);
  }

  if (commandArgs.length === 0) {
    usage();
    process.exit(2);
  }

  if (!Number.isFinite(options.startupTimeoutMs) || options.startupTimeoutMs <= 0) {
    throw new Error("--startup-timeout-ms must be a positive number");
  }

  if (!Number.isFinite(options.pollIntervalMs) || options.pollIntervalMs <= 0) {
    throw new Error("--poll-interval-ms must be a positive number");
  }

  const sessionId = `grid-runtime-${Date.now().toString(36)}`;
  const before = await createPreflightReport();
  const report = {
    sessionId,
    startedAt: new Date().toISOString(),
    repoRoot,
    mode: before.pass ? "attached" : "recovery",
    before,
    gridMain: {
      launchAttempted: false,
      startedByHarness: false,
      cwd: options.gridMainCwd,
      launcher: null,
      launchError: null,
      ready: before.pass,
      startupAttempts: 0,
      startupElapsedMs: 0,
      pid: null,
      keptRunning: false,
      shutdown: null,
    },
    command: {
      command: commandArgs[0],
      args: commandArgs.slice(1),
      durationMs: 0,
      exitCode: null,
      signal: null,
      error: null,
    },
    after: before,
    reportPath: options.reportPath,
    summary: "",
  };

  let gridChild = null;

  try {
    if (!before.pass) {
      if (!options.ensureGridMain) {
        report.summary = buildSummary(report);
        await maybeWriteReport(options.reportPath, report);
        console.error(JSON.stringify(report, null, 2));
        process.exit(1);
      }

      report.gridMain.launchAttempted = true;
      const launch = startGridMain(options.gridMainCwd);
      report.gridMain.launcher = launch.launcher?.label ?? null;
      if (!launch.child) {
        report.gridMain.launchError = launch.error;
        report.after = before;
        report.summary = buildSummary(report);
        await maybeWriteReport(options.reportPath, report);
        console.error(JSON.stringify(report, null, 2));
        process.exit(1);
      }

      gridChild = launch.child;
      report.gridMain.startedByHarness = true;
      report.gridMain.pid = gridChild.pid ?? null;
      gridChild.on("error", (error) => {
        report.gridMain.launchError = error.message;
      });

      const readiness = await waitForAdmissionReady({
        startupTimeoutMs: options.startupTimeoutMs,
        pollIntervalMs: options.pollIntervalMs,
        child: gridChild,
      });

      report.gridMain.ready = readiness.ready;
      report.gridMain.startupAttempts = readiness.attempts;
      report.gridMain.startupElapsedMs = readiness.elapsedMs;
      report.before = readiness.report ?? before;
      report.mode = readiness.ready ? "ensured" : "recovery";

      if (!readiness.ready) {
        report.after = readiness.report ?? report.after;
        report.summary = buildSummary(report);
        await maybeWriteReport(options.reportPath, report);
        console.error(JSON.stringify(report, null, 2));
        process.exit(1);
      }
    }

    report.command = runCommand(commandArgs[0], commandArgs.slice(1));
    report.after = await createPreflightReport();
  } finally {
    if (gridChild && report.gridMain.startedByHarness && !options.keepGridMain) {
      report.gridMain.shutdown = await shutdownChild(gridChild);
    } else if (gridChild && options.keepGridMain) {
      report.gridMain.keptRunning = true;
    }
  }

  report.summary = buildSummary(report);
  const writtenPath = await maybeWriteReport(options.reportPath, report);
  if (writtenPath) {
    report.reportPath = writtenPath;
  }

  const output = JSON.stringify(report, null, 2);
  if (report.command.exitCode === 0 && report.after.pass) {
    console.log(output);
    process.exit(0);
  }

  console.error(output);
  process.exit(report.command.exitCode || 1);
}

await main();
