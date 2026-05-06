import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import type { FieldProfile } from "../../bridge/schema";

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

const TEST_PROFILE: FieldProfile = {
  profileName: "Test Profile",
  version: "1.0.0",
  modulation: {
    envelopes: {
      ground: { sustain: 0.12, lfoRate: 0.04, lfoDepth: 0.025 },
      evaluating: { sustain: 0.5, lfoRate: 0.18, lfoDepth: 0.07 },
      floor_rising: { sustain: 1, lfoRate: 0.22, lfoDepth: 0.04 },
      voices_appearing: { sustain: 0.85, lfoRate: 0.12, lfoDepth: 0.05 },
      voice_1_active: { sustain: 0.88, lfoRate: 0.1, lfoDepth: 0.06 },
      voice_2_active: { sustain: 0.88, lfoRate: 0.13, lfoDepth: 0.06 },
      voice_3_active: { sustain: 0.88, lfoRate: 0.09, lfoDepth: 0.06 },
      elevated: { sustain: 1, lfoRate: 0.07, lfoDepth: 0.03 },
      returning: { sustain: 0.25, lfoRate: 0.06, lfoDepth: 0.03 },
      denied: { sustain: 0.08, lfoRate: 0.35, lfoDepth: 0.1 },
    },
    base: {
      disk: { scale: 0.06, brightness: 0.04, rimAlpha: 0.05 },
      oval: { opacity: 0.03, lineWidth: 0.3, markerAlpha: 0.04, fieldAlpha: 0.02 },
      voice: { alpha: 0, scanSpeed: 0.4, glowRadius: 8 },
      field: { ambientIntensity: 0.28 },
      block: { levitationMod: 0.88 },
    },
    recipe: {
      disk: { scale: 0.94, brightness: 0.96, rimAlpha: 0.95 },
      oval: { opacity: 0.72, lineWidth: 2.1, markerAlpha: 0.82, fieldAlpha: 0.55 },
      voice: { alpha: 0.9, scanSpeed: 1.8, glowRadius: 18 },
      field: { ambientIntensity: 0.44 },
      block: { levitationMod: 0.12 },
    },
  },
  ceremony: {
    rarityGate: {
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
    },
  },
  workflow: {
    goalStatement: "Test goal",
    hardConstraints: ["Constraint 1"],
    functions: [],
    lanes: [],
  },
};

async function configureWatcherProfile(): Promise<void> {
  const { setBridgeFieldProfile } = await import("./bridge-watcher");
  setBridgeFieldProfile(TEST_PROFILE);
}

let writtenData: string | null = null;
let warnSpy: ReturnType<typeof vi.spyOn> | null = null;
let errorSpy: ReturnType<typeof vi.spyOn> | null = null;

