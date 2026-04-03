import os from "os";
import path from "path";

export function getConfig() {
  const echoesDataDir = path.resolve(
    process.env.ECHOES_DATA_DIR?.trim() || path.join(os.homedir(), ".echoes"),
  );
  const seedsDataDir = path.resolve(
    process.env.SEEDS_DATA_DIR?.trim() || path.join(os.homedir(), ".seeds-server"),
  );
  const pulseDataDir = path.resolve(
    process.env.PULSE_DATA_DIR?.trim() || path.join(os.homedir(), ".pulse"),
  );
  const afloatDataDir = path.resolve(
    process.env.AFLOAT_DATA_DIR?.trim() || path.join(os.homedir(), ".afloat"),
  );
  const overviewDataDir = path.resolve(
    process.env.OVERVIEW_DATA_DIR?.trim() || path.join(os.homedir(), ".overview-server"),
  );

  return {
    workspaceRoot:
      process.env.CASCADE_WORKSPACE_ROOT?.trim() || path.join(os.homedir(), "CascadeProjects"),
    seedsRoot: process.env.SEEDS_ROOT?.trim() || path.join(os.homedir(), "seed"),
    echoesAuditPath: path.resolve(
      process.env.ECHOES_AUDIT_PATH?.trim() || path.join(echoesDataDir, "audit.ndjson"),
    ),
    seedsSnapshotsDir: path.resolve(
      process.env.SEEDS_SNAPSHOTS_DIR?.trim() || path.join(seedsDataDir, "snapshots"),
    ),
    pulseJournalDir: path.resolve(
      process.env.PULSE_JOURNAL_DIR?.trim() || path.join(pulseDataDir, "journal"),
    ),
    pulseFocusDir: path.resolve(
      process.env.PULSE_FOCUS_DIR?.trim() || path.join(pulseDataDir, "focus"),
    ),
    afloatHistoryDir: path.resolve(
      process.env.AFLOAT_HISTORY_DIR?.trim() || path.join(afloatDataDir, "history"),
    ),
    gateDir: path.resolve(
      process.env.GATE_DIR?.trim() || path.join(os.homedir(), "CascadeProjects", "GATE"),
    ),
    dataDir: overviewDataDir,
  };
}
