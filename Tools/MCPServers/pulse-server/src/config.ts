import os from "os";
import path from "path";

export function getConfig() {
  const pulseDataDir = path.resolve(
    process.env.PULSE_DATA_DIR?.trim() || path.join(os.homedir(), ".pulse"),
  );
  const echoesDataDir = path.resolve(
    process.env.ECHOES_DATA_DIR?.trim() || path.join(os.homedir(), ".echoes"),
  );
  const afloatDataDir = path.resolve(
    process.env.AFLOAT_DATA_DIR?.trim() || path.join(os.homedir(), ".afloat"),
  );
  const seedsDataDir = path.resolve(
    process.env.SEEDS_DATA_DIR?.trim() || path.join(os.homedir(), ".seeds-server"),
  );

  return {
    dataDir: pulseDataDir,
    journalDir: path.join(pulseDataDir, "journal"),
    focusDir: path.join(pulseDataDir, "focus"),
    digestsDir: path.join(pulseDataDir, "digests"),
    preferencesPath: path.resolve(
      process.env.PULSE_PREFERENCES_PATH?.trim() || path.join(pulseDataDir, "preferences.json"),
    ),
    echoesAuditPath: path.resolve(
      process.env.ECHOES_AUDIT_PATH?.trim() || path.join(echoesDataDir, "audit.ndjson"),
    ),
    echoesTelemetryDir: path.resolve(
      process.env.ECHOES_TELEMETRY_DIR?.trim() || path.join(echoesDataDir, "telemetry"),
    ),
    afloatWorkflowsDir: path.resolve(
      process.env.AFLOAT_WORKFLOWS_DIR?.trim() || path.join(afloatDataDir, "workflows"),
    ),
    afloatHistoryDir: path.resolve(
      process.env.AFLOAT_HISTORY_DIR?.trim() || path.join(afloatDataDir, "history"),
    ),
    seedsSnapshotsDir: path.resolve(
      process.env.SEEDS_SNAPSHOTS_DIR?.trim() || path.join(seedsDataDir, "snapshots"),
    ),
  };
}
