import os from "os";
import path from "path";

function requiredPath(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return path.resolve(value);
}

function parseConfiguredRoots(): string[] {
  const configuredRoots = process.env.SEEDS_ROOTS?.trim();
  if (configuredRoots) {
    return configuredRoots
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => path.resolve(entry));
  }

  return [requiredPath("SEEDS_ROOT")];
}

export function getConfig() {
  return {
    seedsRoot: parseConfiguredRoots()[0],
    seedsRoots: parseConfiguredRoots(),
    dataDir: path.resolve(process.env.SEEDS_DATA_DIR || path.join(os.homedir(), ".seeds-server")),
  };
}
