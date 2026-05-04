import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BridgeState } from "../../bridge/schema";

type Handler = (...args: unknown[]) => void;

interface MockWebContents {
  on: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  openDevTools: ReturnType<typeof vi.fn>;
  setWindowOpenHandler: ReturnType<typeof vi.fn>;
}

class MockBrowserWindow {
  static windows: MockBrowserWindow[] = [];
  static getAllWindows = vi.fn(() => MockBrowserWindow.windows);

  webContents: MockWebContents;
  loadURL = vi.fn();
  loadFile = vi.fn();
  isDestroyed = vi.fn(() => false);
  private webContentsHandlers = new Map<string, Handler>();

  constructor() {
    this.webContents = {
      on: vi.fn((event: string, handler: Handler) => {
        this.webContentsHandlers.set(event, handler);
      }),
      send: vi.fn(),
      openDevTools: vi.fn(),
      setWindowOpenHandler: vi.fn(),
    };
    MockBrowserWindow.windows.push(this);
  }

  emitWebContents(event: string): void {
    this.webContentsHandlers.get(event)?.();
  }
}

function makeBridgeState(): BridgeState {
  return {
    timestamp: "2026-01-01T00:00:00.000Z",
    session_id: "test-session",
    agent_state: "idle",
    blocks: [],
    conversation: [],
    threshold_state: "ground",
    progress: 0,
    voices: [],
    signals: {
      git_diff_lines: 0,
      iteration_count: 0,
      session_age_minutes: 0,
    },
  };
}

function makeFieldProfile() {
  return {
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
  };
}

