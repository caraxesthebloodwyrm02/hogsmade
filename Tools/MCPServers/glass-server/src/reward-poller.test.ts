import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { rm, mkdir, writeFile, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const TMP_DIR = join(tmpdir(), `reward-poller-test-${process.pid}`);
const BRIDGE = join(TMP_DIR, "field-bridge.json");

async function writeBridgeFile(state: object) {
  await writeFile(BRIDGE, JSON.stringify(state), "utf-8");
}

async function readBridgeFile() {
  const raw = await readFile(BRIDGE, "utf-8");
  return JSON.parse(raw);
}

beforeEach(async () => {
  process.env.GLASS_BRIDGE_PATH = BRIDGE;
  process.env.XCHANGE_INGEST_TOKEN = "test-token";
  process.env.XCHANGE_URL = "http://127.0.0.1:18788";
  await rm(TMP_DIR, { recursive: true, force: true });
  await mkdir(TMP_DIR, { recursive: true });
  await writeBridgeFile({ blocks: [], threshold_state: "ground" });
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.GLASS_BRIDGE_PATH;
  delete process.env.XCHANGE_INGEST_TOKEN;
  delete process.env.XCHANGE_URL;
});

// ── buildBadge ──

describe("buildBadge", () => {
  it("renders earned state with correct lifecycle markers", async () => {
    const { buildBadge } = await import("./reward-poller.js");
    const badge = buildBadge(
      {
        reward_id: "r-123",
        state: "earned",
        reward_token_amount: 50,
        updated_at: "2026-01-01T00:00:00Z",
      },
      "2026-01-01T00:00:05Z",
    );
    expect(badge).toContain("r-123");
    expect(badge).toContain("State:   earned");
    expect(badge).toContain("● earned");
    expect(badge).toContain("○ payment_pending");
    expect(badge).toContain("○ payment_confirmed");
    expect(badge).toContain("○ student_acknowledged");
  });

  it("fills all lifecycle markers up to payment_confirmed", async () => {
    const { buildBadge } = await import("./reward-poller.js");
    const badge = buildBadge(
      {
        reward_id: "r-456",
        state: "payment_confirmed",
        reward_token_amount: 100,
        updated_at: "2026-01-02T00:00:00Z",
      },
      "2026-01-02T00:00:05Z",
    );
    expect(badge).toContain("● earned");
    expect(badge).toContain("● payment_pending");
    expect(badge).toContain("● payment_confirmed");
    expect(badge).toContain("○ student_acknowledged");
  });

  it("shows review_requested branch when state is review_requested", async () => {
    const { buildBadge } = await import("./reward-poller.js");
    const badge = buildBadge(
      {
        reward_id: "r-789",
        state: "review_requested",
        reward_token_amount: 0,
        updated_at: "2026-01-03T00:00:00Z",
      },
      "2026-01-03T00:00:05Z",
    );
    expect(badge).toContain("↳ review_requested");
  });

  it("includes amount and polled timestamp", async () => {
    const { buildBadge } = await import("./reward-poller.js");
    const badge = buildBadge(
      { reward_id: "r-ts", state: "earned", reward_token_amount: 77, updated_at: "2026-02-01T00:00:00Z" },
      "2026-02-01T00:00:10Z",
    );
    expect(badge).toContain("77 tokens");
    expect(badge).toContain("polled:  2026-02-01T00:00:10Z");
  });

  it("handles unknown state gracefully (all circles)", async () => {
    const { buildBadge } = await import("./reward-poller.js");
    const badge = buildBadge(
      { reward_id: "r-unk", state: "drafted", reward_token_amount: 0, updated_at: "2026-01-01T00:00:00Z" },
      "2026-01-01T00:00:01Z",
    );
    expect(badge).toContain("○ earned");
    expect(badge).toContain("○ payment_pending");
  });
});

// ── fetchRewardState ──

describe("fetchRewardState", () => {
  it("throws when XCHANGE_INGEST_TOKEN is not set", async () => {
    delete process.env.XCHANGE_INGEST_TOKEN;
    vi.resetModules();
    const { fetchRewardState } = await import("./reward-poller.js");
    await expect(fetchRewardState("r-no-token")).rejects.toThrow("XCHANGE_INGEST_TOKEN");
  });

  it("throws on non-ok HTTP response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const { fetchRewardState } = await import("./reward-poller.js");
    await expect(fetchRewardState("r-404")).rejects.toThrow("HTTP 404");
  });

  it("returns parsed JSON on success", async () => {
    const payload = { reward_id: "r-ok", state: "earned", reward_token_amount: 10 };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => payload }),
    );
    const { fetchRewardState } = await import("./reward-poller.js");
    const result = await fetchRewardState("r-ok");
    expect(result.state).toBe("earned");
    expect(result.reward_id).toBe("r-ok");
  });

  it("sends Authorization header with bearer token", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ reward_id: "r-auth", state: "earned" }),
    });
    vi.stubGlobal("fetch", mockFetch);
    const { fetchRewardState } = await import("./reward-poller.js");
    await fetchRewardState("r-auth");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/v0/state/reward/r-auth"),
      expect.objectContaining({ headers: { Authorization: "Bearer test-token" } }),
    );
  });
});

// ── pollOnce ──

