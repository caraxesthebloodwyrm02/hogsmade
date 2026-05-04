import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { writeBridge, readBridge } from "./bridge-writer.js";
import { rm, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const TMP_DIR = join(tmpdir(), `glass-bridge-test-${process.pid}`);
const BRIDGE = join(TMP_DIR, "field-bridge.json");

beforeEach(async () => {
  process.env.GLASS_BRIDGE_PATH = BRIDGE;
  await rm(TMP_DIR, { recursive: true, force: true });
  await mkdir(TMP_DIR, { recursive: true });
});

afterAll(async () => {
  delete process.env.GLASS_BRIDGE_PATH;
  await rm(TMP_DIR, { recursive: true, force: true });
});

describe("bridge-writer", () => {
  it("creates bridge file from scratch", async () => {
    const result = await writeBridge({ agent_state: "thinking" });
    expect(result.agent_state).toBe("thinking");
    expect(result.timestamp).toBeDefined();
  });

  it("deep-merges signals without clobbering siblings", async () => {
    await writeBridge({
      signals: { git_diff_lines: 10, iteration_count: 1, session_age_minutes: 5 },
    });
    const result = await writeBridge({
      signals: { git_diff_lines: 25 },
    });
    const signals = result.signals as Record<string, number>;
    expect(signals.git_diff_lines).toBe(25);
    expect(signals.iteration_count).toBe(1);
    expect(signals.session_age_minutes).toBe(5);
  });

  it("replaces arrays entirely", async () => {
    await writeBridge({ conversation: [{ role: "user", text: "hello", timestamp: "t1" }] });
    const result = await writeBridge({ conversation: [] });
    expect(result.conversation).toEqual([]);
  });

  it("readBridge returns empty object when file missing", async () => {
    await rm(BRIDGE, { force: true });
    const result = await readBridge();
    expect(result).toEqual({});
  });

  it("readBridge warns and returns empty object for non-ENOENT errors", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const badPath = join(TMP_DIR, "path-is-directory");
    await mkdir(badPath, { recursive: true });
    process.env.GLASS_BRIDGE_PATH = badPath;

    const result = await readBridge();

    expect(result).toEqual({});
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/bridge read failed/i));
  });

  it("replaces object branches when incoming value is primitive", async () => {
    await writeBridge({
      signals: { git_diff_lines: 5, iteration_count: 2 },
    });
    const result = await writeBridge({
      signals: 42 as unknown as Record<string, unknown>,
    });
    expect(result.signals).toBe(42);
  });
});
