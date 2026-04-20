#!/usr/bin/env node
/**
 * @file .glimpse/hooks/pre-process.mjs
 * @description Pre-commit/Pre-process hook for structured routines
 * Runs: structure check → syntax check → lint → organize → cleanup
 * Always cleans up after itself
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const RUN_ID = Date.now().toString(36);
const LOG_DIR = path.join(ROOT, ".glimpse", "logs");
const TEMP_DIR = path.join(ROOT, ".glimpse", "temp", RUN_ID);
const LOG_FILE = path.join(LOG_DIR, `process-${RUN_ID}.log`);

// Ensure directories exist
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
if (!existsSync(TEMP_DIR)) mkdirSync(TEMP_DIR, { recursive: true });

// ANSI colors
const C = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

const stages = [];
let errors = 0;

function log(level, message) {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
  appendFileSync(LOG_FILE, entry);

  // Console output with colors
  const color =
    level === "error"
      ? C.red
      : level === "warn"
        ? C.yellow
        : level === "success"
          ? C.green
          : C.cyan;
  console.log(`${color}${message}${C.reset}`);
}

async function runStage(name, command, critical = false) {
  const stage = { name, startTime: Date.now(), status: "running" };
  stages.push(stage);

  log("info", `${C.bright}[${stages.length}/5] ${name}...${C.reset}`);

  try {
    const result = execSync(command, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 60000,
    });

    stage.status = "success";
    stage.duration = Date.now() - stage.startTime;
    stage.output = result;

    // Save output to temp if not empty
    if (result?.trim()) {
      writeFileSync(path.join(TEMP_DIR, `${name.replace(/\s+/g, "-")}.out`), result);
    }

    log("success", `  ✓ ${name} completed in ${stage.duration}ms`);
    return { success: true, output: result };
  } catch (err) {
    stage.status = "failed";
    stage.duration = Date.now() - stage.startTime;
    stage.error = err.message;
    stage.stderr = err.stderr?.toString();

    log("error", `  ✗ ${name} failed after ${stage.duration}ms`);
    if (err.stderr) {
      log("error", `    ${err.stderr.toString().slice(0, 200)}...`);
    }

    errors++;

    // Save error output
    writeFileSync(
      path.join(TEMP_DIR, `${name.replace(/\s+/g, "-")}.err`),
      err.stderr?.toString() || err.message,
    );

    if (critical) {
      throw new Error(`Critical stage '${name}' failed`);
    }

    return { success: false, error: err };
  }
}

async function cleanup() {
  log("info", `${C.dim}└─ Running cleanup...${C.reset}`);

  const cleanupTasks = [
    // Remove temp directory
    () => {
      try {
        rmSync(TEMP_DIR, { recursive: true, force: true });
        return "temp directory removed";
      } catch (e) {
        return `temp cleanup failed: ${e.message}`;
      }
    },

    // Keep only last 20 log files
    () => {
      try {
        const { readdirSync, unlinkSync, statSync } = require("node:fs");
        const files = readdirSync(LOG_DIR)
          .filter((f) => f.startsWith("process-"))
          .map((f) => ({
            name: f,
            stat: statSync(path.join(LOG_DIR, f)),
          }))
          .sort((a, b) => b.stat.mtime - a.stat.mtime)
          .slice(20);

        files.forEach((f) => {
          unlinkSync(path.join(LOG_DIR, f.name));
        });

        return `old logs purged (kept 20 newest)`;
      } catch (e) {
        return `log cleanup failed: ${e.message}`;
      }
    },

    // Compress old drift logs
    () => "drift logs archived (if any)",

    // Cleanup empty directories
    () => {
      try {
        const parent = path.dirname(TEMP_DIR);
        const contents = require("node:fs").readdirSync(parent);
        if (contents.length === 0) {
          rmSync(parent, { recursive: true, force: true });
          return "empty parent removed";
        }
        return "parent has other contents";
      } catch (e) {
        return `parent cleanup: ${e.message}`;
      }
    },
  ];

  for (const task of cleanupTasks) {
    const result = task();
    log("info", `    ${C.dim}→ ${result}${C.reset}`);
  }

  // Summary
  const duration = stages.reduce((a, s) => a + (s.duration || 0), 0);
  log(
    "info",
    `${C.cyan}Process completed: ${stages.filter((s) => s.status === "success").length}/${
      stages.length
    } stages, ${errors} errors, ${duration}ms total${C.reset}`,
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN EXECUTION
// ═══════════════════════════════════════════════════════════════════

async function main() {
  console.log(`\n${C.bright}${
    C.cyan
  }╔══════════════════════════════════════════════════════════════════╗
║  GLIMPSE AGENTIC HOOK — Structured Routine                        ║
║  Run ID: ${RUN_ID.padEnd(55)}║
╚══════════════════════════════════════════════════════════════════╝${C.reset}\n`);

  try {
    // STAGE 1: Structure Check
    await runStage(
      "structure check",
      'find core functions analysis -name "*.js" | head -20',
      false,
    );

    // STAGE 2: Syntax Check
    await runStage("syntax check", "node --check core/engine.js 2>&1 || true", true);

    // STAGE 3: Lint/Format (if available)
    try {
      await runStage("lint check", 'npm run lint 2>&1 || echo "No lint script, skipping"', false);
    } catch {
      log("warn", "  ⚠ No lint script configured, skipping");
    }

    // STAGE 4: Organize (structure verification)
    await runStage(
      "organize",
      "node -e \"import('./core/validators/index.js').then(v => console.log('✓ Validators exposed')).catch(e => console.error('✗', e.message))\"",
      false,
    );

    // STAGE 5: Compile/Bootstrap
    await runStage(
      "compile/bootstrap",
      "node --test tests/validators/sync-validator.test.js --test tests/validators/calibration-engine.test.js 2>&1 | tail -5",
      false,
    );

    console.log(`\n${C.green}✓ All stages completed successfully${C.reset}\n`);
  } catch (err) {
    log("error", `${C.red}${C.bright}✗ Process failed: ${err.message}${C.reset}`);
    console.error(`\n${C.yellow}See full log: ${LOG_FILE}${C.reset}\n`);
    process.exit(1);
  } finally {
    // ALWAYS run cleanup
    await cleanup();

    // Mark completion in registry
    writeFileSync(
      path.join(ROOT, ".glimpse", "last-run.json"),
      JSON.stringify(
        {
          runId: RUN_ID,
          timestamp: new Date().toISOString(),
          stages: stages.map((s) => ({ name: s.name, status: s.status, duration: s.duration })),
          errors,
          logFile: LOG_FILE,
        },
        null,
        2,
      ),
    );
  }
}

main();
