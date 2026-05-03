/**
 * Craft Server — Consolidated Gruff Toolbelt MCP Server
 *
 * Wraps the gruff CLI toolset as MCP tools for:
 * - Trust routing (actor profiles, route policy resolution)
 * - Routine execution (list, dry-run, execute)
 * - Actor management (list with trust scores)
 * - State snapshot generation
 * - Echoes bridge proportion sending
 *
 * Follows the same patterns as seeds-server, echoes-server, grid-server, etc.
 */

import { emitAudit } from "@cascade/shared-types/audit-client";
import { generateId } from "@cascade/shared-types/id";
import { McpLogger } from "@cascade/shared-types/mcp-logger";
import { SessionRateLimiter } from "@cascade/shared-types/session-rate-limit";
import {
  type TraceContext,
  createChildSpan,
  createRootSpan,
  extractTrace,
} from "@cascade/shared-types/trace-context";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "url";
import * as z from "zod";
import { getConfig } from "./config.js";

// ── Constants ──

const SERVER_NAME = "craft-server";
const VERSION = "1.0.0";
const logger = new McpLogger(SERVER_NAME);
const config = getConfig();
const GRUFF_WORKSPACE = config.gruffWorkspacePath;
const ECHOES_BRIDGE_URL = config.echoesBridgeUrl;
const readLimiter = new SessionRateLimiter();

// ── Gruff module loader ─────────────────────────────────────────────────────

/**
 * Lazily load a gruff module from the configured workspace.
 * Uses dynamic import() so we never shell out to the CLI —
 * we call the exported functions directly.
 */
