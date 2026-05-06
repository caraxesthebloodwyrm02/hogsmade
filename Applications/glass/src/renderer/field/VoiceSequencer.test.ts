import { describe, it, expect, beforeEach } from "vitest";
import { VoiceSequencer, type SequencerState } from "./VoiceSequencer";

describe("VoiceSequencer", () => {
  let seq: VoiceSequencer;

  beforeEach(() => {
    seq = new VoiceSequencer();
  });

  it("starts in idle state", () => {
    expect(seq.state).toBe("idle");
    expect(seq.activeVoiceIndex).toBe(-1);
  });

  it("begin() transitions to voice_1", () => {
    seq.begin();
    expect(seq.state).toBe("voice_1");
    expect(seq.activeVoiceIndex).toBe(0);
  });

  it("advance() steps through voices in order", () => {
    seq.begin();
    expect(seq.state).toBe("voice_1");

    seq.advance();
    expect(seq.state).toBe("voice_2");
    expect(seq.activeVoiceIndex).toBe(1);

    seq.advance();
    expect(seq.state).toBe("voice_3");
    expect(seq.activeVoiceIndex).toBe(2);
  });

  it("advance() from voice_3 transitions to complete", () => {
    seq.begin();
    seq.advance();
    seq.advance();
    seq.advance();
    expect(seq.state).toBe("complete");
    expect(seq.activeVoiceIndex).toBe(-1);
  });

  it("advance() from idle does nothing", () => {
    seq.advance();
    expect(seq.state).toBe("idle");
  });

  it("advance() from complete does nothing", () => {
    seq.begin();
    seq.advance();
    seq.advance();
    seq.advance();
    seq.advance();
    expect(seq.state).toBe("complete");
  });

  it("reset() returns to idle", () => {
    seq.begin();
    seq.advance();
    seq.reset();
    expect(seq.state).toBe("idle");
    expect(seq.activeVoiceIndex).toBe(-1);
  });

  it("thresholdStateForVoice maps correctly to bridge states", () => {
    expect(VoiceSequencer.thresholdStateForVoice("voice_1")).toBe("voice_1_active");
    expect(VoiceSequencer.thresholdStateForVoice("voice_2")).toBe("voice_2_active");
    expect(VoiceSequencer.thresholdStateForVoice("voice_3")).toBe("voice_3_active");
    expect(VoiceSequencer.thresholdStateForVoice("idle")).toBe("ground");
    expect(VoiceSequencer.thresholdStateForVoice("complete")).toBe("elevated");
  });
});
