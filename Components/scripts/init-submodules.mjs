#!/usr/bin/env node
// Fail-soft submodule bootstrap.
//
// After `npm install`, initialize git submodules so a fresh clone
// has a populated `Projects/GRID-main/` checkout without a manual
// `git submodule update --init --recursive` step.
//
// This script is intentionally fail-soft: it must never break
// `npm install`. It will skip silently when:
//   * CASCADE_SKIP_SUBMODULES=1 is set (for environments that bootstrap
//     submodules out-of-band, e.g. GitHub Actions with
//     actions/checkout submodules: true);
//   * the working tree is not a git repository (e.g. npm pack or
//     a source tarball install);
//   * there is no .gitmodules file;
//   * every submodule listed in .gitmodules already has a populated
//     working directory;
//   * `git submodule update` exits non-zero (we print a warning and
//     tell the user how to run it manually).

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..", "..");

function log(msg) {
  console.log(`[init-submodules] ${msg}`);
}

function warn(msg) {
  console.warn(`[init-submodules] ${msg}`);
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: "pipe", encoding: "utf8", ...opts });
}

function tryRun(cmd, args, opts = {}) {
  try {
    return { ok: true, stdout: run(cmd, args, opts) };
  } catch (err) {
    return {
      ok: false,
      error: err,
      stdout: err.stdout?.toString?.() ?? "",
      stderr: err.stderr?.toString?.() ?? "",
    };
  }
}

function parseGitmodulesPaths(contents) {
  // Minimal parser: pull out every `path = ...` line. Order preserved.
  const paths = [];
  for (const line of contents.split(/\r?\n/)) {
    const m = line.match(/^\s*path\s*=\s*(.+?)\s*$/);
    if (m) paths.push(m[1]);
  }
  return paths;
}

function isPopulated(submodulePath) {
  // A populated submodule has at least one tracked file on disk.
  // We approximate that by checking for any entry other than `.git`.
  const full = join(REPO_ROOT, submodulePath);
  if (!existsSync(full)) return false;
  try {
    const entries = run("ls", ["-A", full]).split("\n").filter(Boolean);
    return entries.some((e) => e !== ".git");
  } catch {
    return false;
  }
}

function main() {
  if (process.env.CASCADE_SKIP_SUBMODULES === "1") {
    log("CASCADE_SKIP_SUBMODULES=1 — skipping submodule bootstrap.");
    return 0;
  }

  const gitmodulesPath = join(REPO_ROOT, ".gitmodules");
  if (!existsSync(gitmodulesPath)) {
    // No submodules declared; nothing to do. Do not warn — most
    // installs of this package will not be from a git checkout.
    return 0;
  }

  const dotGit = join(REPO_ROOT, ".git");
  if (!existsSync(dotGit)) {
    // Installed from tarball / npm pack — not a git working tree.
    log("No .git directory; skipping submodule bootstrap (not a git checkout).");
    return 0;
  }

  const gitAvailable = tryRun("git", ["--version"]);
  if (!gitAvailable.ok) {
    warn("git binary not found on PATH; skipping submodule bootstrap.");
    warn("To bootstrap manually: git submodule update --init --recursive");
    return 0;
  }

  const submodulePaths = parseGitmodulesPaths(readFileSync(gitmodulesPath, "utf8"));
  if (submodulePaths.length === 0) {
    return 0;
  }

  const missing = submodulePaths.filter((p) => !isPopulated(p));
  if (missing.length === 0) {
    log(`All ${submodulePaths.length} submodule(s) already populated; nothing to do.`);
    return 0;
  }

  log(`Bootstrapping ${missing.length} submodule(s): ${missing.join(", ")}`);
  const result = tryRun("git", ["submodule", "update", "--init", "--recursive"], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (!result.ok) {
    warn("`git submodule update --init --recursive` exited non-zero.");
    warn("Install will continue; some features may require the missing submodule(s).");
    warn("To bootstrap manually after install: git submodule update --init --recursive");
    return 0;
  }

  const stillMissing = submodulePaths.filter((p) => !isPopulated(p));
  if (stillMissing.length > 0) {
    warn(`Submodule(s) still not populated after update: ${stillMissing.join(", ")}`);
    warn("This can happen behind a proxy or without network access to the submodule host.");
    warn("To retry manually: git submodule update --init --recursive");
  } else {
    log("Submodules bootstrapped successfully.");
  }
  return 0;
}

process.exit(main());
