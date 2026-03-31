#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPreflightReport } from "./grid-admission-preflight.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

function usage() {
  console.error(
    [
      "Usage:",
      "  node scripts/grid-admission-gate.mjs -- <command> [args...]",
      "",
      "Examples:",
      "  node scripts/grid-admission-gate.mjs -- npm --prefix grid-server run start",
      "  node scripts/grid-admission-gate.mjs -- node -e \"console.log('admission ready')\"",
    ].join("\n"),
  );
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
    ...options,
  });

  if (result.error) {
    console.error(`[grid-admission-gate] Failed to run '${command}': ${result.error.message}`);
    return 1;
  }

  if (typeof result.status === "number") {
    return result.status;
  }

  if (result.signal) {
    console.error(`[grid-admission-gate] Command terminated by signal: ${result.signal}`);
    return 1;
  }

  return 1;
}

async function main() {
  const argv = process.argv.slice(2);
  const separator = argv.indexOf("--");
  const commandArgs = separator >= 0 ? argv.slice(separator + 1) : argv;

  if (commandArgs.length === 0) {
    usage();
    process.exit(2);
  }

  const report = await createPreflightReport();
  if (!report.pass) {
    console.error(JSON.stringify(report, null, 2));
    console.error("[grid-admission-gate] Preflight failed. Command was not executed.");
    process.exit(1);
  }

  const [command, ...args] = commandArgs;
  const commandExit = run(command, args);
  process.exit(commandExit);
}

await main();
