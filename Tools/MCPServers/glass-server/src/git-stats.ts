import { execSync } from "child_process";

let cachedLines = 0;
let cachedAt = 0;
const CACHE_TTL_MS = 30_000;

export function computeGitDiffLines(workspace: string | null): number {
  if (!workspace) return 0;

  const now = Date.now();
  if (now - cachedAt < CACHE_TTL_MS) return cachedLines;

  try {
    const output = execSync("git diff --stat", {
      cwd: workspace,
      encoding: "utf-8",
      timeout: 3_000,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const lines = output.trim().split("\n");
    const summary = lines[lines.length - 1] ?? "";
    const insertions = summary.match(/(\d+) insertion/);
    const deletions = summary.match(/(\d+) deletion/);
    cachedLines =
      (insertions ? parseInt(insertions[1], 10) : 0) + (deletions ? parseInt(deletions[1], 10) : 0);
  } catch {
    cachedLines = 0;
  }

  cachedAt = now;
  return cachedLines;
}

export function resetGitStatsCache(): void {
  cachedLines = 0;
  cachedAt = 0;
}