describe("pollOnce", () => {
  it("upserts a reward-state block into the bridge", async () => {
    const payload = {
      reward_id: "r-poll",
      state: "payment_pending",
      reward_token_amount: 75,
      updated_at: "2026-01-01T00:00:00Z",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
    const { pollOnce, makeBlockId } = await import("./reward-poller.js");

    const status = await pollOnce("r-poll");

    expect(status.blockId).toBe(makeBlockId("r-poll"));
    expect(status.lastState).toBe("payment_pending");
    expect(status.lastPolled).toBeTruthy();
    expect(status.rewardId).toBe("r-poll");

    const bridge = await readBridgeFile();
    const block = bridge.blocks.find((b: { id: string }) => b.id === makeBlockId("r-poll"));
    expect(block).toBeDefined();
    expect(block.type).toBe("output");
    expect(block.origin).toBe("agent");
    expect(block.content).toContain("payment_pending");
  });

  it("updates existing block in-place on subsequent poll (no duplicates)", async () => {
    const base = { reward_id: "r-upd", reward_token_amount: 50 };
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...base, state: "earned", updated_at: "2026-01-01T00:00:00Z" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...base,
          state: "payment_pending",
          updated_at: "2026-01-01T00:01:00Z",
        }),
      });
    vi.stubGlobal("fetch", mockFetch);

    const { pollOnce, makeBlockId } = await import("./reward-poller.js");
    await pollOnce("r-upd");
    await pollOnce("r-upd");

    const bridge = await readBridgeFile();
    const blocks = bridge.blocks.filter((b: { id: string }) => b.id === makeBlockId("r-upd"));
    expect(blocks.length).toBe(1);
    expect(blocks[0].content).toContain("payment_pending");
    expect(blocks[0].content).not.toContain("● earned\n  ● payment_pending\n  ● payment");
  });

  it("preserves pre-existing blocks alongside the reward block", async () => {
    const existing = {
      id: "agent-existing-001",
      type: "note",
      language: "text",
      content: "existing",
      position: { x: 800, y: 80 },
      origin: "agent",
    };
    await writeBridgeFile({ blocks: [existing], threshold_state: "ground" });

    const payload = {
      reward_id: "r-preserve",
      state: "earned",
      reward_token_amount: 10,
      updated_at: "2026-01-01T00:00:00Z",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
    const { pollOnce } = await import("./reward-poller.js");
    await pollOnce("r-preserve");

    const bridge = await readBridgeFile();
    expect(bridge.blocks.length).toBe(2);
    expect(bridge.blocks.some((b: { id: string }) => b.id === "agent-existing-001")).toBe(true);
  });
});

// ── armRewardPoller / disarmRewardPoller ──

describe("armRewardPoller", () => {
  it("polls immediately and returns armed state when interval > 0", async () => {
    const payload = {
      reward_id: "r-arm",
      state: "earned",
      reward_token_amount: 10,
      updated_at: "2026-01-01T00:00:00Z",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
    vi.useFakeTimers();

    const { armRewardPoller, disarmRewardPoller } = await import("./reward-poller.js");
    const status = await armRewardPoller("r-arm", 300);

    expect(status.pollerState).toBe("armed");
    expect(status.lastState).toBe("earned");
    expect(status.intervalSeconds).toBe(300);
    expect(status.rewardId).toBe("r-arm");

    await disarmRewardPoller();
    vi.useRealTimers();
  });

  it("single-shot (interval=0) returns disarmed state", async () => {
    const payload = {
      reward_id: "r-shot",
      state: "payment_confirmed",
      reward_token_amount: 25,
      updated_at: "2026-01-01T00:00:00Z",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));

    const { armRewardPoller } = await import("./reward-poller.js");
    const status = await armRewardPoller("r-shot", 0);

    expect(status.pollerState).toBe("disarmed");
    expect(status.lastState).toBe("payment_confirmed");
  });

  it("re-arming replaces the existing timer without duplication", async () => {
    const payload = {
      reward_id: "r-rearm",
      state: "earned",
      reward_token_amount: 5,
      updated_at: "2026-01-01T00:00:00Z",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
    vi.useFakeTimers();

    const { armRewardPoller, disarmRewardPoller } = await import("./reward-poller.js");
    await armRewardPoller("r-rearm", 300);
    const status = await armRewardPoller("r-rearm", 600);

    expect(status.pollerState).toBe("armed");
    expect(status.intervalSeconds).toBe(600);

    await disarmRewardPoller();
    vi.useRealTimers();
  });
});

describe("disarmRewardPoller", () => {
  it("transitions from armed to disarmed", async () => {
    const payload = {
      reward_id: "r-dis",
      state: "earned",
      reward_token_amount: 1,
      updated_at: "2026-01-01T00:00:00Z",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
    vi.useFakeTimers();

    const { armRewardPoller, disarmRewardPoller } = await import("./reward-poller.js");
    await armRewardPoller("r-dis", 300);
    const status = await disarmRewardPoller();

    expect(status.pollerState).toBe("disarmed");
    vi.useRealTimers();
  });

  it("is safe to call when already disarmed", async () => {
    vi.resetModules();
    const { disarmRewardPoller } = await import("./reward-poller.js");
    const status = await disarmRewardPoller();
    expect(status.pollerState).toBe("disarmed");
  });
});
