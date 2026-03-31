/**
 * Overview Server — Checkpoint Trust Instrument MCP Server
 *
 * A read-only aggregator that composes data from all existing file-based
 * sources into a single `checkpoint` tool call. Returns structured JSON
 * with trajectory, cluster health, drift detection, and evidence-backed
 * trust signals.
 *
 * Data flow:
 *   ~/.echoes/audit.ndjson ──────┐
 *   ~/.seeds-server/snapshots/ ──┤
 *   ~/.pulse/journal/ ───────────┤──→ checkpoint ──→ Checkpoint JSON
 *   ~/.pulse/focus/ ─────────────┤
 *   ~/.afloat/history/ ──────────┘
 */

import { emitAudit } from "@cascade/shared-types/audit-client";
import { SessionRateLimiter } from "@cascade/shared-types/session-rate-limit";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { promises as fs } from "fs";
import { pathToFileURL } from "url";
import * as z from "zod";
import { aggregateCheckpoint } from "./checkpoint.js";
import { getConfig } from "./config.js";

// ── Constants ──

const SERVER_NAME = "overview-server";
const VERSION = "1.0.0";
const config = getConfig();
const readLimiter = new SessionRateLimiter();

// ── Data Layer ──

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(config.dataDir, { recursive: true });
}

// ── Server Builder ──

export function buildServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: VERSION,
  });

  // ── health_check ──

  server.tool(
    "health_check",
    "Check overview-server health and data source connectivity",
    {},
    async () => {
      const startMs = Date.now();

      try {
        const sourcePaths = [
          { name: "echoes-audit", path: config.echoesAuditPath },
          { name: "seeds-snapshots", path: config.seedsSnapshotsDir },
          { name: "pulse-journal", path: config.pulseJournalDir },
          { name: "pulse-focus", path: config.pulseFocusDir },
          { name: "afloat-history", path: config.afloatHistoryDir },
        ];

        const sourceChecks = await Promise.all(
          sourcePaths.map(async (s) => {
            try {
              await fs.access(s.path);
              return { name: s.name, reachable: true };
            } catch {
              return { name: s.name, reachable: false };
            }
          }),
        );

        emitAudit({
          source: SERVER_NAME,
          tool: "health_check",
          status: "success",
          durationMs: Date.now() - startMs,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  status: "healthy",
                  server: SERVER_NAME,
                  version: VERSION,
                  timestamp: new Date().toISOString(),
                  dataDir: config.dataDir,
                  dataSources: sourceChecks,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        emitAudit({
          source: SERVER_NAME,
          tool: "health_check",
          status: "error",
          durationMs: Date.now() - startMs,
          metadata: { error: String(error) },
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Health check failed",
                details: String(error),
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // ── checkpoint ──

  server.tool(
    "checkpoint",
    "Generate a checkpoint assessment — answers 'Where do I stand right now?' with trajectory, cluster health, drift detection, and trust signals",
    {
      focus: z
        .string()
        .optional()
        .describe(
          "Zoom into a specific cluster: 'grid-family', 'mcp-infrastructure', 'deployment-pipeline', 'canopy-apps', 'glimpse-family', 'seed-archive', or a repo name",
        ),
      since: z
        .string()
        .optional()
        .describe(
          "ISO 8601 timestamp — only consider changes since this time. Defaults to 24 hours ago",
        ),
      depth: z
        .enum(["summary", "standard", "deep"])
        .optional()
        .describe(
          "Controls detail level. 'summary' for one-screen, 'deep' for full drill-down. Default: standard",
        ),
    },
    async ({ focus, since, depth }) => {
      const rlMsg = readLimiter.check("checkpoint");
      if (rlMsg) return { content: [{ type: "text" as const, text: JSON.stringify({ error: rlMsg }) }], isError: true };
      const startMs = Date.now();

      try {
        const checkpoint = await aggregateCheckpoint({ focus, since, depth });

        emitAudit({
          source: SERVER_NAME,
          tool: "checkpoint",
          status: "success",
          durationMs: Date.now() - startMs,
          metadata: {
            focus: focus ?? null,
            depth: depth ?? "standard",
            trustLegacyScore: checkpoint.trust.legacyScore,
            trustRelationshipCount: checkpoint.trust.relationships.length,
            driftSeverity: checkpoint.drift.severity,
            trajectory: checkpoint.trajectory.direction,
          },
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(checkpoint, null, 2),
            },
          ],
        };
      } catch (error) {
        emitAudit({
          source: SERVER_NAME,
          tool: "checkpoint",
          status: "error",
          durationMs: Date.now() - startMs,
          metadata: { error: String(error) },
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Checkpoint generation failed",
                details: String(error),
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  return server;
}

// ── Start ──

export async function startServer(): Promise<McpServer> {
  await ensureDataDir();
  console.error(`[${SERVER_NAME}] v${VERSION} starting`);
  const server = buildServer();
  await server.connect(new StdioServerTransport());
  return server;
}

const isEntrypoint =
  process.argv[1] != null &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isEntrypoint) {
  async function main() {
    try {
      await startServer();
    } catch (error) {
      console.error(`[${SERVER_NAME}] failed to start`, error);
      process.exit(1);
    }
  }

  void main();
}
