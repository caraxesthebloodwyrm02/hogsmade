/**
 * Glass Server — Bridge emitter MCP server.
 *
 * Writes session state to ~/.caraxes/field-bridge.json so the Glass
 * Electron renderer can visualize live agent sessions.
 *
 * Tools:
 *   glass_bridge_write  — partial-patch merge into the bridge file
 *   glass_session_start — initialize a fresh session (zeroes signals, ground state)
 *   glass_emit_turn     — append a conversation turn + update agent_state
 */

import { emitAudit } from "@cascade/shared-types/audit-client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "url";
import * as z from "zod";
import { writeBridge, readBridge, getBridgePath } from "./bridge-writer.js";
import { loadProfile, type TriadicWeights } from "./profile-reader.js";
import { applyTriadicGuard } from "./triadic-guard.js";

const SERVER_NAME = "glass-server";
const VERSION = "1.0.0";

let activeTriadic: TriadicWeights = { safety: 1.0, correctness: 0.85, autonomy: 0.7 };

export function buildServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: VERSION });
  const tool = server.tool.bind(server) as any;

  // ── glass_bridge_write ──

  tool(
    "glass_bridge_write",
    "Write a partial JSON patch to the Glass bridge file. Fields are deep-merged into current state.",
    {
      agent_state: z
        .enum(["idle", "thinking", "writing", "reviewing", "elevated"])
        .optional()
        .describe("Current agent lifecycle state"),
      threshold_state: z
        .enum([
          "ground",
          "evaluating",
          "floor_rising",
          "voices_appearing",
          "voice_1_active",
          "voice_2_active",
          "voice_3_active",
          "elevated",
          "returning",
          "denied",
        ])
        .optional()
        .describe("Ceremony threshold state"),
      progress: z.number().min(0).max(1).optional().describe("Ceremony progress 0.0–1.0"),
      conversation: z
        .array(
          z.object({
            role: z.enum(["user", "agent"]),
            text: z.string().max(32_768),
            timestamp: z.string().max(64),
          }),
        )
        .max(200)
        .optional()
        .describe("Replace full conversation array"),
      blocks: z
        .array(
          z.object({
            id: z.string().max(128),
            type: z.enum(["code", "note", "output"]),
            language: z.string().max(64),
            content: z.string().max(1_000_000),
            position: z.object({ x: z.number(), y: z.number() }),
            origin: z.enum(["user", "agent"]),
          }),
        )
        .max(200)
        .optional()
        .describe("Replace full blocks array"),
      voices: z
        .array(
          z.object({
            id: z.enum(["I", "II", "III"]),
            color: z.enum(["amber", "silver", "gold"]),
            position: z.enum(["left", "center", "right"]),
            text: z.string().max(1024),
            active: z.boolean(),
          }),
        )
        .max(3)
        .optional()
        .describe("Replace full voices array"),
      signals: z
        .object({
          git_diff_lines: z.number().optional(),
          iteration_count: z.number().optional(),
          session_age_minutes: z.number().optional(),
        })
        .optional()
        .describe("Partial signal update — deep-merged"),
    },
    async (params: Record<string, unknown>) => {
      const startMs = Date.now();
      try {
        const patch: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(params)) {
          if (v !== undefined) patch[k] = v;
        }

        const current = await readBridge();
        const guard = applyTriadicGuard(patch, current, activeTriadic);
        if (!guard.allowed) {
          emitAudit({
            source: SERVER_NAME,
            tool: "glass_bridge_write",
            status: "error",
            durationMs: Date.now() - startMs,
            metadata: { guard: "triadic", warnings: guard.warnings },
          });
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: "triadic guard rejected write",
                  warnings: guard.warnings,
                }),
              },
            ],
            isError: true,
          };
        }

        const merged = await writeBridge(patch);
        emitAudit({
          source: SERVER_NAME,
          tool: "glass_bridge_write",
          status: "success",
          durationMs: Date.now() - startMs,
          metadata: { keys: Object.keys(patch) },
        });
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ ok: true, state: merged }, null, 2) },
          ],
        };
      } catch (error) {
        emitAudit({
          source: SERVER_NAME,
          tool: "glass_bridge_write",
          status: "error",
          durationMs: Date.now() - startMs,
          metadata: { error: String(error) },
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: String(error) }) }],
          isError: true,
        };
      }
    },
  );

  // ── glass_session_start ──

  tool(
    "glass_session_start",
    "Initialize a fresh Glass session — zeroes signals, sets ground state, generates session_id. Loads .glass-profile.yaml if present in the given workspace.",
    {
      name: z.string().optional().describe("Human-readable session label"),
      workspace: z
        .string()
        .optional()
        .describe("Absolute path to workspace root — used to find .glass-profile.yaml"),
    },
    async ({ name, workspace }: { name?: string; workspace?: string }) => {
      const startMs = Date.now();
      try {
        const label = name ?? new Date().toISOString().slice(0, 16).replace("T", "-");
        const sid = `${label}-${Math.random().toString(36).slice(2, 8)}`;

        const profile = workspace ? await loadProfile(workspace) : null;

        const state: Record<string, unknown> = {
          session_id: sid,
          agent_state: "idle",
          blocks: [],
          conversation: [],
          threshold_state: "ground",
          progress: 0,
          voices: [],
          signals: { git_diff_lines: 0, iteration_count: 0, session_age_minutes: 0 },
        };

        if (profile?.voices) {
          state._profile_voices = profile.voices;
        }

        if (profile?.triadic) {
          activeTriadic = profile.triadic;
        }

        const merged = await writeBridge(state);

        emitAudit({
          source: SERVER_NAME,
          tool: "glass_session_start",
          status: "success",
          durationMs: Date.now() - startMs,
          metadata: { session_id: sid, hasProfile: !!profile },
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  ok: true,
                  session_id: sid,
                  profile: profile ? { voices: profile.voices, ceremony: profile.ceremony } : null,
                  bridge: getBridgePath(),
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
          tool: "glass_session_start",
          status: "error",
          durationMs: Date.now() - startMs,
          metadata: { error: String(error) },
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: String(error) }) }],
          isError: true,
        };
      }
    },
  );

  // ── glass_session_resume ──

  tool(
    "glass_session_resume",
    "Read the current bridge state and return a structured summary. Lets an agent decide whether to continue the existing session or start fresh.",
    {},
    async () => {
      const startMs = Date.now();
      try {
        const state = await readBridge();
        const blocks = Array.isArray(state.blocks)
          ? (state.blocks as Array<Record<string, unknown>>)
          : [];
        const conversation = Array.isArray(state.conversation)
          ? (state.conversation as Array<Record<string, unknown>>)
          : [];
        const lastTurn = conversation.length > 0 ? conversation[conversation.length - 1] : null;
        const signals =
          state.signals && typeof state.signals === "object"
            ? (state.signals as Record<string, unknown>)
            : {};

        const summary = {
          session_id: state.session_id ?? null,
          threshold_state: state.threshold_state ?? "ground",
          agent_state: state.agent_state ?? "idle",
          progress: typeof state.progress === "number" ? state.progress : 0,
          block_count: blocks.length,
          conversation_turns: conversation.length,
          last_turn: lastTurn
            ? { role: lastTurn.role, preview: String(lastTurn.text ?? "").slice(0, 120) }
            : null,
          signals,
          has_active_session: typeof state.session_id === "string" && state.session_id.length > 0,
          bridge_path: getBridgePath(),
        };

        emitAudit({
          source: SERVER_NAME,
          tool: "glass_session_resume",
          status: "success",
          durationMs: Date.now() - startMs,
          metadata: {
            session_id: String(state.session_id ?? ""),
            has_active: summary.has_active_session,
          },
        });

        return {
          content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
        };
      } catch (error) {
        emitAudit({
          source: SERVER_NAME,
          tool: "glass_session_resume",
          status: "error",
          durationMs: Date.now() - startMs,
          metadata: { error: String(error) },
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: String(error) }) }],
          isError: true,
        };
      }
    },
  );

  // ── glass_emit_turn ──

  tool(
    "glass_emit_turn",
    "Append a single conversation turn and update agent_state. Lighter than glass_bridge_write for per-turn emission.",
    {
      role: z.enum(["user", "agent"]).describe("Who spoke"),
      text: z.string().max(32_768).describe("Message content"),
      agent_state: z
        .enum(["idle", "thinking", "writing", "reviewing", "elevated"])
        .optional()
        .describe("New agent state after this turn"),
    },
    async ({ role, text, agent_state }: { role: string; text: string; agent_state?: string }) => {
      const startMs = Date.now();
      try {
        const current = await readBridge();
        const conversation = Array.isArray(current.conversation) ? [...current.conversation] : [];
        conversation.push({ role, text, timestamp: new Date().toISOString() });

        const patch: Record<string, unknown> = { conversation };
        if (agent_state) patch.agent_state = agent_state;

        const guard = applyTriadicGuard(patch, current, activeTriadic);
        if (!guard.allowed) {
          emitAudit({
            source: SERVER_NAME,
            tool: "glass_emit_turn",
            status: "error",
            durationMs: Date.now() - startMs,
            metadata: { guard: "triadic", warnings: guard.warnings },
          });
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: "triadic guard rejected emit_turn",
                  warnings: guard.warnings,
                }),
              },
            ],
            isError: true,
          };
        }

        const merged = await writeBridge(patch);

        emitAudit({
          source: SERVER_NAME,
          tool: "glass_emit_turn",
          status: "success",
          durationMs: Date.now() - startMs,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ ok: true, turns: conversation.length }),
            },
          ],
        };
      } catch (error) {
        emitAudit({
          source: SERVER_NAME,
          tool: "glass_emit_turn",
          status: "error",
          durationMs: Date.now() - startMs,
          metadata: { error: String(error) },
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: String(error) }) }],
          isError: true,
        };
      }
    },
  );

  return server;
}

// ── Start ──

export async function startServer(): Promise<McpServer> {
  console.error(`[${SERVER_NAME}] v${VERSION} starting — bridge: ${getBridgePath()}`);
  const server = buildServer();
  await server.connect(new StdioServerTransport());
  return server;
}

const isEntrypoint =
  process.argv[1] != null && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isEntrypoint) {
  void startServer().catch((err) => {
    console.error(`[${SERVER_NAME}] failed to start`, err);
    process.exit(1);
  });
}
