/**
 * MCP Bridge — connects the Nuke UI to the running MCP server ecosystem.
 *
 * Strategy:
 *   1. If VITE_MCP_BRIDGE_URL is set, POST calls to that HTTP adapter.
 *   2. Otherwise, simulate with a delay and a console trace (dev scaffold mode).
 *
 * Bridge wire format:
 *   POST <BRIDGE_URL>/call
 *   Body: { server: string; tool: string; params?: object }
 *   Response: { content: Array<{ type: string; text: string }>; isError?: boolean }
 *
 * To run a local bridge that proxies fetch → stdio MCP:
 *   See nuke-bridge/server.ts (companion script, launches MCP via child_process.spawn).
 */

const BRIDGE_URL = (import.meta.env.VITE_MCP_BRIDGE_URL as string | undefined)?.replace(/\/$/, "");

export interface McpContent {
  type: string;
  text: string;
}

export interface McpResult {
  content: McpContent[];
  isError?: boolean;
}

/** Call an MCP tool through the bridge. Throws on network or bridge error. */
export async function callMcp(
  server: string,
  tool: string,
  params: Record<string, unknown> = {},
): Promise<McpResult> {
  if (!BRIDGE_URL) {
    // Simulation mode — log the would-be call and return a synthetic result
    const label = `${server}/${tool}`;
    console.info(`[mcp-bridge] sim → ${label}`, params);
    const delay = 500 + Math.random() * 400;
    await new Promise((r) => setTimeout(r, delay));
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ _simulated: true, server, tool, params }),
        },
      ],
    };
  }

  const res = await fetch(`${BRIDGE_URL}/call`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ server, tool, params }),
  });

  if (!res.ok) {
    throw new Error(`Bridge HTTP ${res.status}: ${await res.text()}`);
  }

  return res.json() as Promise<McpResult>;
}

/** Extract concatenated text from an McpResult. */
export function mcpText(result: McpResult): string {
  return result.content.map((c) => c.text).join("\n");
}

/** Parse the first JSON block from an McpResult. Returns null on parse failure. */
export function mcpJson<T = unknown>(result: McpResult): T | null {
  try {
    return JSON.parse(mcpText(result)) as T;
  } catch {
    return null;
  }
}

/** True if a bridge URL is configured (realtime mode). */
export const isBridged = !!BRIDGE_URL;
