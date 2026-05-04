import { describe, it, expect } from "vitest";
import {
  ASSET_CATEGORIES,
  ASSET_RARITIES,
  DEFAULT_BRIDGE_STATE,
  isAssetCategory,
  isAssetRarity,
  isRarityPermitted,
  type BridgeState,
  type ThresholdState,
  type BridgeVoice,
} from "./schema";

describe("bridge schema", () => {
  it("DEFAULT_BRIDGE_STATE has correct shape", () => {
    const s = DEFAULT_BRIDGE_STATE;
    expect(s.agent_state).toBe("idle");
    expect(s.threshold_state).toBe("ground");
    expect(s.progress).toBe(0);
    expect(s.voices).toEqual([]);
    expect(s.blocks).toEqual([]);
    expect(s.conversation).toEqual([]);
    expect(s.signals).toEqual({
      git_diff_lines: 0,
      iteration_count: 0,
      session_age_minutes: 0,
    });
  });

  it("ThresholdState covers all ceremony stages", () => {
    const states: ThresholdState[] = [
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
    ];
    expect(states).toHaveLength(10);
  });

  it("BridgeVoice accepts valid voice data", () => {
    const v: BridgeVoice = {
      id: "I",
      color: "amber",
      position: "left",
      text: "test",
      active: true,
    };
    expect(v.id).toBe("I");
    expect(v.color).toBe("amber");
    expect(v.position).toBe("left");
  });

  it("DEFAULT_BRIDGE_STATE can be spread for updates", () => {
    const patched: BridgeState = {
      ...DEFAULT_BRIDGE_STATE,
      threshold_state: "evaluating",
      progress: 0.5,
    };
    expect(patched.threshold_state).toBe("evaluating");
    expect(patched.progress).toBe(0.5);
    expect(patched.agent_state).toBe("idle");
  });

  it("defines runtime asset category and rarity guards", () => {
    expect(ASSET_CATEGORIES).toContain("relic");
    expect(ASSET_CATEGORIES).toContain("blueprint");
    expect(ASSET_RARITIES).toContain("mythic");
    expect(isAssetCategory("artifact")).toBe(true);
    expect(isAssetCategory("unknown")).toBe(false);
    expect(isAssetRarity("rare")).toBe(true);
    expect(isAssetRarity("forbidden")).toBe(false);
  });

  it("gates rarity by ceremony threshold state", () => {
    expect(isRarityPermitted("uncommon", "ground")).toBe(true);
    expect(isRarityPermitted("rare", "ground")).toBe(false);
    expect(isRarityPermitted("rare", "floor_rising")).toBe(true);
    expect(isRarityPermitted("epic", "voice_2_active")).toBe(true);
    expect(isRarityPermitted("mythic", "voice_2_active")).toBe(false);
    expect(isRarityPermitted("mythic", "elevated")).toBe(true);
    expect(isRarityPermitted("uncommon", "denied")).toBe(false);
  });
});
