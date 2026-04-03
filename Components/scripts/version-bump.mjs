#!/usr/bin/env node
/**
 * Version bump script for hogsmade monorepo
 * Usage: node scripts/version-bump.mjs [patch|minor|major]
 */

import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

const validBumps = ["patch", "minor", "major"];
const bump = process.argv[2] || "patch";

if (!validBumps.includes(bump)) {
  console.error(`Invalid bump type: ${bump}. Use: patch, minor, major`);
  process.exit(1);
}

// Read root package.json
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const current = pkg.version;
const [major, minor, patch] = current.split(".").map(Number);

let newVersion;
if (bump === "major") newVersion = `${major + 1}.0.0`;
else if (bump === "minor") newVersion = `${major}.${minor + 1}.0`;
else newVersion = `${major}.${minor}.${patch + 1}`;

console.log(`Bumping: ${current} → ${newVersion}`);

// Update root package.json
pkg.version = newVersion;
writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");

// Update CHANGELOG.md
try {
  const today = new Date().toISOString().split("T")[0];
  const changelog = readFileSync("CHANGELOG.md", "utf8");
  const unreleased = "## [Unreleased]";
  const newSection = `## [Unreleased]\n\n## [${newVersion}] - ${today}`;
  const updated = changelog.replace(unreleased, newSection);
  writeFileSync("CHANGELOG.md", updated);
  console.log("✅ CHANGELOG.md updated");
} catch (e) {
  console.warn("⚠️  CHANGELOG.md not updated:", e.message);
}

console.log(`✅ Version bumped to ${newVersion}`);
console.log("Next steps:");
console.log("  git add package.json CHANGELOG.md");
console.log(`  git commit -m "chore(release): bump version to ${newVersion}"`);
console.log(`  git tag v${newVersion}`);
console.log("  git push && git push --tags");
