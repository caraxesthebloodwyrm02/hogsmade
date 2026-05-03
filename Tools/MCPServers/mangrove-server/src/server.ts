/**
 * Mangrove Server — Ecosystem Navigation & Operational Awareness MCP Server
 *
 * The Mangrove is the ecosystem's navigation layer. Like a hiker clearing dried
 * leaves from the path, Mangrove interprets and optimizes the path currently being
 * navigated, applying best practices and ecosystem-level orientation.
 *
 * This server provides:
 * - Ecosystem health awareness via health_check
 * - Path-clearing and orientation signal collection (future)
 * - Best-practice enforcement across the Mangrove ecosystem (future)
 *
 * Intentionally minimal right now — tools will be added as ecosystem navigation
 * patterns emerge. The Mangrove grows with the forest.
 *
 * Built by Prince (Irfan Kabir)
 */

import { emitAudit } from "@cascade/shared-types/audit-client";
import { generateId } from "@cascade/shared-types/id";
import { McpLogger } from "@cascade/shared-types/mcp-logger";
import {
  type TraceContext,
  createRootSpan,
  extractTrace,
} from "@cascade/shared-types/trace-context";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import path from "path";
import { pathToFileURL } from "url";
import { getConfig } from "./config.js";

// ── Constants ──

const SERVER_NAME = "mangrove-server";
const VERSION = "1.0.0";
const logger = new McpLogger(SERVER_NAME);
const config = getConfig();
const MANGROVE_WORKSPACE_ROOT = config.mangroveWorkspaceRoot;
const GRUFF_WORKSPACE_PATH = config.gruffWorkspacePath;

// ── Server Builder ──

export function buildServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: VERSION,
  });
  // Avoid deep generic inference cost from complex schemas.
  const registerTool = server.registerTool.bind(server) as any;

  // Health check — the compass bearing of the Mangrove
  registerTool(
    "health_check",
    { description: "Check mangrove-server health and operational readiness" },
    async (_params: unknown, extra?: { traceContext?: TraceContext }) => {
      const rootSpan = createRootSpan("mangrove:health_check", {
        server: SERVER_NAME,
        version: VERSION,
        workspace: MANGROVE_WORKSPACE_ROOT,
      });
      const ctx = extractTrace(extra?.traceContext ?? {}, rootSpan.span);

      const id = generateId();
      const timestamp = new Date().toISOString();

      await emitAudit({
        timestamp,
        source: SERVER_NAME,
        tool: "health_check",
        status: "success",
        metadata: {
          correlationId: id,
          traceId: ctx?.traceId ?? rootSpan.traceId,
          spanId: ctx?.spanId ?? rootSpan.spanId,
        },
      });

      const payload = {
        status: "ok",
        server: SERVER_NAME,
        version: VERSION,
        mangroveWorkspaceRoot: MANGROVE_WORKSPACE_ROOT,
        gruffWorkspacePath: GRUFF_WORKSPACE_PATH,
        timestamp,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
      };
    },
  );

  // NEXT: path_orient — ecosystem navigation signal collection
  // NEXT: clear_path — best-practice enforcement activation

  return server;
}

// ── Server Lifecycle ──

export async function startServer(): Promise<McpServer> {
  logger.info(
    `v${VERSION} starting — workspace: ${MANGROVE_WORKSPACE_ROOT}, gruff: ${GRUFF_WORKSPACE_PATH}`,
  );
  const server = buildServer();
  await server.connect(new StdioServerTransport());
  return server;
}

// ── Entrypoint ──

const isEntrypoint =
  process.argv[1] != null && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isEntrypoint) {
  async function main() {
    try {
      await startServer();
    } catch (error) {
      logger.error(`failed to start`, { error: String(error) });
      process.exit(1);
    }
  }

  main();
}
