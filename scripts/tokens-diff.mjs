#!/usr/bin/env node
/**
 * tokens-diff.mjs
 * Fails if .claude-plugin/assets/tokens.css has changed (vs HEAD or a base ref)
 * without a matching CHANGELOG.md entry for the current version.
 *
 * Usage:
 *   node scripts/tokens-diff.mjs [--base <ref>]   # default base: HEAD~1
 *
 * Exit codes:
 *   0  tokens.css unchanged, or changed with a CHANGELOG entry present.
 *   1  tokens.css changed without a CHANGELOG entry — block the PR.
 */

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const baseIdx = args.indexOf("--base");
const BASE_REF = baseIdx !== -1 ? args[baseIdx + 1] : "HEAD~1";

const TOKENS_PATH = ".claude-plugin/assets/tokens.css";
const CHANGELOG_PATH = "CHANGELOG.md";

function git(cmd) {
  try {
    return execSync(`git -C ${ROOT} ${cmd}`, { encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
}

// Check if tokens.css changed between BASE_REF and HEAD
const diff = git(`diff --name-only ${BASE_REF} HEAD -- "${TOKENS_PATH}"`);
if (!diff.includes(TOKENS_PATH)) {
  console.log(`tokens-diff: tokens.css unchanged since ${BASE_REF} — OK`);
  process.exit(0);
}

console.log(`tokens-diff: tokens.css changed since ${BASE_REF} — checking CHANGELOG.md`);

// Read CHANGELOG.md and look for an [Unreleased] or versioned section
const changelogPath = path.join(ROOT, CHANGELOG_PATH);
if (!existsSync(changelogPath)) {
  console.error(`tokens-diff: FAIL — CHANGELOG.md not found`);
  process.exit(1);
}

const changelog = readFileSync(changelogPath, "utf-8");

// Accept if CHANGELOG has an [Unreleased] section with content, or any versioned entry
// added since BASE_REF (by checking if the diff of CHANGELOG is non-empty)
const changelogDiff = git(`diff ${BASE_REF} HEAD -- "${CHANGELOG_PATH}"`);
if (!changelogDiff) {
  console.error(
    `tokens-diff: FAIL — tokens.css changed but CHANGELOG.md has no new entry.\n` +
      `Add a CHANGELOG entry under [Unreleased] or a new version section before merging.`,
  );
  process.exit(1);
}

// Verify the changelog diff adds at least one design/token-related keyword
const designKeywords = ["token", "design", "css", "color", "theme", "density", "font", "asset"];
const hasDesignEntry = designKeywords.some((k) => changelogDiff.toLowerCase().includes(k));

if (!hasDesignEntry) {
  console.error(
    `tokens-diff: FAIL — CHANGELOG.md changed, but no design/token keyword found in the diff.\n` +
      `Ensure the entry mentions what changed in tokens.css (color, theme, spacing, etc.).`,
  );
  process.exit(1);
}

console.log(`tokens-diff: PASS — tokens.css change covered by CHANGELOG entry`);
process.exit(0);
