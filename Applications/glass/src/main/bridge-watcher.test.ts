import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";

vi.mock("fs");
vi.mock("os", () => ({ default: { homedir: () => "/mock-home" }, homedir: () => "/mock-home" }));

const BRIDGE_PATH = "/mock-home/.caraxes/field-bridge.json";

function makeBridgeState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    timestamp: "2026-01-01T00:00:00Z",
    session_id: "test",
    agent_state: "idle",
    blocks: [],
    conversation: [],
    threshold_state: "ground",
    progress: 0,
    voices: [],
    signals: { git_diff_lines: 0, iteration_count: 0, session_age_minutes: 0 },
    ...overrides,
  };
}

function mockReadSync(state: Record<string, unknown>): void {
  vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(state));
}

let writtenData: string | null = null;

beforeEach(() => {
  vi.resetModules();
  vi.mocked(fs.readFileSync).mockReset();
  vi.mocked(fs.writeFileSync).mockReset();
  vi.mocked(fs.renameSync).mockReset();
  vi.mocked(fs.existsSync).mockReturnValue(true);
  writtenData = null;
  vi.mocked(fs.writeFileSync).mockImplementation((_p, data) => {
    writtenData = typeof data === "string" ? data : String(data);
  });
  vi.mocked(fs.renameSync).mockImplementation(() => {});
});

describe("appendConversationTurn", () => {
  it("appends a user message to conversation", async () => {
    const { appendConversationTurn } = await import("./bridge-watcher");
    mockReadSync(makeBridgeState());
    appendConversationTurn("hello");
    expect(writtenData).not.toBeNull();
    const state = JSON.parse(writtenData!);
    expect(state.conversation).toHaveLength(1);
    expect(state.conversation[0].role).toBe("user");
    expect(state.conversation[0].text).toBe("hello");
    expect(state.conversation[0].timestamp).toBeTruthy();
  });

  it("appends to existing conversation", async () => {
    const { appendConversationTurn } = await import("./bridge-watcher");
    mockReadSync(
      makeBridgeState({
        conversation: [{ role: "agent", text: "hi", timestamp: "2026-01-01T00:00:00Z" }],
      }),
    );
    appendConversationTurn("reply");
    const state = JSON.parse(writtenData!);
    expect(state.conversation).toHaveLength(2);
    expect(state.conversation[1].text).toBe("reply");
  });

  it("rejects empty text", async () => {
    const { appendConversationTurn } = await import("./bridge-watcher");
    mockReadSync(makeBridgeState());
    appendConversationTurn("");
    expect(writtenData).toBeNull();
  });

  it("rejects text exceeding max length", async () => {
    const { appendConversationTurn } = await import("./bridge-watcher");
    mockReadSync(makeBridgeState());
    appendConversationTurn("x".repeat(32_769));
    expect(writtenData).toBeNull();
  });

  it("caps conversation at 200 entries", async () => {
    const { appendConversationTurn } = await import("./bridge-watcher");
    const existing = Array.from({ length: 200 }, (_, i) => ({
      role: "agent",
      text: `msg-${i}`,
      timestamp: "2026-01-01T00:00:00Z",
    }));
    mockReadSync(makeBridgeState({ conversation: existing }));
    appendConversationTurn("overflow");
    const state = JSON.parse(writtenData!);
    expect(state.conversation).toHaveLength(200);
    expect(state.conversation[199].text).toBe("overflow");
    expect(state.conversation[0].text).toBe("msg-1");
  });
});

describe("addBridgeBlock", () => {
  it("adds a code block with generated ID", async () => {
    const { addBridgeBlock } = await import("./bridge-watcher");
    mockReadSync(makeBridgeState());
    addBridgeBlock({
      type: "code",
      language: "typescript",
      content: "const x = 1;",
      position: { x: 100, y: 200 },
      origin: "user",
    });
    expect(writtenData).not.toBeNull();
    const state = JSON.parse(writtenData!);
    expect(state.blocks).toHaveLength(1);
    expect(state.blocks[0].id).toMatch(/^user-/);
    expect(state.blocks[0].type).toBe("code");
    expect(state.blocks[0].language).toBe("typescript");
    expect(state.blocks[0].content).toBe("const x = 1;");
    expect(state.blocks[0].position).toEqual({ x: 100, y: 200 });
    expect(state.blocks[0].origin).toBe("user");
  });

  it("rejects invalid type", async () => {
    const { addBridgeBlock } = await import("./bridge-watcher");
    mockReadSync(makeBridgeState());
    addBridgeBlock({
      type: "invalid",
      language: "text",
      content: "",
      position: { x: 0, y: 0 },
      origin: "user",
    });
    expect(writtenData).toBeNull();
  });

  it("rejects when blocks at capacity", async () => {
    const { addBridgeBlock } = await import("./bridge-watcher");
    const blocks = Array.from({ length: 200 }, (_, i) => ({
      id: `b-${i}`,
      type: "code",
      language: "text",
      content: "",
      position: { x: 0, y: 0 },
      origin: "user",
    }));
    mockReadSync(makeBridgeState({ blocks }));
    addBridgeBlock({
      type: "code",
      language: "text",
      content: "",
      position: { x: 0, y: 0 },
      origin: "user",
    });
    expect(writtenData).toBeNull();
  });
});

describe("patchBridgeBlockPosition", () => {
  it("updates position of existing block", async () => {
    const { patchBridgeBlockPosition } = await import("./bridge-watcher");
    mockReadSync(
      makeBridgeState({
        blocks: [
          {
            id: "b1",
            type: "code",
            language: "ts",
            content: "x",
            position: { x: 0, y: 0 },
            origin: "user",
          },
        ],
      }),
    );
    patchBridgeBlockPosition("b1", 50, 75);
    const state = JSON.parse(writtenData!);
    expect(state.blocks[0].position).toEqual({ x: 50, y: 75 });
  });

  it("skips unknown block ID silently", async () => {
    const { patchBridgeBlockPosition } = await import("./bridge-watcher");
    mockReadSync(makeBridgeState({ blocks: [] }));
    patchBridgeBlockPosition("unknown", 10, 20);
    expect(writtenData).toBeNull();
  });

  it("rejects non-finite coordinates", async () => {
    const { patchBridgeBlockPosition } = await import("./bridge-watcher");
    mockReadSync(makeBridgeState());
    patchBridgeBlockPosition("b1", NaN, 10);
    expect(writtenData).toBeNull();
  });
});

describe("patchBridgeBlock", () => {
  it("updates content of existing block", async () => {
    const { patchBridgeBlock } = await import("./bridge-watcher");
    mockReadSync(
      makeBridgeState({
        blocks: [
          {
            id: "b1",
            type: "code",
            language: "ts",
            content: "old",
            position: { x: 0, y: 0 },
            origin: "user",
          },
        ],
      }),
    );
    patchBridgeBlock("b1", "new content");
    const state = JSON.parse(writtenData!);
    expect(state.blocks[0].content).toBe("new content");
  });

  it("skips unknown block ID", async () => {
    const { patchBridgeBlock } = await import("./bridge-watcher");
    mockReadSync(makeBridgeState({ blocks: [] }));
    patchBridgeBlock("unknown", "data");
    expect(writtenData).toBeNull();
  });
});