async function loadGruffModule(relativePath: string): Promise<Record<string, unknown>> {
  const fullPath = `${GRUFF_WORKSPACE}/src/${relativePath}`;
  try {
    return (await import(fullPath)) as Record<string, unknown>;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to load gruff module "${relativePath}" from ${GRUFF_WORKSPACE}: ${message}. ` +
        `Is GRUFF_WORKSPACE_PATH set correctly and the workspace bootstrapped?`,
    );
  }
}

// ── Gruff-proportion-v1 schema ──────────────────────────────────────────────

const GruffProportionSchema = z.object({
  schemaVersion: z.string().describe("Schema version — should be 'gruff-proportion-v1'"),
  generatedAt: z.string().describe("ISO-8601 timestamp of generation"),
  audioDrive: z.record(z.string(), z.unknown()).optional().describe("Audio drive map"),
  theta: z.number().optional().describe("Theta parameter"),
  weights: z.record(z.string(), z.number()).optional().describe("Model weights"),
  sequence: z.record(z.string(), z.unknown()).optional().describe("Sequence definition"),
  manifest: z.record(z.string(), z.unknown()).optional().describe("Manifest data"),
  compass: z.record(z.string(), z.unknown()).optional().describe("Compass direction data"),
  provenance: z.record(z.string(), z.unknown()).optional().describe("Provenance metadata"),
});

// ── Safe wrapper: handles uninitialized DB errors ────────────────────────────

function isDbNotInitialized(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("no such table") ||
    msg.includes("SQLITE_ERROR") ||
    msg.includes("ENOENT") ||
    msg.includes("SQLITE_CANTOPEN") ||
    msg.includes("no such database") ||
    msg.includes("database is locked")
  );
}

function formatDbError(err: unknown): string {
  if (isDbNotInitialized(err)) {
    return (
      `Gruff trust database is not initialized. Please run "gruff init" from the ` +
      `gruff workspace at ${GRUFF_WORKSPACE} to bootstrap the database, or set ` +
      `GRUFF_WORKSPACE_PATH to point to a valid gruff installation.`
    );
  }
  const msg = err instanceof Error ? err.message : String(err);
  return `Gruff operation failed: ${msg}`;
}

// ── Build the MCP server ────────────────────────────────────────────────────

export function buildServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: VERSION,
  });
  // Avoid deep generic inference cost from complex schemas.
  const registerTool = server.registerTool.bind(server) as any;

  // ── health_check ─────────────────────────────────────────────────────────

  registerTool(
    "health_check",
    {
      description: "Check craft-server health and gruff workspace status",
    },
    async () => {
      let gruffDbStatus = "unknown";
      let actorCount: number | null = null;

      try {
        const dbModule = await loadGruffModule("trust/db.js");
        const listActorsFn = dbModule.listActors as (limit?: number) => unknown[];
        const actors = listActorsFn(5);
        if (Array.isArray(actors)) {
          actorCount = actors.length;
          gruffDbStatus = "connected";
        }
      } catch (err) {
        gruffDbStatus = isDbNotInitialized(err) ? "not_initialized" : "error";
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                status: gruffDbStatus === "connected" ? "ok" : "degraded",
                server: SERVER_NAME,
                version: VERSION,
                gruffPath: GRUFF_WORKSPACE,
                gruffDbStatus,
                actorCount,
                echoesBridgeUrl: ECHOES_BRIDGE_URL,
                timestamp: new Date().toISOString(),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── list_actors ──────────────────────────────────────────────────────────

  registerTool(
    "list_actors",
    {
      description:
        "List actor profiles and trust scores from the gruff trust database. " +
        "Returns actors ordered by score (highest trust first).",
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .default(50)
          .describe("Maximum number of actors to return"),
      }),
    },
    async (args: { limit?: number }) => {
      try {
        const dbModule = await loadGruffModule("trust/db.js");
        const listActorsFn = dbModule.listActors as (limit?: number) => unknown[];
        const actors = listActorsFn(args.limit ?? 50);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  actors,
                  count: Array.isArray(actors) ? actors.length : 0,
                  limit: args.limit ?? 50,
                  timestamp: new Date().toISOString(),
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        const errorMessage = formatDbError(err);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: errorMessage }) }],
          isError: true,
        };
      }
    },
  );

  // ── route_tool ───────────────────────────────────────────────────────────

  registerTool(
    "route_tool",
    {
      description:
        "Route a tool call to the appropriate actor tier. Returns the actor's tier " +
        "(school, practice, hold) and trust score, determining what level of access " +
        "the actor should have.",
      inputSchema: z.object({
        tool: z.string().min(1).describe("The tool name being requested (e.g., 'record_audit')"),
        actor: z.string().min(1).describe("The actor requesting access (e.g., 'echoes-server')"),
      }),
    },
    async (args: { tool: string; actor: string }) => {
      try {
        const scorerModule = await loadGruffModule("trust/scorer.js");
        const resolveRoutePolicyFn = scorerModule.resolveRoutePolicy as (
          tool: string,
          actor: string,
        ) => unknown;
        const result = resolveRoutePolicyFn(args.tool, args.actor);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  route: result,
                  requested: { tool: args.tool, actor: args.actor },
                  timestamp: new Date().toISOString(),
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        const errorMessage = formatDbError(err);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: errorMessage }) }],
          isError: true,
        };
      }
    },
  );

  // ── list_routines ────────────────────────────────────────────────────────

  registerTool(
    "list_routines",
    {
      description:
        "List available routines from the gruff racks/routines/ directory. " +
        "Returns each routine's name, status, trigger, and dispatch count.",
    },
    async () => {
      try {
        const runnerModule = await loadGruffModule("routine-runner.js");
        const listRoutinesFn = runnerModule.listRoutines as () => string[];
        const loadRoutineFn = runnerModule.loadRoutine as (name: string) => Record<string, unknown>;

        const names = listRoutinesFn();
        const routines = names.map((n: string) => {
          try {
            const r = loadRoutineFn(n);
            return {
              name: r.name,
              status: r.status,
              trigger: r.trigger,
              intent: (r.intent as string) ?? "",
              timeout: (r.timeout as string) ?? "10m",
              dispatches: Array.isArray(r.dispatches) ? r.dispatches.length : 0,
              produces: (r.produces as unknown[]) ?? [],
              owner: (r.owner as string) ?? "unknown",
            };
          } catch {
            return {
              name: n,
              status: "error",
              trigger: "unknown",
              intent: "",
              timeout: "10m",
              dispatches: 0,
              produces: [],
              owner: "unknown",
              error: "Failed to load routine config",
            };
          }
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  routines,
                  total: routines.length,
                  active: routines.filter((r) => r.status === "active").length,
                  draft: routines.filter((r) => r.status === "draft").length,
                  completed: routines.filter((r) => r.status === "completed").length,
                  timestamp: new Date().toISOString(),
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        const errorMessage = formatDbError(err);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: errorMessage }) }],
          isError: true,
        };
      }
    },
  );

  // ── run_routine ──────────────────────────────────────────────────────────

  registerTool(
    "run_routine",
    {
      description:
        "Execute a routine from gruff racks/routines/. Supports dry-run mode " +
        "to preview the dispatch plan without actually executing.",
      inputSchema: z.object({
        routine: z.string().min(1).describe("Routine name (directory under racks/routines/)"),
        dry_run: z
          .boolean()
          .optional()
          .default(false)
          .describe("If true, return the dispatch plan without executing"),
        args: z
          .record(z.string(), z.unknown())
          .optional()
          .default({})
          .describe("Arguments to pass to MCP tool dispatches"),
        timeout_ms: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Override the routine's default timeout in milliseconds"),
      }),
    },
    async (args: {
      routine: string;
      dry_run?: boolean;
      args?: Record<string, unknown>;
      timeout_ms?: number;
    }) => {
      const incomingTrace: TraceContext | null = extractTrace(args as Record<string, unknown>);
      const span = incomingTrace ? createChildSpan(incomingTrace) : createRootSpan();

      try {
        const runnerModule = await loadGruffModule("routine-runner.js");
        const runRoutineFn = runnerModule.runRoutine as (
          name: string,
          opts: Record<string, unknown>,
        ) => Promise<Record<string, unknown>>;

        const report = await runRoutineFn(args.routine, {
          dryRun: args.dry_run ?? false,
          args: args.args ?? {},
          timeoutMs: args.timeout_ms,
        });

        const reportStatus = report.status as string;
        const reportDuration = report.durationMs as number;

        emitAudit({
          traceId: span.traceId,
          spanId: span.spanId,
          source: SERVER_NAME,
          tool: "run_routine",
          status: reportStatus === "pass" || reportStatus === "dry-run" ? "success" : "failure",
          durationMs: reportDuration ?? 0,
          metadata: {
            routine: args.routine,
            dryRun: args.dry_run ?? false,
            dispatchCount: Array.isArray(report.dispatches)
              ? (report.dispatches as unknown[]).length
              : 0,
            status: report.status,
          },
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  report,
                  timestamp: new Date().toISOString(),
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        const errorMessage = formatDbError(err);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: errorMessage }) }],
          isError: true,
        };
      }
    },
  );

  // ── generate_snapshot ────────────────────────────────────────────────────

  registerTool(
    "generate_snapshot",
    {
      description:
        "Generate a comprehensive state snapshot of the gruff trust ecosystem. " +
        "Includes actor profiles, events, sessions, routing decisions, routine inventory, " +
        "and dry-run results. Replicates the 'gruff snapshot' CLI command.",
      inputSchema: z.object({
        output_path: z
          .string()
          .optional()
          .describe("Optional file path to write the snapshot JSON to"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .default(20)
          .describe("Max recent events per actor timeline"),
      }),
    },
    async (args: { output_path?: string; limit?: number }) => {
      const incomingTrace: TraceContext | null = extractTrace(args as Record<string, unknown>);
      const span = incomingTrace ? createChildSpan(incomingTrace) : createRootSpan();
      const snapshotId = generateId("snap");
      const startedAt = Date.now();

      try {
        const dbModule = await loadGruffModule("trust/db.js");
        const scorerModule = await loadGruffModule("trust/scorer.js");
        const runnerModule = await loadGruffModule("routine-runner.js");

        const listActorsFn = dbModule.listActors as (limit?: number) => unknown[];
        const trustDbPathFn = dbModule.trustDbPath as () => string;
        const getDbFn = dbModule.getDb as () => Record<string, unknown>;
        const resolveRoutePolicyFn = scorerModule.resolveRoutePolicy as (
          tool: string,
          actor: string,
        ) => unknown;
        const listRoutinesFn = runnerModule.listRoutines as () => string[];
        const loadRoutineFn = runnerModule.loadRoutine as (name: string) => Record<string, unknown>;
        const runRoutineFn = runnerModule.runRoutine as (
          name: string,
          opts: Record<string, unknown>,
        ) => Promise<unknown>;

        const evtLimit = args.limit ?? 20;
        const ts = new Date().toISOString();
        const db = getDbFn();
        const actors = listActorsFn(200);

        type DbWithPrepare = {
          prepare: (sql: string) => { get: () => unknown; all: (...args: unknown[]) => unknown[] };
        };
        const dbp = db as unknown as DbWithPrepare;

        // ── Events: global summary + per-actor detail ──
        const totalEvents = (dbp.prepare("SELECT count(*) as c FROM events").get() as { c: number })
          .c;
        const statusBreakdown = dbp
          .prepare(
            "SELECT status, count(*) as count FROM events GROUP BY status ORDER BY count DESC",
          )
          .all() as { status: string; count: number }[];
        const toolBreakdown = dbp
          .prepare(
            "SELECT tool, count(*) as count, " +
              "sum(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as ok, " +
              "sum(CASE WHEN status = 'failure' THEN 1 ELSE 0 END) as fail, " +
              "round(avg(duration_ms), 1) as avg_ms " +
              "FROM events GROUP BY tool ORDER BY count DESC",
          )
          .all();
        const sourceBreakdown = dbp
          .prepare(
            "SELECT source, count(*) as count FROM events GROUP BY source ORDER BY count DESC",
          )
          .all() as { source: string; count: number }[];
        const recentEvents = dbp
          .prepare(
            "SELECT id, ts, source, tool, actor, status, duration_ms, payload_json FROM events ORDER BY ts DESC LIMIT ?",
          )
          .all(50);

        // Per-actor event timeline
        const actorTimelines: Record<string, unknown[]> = {};
        const typedActors = actors as Array<{ actor: string }>;
        for (const actor of typedActors.slice(0, 15)) {
          const events = dbp
            .prepare(
              "SELECT id, ts, tool, status, duration_ms, payload_json FROM events WHERE actor = ? ORDER BY ts DESC LIMIT ?",
            )
            .all(actor.actor, evtLimit);
          if (events.length > 0) actorTimelines[actor.actor] = events;
        }

        // ── Sessions ──
        const totalSessions = (
          dbp.prepare("SELECT count(*) as c FROM actor_sessions").get() as { c: number }
        ).c;
        const activeSessions = dbp
          .prepare("SELECT * FROM actor_sessions WHERE active = 1 ORDER BY last_seen DESC")
          .all();
        const recentClosed = dbp
          .prepare("SELECT * FROM actor_sessions WHERE active = 0 ORDER BY closed_at DESC LIMIT 20")
          .all();

        // ── Routing decisions ──
        const routingDecisions = dbp
          .prepare("SELECT * FROM routing_decisions ORDER BY decided_at DESC LIMIT 20")
          .all();

        // ── Route policy samples ──
        const sampleActors = [
          "echoes-server",
          "grid-server-merit-guard",
          "overview-server",
          "eligibility-server",
          "pulse-server",
        ];
        const routeSamples = sampleActors.map((a: string) => {
          try {
            return resolveRoutePolicyFn("record_audit", a);
          } catch {
            return { actor: a, error: "not found" };
          }
        });

        // ── Routines + dry-runs ──
        const routineNames = listRoutinesFn();
        const routineInventory = routineNames.map((n: string) => {
          try {
            const r = loadRoutineFn(n);
            return {
              name: r.name,
              status: r.status,
              trigger: r.trigger,
              timeout: r.timeout,
              dispatches: Array.isArray(r.dispatches) ? r.dispatches.length : 0,
              produces: r.produces,
            };
          } catch {
            return {
              name: n,
              status: "error",
              trigger: "unknown",
              timeout: "10m",
              dispatches: 0,
              produces: [],
            };
          }
        });

        const dryRuns: Record<string, unknown> = {};
        for (const n of routineNames.slice(0, 10)) {
          try {
            dryRuns[n] = await runRoutineFn(n, { dryRun: true });
          } catch {
            dryRuns[n] = { error: "dry-run failed" };
          }
        }

        const master = {
          snapshotVersion: "gruff-snapshot-v2",
          snapshotId,
          generatedAt: ts,
          gruffVersion: "1.0.0",
          trustDb: {
            path: trustDbPathFn(),
            actorCount: Array.isArray(actors) ? actors.length : 0,
          },
          actors,
          events: {
            total: totalEvents,
            statusBreakdown,
            toolBreakdown,
            sourceBreakdown,
            recent: recentEvents,
            actorTimelines,
          },
          sessions: {
            total: totalSessions,
            active: activeSessions,
            recentClosed,
          },
          routingDecisions,
          routeSamples,
          routines: {
            total: routineInventory.length,
            active: routineInventory.filter((r) => r.status === "active").length,
            draft: routineInventory.filter((r) => r.status === "draft").length,
            completed: routineInventory.filter((r) => r.status === "completed").length,
            inventory: routineInventory,
          },
          dryRuns,
        };

        // ── Write to file if requested ──
        if (args.output_path) {
          const fsModule = await import("fs");
          const pathModule = await import("path");
          const { writeFileSync, mkdirSync } = fsModule;
          const { dirname } = pathModule;
          mkdirSync(dirname(args.output_path), { recursive: true });
          writeFileSync(args.output_path, JSON.stringify(master, null, 2));
        }

        const durationMs = Date.now() - startedAt;

        emitAudit({
          traceId: span.traceId,
          spanId: span.spanId,
          source: SERVER_NAME,
          tool: "generate_snapshot",
          status: "success",
          durationMs,
          metadata: {
            snapshotId,
            actorCount: Array.isArray(actors) ? actors.length : 0,
            totalEvents,
            totalSessions,
            routineCount: routineNames.length,
            outputPath: args.output_path ?? null,
          },
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  snapshot: master,
                  durationMs,
                  writtenTo: args.output_path ?? null,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        const errorMessage = formatDbError(err);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: errorMessage }) }],
          isError: true,
        };
      }
    },
  );

  // ── send_proportion ──────────────────────────────────────────────────────

  registerTool(
    "send_proportion",
    {
      description:
        "Send a gruff-proportion-v1 payload to the Echoes bridge. " +
        "Validates the payload against the gruff-proportion-v1 schema before sending.",
      inputSchema: z.object({
        payload: z
          .record(z.string(), z.unknown())
          .describe(
            "The gruff-proportion-v1 payload. Must include: schemaVersion, generatedAt, " +
              "audioDrive, theta, weights, sequence, manifest, compass, provenance.",
          ),
      }),
    },
    async (args: { payload: Record<string, unknown> }) => {
      const incomingTrace: TraceContext | null = extractTrace(args as Record<string, unknown>);
      const span = incomingTrace ? createChildSpan(incomingTrace) : createRootSpan();

      // Validate payload against gruff-proportion-v1 schema
      const parseResult = GruffProportionSchema.safeParse(args.payload);
      if (!parseResult.success) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: "Invalid gruff-proportion-v1 payload",
                  validationErrors: parseResult.error.issues,
                  expected: {
                    schemaVersion: "string (e.g., 'gruff-proportion-v1')",
                    generatedAt: "ISO-8601 timestamp",
                    audioDrive: "optional record",
                    theta: "optional number",
                    weights: "optional record of string→number",
                    sequence: "optional record",
                    manifest: "optional record",
                    compass: "optional record",
                    provenance: "optional record",
                  },
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }

      try {
        const ingesterModule = await loadGruffModule("trust/ingester.js");
        const sendProportionFn = ingesterModule.sendProportion as (
          payload: Record<string, unknown>,
        ) => Promise<Response>;

        // Override bridge URL via environment before calling sendProportion,
        // since sendProportion reads GRUFF_ECHOES_BRIDGE_URL from process.env
        const originalBridgeUrl = process.env.GRUFF_ECHOES_BRIDGE_URL;
        if (ECHOES_BRIDGE_URL !== "http://localhost:8000/api/gruff-proportion") {
          process.env.GRUFF_ECHOES_BRIDGE_URL = ECHOES_BRIDGE_URL;
        }

        let response: Response;
        try {
          response = await sendProportionFn(parseResult.data as Record<string, unknown>);
        } finally {
          // Restore original value so we don't leak state
          if (originalBridgeUrl !== undefined) {
            process.env.GRUFF_ECHOES_BRIDGE_URL = originalBridgeUrl;
          } else {
            delete process.env.GRUFF_ECHOES_BRIDGE_URL;
          }
        }

        const statusCode = response.status;
        const statusText = response.statusText;
        let responseBody: unknown = null;
        try {
          responseBody = await response.json();
        } catch {
          try {
            responseBody = await response.text();
          } catch {
            responseBody = null;
          }
        }

        const ok = response.ok;

        emitAudit({
          traceId: span.traceId,
          spanId: span.spanId,
          source: SERVER_NAME,
          tool: "send_proportion",
          status: ok ? "success" : "failure",
          durationMs: 0,
          metadata: {
            bridgeUrl: ECHOES_BRIDGE_URL,
            responseStatus: statusCode,
            schemaVersion: parseResult.data.schemaVersion as string,
          },
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  sent: ok,
                  status: statusCode,
                  statusText,
                  response: responseBody,
                  bridgeUrl: ECHOES_BRIDGE_URL,
                  timestamp: new Date().toISOString(),
                },
                null,
                2,
              ),
            },
          ],
          ...(ok ? {} : { isError: true }),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `Failed to send proportion to Echoes bridge: ${message}`,
                bridgeUrl: ECHOES_BRIDGE_URL,
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // ── Start ──

  return server;
}

export async function startServer(): Promise<McpServer> {
  logger.info(
    `v${VERSION} starting — gruff workspace: ${GRUFF_WORKSPACE}, echoes bridge: ${ECHOES_BRIDGE_URL}`,
  );
  const server = buildServer();
  await server.connect(new StdioServerTransport());
  return server;
}

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

  void main();
}
