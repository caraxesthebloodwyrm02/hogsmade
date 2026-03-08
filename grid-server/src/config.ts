import path from "path";

function requiredPath(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return path.resolve(value);
}

export function getConfig() {
  const workspaceRoot = requiredPath("CASCADE_WORKSPACE_ROOT");
  const gateDir = requiredPath("GATE_DIR");
  const trustedSourcePartitions = (process.env.GATE_TRUSTED_SOURCE_PARTITIONS || path.parse(workspaceRoot).root)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return {
    workspaceRoot,
    gateDir,
    gridApiUrl: process.env.GRID_API_URL?.trim() || "",
    /** When set, validate_envelope verifies user_fingerprint via HMAC-SHA256 (same as create_test_envelope.py). */
    gateUserSecret: process.env.GATE_USER_SECRET?.trim() || "",
    trustedSourcePartitions,
    deploymentTargets: {
      "grid-server": { path: path.join(workspaceRoot, "grid-server"), port: 8080, permissions: ["deploy", "run_tests", "start_server", "write_results"] },
      "afloat-server": { path: path.join(workspaceRoot, "afloat-server"), port: 3000, permissions: ["deploy", "start_server"] },
      "echoes-server": { path: path.join(workspaceRoot, "echoes-server"), port: 8000, permissions: ["deploy", "run_tests", "start_server", "write_results"] },
      "lots-server": { path: path.join(workspaceRoot, "lots-server"), port: 8001, permissions: ["deploy", "run_tests"] },
      "experiments": { path: path.join(workspaceRoot, "experiments"), port: null as number | null, permissions: ["read_only", "run_tests", "write_results"] },
    },
  };
}
