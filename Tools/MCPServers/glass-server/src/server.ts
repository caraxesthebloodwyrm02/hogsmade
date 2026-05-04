/**
 * Glass Server — Bridge emitter MCP server.
 *
 * Writes session state to ~/.caraxes/field-bridge.json so the Glass
 * Electron renderer can visualize live agent sessions.
 *
 * Tools:
 *   glass_bridge_write      — partial-patch merge into the bridge file
 *   glass_session_start     — initialize a fresh session (zeroes signals, ground state)
 *   glass_emit_turn         — append a conversation turn + update agent_state
 *   glass_session_resume    — read bridge state summary
 *   glass_update_signals    — lightweight signal-only update (drives field modulation)
 *   glass_pending_messages  — return unread user messages since last consumption (HWM)
 *   glass_assets_list       — list durable semantic assets from the inventory ledger
 */

import { emitAudit } from "@cascade/shared-types/audit-client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "url";
import * as z from "zod";
import { writeBridge, readBridge, getBridgePath } from "./bridge-writer.js";
import { appendInventoryAsset, getInventoryPath, readInventory } from "./inventory-writer.js";
import { loadProfile, type TriadicWeights } from "./profile-reader.js";
import { applyTriadicGuard } from "./triadic-guard.js";

const SERVER_NAME = "glass-server";
const VERSION = "1.0.0";

let activeTriadic: TriadicWeights = { safety: 1.0, correctness: 0.85, autonomy: 0.7 };
let ceremonyEvalThreshold = 15;
let ceremonyIdleMinutes: number | null = null;

