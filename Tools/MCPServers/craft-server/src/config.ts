/**
 * Craft-server configuration module.
 *
 * Reads environment variables for:
 * - GRUFF_WORKSPACE_PATH — path to the gruff workspace
 * - ECHOES_BRIDGE_URL    — URL of the Echoes bridge for proportion payloads
 */

export interface CraftConfig {
  gruffWorkspacePath: string;
  echoesBridgeUrl: string;
}

export function getConfig(): CraftConfig {
  return {
    gruffWorkspacePath:
      process.env.GRUFF_WORKSPACE_PATH?.trim() || "/home/irfankabir/gruff/workspace",
    echoesBridgeUrl: process.env.ECHOES_BRIDGE_URL?.trim() || "http://localhost:8001",
  };
}
