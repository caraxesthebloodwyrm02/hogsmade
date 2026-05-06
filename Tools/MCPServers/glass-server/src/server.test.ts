import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { rm, mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

vi.mock("@cascade/shared-types/audit-client", () => ({ emitAudit: vi.fn() }));

function toolText(result: unknown): string {
  const r = result as { content: Array<{ text: string }> };
  return r.content[0].text;
}

function toolIsError(result: unknown): boolean | undefined {
  return (result as { isError?: boolean }).isError;
}

const TMP_DIR = join(tmpdir(), `glass-server-test-${process.pid}`);
const BRIDGE = join(TMP_DIR, "field-bridge.json");
const INVENTORY = join(TMP_DIR, "glass-inventory.json");

async function makeClient() {
  const { buildServer } = await import("./server.js");
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = buildServer();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "0.0.1" });
  await client.connect(clientTransport);
  return { client, server };
}

beforeEach(async () => {
  process.env.GLASS_BRIDGE_PATH = BRIDGE;
  process.env.GLASS_INVENTORY_PATH = INVENTORY;
  await rm(TMP_DIR, { recursive: true, force: true });
  await mkdir(TMP_DIR, { recursive: true });
  vi.resetModules();
});

afterAll(async () => {
  delete process.env.GLASS_BRIDGE_PATH;
  delete process.env.GLASS_INVENTORY_PATH;
  await rm(TMP_DIR, { recursive: true, force: true });
});

