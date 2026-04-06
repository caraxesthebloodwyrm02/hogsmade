import os from "os";
import path from "path";

export function getConfig() {
  const dataDir = path.resolve(
    process.env.AFLOAT_DATA_DIR?.trim() || path.join(os.homedir(), ".afloat"),
  );

  return {
    dataDir,
    workflowsDir: path.resolve(
      process.env.AFLOAT_WORKFLOWS_DIR?.trim() || path.join(dataDir, "workflows"),
    ),
    historyDir: path.resolve(
      process.env.AFLOAT_HISTORY_DIR?.trim() || path.join(dataDir, "history"),
    ),
    // Allowed roots for command execution safety (P-MCP-001, P-MCP-005)
    allowedRoots: [
      process.env.AFLOAT_ALLOWED_ROOTS
        ? path.resolve(process.env.AFLOAT_ALLOWED_ROOTS.trim())
        : path.join(os.homedir(), "CascadeProjects"),
    ],
  };
}