/** High-water mark: index of the last conversation entry consumed by the agent. */
let consumedIndex = 0;

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
            type: z.enum(["code", "note", "output", "asset"]),
            language: z.string().max(64),
            content: z.string().max(1_000_000),
            position: z.object({ x: z.number(), y: z.number() }),
            origin: z.enum(["user", "agent"]),
            asset: z
              .object({
                category: z.enum([
                  "fragment",
                  "token",
                  "artifact",
                  "relic",
                  "echo",
                  "seed",
                  "catalyst",
                  "blueprint",
                  "collectible",
                ]),
                rarity: z.enum(["common", "uncommon", "rare", "epic", "legendary", "mythic"]),
                label: z.string().max(64),
                glyph: z.string().max(8).optional(),
                acquired_at: z.string().max(64),
                source_ceremony: z.enum([
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
                ]),
                source_session: z.string().max(128),
                consumed: z.boolean().optional(),
                ledger_id: z.string().max(128).optional(),
              })
              .optional(),
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

        // Store ceremony thresholds in-memory so they survive Electron bridge round-trips
        // that strip unknown keys via validateBridgeState().
        ceremonyEvalThreshold = profile?.signals?.hot_threshold?.iteration_count ?? 15;
        if (profile?.ceremony?.auto_return_after_idle_minutes !== undefined) {
          ceremonyIdleMinutes = profile.ceremony.auto_return_after_idle_minutes;
        } else {
          ceremonyIdleMinutes = null;
        }

        // Write ceremony thresholds from profile (or defaults) so glass_evaluate_ceremony
        // can read them directly without re-parsing YAML.
        state._ceremony_eval_threshold = profile?.signals?.hot_threshold?.iteration_count ?? 15;
        if (profile?.ceremony?.auto_return_after_idle_minutes !== undefined) {
          state._ceremony_idle_minutes = profile.ceremony.auto_return_after_idle_minutes;
        }
        if (workspace) {
          state._profile_workspace = workspace;
        }

        consumedIndex = 0;

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

  // ── glass_update_signals ──

  tool(
    "glass_update_signals",
    "Update field signals that drive visual modulation (ambient intensity, LFO rate, geometry scale). Lighter than glass_bridge_write — only touches the signals object. Use at natural boundaries: after commits, after tool calls, periodically for session_age.",
    {
      git_diff_lines: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Total diff lines in current working tree"),
      iteration_count: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Number of agent iterations/tool calls this session"),
      session_age_minutes: z.number().min(0).optional().describe("Minutes since session started"),
    },
    async (params: {
      git_diff_lines?: number;
      iteration_count?: number;
      session_age_minutes?: number;
    }) => {
      const startMs = Date.now();
      try {
        const current = await readBridge();
        const currentSignals =
          current.signals && typeof current.signals === "object"
            ? (current.signals as Record<string, unknown>)
            : {};

        const updatedSignals: Record<string, unknown> = { ...currentSignals };
        if (params.git_diff_lines !== undefined)
          updatedSignals.git_diff_lines = params.git_diff_lines;
        if (params.iteration_count !== undefined)
          updatedSignals.iteration_count = params.iteration_count;
        if (params.session_age_minutes !== undefined)
          updatedSignals.session_age_minutes = params.session_age_minutes;

        const patch = { signals: updatedSignals };
        const merged = await writeBridge(patch);

        emitAudit({
          source: SERVER_NAME,
          tool: "glass_update_signals",
          status: "success",
          durationMs: Date.now() - startMs,
          metadata: { signals: updatedSignals },
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ ok: true, signals: updatedSignals }),
            },
          ],
        };
      } catch (error) {
        emitAudit({
          source: SERVER_NAME,
          tool: "glass_update_signals",
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

  // ── glass_pending_messages ──

  tool(
    "glass_pending_messages",
    "Return user messages written to the bridge since the agent last consumed them. Advances the high-water mark so each message is delivered exactly once. Call at turn boundaries to discover Glass-side input.",
    {
      peek: z
        .boolean()
        .optional()
        .describe("If true, return pending messages without advancing the high-water mark"),
    },
    async ({ peek }: { peek?: boolean }) => {
      const startMs = Date.now();
      try {
        const state = await readBridge();
        const conversation = Array.isArray(state.conversation)
          ? (state.conversation as Array<{ role: string; text: string; timestamp: string }>)
          : [];

        const pending: Array<{ role: string; text: string; timestamp: string; index: number }> = [];
        for (let i = consumedIndex; i < conversation.length; i++) {
          if (conversation[i].role === "user") {
            pending.push({ ...conversation[i], index: i });
          }
        }

        if (!peek) {
          consumedIndex = conversation.length;
        }

        emitAudit({
          source: SERVER_NAME,
          tool: "glass_pending_messages",
          status: "success",
          durationMs: Date.now() - startMs,
          metadata: {
            pending: pending.length,
            hwm: consumedIndex,
            peek: !!peek,
          },
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  pending,
                  count: pending.length,
                  hwm: consumedIndex,
                  total_conversation: conversation.length,
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
          tool: "glass_pending_messages",
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

  // ── glass_emit_block ──

  tool(
    "glass_emit_block",
    "Add an agent-origin block to the Glass field. Now supports 3D persistence via 'asset' blocks. Assets enforce a rarity ceiling based on current ThresholdState (Rift ceremony). Automatically assigns a grid position based on current agent-block count.",
    {
      type: z.enum(["code", "note", "output", "asset"]).describe("Block type"),
      language: z.string().max(64).optional().describe("Language hint (default: text)"),
      content: z.string().max(1_000_000).describe("Block content"),
      ref_id: z.string().max(128).optional().describe("Optional reference to another block id"),
      max_blocks: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Maximum agent-origin blocks to retain (default: 12)"),
      asset_category: z
        .enum([
          "fragment",
          "token",
          "artifact",
          "relic",
          "echo",
          "seed",
          "catalyst",
          "blueprint",
          "collectible",
        ])
        .optional()
        .describe("Required if type is 'asset'"),
      asset_rarity: z
        .enum(["common", "uncommon", "rare", "epic", "legendary", "mythic"])
        .optional()
        .describe("Required if type is 'asset'. Subject to ThresholdState rarity gate."),
      asset_label: z
        .string()
        .max(32)
        .optional()
        .describe("Short label for the asset (required if type is 'asset')"),
      asset_glyph: z.string().max(4).optional().describe("Unicode char for rendering"),
    },
    async ({
      type,
      language,
      content,
      ref_id,
      max_blocks,
      asset_category,
      asset_rarity,
      asset_label,
      asset_glyph,
    }: {
      type: "code" | "note" | "output" | "asset";
      language?: string;
      content: string;
      ref_id?: string;
      max_blocks?: number;
      asset_category?: string;
      asset_rarity?: string;
      asset_label?: string;
      asset_glyph?: string;
    }) => {
      const startMs = Date.now();
      try {
        const current = await readBridge();
        const blocks = Array.isArray(current.blocks)
          ? ([...current.blocks] as Array<Record<string, unknown>>)
          : [];
        const thresholdState =
          typeof current.threshold_state === "string" ? current.threshold_state : "ground";

        // Asset rarity gate logic
        if (type === "asset") {
          if (!asset_category || !asset_rarity || !asset_label) {
            throw new Error(
              "asset_category, asset_rarity, and asset_label are required when type is 'asset'",
            );
          }
          const RARITY_ORDER: Record<string, number> = {
            common: 0,
            uncommon: 1,
            rare: 2,
            epic: 3,
            legendary: 4,
            mythic: 5,
          };
          const RARITY_GATE: Record<string, string> = {
            ground: "uncommon",
            evaluating: "uncommon",
            floor_rising: "rare",
            voices_appearing: "epic",
            voice_1_active: "epic",
            voice_2_active: "epic",
            voice_3_active: "epic",
            elevated: "mythic",
            returning: "rare",
            denied: "common",
          };
          const permittedCeiling = RARITY_GATE[thresholdState] ?? "common";
          const orderRequested = RARITY_ORDER[asset_rarity] ?? 0;
          const orderCeiling = RARITY_ORDER[permittedCeiling] ?? 0;

          if (orderRequested > orderCeiling) {
            throw new Error(
              `Rarity '${asset_rarity}' is not permitted during state '${thresholdState}'. Ceiling is '${permittedCeiling}'.`,
            );
          }
        }

        // Grid slot is derived from current agent-block count (before adding new one).
        const agentBlockCount = blocks.filter((b) => b.origin === "agent").length;
        const slot = agentBlockCount;
        const row = slot % 4;
        const col = Math.floor(slot / 4);
        const x = 760 + col * 220;
        const y = 80 + row * 200;

        const newBlock: Record<string, unknown> = {
          id: `agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type,
          language: language ?? "text",
          content,
          position: { x, y },
          origin: "agent",
        };
        if (ref_id !== undefined) newBlock.ref_id = ref_id;

        if (type === "asset") {
          const inventoryRecord = await appendInventoryAsset({
            block_id: String(newBlock.id),
            category: String(asset_category),
            rarity: String(asset_rarity),
            label: String(asset_label),
            glyph: asset_glyph,
            content,
            source_ceremony: thresholdState,
            source_session: typeof current.session_id === "string" ? current.session_id : "unknown",
            acquired_at: new Date().toISOString(),
          });

          newBlock.asset = {
            category: inventoryRecord.category,
            rarity: inventoryRecord.rarity,
            label: inventoryRecord.label,
            glyph: asset_glyph,
            acquired_at: inventoryRecord.acquired_at,
            source_ceremony: inventoryRecord.source_ceremony,
            source_session: inventoryRecord.source_session,
            ledger_id: inventoryRecord.ledger_id,
          };
        }

        let updatedBlocks = [...blocks, newBlock];

        // Pruning: remove oldest agent-origin blocks if limit exceeded.
        // User-origin blocks and 'asset' blocks are unconditionally preserved.
        const limit = max_blocks ?? 12;
        const newAgentCount = updatedBlocks.filter(
          (b) => b.origin === "agent" && b.type !== "asset",
        ).length;
        if (newAgentCount > limit) {
          const excess = newAgentCount - limit;
          let removed = 0;
          updatedBlocks = updatedBlocks.filter((b) => {
            if (b.origin === "agent" && b.type !== "asset" && removed < excess) {
              removed++;
              return false;
            }
            return true;
          });
        }

        const merged = await writeBridge({ blocks: updatedBlocks });

        emitAudit({
          source: SERVER_NAME,
          tool: "glass_emit_block",
          status: "success",
          durationMs: Date.now() - startMs,
          metadata: {
            block_id: String(newBlock.id),
            type,
            slot,
            position: { x, y },
            total_blocks: updatedBlocks.length,
          },
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  ok: true,
                  block_id: newBlock.id,
                  position: { x, y },
                  slot,
                  block_count: updatedBlocks.length,
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
          tool: "glass_emit_block",
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

  // ── glass_assets_list ──

  tool(
    "glass_assets_list",
    "List durable semantic assets from the Glass inventory ledger. This reads glass-inventory.json, not the live bridge.",
    {
      category: z
        .enum([
          "fragment",
          "token",
          "artifact",
          "relic",
          "echo",
          "seed",
          "catalyst",
          "blueprint",
          "collectible",
        ])
        .optional()
        .describe("Optional asset category filter"),
      rarity: z
        .enum(["common", "uncommon", "rare", "epic", "legendary", "mythic"])
        .optional()
        .describe("Optional rarity filter"),
      limit: z.number().int().min(1).max(200).optional().describe("Maximum assets to return"),
    },
    async ({ category, rarity, limit }: { category?: string; rarity?: string; limit?: number }) => {
      const startMs = Date.now();
      try {
        const inventory = await readInventory();
        let assets = inventory.assets;
        if (category) assets = assets.filter((asset) => asset.category === category);
        if (rarity) assets = assets.filter((asset) => asset.rarity === rarity);
        assets = assets.slice(-(limit ?? 50)).reverse();

        emitAudit({
          source: SERVER_NAME,
          tool: "glass_assets_list",
          status: "success",
          durationMs: Date.now() - startMs,
          metadata: { count: assets.length, category, rarity },
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  ok: true,
                  inventory_path: getInventoryPath(),
                  count: assets.length,
                  assets,
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
          tool: "glass_assets_list",
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

  // ── glass_evaluate_ceremony ──

  tool(
    "glass_evaluate_ceremony",
    "Evaluate whether the ceremony threshold has been reached based on current signals. When iteration_count meets _ceremony_eval_threshold and threshold_state is 'ground', automatically transitions to 'evaluating'. Safe to call repeatedly — only acts when the guard conditions are satisfied.",
    {},
    async () => {
      const startMs = Date.now();
      try {
        const state = await readBridge();
        const signals =
          state.signals && typeof state.signals === "object"
            ? (state.signals as Record<string, unknown>)
            : {};
        const iterCount = typeof signals.iteration_count === "number" ? signals.iteration_count : 0;
        const threshold = ceremonyEvalThreshold;
        const idleMinutes = ceremonyIdleMinutes;
        const thresholdStateBefore =
          typeof state.threshold_state === "string" ? state.threshold_state : "ground";

        const thresholdMet = iterCount >= threshold;
        const eligible = thresholdMet && thresholdStateBefore === "ground";

        let thresholdStateAfter = thresholdStateBefore;
        let guardWarnings: string[] = [];

        if (eligible) {
          const patch = { threshold_state: "evaluating" as const };
          const guard = applyTriadicGuard(patch, state, activeTriadic);
          if (guard.allowed) {
            await writeBridge(patch);
            thresholdStateAfter = "evaluating";
          } else {
            guardWarnings = guard.warnings ?? [];
          }
        }

        emitAudit({
          source: SERVER_NAME,
          tool: "glass_evaluate_ceremony",
          status: "success",
          durationMs: Date.now() - startMs,
          metadata: {
            eligible,
            threshold_met: thresholdMet,
            iteration_count: iterCount,
            threshold,
            threshold_state_before: thresholdStateBefore,
            threshold_state_after: thresholdStateAfter,
          },
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  ok: true,
                  eligible,
                  threshold_met: thresholdMet,
                  threshold_state_before: thresholdStateBefore,
                  threshold_state_after: thresholdStateAfter,
                  iteration_count: iterCount,
                  threshold,
                  idle_minutes: idleMinutes,
                  guard_warnings: guardWarnings,
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
          tool: "glass_evaluate_ceremony",
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

  // ── end of tools ──

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
