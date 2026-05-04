import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
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
  await rm(TMP_DIR, { recursive: true, force: true });
  await mkdir(TMP_DIR, { recursive: true });
  vi.resetModules();
});

afterAll(async () => {
  delete process.env.GLASS_BRIDGE_PATH;
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
});
