import path from "path";

function resolveEnvPath(name: string, defaultValue: string): string {
  const value = process.env[name]?.trim();
  return path.resolve(value || defaultValue);
}

export function getConfig() {
  return {
    mangroveWorkspaceRoot: resolveEnvPath(
      "MANGROVE_WORKSPACE_ROOT",
      "/mnt/arch_data/home/caraxes/CascadeProjects",
    ),
    gruffWorkspacePath: resolveEnvPath("GRUFF_WORKSPACE_PATH", "/home/irfankabir/gruff/workspace"),
  };
}
