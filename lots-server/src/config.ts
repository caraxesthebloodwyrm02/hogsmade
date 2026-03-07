import path from "path";

function requiredPath(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return path.resolve(value);
}

export function getConfig() {
  return {
    experimentsDir: requiredPath("LOTS_EXPERIMENTS_DIR"),
  };
}
