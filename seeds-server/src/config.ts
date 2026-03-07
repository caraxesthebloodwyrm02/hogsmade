import path from "path";
import os from "os";

function requiredPath(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return path.resolve(value);
}

export function getConfig() {
  return {
    seedsRoot: requiredPath("SEEDS_ROOT"),
    dataDir: path.resolve(process.env.SEEDS_DATA_DIR || path.join(os.homedir(), ".seeds-server")),
  };
}
