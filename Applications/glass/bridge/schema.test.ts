import { describe, it, expect } from "vitest";
import {
  DEFAULT_BRIDGE_STATE,
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
});