describe("glass-server tools", () => {
  describe("glass_session_start", () => {
    it("creates a session and returns ok", async () => {
      const { client } = await makeClient();
      const result = await client.callTool({
        name: "glass_session_start",
        arguments: { name: "test" },
      });
      const parsed = JSON.parse(toolText(result));
      expect(parsed.ok).toBe(true);
      expect(typeof parsed.session_id).toBe("string");
      expect(parsed.session_id).toContain("test");
    });

    it("writes bridge to disk", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });
      const { readFile } = await import("fs/promises");
      const raw = await readFile(BRIDGE, "utf-8");
      const state = JSON.parse(raw);
      expect(state.threshold_state).toBe("ground");
      expect(state.agent_state).toBe("idle");
      expect(Array.isArray(state.blocks)).toBe(true);
    });

    it("loads workspace profile when provided", async () => {
      const ws = join(TMP_DIR, "workspace");
      await mkdir(ws, { recursive: true });
      await writeFile(
        join(ws, ".glass-profile.yaml"),
        `voices:\n  I:\n    color: amber\n    role: speed\ntriadic:\n  safety: 0.9\n`,
        "utf-8",
      );
      process.env.CASCADE_WORKSPACE_ROOT = TMP_DIR;

      const { client } = await makeClient();
      const result = await client.callTool({
        name: "glass_session_start",
        arguments: { workspace: ws },
      });
      const parsed = JSON.parse(toolText(result));
      expect(parsed.ok).toBe(true);
      expect(parsed.profile).not.toBeNull();
      expect(parsed.profile.voices.I.color).toBe("amber");
    });
  });

  describe("glass_bridge_write", () => {
    it("patches bridge state and returns ok", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });
      const result = await client.callTool({
        name: "glass_bridge_write",
        arguments: { agent_state: "thinking", threshold_state: "evaluating", progress: 0.3 },
      });
      const parsed = JSON.parse(toolText(result));
      expect(parsed.ok).toBe(true);
      expect(parsed.state.agent_state).toBe("thinking");
    });

    it("rejects invalid threshold_state — Zod schema as first line of defence", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });
      const result = await client.callTool({
        name: "glass_bridge_write",
        arguments: { threshold_state: "not_a_valid_state" },
      });
      // Zod rejects before the handler runs; SDK wraps as MCP error.
      expect(toolIsError(result)).toBe(true);
      expect(toolText(result)).toMatch(/MCP error|invalid|threshold_state/i);
    });

    it("blocks jump from ground to elevated without passing through evaluating", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });
      const result = await client.callTool({
        name: "glass_bridge_write",
        arguments: { threshold_state: "elevated", progress: 1.0 },
      });
      const parsed = JSON.parse(toolText(result));
      expect(parsed.error).toContain("triadic guard");
    });

    it("returns error when writeBridge throws unexpectedly", async () => {
      try {
        vi.doMock("./bridge-writer.js", async () => {
          const actual =
            await vi.importActual<typeof import("./bridge-writer.js")>("./bridge-writer.js");
          return {
            ...actual,
            writeBridge: vi.fn(async () => {
              throw new Error("forced write failure");
            }),
          };
        });

        const { client } = await makeClient();
        const result = await client.callTool({
          name: "glass_bridge_write",
          arguments: { agent_state: "thinking" },
        });
        expect(toolIsError(result)).toBe(true);
        const parsed = JSON.parse(toolText(result));
        expect(parsed.error).toContain("forced write failure");
      } finally {
        vi.doUnmock("./bridge-writer.js");
        vi.resetModules();
      }
    });
  });

  describe("glass_emit_turn", () => {
    it("appends a turn to the conversation", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });
      const result = await client.callTool({
        name: "glass_emit_turn",
        arguments: { role: "user", text: "hello from test" },
      });
      const parsed = JSON.parse(toolText(result));
      expect(parsed.ok).toBe(true);
      expect(parsed.turns).toBe(1);
    });

    it("updates agent_state when provided", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });
      await client.callTool({
        name: "glass_emit_turn",
        arguments: { role: "agent", text: "processing", agent_state: "thinking" },
      });
      const { readFile } = await import("fs/promises");
      const raw = await readFile(BRIDGE, "utf-8");
      const state = JSON.parse(raw);
      expect(state.agent_state).toBe("thinking");
    });

    // Regression: glass_emit_turn previously skipped applyTriadicGuard entirely.
    // Zod handles enum validation at the schema layer; the triadic guard adds
    // defence-in-depth for programmatic bypasses. This test verifies the guard
    // does not break normal valid calls.
    it("regression: triadic guard does not block valid emit_turn calls", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });
      for (const [role, text] of [
        ["user", "init"],
        ["agent", "ack"],
      ] as const) {
        const result = await client.callTool({
          name: "glass_emit_turn",
          arguments: { role, text, agent_state: "thinking" },
        });
        expect(JSON.parse(toolText(result)).ok).toBe(true);
        expect(toolIsError(result)).toBeFalsy();
      }
    });
  });

  describe("glass_session_resume", () => {
    it("returns safe defaults before session start", async () => {
      const { client } = await makeClient();
      const result = await client.callTool({ name: "glass_session_resume", arguments: {} });
      const parsed = JSON.parse(toolText(result));
      expect(parsed.has_active_session).toBe(false);
      expect(parsed.threshold_state).toBe("ground");
      expect(parsed.agent_state).toBe("idle");
      expect(parsed.progress).toBe(0);
      expect(parsed.block_count).toBe(0);
      expect(parsed.conversation_turns).toBe(0);
      expect(parsed.last_turn).toBeNull();
    });

    it("summarizes populated session state", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: { name: "resume-check" } });
      await client.callTool({
        name: "glass_bridge_write",
        arguments: {
          threshold_state: "evaluating",
          progress: 0.42,
          blocks: [
            {
              id: "I",
              type: "note",
              language: "text",
              content: "Roman I",
              position: { x: 10, y: 20 },
              origin: "user",
            },
            {
              id: "II",
              type: "code",
              language: "typescript",
              content: "const x = 1;",
              position: { x: 40, y: 80 },
              origin: "agent",
            },
          ],
        },
      });
      await client.callTool({
        name: "glass_emit_turn",
        arguments: { role: "user", text: "hello from resume path", agent_state: "thinking" },
      });

      const result = await client.callTool({ name: "glass_session_resume", arguments: {} });
      const parsed = JSON.parse(toolText(result));
      expect(parsed.has_active_session).toBe(true);
      expect(parsed.threshold_state).toBe("evaluating");
      expect(parsed.agent_state).toBe("thinking");
      expect(parsed.progress).toBe(0.42);
      expect(parsed.block_count).toBe(2);
      expect(parsed.conversation_turns).toBe(1);
      expect(parsed.last_turn.role).toBe("user");
      expect(parsed.last_turn.preview).toContain("hello from resume path");
    });

    it("returns error payload when bridge read fails unexpectedly", async () => {
      try {
        vi.doMock("./bridge-writer.js", async () => {
          const actual =
            await vi.importActual<typeof import("./bridge-writer.js")>("./bridge-writer.js");
          return {
            ...actual,
            readBridge: vi.fn(async () => {
              throw new Error("forced read failure");
            }),
          };
        });

        const { client } = await makeClient();
        const result = await client.callTool({ name: "glass_session_resume", arguments: {} });
        expect(toolIsError(result)).toBe(true);
        const parsed = JSON.parse(toolText(result));
        expect(parsed.error).toContain("forced read failure");
      } finally {
        vi.doUnmock("./bridge-writer.js");
        vi.resetModules();
      }
    });
  });

  describe("glass_update_signals", () => {
    it("updates individual signal fields", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });
      const result = await client.callTool({
        name: "glass_update_signals",
        arguments: { git_diff_lines: 42 },
      });
      const parsed = JSON.parse(toolText(result));
      expect(parsed.ok).toBe(true);
      expect(parsed.signals.git_diff_lines).toBe(42);
      expect(parsed.signals.iteration_count).toBe(0);
      expect(parsed.signals.session_age_minutes).toBe(0);
    });

    it("merges with existing signals without clobbering", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });
      await client.callTool({
        name: "glass_update_signals",
        arguments: { git_diff_lines: 100, iteration_count: 5 },
      });
      const result = await client.callTool({
        name: "glass_update_signals",
        arguments: { session_age_minutes: 12 },
      });
      const parsed = JSON.parse(toolText(result));
      expect(parsed.signals.git_diff_lines).toBe(100);
      expect(parsed.signals.iteration_count).toBe(5);
      expect(parsed.signals.session_age_minutes).toBe(12);
    });

    it("overwrites a single field without touching others", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });
      await client.callTool({
        name: "glass_update_signals",
        arguments: { git_diff_lines: 50, iteration_count: 3 },
      });
      const result = await client.callTool({
        name: "glass_update_signals",
        arguments: { iteration_count: 7 },
      });
      const parsed = JSON.parse(toolText(result));
      expect(parsed.signals.git_diff_lines).toBe(50);
      expect(parsed.signals.iteration_count).toBe(7);
    });

    it("persists to bridge file on disk", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });
      await client.callTool({
        name: "glass_update_signals",
        arguments: { git_diff_lines: 200, session_age_minutes: 30 },
      });
      const { readFile } = await import("fs/promises");
      const raw = await readFile(BRIDGE, "utf-8");
      const state = JSON.parse(raw);
      expect(state.signals.git_diff_lines).toBe(200);
      expect(state.signals.session_age_minutes).toBe(30);
    });
  });

  describe("glass_pending_messages", () => {
    it("returns empty pending when no messages exist", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });
      const result = await client.callTool({
        name: "glass_pending_messages",
        arguments: {},
      });
      const parsed = JSON.parse(toolText(result));
      expect(parsed.count).toBe(0);
      expect(parsed.pending).toEqual([]);
      expect(parsed.hwm).toBe(0);
    });

    it("returns only user messages from conversation", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });
      await client.callTool({
        name: "glass_emit_turn",
        arguments: { role: "user", text: "hello from glass" },
      });
      await client.callTool({
        name: "glass_emit_turn",
        arguments: { role: "agent", text: "agent response" },
      });
      await client.callTool({
        name: "glass_emit_turn",
        arguments: { role: "user", text: "second glass message" },
      });

      const result = await client.callTool({
        name: "glass_pending_messages",
        arguments: {},
      });
      const parsed = JSON.parse(toolText(result));
      expect(parsed.count).toBe(2);
      expect(parsed.pending[0].text).toBe("hello from glass");
      expect(parsed.pending[0].role).toBe("user");
      expect(parsed.pending[1].text).toBe("second glass message");
      expect(parsed.total_conversation).toBe(3);
    });

    it("advances HWM so second call returns empty", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });
      await client.callTool({
        name: "glass_emit_turn",
        arguments: { role: "user", text: "msg1" },
      });

      const first = await client.callTool({
        name: "glass_pending_messages",
        arguments: {},
      });
      expect(JSON.parse(toolText(first)).count).toBe(1);

      const second = await client.callTool({
        name: "glass_pending_messages",
        arguments: {},
      });
      expect(JSON.parse(toolText(second)).count).toBe(0);
      expect(JSON.parse(toolText(second)).hwm).toBe(1);
    });

    it("delivers new messages after HWM advances", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });
      await client.callTool({
        name: "glass_emit_turn",
        arguments: { role: "user", text: "first" },
      });

      await client.callTool({ name: "glass_pending_messages", arguments: {} });

      await client.callTool({
        name: "glass_emit_turn",
        arguments: { role: "user", text: "arrived later" },
      });

      const result = await client.callTool({
        name: "glass_pending_messages",
        arguments: {},
      });
      const parsed = JSON.parse(toolText(result));
      expect(parsed.count).toBe(1);
      expect(parsed.pending[0].text).toBe("arrived later");
    });

    it("peek mode does not advance HWM", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });
      await client.callTool({
        name: "glass_emit_turn",
        arguments: { role: "user", text: "peek-me" },
      });

      const peek1 = await client.callTool({
        name: "glass_pending_messages",
        arguments: { peek: true },
      });
      expect(JSON.parse(toolText(peek1)).count).toBe(1);

      const peek2 = await client.callTool({
        name: "glass_pending_messages",
        arguments: { peek: true },
      });
      expect(JSON.parse(toolText(peek2)).count).toBe(1);

      const consume = await client.callTool({
        name: "glass_pending_messages",
        arguments: {},
      });
      expect(JSON.parse(toolText(consume)).count).toBe(1);

      const after = await client.callTool({
        name: "glass_pending_messages",
        arguments: {},
      });
      expect(JSON.parse(toolText(after)).count).toBe(0);
    });

    it("HWM resets on session_start", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });
      await client.callTool({
        name: "glass_emit_turn",
        arguments: { role: "user", text: "old session" },
      });
      await client.callTool({ name: "glass_pending_messages", arguments: {} });

      await client.callTool({ name: "glass_session_start", arguments: {} });
      await client.callTool({
        name: "glass_emit_turn",
        arguments: { role: "user", text: "new session" },
      });

      const result = await client.callTool({
        name: "glass_pending_messages",
        arguments: {},
      });
      const parsed = JSON.parse(toolText(result));
      expect(parsed.count).toBe(1);
      expect(parsed.pending[0].text).toBe("new session");
    });
  });

  describe("glass_evaluate_ceremony", () => {
    it("returns eligible=false when iteration_count is below threshold", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });
      // Default threshold is 15; iteration_count starts at 0.
      const result = await client.callTool({
        name: "glass_evaluate_ceremony",
        arguments: {},
      });
      const parsed = JSON.parse(toolText(result));
      expect(parsed.ok).toBe(true);
      expect(parsed.eligible).toBe(false);
      expect(parsed.threshold_met).toBe(false);
      expect(parsed.threshold_state_before).toBe("ground");
      expect(parsed.threshold_state_after).toBe("ground");
      expect(parsed.threshold).toBe(15);
    });

    it("transitions ground → evaluating when iteration_count meets threshold", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });
      await client.callTool({
        name: "glass_update_signals",
        arguments: { iteration_count: 15 },
      });
      const result = await client.callTool({
        name: "glass_evaluate_ceremony",
        arguments: {},
      });
      const parsed = JSON.parse(toolText(result));
      expect(parsed.ok).toBe(true);
      expect(parsed.eligible).toBe(true);
      expect(parsed.threshold_met).toBe(true);
      expect(parsed.threshold_state_before).toBe("ground");
      expect(parsed.threshold_state_after).toBe("evaluating");
    });

    it("does not re-transition when already in evaluating state", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });
      await client.callTool({
        name: "glass_update_signals",
        arguments: { iteration_count: 20 },
      });
      // First call transitions to evaluating.
      await client.callTool({ name: "glass_evaluate_ceremony", arguments: {} });
      // Second call: threshold_state is now evaluating — eligible must be false.
      const result = await client.callTool({
        name: "glass_evaluate_ceremony",
        arguments: {},
      });
      const parsed = JSON.parse(toolText(result));
      expect(parsed.eligible).toBe(false);
      expect(parsed.threshold_state_before).toBe("evaluating");
      expect(parsed.threshold_state_after).toBe("evaluating");
    });

    it("uses profile-supplied threshold when workspace provided", async () => {
      const ws = join(TMP_DIR, "ws-ceremony");
      await mkdir(ws, { recursive: true });
      await writeFile(
        join(ws, ".glass-profile.yaml"),
        `signals:\n  hot_threshold:\n    iteration_count: 5\n`,
        "utf-8",
      );
      process.env.CASCADE_WORKSPACE_ROOT = TMP_DIR;

      const { client } = await makeClient();
      await client.callTool({
        name: "glass_session_start",
        arguments: { workspace: ws },
      });
      await client.callTool({
        name: "glass_update_signals",
        arguments: { iteration_count: 5 },
      });
      const result = await client.callTool({
        name: "glass_evaluate_ceremony",
        arguments: {},
      });
      const parsed = JSON.parse(toolText(result));
      expect(parsed.threshold).toBe(5);
      expect(parsed.eligible).toBe(true);
      expect(parsed.threshold_state_after).toBe("evaluating");
    });

    it("uses in-memory threshold when _ceremony_eval_threshold absent from bridge", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });

      // Simulate Electron bridge-watcher stripping private keys by overwriting
      // the bridge file without _ceremony_eval_threshold.
      const { readFile, writeFile: wf } = await import("fs/promises");
      const raw = await readFile(BRIDGE, "utf-8");
      const bridgeData = JSON.parse(raw);
      delete bridgeData._ceremony_eval_threshold;
      delete bridgeData._ceremony_idle_minutes;
      await wf(BRIDGE, JSON.stringify(bridgeData), "utf-8");

      // Set iteration_count to exactly the default threshold (15).
      await client.callTool({
        name: "glass_update_signals",
        arguments: { iteration_count: 15 },
      });

      const result = await client.callTool({
        name: "glass_evaluate_ceremony",
        arguments: {},
      });
      const parsed2 = JSON.parse(toolText(result));
      expect(parsed2.threshold).toBe(15);
      expect(parsed2.eligible).toBe(true);
      expect(parsed2.threshold_state_after).toBe("evaluating");
    });
  });

  describe("glass_emit_block", () => {
    it("emits a block with position at slot 0", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });
      const result = await client.callTool({
        name: "glass_emit_block",
        arguments: { type: "note", content: "hello block" },
      });
      const parsed = JSON.parse(toolText(result));
      expect(parsed.ok).toBe(true);
      expect(parsed.slot).toBe(0);
      // slot 0: row=0, col=0 → x=760, y=80
      expect(parsed.position).toEqual({ x: 760, y: 80 });
      expect(typeof parsed.block_id).toBe("string");
    });

    it("assigns slot 1 (row=1, col=0) for the second agent block", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });
      await client.callTool({
        name: "glass_emit_block",
        arguments: { type: "note", content: "block A" },
      });
      const result = await client.callTool({
        name: "glass_emit_block",
        arguments: { type: "note", content: "block B" },
      });
      const parsed = JSON.parse(toolText(result));
      expect(parsed.slot).toBe(1);
      // slot 1: row=1, col=0 → x=760, y=280
      expect(parsed.position).toEqual({ x: 760, y: 280 });
    });

    it("assigns slot 4 (row=0, col=1) after filling first column", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });
      for (let i = 0; i < 4; i++) {
        await client.callTool({
          name: "glass_emit_block",
          arguments: { type: "note", content: `block ${i}` },
        });
      }
      const result = await client.callTool({
        name: "glass_emit_block",
        arguments: { type: "note", content: "block 5th" },
      });
      const parsed = JSON.parse(toolText(result));
      expect(parsed.slot).toBe(4);
      // slot 4: row=0, col=1 → x=980, y=80
      expect(parsed.position).toEqual({ x: 980, y: 80 });
    });

    it("stores ref_id on block", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });
      await client.callTool({
        name: "glass_emit_block",
        arguments: {
          type: "code",
          language: "typescript",
          content: "const x = 1;",
          ref_id: "agent-abc-123",
        },
      });
      const { readFile } = await import("fs/promises");
      const raw = await readFile(BRIDGE, "utf-8");
      const state = JSON.parse(raw);
      const block = state.blocks[0];
      expect(block.ref_id).toBe("agent-abc-123");
      expect(block.language).toBe("typescript");
      expect(block.origin).toBe("agent");
    });

    it("prunes oldest agent blocks when max_blocks exceeded", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });
      // Add 3 agent output blocks; max_blocks=2 on the 3rd → should prune the first
      await client.callTool({
        name: "glass_emit_block",
        arguments: { type: "output", content: "old1" },
      });
      await client.callTool({
        name: "glass_emit_block",
        arguments: { type: "output", content: "old2" },
      });
      const result = await client.callTool({
        name: "glass_emit_block",
        arguments: { type: "output", content: "new", max_blocks: 2 },
      });
      const parsed = JSON.parse(toolText(result));
      expect(parsed.block_count).toBe(2);
      const { readFile } = await import("fs/promises");
      const raw = await readFile(BRIDGE, "utf-8");
      const state = JSON.parse(raw);
      expect(state.blocks.map((b: { content: string }) => b.content)).not.toContain("old1");
      expect(state.blocks.map((b: { content: string }) => b.content)).toContain("new");
    });

    it("never prunes user-origin blocks", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });
      // Seed a user block directly via glass_bridge_write
      await client.callTool({
        name: "glass_bridge_write",
        arguments: {
          blocks: [
            {
              id: "user-block-1",
              type: "output",
              language: "text",
              content: "user note",
              position: { x: 0, y: 0 },
              origin: "user",
            },
          ],
        },
      });
      // Emit 2 agent output blocks with max_blocks=1 — should prune oldest agent but keep user block
      await client.callTool({
        name: "glass_emit_block",
        arguments: { type: "output", content: "agent1", max_blocks: 1 },
      });
      const result = await client.callTool({
        name: "glass_emit_block",
        arguments: { type: "output", content: "agent2", max_blocks: 1 },
      });
      const parsed = JSON.parse(toolText(result));
      // 1 user + 1 agent = 2 total
      expect(parsed.block_count).toBe(2);
      const { readFile } = await import("fs/promises");
      const raw = await readFile(BRIDGE, "utf-8");
      const state = JSON.parse(raw);
      const origins = state.blocks.map((b: { origin: string }) => b.origin);
      expect(origins).toContain("user");
      const contents = state.blocks.map((b: { content: string }) => b.content);
      expect(contents).toContain("user note");
      expect(contents).toContain("agent2");
      expect(contents).not.toContain("agent1");
    });

    it("mints an asset block when rarity is permitted by current ceremony state", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });
      await client.callTool({
        name: "glass_bridge_write",
        arguments: { threshold_state: "evaluating" },
      });
      await client.callTool({
        name: "glass_bridge_write",
        arguments: { threshold_state: "floor_rising" },
      });
      await client.callTool({
        name: "glass_bridge_write",
        arguments: { threshold_state: "voices_appearing" },
      });
      await client.callTool({
        name: "glass_bridge_write",
        arguments: { threshold_state: "voice_1_active" },
      });
      await client.callTool({
        name: "glass_bridge_write",
        arguments: { threshold_state: "voice_2_active" },
      });
      await client.callTool({
        name: "glass_bridge_write",
        arguments: { threshold_state: "voice_3_active" },
      });
      await client.callTool({
        name: "glass_bridge_write",
        arguments: { threshold_state: "elevated", progress: 1 },
      });

      const result = await client.callTool({
        name: "glass_emit_block",
        arguments: {
          type: "asset",
          content: "A durable semantic anchor",
          asset_category: "relic",
          asset_rarity: "mythic",
          asset_label: "Rift Anchor",
          asset_glyph: "*",
        },
      });

      const parsed = JSON.parse(toolText(result));
      expect(parsed.ok).toBe(true);

      const { readFile } = await import("fs/promises");
      const raw = await readFile(BRIDGE, "utf-8");
      const state = JSON.parse(raw);
      expect(state.blocks[0].type).toBe("asset");
      expect(state.blocks[0].asset).toMatchObject({
        category: "relic",
        rarity: "mythic",
        label: "Rift Anchor",
        source_ceremony: "elevated",
      });
      expect(state.blocks[0].asset.ledger_id).toMatch(/^asset-/);

      const inventoryRaw = await readFile(INVENTORY, "utf-8");
      const inventory = JSON.parse(inventoryRaw);
      expect(inventory.assets).toHaveLength(1);
      expect(inventory.assets[0]).toMatchObject({
        ledger_id: state.blocks[0].asset.ledger_id,
        block_id: state.blocks[0].id,
        category: "relic",
        rarity: "mythic",
        label: "Rift Anchor",
        source_ceremony: "elevated",
      });
    });

    it("rejects asset minting when rarity exceeds current ceremony ceiling", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });

      const result = await client.callTool({
        name: "glass_emit_block",
        arguments: {
          type: "asset",
          content: "Too early",
          asset_category: "relic",
          asset_rarity: "mythic",
          asset_label: "Forbidden Anchor",
        },
      });

      expect(toolIsError(result)).toBe(true);
      const parsed = JSON.parse(toolText(result));
      expect(parsed.error).toContain("not permitted");
    });

    it("keeps asset blocks when pruning ordinary agent blocks", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });
      await client.callTool({
        name: "glass_emit_block",
        arguments: {
          type: "asset",
          content: "A common field marker",
          asset_category: "token",
          asset_rarity: "common",
          asset_label: "Field Token",
        },
      });
      await client.callTool({
        name: "glass_emit_block",
        arguments: { type: "output", content: "agent1", max_blocks: 1 },
      });
      await client.callTool({
        name: "glass_emit_block",
        arguments: { type: "output", content: "agent2", max_blocks: 1 },
      });

      const { readFile } = await import("fs/promises");
      const raw = await readFile(BRIDGE, "utf-8");
      const state = JSON.parse(raw);
      const contents = state.blocks.map((b: { content: string }) => b.content);
      expect(contents).toContain("A common field marker");
      expect(contents).toContain("agent2");
      expect(contents).not.toContain("agent1");
    });
  });

  describe("glass_eval_run", () => {
    beforeEach(() => {
      // Point probes at a non-existent path so typecheck/tests fail fast
      // (execSync throws ENOENT) rather than running the full Glass app suite.
      process.env.GLASS_APP_PATH = join(TMP_DIR, "no-such-app");
    });

    afterEach(() => {
      delete process.env.GLASS_APP_PATH;
    });

    it("returns an EvalReport with 4 probes", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });
      const result = await client.callTool({ name: "glass_eval_run", arguments: {} });
      expect(toolIsError(result)).toBeFalsy();
      const parsed = JSON.parse(toolText(result));
      expect(typeof parsed.id).toBe("string");
      expect(typeof parsed.timestamp).toBe("string");
      expect(typeof parsed.durationMs).toBe("number");
      expect(Array.isArray(parsed.probes)).toBe(true);
      expect(parsed.probes).toHaveLength(4);
    });

    it("each probe has name, status, durationMs, and detail", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });
      const result = await client.callTool({ name: "glass_eval_run", arguments: {} });
      const parsed = JSON.parse(toolText(result));
      for (const probe of parsed.probes) {
        expect(typeof probe.name).toBe("string");
        expect(["pass", "fail", "error"]).toContain(probe.status);
        expect(typeof probe.durationMs).toBe("number");
        expect(typeof probe.detail).toBe("object");
      }
    });

    it("summary total is 4 and counts sum correctly", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });
      const result = await client.callTool({ name: "glass_eval_run", arguments: {} });
      const parsed = JSON.parse(toolText(result));
      expect(parsed.summary.total).toBe(4);
      expect(parsed.summary.passed + parsed.summary.failed + parsed.summary.errored).toBe(4);
    });

    it("bridge probe passes when session has been started", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });
      const result = await client.callTool({ name: "glass_eval_run", arguments: {} });
      const parsed = JSON.parse(toolText(result));
      const bridgeProbe = parsed.probes.find((p: { name: string }) => p.name === "bridge");
      expect(bridgeProbe).toBeDefined();
      expect(bridgeProbe.status).toBe("pass");
    });

    it("ceremony_gate probe reports eligible=false when iteration_count is 0", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });
      const result = await client.callTool({ name: "glass_eval_run", arguments: {} });
      const parsed = JSON.parse(toolText(result));
      const gateProbe = parsed.probes.find((p: { name: string }) => p.name === "ceremony_gate");
      expect(gateProbe).toBeDefined();
      expect(gateProbe.detail.eligible).toBe(false);
    });
  });

  describe("glass_eval_schedule", () => {
    it("arm returns schedulerState armed with provided interval", async () => {
      const { client } = await makeClient();
      const result = await client.callTool({
        name: "glass_eval_schedule",
        arguments: { action: "arm", interval_seconds: 60 },
      });
      expect(toolIsError(result)).toBeFalsy();
      const parsed = JSON.parse(toolText(result));
      expect(parsed.schedulerState).toBe("armed");
      expect(parsed.intervalSeconds).toBe(60);
      // Disarm to clean up the timer.
      await client.callTool({ name: "glass_eval_schedule", arguments: { action: "disarm" } });
    });

    it("arm uses default interval of 300 when not specified", async () => {
      const { client } = await makeClient();
      const result = await client.callTool({
        name: "glass_eval_schedule",
        arguments: { action: "arm" },
      });
      const parsed = JSON.parse(toolText(result));
      expect(parsed.schedulerState).toBe("armed");
      expect(parsed.intervalSeconds).toBe(300);
      await client.callTool({ name: "glass_eval_schedule", arguments: { action: "disarm" } });
    });

    it("disarm after arm returns schedulerState disarmed", async () => {
      const { client } = await makeClient();
      await client.callTool({
        name: "glass_eval_schedule",
        arguments: { action: "arm", interval_seconds: 60 },
      });
      const result = await client.callTool({
        name: "glass_eval_schedule",
        arguments: { action: "disarm" },
      });
      const parsed = JSON.parse(toolText(result));
      expect(parsed.schedulerState).toBe("disarmed");
    });

    it("status reflects armed state immediately after arm", async () => {
      const { client } = await makeClient();
      await client.callTool({
        name: "glass_eval_schedule",
        arguments: { action: "arm", interval_seconds: 90 },
      });
      const statusResult = await client.callTool({ name: "glass_eval_status", arguments: {} });
      const parsed = JSON.parse(toolText(statusResult));
      expect(parsed.schedulerState).toBe("armed");
      expect(parsed.intervalSeconds).toBe(90);
      await client.callTool({ name: "glass_eval_schedule", arguments: { action: "disarm" } });
    });
  });

  describe("glass_eval_status", () => {
    it("returns schedulerState idle before any schedule action", async () => {
      const { client } = await makeClient();
      const result = await client.callTool({ name: "glass_eval_status", arguments: {} });
      expect(toolIsError(result)).toBeFalsy();
      const parsed = JSON.parse(toolText(result));
      expect(parsed.schedulerState).toBe("idle");
    });

    it("log_path ends with glass-eval-log.ndjson", async () => {
      const { client } = await makeClient();
      const result = await client.callTool({ name: "glass_eval_status", arguments: {} });
      const parsed = JSON.parse(toolText(result));
      expect(parsed.log_path).toMatch(/glass-eval-log\.ndjson$/);
    });

    it("lastReport is undefined before any eval run", async () => {
      const { client } = await makeClient();
      const result = await client.callTool({ name: "glass_eval_status", arguments: {} });
      const parsed = JSON.parse(toolText(result));
      expect(parsed.lastReport).toBeUndefined();
    });

    it("lastReport is populated after glass_eval_run", async () => {
      process.env.GLASS_APP_PATH = join(TMP_DIR, "no-such-app");
      try {
        const { client } = await makeClient();
        await client.callTool({ name: "glass_session_start", arguments: {} });
        await client.callTool({ name: "glass_eval_run", arguments: {} });
        const statusResult = await client.callTool({ name: "glass_eval_status", arguments: {} });
        const parsed = JSON.parse(toolText(statusResult));
        expect(parsed.lastReport).toBeDefined();
        expect(parsed.lastReport.summary.total).toBe(4);
      } finally {
        delete process.env.GLASS_APP_PATH;
      }
    });
  });

  describe("glass_assets_list", () => {
    it("lists durable assets from the inventory ledger", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });
      await client.callTool({
        name: "glass_emit_block",
        arguments: {
          type: "asset",
          content: "A common token",
          asset_category: "token",
          asset_rarity: "common",
          asset_label: "Field Token",
        },
      });

      const result = await client.callTool({
        name: "glass_assets_list",
        arguments: { category: "token" },
      });

      const parsed = JSON.parse(toolText(result));
      expect(parsed.ok).toBe(true);
      expect(parsed.inventory_path).toBe(INVENTORY);
      expect(parsed.count).toBe(1);
      expect(parsed.assets[0]).toMatchObject({
        category: "token",
        rarity: "common",
        label: "Field Token",
      });
    });

    it("returns newest assets first and respects limit", async () => {
      const { client } = await makeClient();
      await client.callTool({ name: "glass_session_start", arguments: {} });
      for (const label of ["One", "Two", "Three"]) {
        await client.callTool({
          name: "glass_emit_block",
          arguments: {
            type: "asset",
            content: label,
            asset_category: "token",
            asset_rarity: "common",
            asset_label: label,
          },
        });
      }

      const result = await client.callTool({
        name: "glass_assets_list",
        arguments: { limit: 2 },
      });

      const parsed = JSON.parse(toolText(result));
      expect(parsed.count).toBe(2);
      expect(parsed.assets.map((asset: { label: string }) => asset.label)).toEqual([
        "Three",
        "Two",
      ]);
    });
  });

  describe("glass_query_spatial_state", () => {
    it("returns empty blocks and zero heat when bridge is empty", async () => {
      const { client } = await makeClient();
      const result = await client.callTool({
        name: "glass_query_spatial_state",
        arguments: {},
      });
      const parsed = JSON.parse(toolText(result));
      expect(parsed.ok).toBe(true);
      expect(parsed.block_count).toBe(0);
      expect(parsed.blocks).toEqual([]);
      expect(parsed.stale_candidates).toEqual([]);
      expect(parsed.field_heat).toBe(0);
      expect(parsed.is_hot).toBe(false);
    });

    it("returns spaceman_position at canvas center", async () => {
      const { client } = await makeClient();
      const result = await client.callTool({
        name: "glass_query_spatial_state",
        arguments: {},
      });
      const parsed = JSON.parse(toolText(result));
      expect(parsed.spaceman_position).toEqual({ x: 700, y: 450 });
    });

    it("computes distance_from_spaceman correctly", async () => {
      // Write a bridge with one block at a known position
      const { writeFile } = await import("fs/promises");
      await writeFile(
        BRIDGE,
        JSON.stringify({
          session_id: "test",
          threshold_state: "ground",
          blocks: [
            {
              id: "b1",
              type: "note",
              origin: "agent",
              language: "text",
              content: "hello",
              position: { x: 700, y: 450 }, // exactly at spaceman → distance 0
            },
            {
              id: "b2",
              type: "code",
              origin: "user",
              language: "typescript",
              content: "x",
              position: { x: 700, y: 450 + 100 }, // 100px below → distance 100
            },
          ],
          conversation: [],
          signals: { git_diff_lines: 0, iteration_count: 0, session_age_minutes: 0 },
        }),
        "utf-8",
      );

      const { client } = await makeClient();
      const result = await client.callTool({
        name: "glass_query_spatial_state",
        arguments: {},
      });
      const parsed = JSON.parse(toolText(result));

      const b1 = parsed.blocks.find((b: { id: string }) => b.id === "b1");
      const b2 = parsed.blocks.find((b: { id: string }) => b.id === "b2");

      expect(b1.distance_from_spaceman).toBe(0);
      expect(b1.staleness_score).toBe(0);
      expect(b2.distance_from_spaceman).toBe(100);
      expect(b2.staleness_score).toBeGreaterThan(0);
    });

    it("stale_candidates are sorted farthest first", async () => {
      const { writeFile } = await import("fs/promises");
      await writeFile(
        BRIDGE,
        JSON.stringify({
          session_id: "test",
          threshold_state: "ground",
          blocks: [
            {
              id: "near",
              type: "note",
              origin: "agent",
              language: "text",
              content: "",
              position: { x: 700, y: 450 },
            },
            {
              id: "mid",
              type: "note",
              origin: "agent",
              language: "text",
              content: "",
              position: { x: 700, y: 550 },
            },
            {
              id: "far",
              type: "note",
              origin: "agent",
              language: "text",
              content: "",
              position: { x: 0, y: 0 },
            },
          ],
          conversation: [],
          signals: { git_diff_lines: 0, iteration_count: 0, session_age_minutes: 0 },
        }),
        "utf-8",
      );

      const { client } = await makeClient();
      const result = await client.callTool({
        name: "glass_query_spatial_state",
        arguments: { stale_limit: 2 },
      });
      const parsed = JSON.parse(toolText(result));

      expect(parsed.stale_candidates).toHaveLength(2);
      expect(parsed.stale_candidates[0]).toBe("far"); // farthest first
    });

    it("computes field_heat from iteration_count vs hot_threshold", async () => {
      const { writeFile } = await import("fs/promises");
      await writeFile(
        BRIDGE,
        JSON.stringify({
          session_id: "test",
          threshold_state: "ground",
          blocks: [],
          conversation: [],
          signals: { git_diff_lines: 0, iteration_count: 10, session_age_minutes: 0 },
          _hot_threshold: { git_diff_lines: 200, iteration_count: 20, session_age_minutes: 60 },
        }),
        "utf-8",
      );

      const { client } = await makeClient();
      const result = await client.callTool({
        name: "glass_query_spatial_state",
        arguments: {},
      });
      const parsed = JSON.parse(toolText(result));

      // 10 / 20 = 0.5
      expect(parsed.field_heat).toBe(0.5);
      expect(parsed.is_hot).toBe(false);
    });

    it("is_hot true when signals meet or exceed threshold", async () => {
      const { writeFile } = await import("fs/promises");
      await writeFile(
        BRIDGE,
        JSON.stringify({
          session_id: "test",
          threshold_state: "ground",
          blocks: [],
          conversation: [],
          signals: { git_diff_lines: 0, iteration_count: 20, session_age_minutes: 0 },
          _hot_threshold: { git_diff_lines: 200, iteration_count: 20, session_age_minutes: 60 },
        }),
        "utf-8",
      );

      const { client } = await makeClient();
      const result = await client.callTool({
        name: "glass_query_spatial_state",
        arguments: {},
      });
      const parsed = JSON.parse(toolText(result));

      expect(parsed.field_heat).toBe(1);
      expect(parsed.is_hot).toBe(true);
    });

    it("staleness_score is clamped to 1 for blocks far outside canvas bounds", async () => {
      const { writeFile } = await import("fs/promises");
      await writeFile(
        BRIDGE,
        JSON.stringify({
          session_id: "test",
          threshold_state: "ground",
          blocks: [
            {
              id: "wayout",
              type: "note",
              origin: "agent",
              language: "text",
              content: "",
              position: { x: 9999, y: 9999 },
            },
          ],
          conversation: [],
          signals: { git_diff_lines: 0, iteration_count: 0, session_age_minutes: 0 },
        }),
        "utf-8",
      );

      const { client } = await makeClient();
      const result = await client.callTool({
        name: "glass_query_spatial_state",
        arguments: {},
      });
      const parsed = JSON.parse(toolText(result));
      expect(parsed.blocks[0].staleness_score).toBe(1);
    });
  });

  describe("glass_reward_state", () => {
    afterEach(() => {
      vi.restoreAllMocks();
      delete process.env.XCHANGE_INGEST_TOKEN;
      delete process.env.XCHANGE_URL;
    });

    it("returns error when XCHANGE_INGEST_TOKEN is not set", async () => {
      delete process.env.XCHANGE_INGEST_TOKEN;
      vi.resetModules();
      const { client } = await makeClient();
      const result = await client.callTool({
        name: "glass_reward_state",
        arguments: { reward_id: "r-no-token", poll_interval_seconds: 0 },
      });
      expect(toolIsError(result)).toBe(true);
      const parsed = JSON.parse(toolText(result));
      expect(parsed.error).toContain("XCHANGE_INGEST_TOKEN");
    });

    it("returns state and block_id on successful poll", async () => {
      process.env.XCHANGE_INGEST_TOKEN = "test-tok";
      process.env.XCHANGE_URL = "http://127.0.0.1:18788";
      const payload = {
        reward_id: "r-srv",
        state: "earned",
        reward_token_amount: 50,
        updated_at: "2026-01-01T00:00:00Z",
      };
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, json: async () => payload }),
      );
      vi.resetModules();
      const { client } = await makeClient();
      const result = await client.callTool({
        name: "glass_reward_state",
        arguments: { reward_id: "r-srv", poll_interval_seconds: 0 },
      });
      expect(toolIsError(result)).toBeUndefined();
      const parsed = JSON.parse(toolText(result));
      expect(parsed.state).toBe("earned");
      expect(parsed.block_id).toBe("reward-state-r-srv");
      expect(parsed.poller_state).toBe("disarmed");
    });

    it("returns error when x-change returns non-ok status", async () => {
      process.env.XCHANGE_INGEST_TOKEN = "test-tok";
      process.env.XCHANGE_URL = "http://127.0.0.1:18788";
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
      vi.resetModules();
      const { client } = await makeClient();
      const result = await client.callTool({
        name: "glass_reward_state",
        arguments: { reward_id: "r-404", poll_interval_seconds: 0 },
      });
      expect(toolIsError(result)).toBe(true);
      const parsed = JSON.parse(toolText(result));
      expect(parsed.error).toContain("HTTP 404");
    });
  });
});