beforeEach(() => {
  vi.resetModules();
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
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

afterEach(() => {
  warnSpy?.mockRestore();
  errorSpy?.mockRestore();
  warnSpy = null;
  errorSpy = null;
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
    await configureWatcherProfile();
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
    await configureWatcherProfile();
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

  it("adds asset blocks when rarity is permitted by current ceremony state", async () => {
    await configureWatcherProfile();
    const { addBridgeBlock } = await import("./bridge-watcher");
    mockReadSync(makeBridgeState({ threshold_state: "elevated" }));
    addBridgeBlock({
      type: "asset",
      language: "text",
      content: "Rift-crossing invariant",
      position: { x: 100, y: 200 },
      origin: "agent",
      asset: {
        category: "relic",
        rarity: "mythic",
        label: "Rift Anchor",
        glyph: "*",
        acquired_at: "2026-01-01T00:00:00Z",
        source_ceremony: "elevated",
        source_session: "test",
      },
    });
    expect(writtenData).not.toBeNull();
    const state = JSON.parse(writtenData!);
    expect(state.blocks[0].type).toBe("asset");
    expect(state.blocks[0].asset.rarity).toBe("mythic");
  });

  it("rejects asset blocks when rarity exceeds ceremony ceiling", async () => {
    await configureWatcherProfile();
    const { addBridgeBlock } = await import("./bridge-watcher");
    mockReadSync(makeBridgeState({ threshold_state: "ground" }));
    addBridgeBlock({
      type: "asset",
      language: "text",
      content: "Too early",
      position: { x: 0, y: 0 },
      origin: "agent",
      asset: {
        category: "relic",
        rarity: "mythic",
        label: "Forbidden Anchor",
        acquired_at: "2026-01-01T00:00:00Z",
        source_ceremony: "ground",
        source_session: "test",
      },
    });
    expect(writtenData).toBeNull();
  });

  it("rejects when blocks at capacity", async () => {
    await configureWatcherProfile();
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

  it("rejects position changes for agent-owned blocks", async () => {
    const { patchBridgeBlockPosition } = await import("./bridge-watcher");
    mockReadSync(
      makeBridgeState({
        blocks: [
          {
            id: "agent-1",
            type: "code",
            language: "ts",
            content: "x",
            position: { x: 0, y: 0 },
            origin: "agent",
          },
        ],
      }),
    );

    patchBridgeBlockPosition("agent-1", 50, 75);

    expect(writtenData).toBeNull();
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

  it("rejects content changes for agent-owned blocks", async () => {
    const { patchBridgeBlock } = await import("./bridge-watcher");
    mockReadSync(
      makeBridgeState({
        blocks: [
          {
            id: "agent-1",
            type: "code",
            language: "ts",
            content: "old",
            position: { x: 0, y: 0 },
            origin: "agent",
          },
        ],
      }),
    );

    patchBridgeBlock("agent-1", "new content");

    expect(writtenData).toBeNull();
  });

  it("skips unknown block ID", async () => {
    const { patchBridgeBlock } = await import("./bridge-watcher");
    mockReadSync(makeBridgeState({ blocks: [] }));
    patchBridgeBlock("unknown", "data");
    expect(writtenData).toBeNull();
  });
});

describe("validateBridgeState voices", () => {
  it("drops malformed voices while preserving valid voice entries", async () => {
    await configureWatcherProfile();
    const { addBridgeBlock } = await import("./bridge-watcher");
    mockReadSync(
      makeBridgeState({
        voices: [
          { id: "I", color: "amber", position: "left", text: "ready", active: true },
          { id: "IV", color: "gold", position: "right", text: "invalid id", active: true },
          { id: "II", color: "blue", position: "center", text: "invalid color", active: true },
        ],
      }),
    );

    addBridgeBlock({
      type: "code",
      language: "typescript",
      content: "",
      position: { x: 0, y: 0 },
      origin: "user",
    });

    const state = JSON.parse(writtenData!);
    expect(state.voices).toEqual([
      { id: "I", color: "amber", position: "left", text: "ready", active: true },
    ]);
  });
});

describe("deleteBridgeBlock", () => {
  it("deletes a user-owned block by id", async () => {
    vi.resetModules();
    await configureWatcherProfile();
    const { deleteBridgeBlock } = await import("./bridge-watcher");
    mockReadSync(
      makeBridgeState({
        blocks: [
          { id: "b1", type: "code", language: "ts", content: "", x: 0, y: 0, origin: "user" },
        ],
      }),
    );
    deleteBridgeBlock("b1");
    const state = JSON.parse(writtenData!);
    expect(state.blocks).toHaveLength(0);
  });

  it("skips unknown block id and does not write", async () => {
    vi.resetModules();
    await configureWatcherProfile();
    const { deleteBridgeBlock } = await import("./bridge-watcher");
    mockReadSync(makeBridgeState({ blocks: [] }));
    deleteBridgeBlock("nonexistent");
    expect(writtenData).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("rejects agent-owned block and does not write", async () => {
    vi.resetModules();
    await configureWatcherProfile();
    const { deleteBridgeBlock } = await import("./bridge-watcher");
    mockReadSync(
      makeBridgeState({
        blocks: [
          { id: "b2", type: "code", language: "ts", content: "", x: 0, y: 0, origin: "agent" },
        ],
      }),
    );
    deleteBridgeBlock("b2");
    expect(writtenData).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("no-ops when state.blocks is not an array", async () => {
    vi.resetModules();
    await configureWatcherProfile();
    const { deleteBridgeBlock } = await import("./bridge-watcher");
    mockReadSync(makeBridgeState({ blocks: null }));
    deleteBridgeBlock("b1");
    expect(writtenData).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe("setBridgeThresholdState", () => {
  it("persists a valid ThresholdState", async () => {
    vi.resetModules();
    const { setBridgeThresholdState } = await import("./bridge-watcher");
    mockReadSync(makeBridgeState({ threshold_state: "ground" }));
    setBridgeThresholdState("elevated");
    expect(writtenData).not.toBeNull();
    const state = JSON.parse(writtenData!);
    expect(state.threshold_state).toBe("elevated");
  });

  it("rejects an invalid state string and does not write", async () => {
    vi.resetModules();
    const { setBridgeThresholdState } = await import("./bridge-watcher");
    mockReadSync(makeBridgeState());
    (setBridgeThresholdState as (s: string) => void)("not_a_state");
    expect(writtenData).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("persists each valid ThresholdState value", async () => {
    const states = [
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
    ] as const;
    for (const s of states) {
      vi.resetModules();
      writtenData = null;
      const { setBridgeThresholdState } = await import("./bridge-watcher");
      mockReadSync(makeBridgeState());
      setBridgeThresholdState(s);
      expect(writtenData).not.toBeNull();
      const state = JSON.parse(writtenData!);
      expect(state.threshold_state).toBe(s);
    }
  });
});

describe("getPreviousThresholdState", () => {
  it("returns 'ground' initially before any threshold state changes", async () => {
    vi.resetModules();
    const { getPreviousThresholdState } = await import("./bridge-watcher");
    expect(getPreviousThresholdState()).toBe("ground");
  });

  it("returns the previous state after a threshold state transition", async () => {
    vi.resetModules();
    const { getPreviousThresholdState, setBridgeThresholdState } =
      await import("./bridge-watcher");
    mockReadSync(makeBridgeState({ threshold_state: "evaluating" }));
    setBridgeThresholdState("elevated");
    expect(getPreviousThresholdState()).toBe("evaluating");
  });

  it("tracks consecutive transitions correctly", async () => {
    vi.resetModules();
    const { getPreviousThresholdState, setBridgeThresholdState } =
      await import("./bridge-watcher");
    mockReadSync(makeBridgeState({ threshold_state: "ground" }));
    expect(getPreviousThresholdState()).toBe("ground");
    setBridgeThresholdState("evaluating");
    expect(getPreviousThresholdState()).toBe("ground");
    mockReadSync(JSON.parse(writtenData!));
    setBridgeThresholdState("voices_appearing");
    expect(getPreviousThresholdState()).toBe("evaluating");
    mockReadSync(JSON.parse(writtenData!));
    setBridgeThresholdState("elevated");
    expect(getPreviousThresholdState()).toBe("voices_appearing");
  });

  it("does not update the previous state when an invalid state is passed", async () => {
    vi.resetModules();
    const { getPreviousThresholdState, setBridgeThresholdState } =
      await import("./bridge-watcher");
    mockReadSync(makeBridgeState({ threshold_state: "ground" }));
    (setBridgeThresholdState as (s: string) => void)("not_a_state");
    expect(getPreviousThresholdState()).toBe("ground");
  });
});
