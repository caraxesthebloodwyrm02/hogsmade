/**
 * Harness Server — Configuration
 */

import * as path from "node:path";
import * as os from "node:os";

export interface HarnessConfig {
  dataDir: string;
  scenariosFile: string;
  signalsFile: string;
  agentStateFile: string;
  manifestDir: string;
  pythonHarnessRoot: string;
  gateDir: string;
  echoesAuditPath: string;
  gridApiUrl: string;
}

export function getConfig(): HarnessConfig {
  const dataDir = process.env.HARNESS_DATA_DIR ?? path.join(os.homedir(), ".harness-server");

  const gateDir = process.env.GATE_DIR ?? path.join(os.homedir(), "CascadeProjects/Projects/GATE");

  const manifestDir = process.env.HARNESS_MANIFEST_DIR ?? path.join(gateDir, "harness/manifests");

  const pythonHarnessRoot =
    process.env.HARNESS_PYTHON_ROOT ?? path.join(gateDir, "harness/src/harness");

  return {
    dataDir,
    scenariosFile: path.join(dataDir, "scenarios.json"),
    signalsFile: path.join(dataDir, "signals.ndjson"),
    agentStateFile: path.join(dataDir, "agent-state.json"),
    manifestDir,
    pythonHarnessRoot,
    gateDir,
    echoesAuditPath:
      process.env.ECHOES_AUDIT_PATH ?? path.join(os.homedir(), ".echoes/audit.ndjson"),
    gridApiUrl: process.env.GRID_API_URL ?? "http://localhost:8080",
  };
}
