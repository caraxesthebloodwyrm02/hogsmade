#!/usr/bin/env node
/**
 * Generate release notes from conventional commits
 */

import { execSync } from "child_process";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const currentVersion = pkg.version;

try {
  const lastTag = execSync("git describe --tags --abbrev=0 HEAD~1 2>/dev/null", {
    encoding: "utf8",
  }).trim();

  const commits = execSync(`git log ${lastTag}..HEAD --pretty=format:"%s|%h|%an" --no-merges`, {
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);

  const categories = {
    feat: [],
    fix: [],
    security: [],
    ci: [],
    docs: [],
    chore: [],
    other: [],
  };

  for (const line of commits) {
    const [msg, hash, author] = line.split("|");
    const type = msg.match(/^([a-z]+)/)?.[1] || "other";
    const clean = msg.replace(/^([a-z]+)(\([^)]+\))?:\s*/, "");
    const entry = `- ${clean} (${hash})`;

    if (categories[type]) categories[type].push(entry);
    else categories.other.push(entry);
  }

  console.log(`# hogsmade v${currentVersion} Release Notes\n`);

  for (const [cat, items] of Object.entries(categories)) {
    if (items.length === 0) continue;
    const header =
      cat === "feat"
        ? "Features"
        : cat === "fix"
          ? "Bug Fixes"
          : cat === "security"
            ? "Security"
            : cat === "ci"
              ? "CI/CD"
              : cat === "docs"
                ? "Documentation"
                : cat === "chore"
                  ? "Chores"
                  : "Other";
    console.log(`## ${header}`);
    console.log(items.join("\n"));
    console.log();
  }
} catch (e) {
  console.log("No previous tag found. Run with first release.");
}
