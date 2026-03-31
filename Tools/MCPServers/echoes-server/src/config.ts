import os from "os";
import path from "path";

export function getConfig() {
  const dataDir = path.resolve(
    process.env.ECHOES_DATA_DIR?.trim() || path.join(os.homedir(), ".echoes"),
  );

  return {
    dataDir,
    auditLogPath: path.resolve(
      process.env.ECHOES_AUDIT_PATH?.trim() ||
        path.join(dataDir, "audit.ndjson"),
    ),
    telemetryDir: path.resolve(
      process.env.ECHOES_TELEMETRY_DIR?.trim() ||
        path.join(dataDir, "telemetry"),
    ),
    precedentsDir: path.resolve(
      process.env.ECHOES_PRECEDENTS_DIR?.trim() ||
        path.join(dataDir, "precedents"),
    ),
  };
}
