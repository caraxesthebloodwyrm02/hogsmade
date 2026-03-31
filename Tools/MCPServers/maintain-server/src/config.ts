import os from "os";
import path from "path";

function requiredPath(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return path.resolve(value);
}

export function getConfig() {
  const workspaceRoot = requiredPath("CASCADE_WORKSPACE_ROOT");
  const seedsRoot = requiredPath("SEEDS_ROOT");
  const configuredScanRoots = process.env.MAINTAIN_SCAN_ROOTS;

  return {
    workspaceRoot,
    seedsRoot,
    dataDir: path.resolve(
      process.env.MAINTAIN_DATA_DIR || path.join(os.homedir(), ".maintain-server"),
    ),
    scanRoots: (configuredScanRoots || `${workspaceRoot},${seedsRoot}`)
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => path.resolve(entry))
      .filter(Boolean),
  };
}
