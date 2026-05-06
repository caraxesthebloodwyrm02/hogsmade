import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadProfile } from "./profile-reader.js";
import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const TMP = join(tmpdir(), `glass-profile-test-${process.pid}`);

beforeAll(() => {
  process.env.CASCADE_WORKSPACE_ROOT = tmpdir();
});

afterEach(async () => {
  await rm(TMP, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function writeProfile(content: string): Promise<string> {
  await mkdir(TMP, { recursive: true });
  await writeFile(join(TMP, ".glass-profile.yaml"), content, "utf-8");
  return TMP;
}

describe("profile-reader", () => {
  it("returns null when no profile exists", async () => {
    const result = await loadProfile("/nonexistent/path");
    expect(result).toBeNull();
  });

  it("returns null for paths outside allowed roots", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await loadProfile("/definitely-outside-allowed-root");
    expect(result).toBeNull();
    expect(err).toHaveBeenCalledWith(expect.stringMatching(/outside allowed roots/i));
  });

  it("blocks a path that shares the allowed-root prefix but is a sibling directory (CVE: prefix bypass)", async () => {
    // e.g. if allowedRoot = /tmp  then /tmp-evil must NOT be allowed,
    // even though "/tmp-evil".startsWith("/tmp") is true without the sep guard.
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const sibling = (process.env.CASCADE_WORKSPACE_ROOT ?? "") + "-evil-sibling";
    const result = await loadProfile(sibling);
    expect(result).toBeNull();
    expect(err).toHaveBeenCalledWith(expect.stringMatching(/outside allowed roots/i));
  });

  it("parses a valid profile", async () => {
    const ws = await writeProfile(`
voices:
  I:
    color: amber
    role: speed
    label: "Velocity"
  II:
    color: silver
    role: safety

ceremony:
  auto_evaluate_after_iterations: 5
  auto_return_after_idle_minutes: 10

signals:
  hot_threshold:
    git_diff_lines: 200
    iteration_count: 15
`);

    const profile = await loadProfile(ws);
    expect(profile).not.toBeNull();
    expect(profile!.voices!["I"]).toEqual({ color: "amber", role: "speed", label: "Velocity" });
    expect(profile!.voices!["II"]).toEqual({ color: "silver", role: "safety", label: undefined });
    expect(profile!.ceremony!.auto_evaluate_after_iterations).toBe(5);
    expect(profile!.ceremony!.auto_return_after_idle_minutes).toBe(10);
    expect(profile!.signals!.hot_threshold!.git_diff_lines).toBe(200);
    expect(profile!.signals!.hot_threshold!.iteration_count).toBe(15);
  });

  it("parses presets block", async () => {
    const ws = await writeProfile(`
presets:
  baseline-orbit-v1:
    description: "Ground state baseline"
    captured: "2026-05-04"
    bridge:
      threshold_state: ground
      progress: 0
      agent_state: idle
`);
    const profile = await loadProfile(ws);
    expect(profile).not.toBeNull();
    expect(profile!.presets).toBeDefined();
    const preset = profile!.presets!["baseline-orbit-v1"];
    expect(preset.description).toBe("Ground state baseline");
    expect(preset.captured).toBe("2026-05-04");
    expect(preset.bridge?.threshold_state).toBe("ground");
    expect(preset.bridge?.progress).toBe(0);
    expect(preset.bridge?.agent_state).toBe("idle");
  });

  it("parses presets block with arrays", async () => {
    const ws = await writeProfile(`
presets:
  array-preset:
    bridge:
      voices:
        - I
        - II
      blocks:
        - id: 1
          content: "hello"
        - id: 2
          content: "world"
      conversation:
        - "message 1"
        - "message 2"
`);
    const profile = await loadProfile(ws);
    expect(profile).not.toBeNull();
    expect(profile!.presets).toBeDefined();
    const preset = profile!.presets!["array-preset"];
    expect(preset.bridge?.voices).toEqual(["I", "II"]);
    expect(preset.bridge?.blocks).toEqual([
      { id: 1, content: "hello" },
      { id: 2, content: "world" },
    ]);
    expect(preset.bridge?.conversation).toEqual(["message 1", "message 2"]);
  });

  it("ignores invalid voice colors", async () => {
    const ws = await writeProfile(`
voices:
  I:
    color: purple
    role: chaos
`);

    const profile = await loadProfile(ws);
    expect(profile).not.toBeNull();
    expect(profile!.voices).toBeUndefined();
  });

  it("parses valid palette values and skips invalid ones", async () => {
    const ws = await writeProfile(`
palette:
  ember: "#c8b89a"
  deep: "#123456"
  invalid_short: "#fff"
  invalid_word: "amber"
`);
    const profile = await loadProfile(ws);
    expect(profile).not.toBeNull();
    expect(profile!.palette).toEqual({
      ember: "#c8b89a",
      deep: "#123456",
    });
  });

  it("applies triadic defaults for missing values", async () => {
    const ws = await writeProfile(`
triadic:
  safety: 0.95
`);
    const profile = await loadProfile(ws);
    expect(profile).not.toBeNull();
    expect(profile!.triadic).toEqual({
      safety: 0.95,
      correctness: 0.85,
      autonomy: 0.7,
    });
  });

  it("warns on non-ENOENT read failures", async () => {
    await mkdir(TMP, { recursive: true });
    const wsFile = join(TMP, "workspace-file");
    await writeFile(wsFile, "not-a-directory", "utf-8");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const profile = await loadProfile(wsFile);

    expect(profile).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/profile load failed/i));
  });
});