describe("main bridge window routing", () => {
  let activateHandler: Handler | null;
  let bridgeUpdate: ((state: BridgeState) => void) | null;
  let ipcHandles: Record<string, (...args: unknown[]) => unknown>;
  let readFileMock: ReturnType<typeof vi.fn>;
  let app: Record<string, ReturnType<typeof vi.fn>>;
  let ipcMain: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    activateHandler = null;
    bridgeUpdate = null;
    ipcHandles = {};
    readFileMock = vi.fn();
    MockBrowserWindow.windows = [];
    MockBrowserWindow.getAllWindows.mockImplementation(() => MockBrowserWindow.windows);

    app = {
      enableSandbox: vi.fn(),
      whenReady: vi.fn(() => Promise.resolve()),
      getAppPath: vi.fn(() => "/mock-app"),
      on: vi.fn((event: string, handler: Handler) => {
        if (event === "activate") activateHandler = handler;
      }),
      quit: vi.fn(),
    };
    ipcMain = {
      on: vi.fn(),
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        ipcHandles[channel] = handler;
      }),
    };

    vi.doMock("electron", () => ({
      app,
      BrowserWindow: MockBrowserWindow,
      session: {
        defaultSession: {
          webRequest: {
            onHeadersReceived: vi.fn(),
          },
        },
      },
      ipcMain,
    }));
    vi.doMock("fs/promises", () => ({
      readFile: readFileMock,
    }));
    vi.doMock("os", () => ({
      default: { homedir: () => "/mock-home" },
      homedir: () => "/mock-home",
    }));

    vi.doMock("./bridge-watcher", () => ({
      startBridgeWatcher: vi.fn((cb: (state: BridgeState) => void) => {
        bridgeUpdate = cb;
      }),
      patchBridgeBlock: vi.fn(),
      appendConversationTurn: vi.fn(),
      addBridgeBlock: vi.fn(),
      patchBridgeBlockPosition: vi.fn(),
      deleteBridgeBlock: vi.fn(),
      setBridgeFieldProfile: vi.fn(),
    }));
    vi.doMock("./field-profile", () => ({
      loadFieldProfile: vi.fn(() => ({
        profile: makeFieldProfile(),
        resolvedPath: "/mock-app/config/field-profile.json",
        usedOverride: false,
      })),
    }));
  });

  afterEach(() => {
    vi.doUnmock("electron");
    vi.doUnmock("fs/promises");
    vi.doUnmock("os");
    vi.doUnmock("./bridge-watcher");
    vi.doUnmock("./field-profile");
  });

  async function importMain(): Promise<void> {
    await import("./index");
    await Promise.resolve();
    await Promise.resolve();
  }

  it("routes bridge updates to the current BrowserWindow set", async () => {
    await importMain();
    const startupWindow = MockBrowserWindow.windows[0];

    MockBrowserWindow.windows = [];
    activateHandler?.();
    const reopenedWindow = MockBrowserWindow.windows[0];
    const state = makeBridgeState();

    bridgeUpdate?.(state);

    expect(reopenedWindow.webContents.send).toHaveBeenCalledWith("bridge:update", state);
    expect(startupWindow.webContents.send).not.toHaveBeenCalledWith("bridge:update", state);
  });

  it("skips destroyed windows when broadcasting bridge updates", async () => {
    await importMain();
    const state = makeBridgeState();
    const first = MockBrowserWindow.windows[0];
    first.isDestroyed.mockReturnValue(true);
    const second = new MockBrowserWindow();

    bridgeUpdate?.(state);

    expect(first.webContents.send).not.toHaveBeenCalledWith("bridge:update", state);
    expect(second.webContents.send).toHaveBeenCalledWith("bridge:update", state);
  });

  it("sends the latest bridge state when a newly activated window finishes loading", async () => {
    await importMain();
    const state = makeBridgeState();
    bridgeUpdate?.(state);

    MockBrowserWindow.windows = [];
    activateHandler?.();
    const reopenedWindow = MockBrowserWindow.windows[0];

    reopenedWindow.emitWebContents("did-finish-load");

    expect(reopenedWindow.webContents.send).toHaveBeenCalledWith("bridge:update", state);
  });

  it("returns parsed assets from bridge:list-assets", async () => {
    await importMain();
    readFileMock.mockResolvedValue(
      JSON.stringify({ assets: [{ ledger_id: "asset-1", label: "Alpha" }] }),
    );

    const result = await ipcHandles["bridge:list-assets"]();

    expect(result).toEqual([{ ledger_id: "asset-1", label: "Alpha" }]);
    expect(readFileMock).toHaveBeenCalledWith("/mock-home/.caraxes/glass-inventory.json", "utf-8");
  });

  it("returns empty list when inventory file is missing", async () => {
    await importMain();
    readFileMock.mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }));

    const result = await ipcHandles["bridge:list-assets"]();

    expect(result).toEqual([]);
  });

  it("returns semantic search results from blocks and inventory assets", async () => {
    await importMain();
    readFileMock.mockResolvedValue(
      JSON.stringify({
        assets: [
          {
            ledger_id: "asset-1",
            label: "Session Relic",
            category: "relic",
            rarity: "mythic",
            content: "Tracks the session token flow for auth recovery.",
            source_ceremony: "elevated",
            source_session: "test-session",
            acquired_at: "2026-05-04T00:00:00.000Z",
          },
        ],
      }),
    );
    const state = makeBridgeState();
    state.blocks.push({
      id: "block-auth",
      type: "code",
      language: "typescript",
      content: "const token = sessionStorage.getItem('auth-token');",
      position: { x: 40, y: 50 },
      origin: "agent",
    });
    bridgeUpdate?.(state);

    const result = await ipcHandles["search:semantic"](null, { query: "auth", limit: 4 });

    expect(result).toHaveLength(2);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "block-auth", source: "block" }),
        expect.objectContaining({ id: "asset-1", source: "asset" }),
      ]),
    );
  });

  it("returns active field profile through config:get-field-profile", async () => {
    await importMain();
    const result = await ipcHandles["config:get-field-profile"]();
    expect(result).toBeTruthy();
    expect((result as { rarityGate?: { elevated: string } }).rarityGate?.elevated).toBe("mythic");
  });

  it("calls deleteBridgeBlock when bridge:delete-block is invoked", async () => {
    await importMain();
    const { deleteBridgeBlock } = await import("./bridge-watcher");

    const payload = { id: "block-auth" };
    const handler = (ipcMain.on as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) => call[0] === "bridge:delete-block",
    )?.[1];

    expect(handler).toBeDefined();
    handler?.(null, payload);

    expect(deleteBridgeBlock).toHaveBeenCalledWith("block-auth");
  });

  it("rejects bridge:delete-block with invalid id", async () => {
    await importMain();
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const handler = (ipcMain.on as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) => call[0] === "bridge:delete-block",
    )?.[1];

    handler?.(null, { id: 123 }); // Invalid: id is not a string

    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringContaining("bridge:delete-block rejected"),
    );
    consoleWarn.mockRestore();
  });
});
