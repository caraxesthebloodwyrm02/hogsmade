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
  };
}
