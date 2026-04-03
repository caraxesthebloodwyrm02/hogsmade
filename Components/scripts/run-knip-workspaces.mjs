#!/usr/bin/env node
/**
 * Run knip per npm workspace so analysis stays scoped (avoids scanning GRID submodule, viz, etc.).
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
/** Skip `Applications/*` — Vite/Rollup extensions confuse knip; MCP + shared libs are the main hygiene target. */
const workspaces = (pkg.workspaces ?? []).filter((w) => !w.startsWith("Applications/"));

let failed = false;
for (const pattern of workspaces) {
  if (pattern.includes("*")) {
    console.error("run-knip-workspaces: glob workspaces not supported; list packages explicitly.");
    process.exit(1);
  }
  try {
    execSync(
      `npx --yes knip@5.50.0 --workspace "${pattern}" --no-progress --exclude exports,types,nsExports,nsTypes`,
      {
        cwd: root,
        stdio: "inherit",
        shell: "/bin/bash",
      },
    );
  } catch {
    failed = true;
  }
}

if (failed) process.exit(1);
