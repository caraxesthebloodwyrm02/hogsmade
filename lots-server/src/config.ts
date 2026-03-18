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
  const echoesDataDir = path.resolve(
    process.env.ECHOES_DATA_DIR?.trim() || path.join(os.homedir(), ".echoes"),
  );
  const seedsDataDir = path.resolve(
    process.env.SEEDS_DATA_DIR?.trim() ||
    path.join(os.homedir(), ".seeds-server"),
  );
  const afloatDataDir = path.resolve(
    process.env.AFLOAT_DATA_DIR?.trim() || path.join(os.homedir(), ".afloat"),
  );

  return {
    experimentsDir: requiredPath("LOTS_EXPERIMENTS_DIR"),
    enableExperimentRun:
      process.env.LOTS_ENABLE_EXPERIMENT_RUN?.trim().toLowerCase() === "true",
    echoesAuditPath: path.resolve(
      process.env.ECHOES_AUDIT_PATH?.trim() ||
      path.join(echoesDataDir, "audit.ndjson"),
    ),
    seedsSnapshotsDir: path.resolve(
      process.env.SEEDS_SNAPSHOTS_DIR?.trim() ||
      path.join(seedsDataDir, "snapshots"),
    ),
    afloatHistoryDir: path.resolve(
      process.env.AFLOAT_HISTORY_DIR?.trim() ||
      path.join(afloatDataDir, "history"),
    ),
  };
}
