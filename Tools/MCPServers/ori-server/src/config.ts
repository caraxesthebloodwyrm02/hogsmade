import os from "os";
import path from "path";

export function getConfig() {
  const oriDataDir = path.resolve(
    process.env.ORI_DATA_DIR?.trim() || path.join(os.homedir(), ".ori"),
  );
  const echoesDataDir = path.resolve(
    process.env.ECHOES_DATA_DIR?.trim() || path.join(os.homedir(), ".echoes"),
  );

  return {
    dataDir: oriDataDir,
    logDir: path.join(oriDataDir, "logs"),
    probeDir: path.join(oriDataDir, "probes"),
    recommendationsDir: path.join(oriDataDir, "recommendations"),
    registryDir: path.join(oriDataDir, "registry"),
    runsDir: path.join(oriDataDir, "runs"),
    reportsDir: path.join(oriDataDir, "reports"),
    threatModelDir: path.join(oriDataDir, "threat-model"),
    notebookDir: path.join(oriDataDir, "notebook"),
    echoesAuditPath: path.resolve(
      process.env.ECHOES_AUDIT_PATH?.trim() || path.join(echoesDataDir, "audit.ndjson"),
    ),
    preferencesPath: path.resolve(
      process.env.ORI_PREFERENCES_PATH?.trim() || path.join(oriDataDir, "preferences.json"),
    ),
    cascadeRoot: path.resolve(
      process.env.CASCADE_WORKSPACE_ROOT?.trim() || path.join(os.homedir(), "CascadeProjects"),
    ),
  };
}
