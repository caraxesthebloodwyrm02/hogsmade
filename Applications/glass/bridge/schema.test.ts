import { describe, it, expect } from "vitest";
import {
  ASSET_CATEGORIES,
  ASSET_RARITIES,
  DEFAULT_BRIDGE_STATE,
  THRESHOLD_STATES,
  isAssetCategory,
  isAssetRarity,
  isRarityPermitted,
  type RarityGateMap,
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
    const states: ThresholdState[] = [...THRESHOLD_STATES];
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
    const gate: RarityGateMap = {
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
    expect(isRarityPermitted("uncommon", "ground", gate)).toBe(true);
    expect(isRarityPermitted("rare", "ground", gate)).toBe(false);
    expect(isRarityPermitted("rare", "floor_rising", gate)).toBe(true);
    expect(isRarityPermitted("epic", "voice_2_active", gate)).toBe(true);
    expect(isRarityPermitted("mythic", "voice_2_active", gate)).toBe(false);
    expect(isRarityPermitted("mythic", "elevated", gate)).toBe(true);
    expect(isRarityPermitted("uncommon", "denied", gate)).toBe(false);
  });
});
