import { describe, it, expect } from "vitest";
import { FieldState } from "../state/FieldState";
import { ModulationEngine, type BusValues } from "./ModulationEngine";
import { ThresholdLine } from "./ThresholdLine";
import { VoiceSequencer } from "./VoiceSequencer";
import {
  DEFAULT_BRIDGE_STATE,
  type FieldProfile,
  type ThresholdState,
  type BridgeVoice,
} from "../../../bridge/schema";

function simulate(
  engine: ModulationEngine,
  line: ThresholdLine,
  state: ThresholdState,
  progress: number,
  frames: number,
): BusValues {
  let bus: BusValues;
  for (let i = 0; i < frames; i++) {
    bus = engine.tick(16, state, progress);
    line.tick(16, state);
  }
  return bus!;
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
    goalStatement: "test",
    hardConstraints: ["test"],
    functions: [],
    lanes: [],
  },
};

describe("ceremony integration", () => {
  it("full cycle: ground → evaluating → floor_rising → voices_appearing → elevated → returning → ground", () => {
    const engine = new ModulationEngine(TEST_PROFILE.modulation);
    const line = new ThresholdLine(1400, 900);

    // ground — quiet
    let bus = simulate(engine, line, "ground", 0, 60);
    expect(bus.disk.scale).toBeLessThan(0.25);
    expect(bus.oval.opacity).toBeLessThan(0.15);
    expect(line.opacity).toBe(0);

    // evaluating — disk grows, threshold line appears
    bus = simulate(engine, line, "evaluating", 0.5, 120);
    expect(bus.disk.scale).toBeGreaterThan(0.1);
    expect(line.opacity).toBeGreaterThan(0);

    // floor_rising — disk continues growing, line persists
    bus = simulate(engine, line, "floor_rising", 0.8, 120);
    expect(bus.disk.scale).toBeGreaterThan(0.15);
    expect(line.opacity).toBeGreaterThan(0);

    // voices_appearing — voice alpha rises
    bus = simulate(engine, line, "voices_appearing", 0.9, 200);
    expect(bus.voice.alpha).toBeGreaterThan(0.05);

    // elevated — max modulation
    bus = simulate(engine, line, "elevated", 1.0, 300);
    expect(bus.disk.scale).toBeGreaterThan(0.3);
    expect(bus.oval.opacity).toBeGreaterThan(0.1);

    // returning — values decrease
    const elevatedScale = bus.disk.scale;
    bus = simulate(engine, line, "returning", 0.5, 300);
    expect(bus.disk.scale).toBeLessThan(elevatedScale);

    // ground — back to quiet
    bus = simulate(engine, line, "ground", 0, 600);
    expect(bus.disk.scale).toBeLessThan(0.25);
  });

  it("voice sequencer maps to correct threshold states", () => {
    const seq = new VoiceSequencer();
    const engine = new ModulationEngine(TEST_PROFILE.modulation);

    seq.begin();
    expect(VoiceSequencer.thresholdStateForVoice(seq.state)).toBe("voice_1_active");

    let bus: BusValues;
    for (let i = 0; i < 100; i++) {
      bus = engine.tick(16, VoiceSequencer.thresholdStateForVoice(seq.state), 0.8);
    }
    expect(bus!.voice.alpha).toBeGreaterThan(0);

    seq.advance();
    expect(VoiceSequencer.thresholdStateForVoice(seq.state)).toBe("voice_2_active");

    seq.advance();
    expect(VoiceSequencer.thresholdStateForVoice(seq.state)).toBe("voice_3_active");

    seq.advance();
    expect(VoiceSequencer.thresholdStateForVoice(seq.state)).toBe("elevated");
  });

  it("FieldState propagates bridge updates to subscribers", () => {
    const fs = new FieldState();
    const states: ThresholdState[] = [];

    fs.subscribe((s) => states.push(s.thresholdState));

    const voices: BridgeVoice[] = [
      { id: "I", color: "amber", position: "left", text: "Signal unconstrained.", active: true },
      { id: "II", color: "silver", position: "center", text: "Scan lines bleeding.", active: true },
      { id: "III", color: "gold", position: "right", text: "Field hosts ceremony.", active: true },
    ];

    fs.update({ ...DEFAULT_BRIDGE_STATE, threshold_state: "ground", progress: 0 });
    fs.update({ ...DEFAULT_BRIDGE_STATE, threshold_state: "evaluating", progress: 0.5 });
    fs.update({ ...DEFAULT_BRIDGE_STATE, threshold_state: "floor_rising", progress: 0.8 });
    fs.update({
      ...DEFAULT_BRIDGE_STATE,
      threshold_state: "voices_appearing",
      progress: 1.0,
      voices,
    });
    fs.update({ ...DEFAULT_BRIDGE_STATE, threshold_state: "elevated", progress: 1.0, voices });

    expect(states).toEqual([
      "ground",
      "evaluating",
      "floor_rising",
      "voices_appearing",
      "elevated",
    ]);
    expect(fs.voices).toHaveLength(3);
  });

  it("denied state produces distinct visual signature", () => {
    const engine = new ModulationEngine(TEST_PROFILE.modulation);
    const line = new ThresholdLine(1400, 900);

    simulate(engine, line, "evaluating", 0.5, 100);
    const bus = simulate(engine, line, "denied", 0.5, 300);

    expect(bus.disk.scale).toBeLessThan(0.3);
    expect(line.opacity).toBeLessThan(0.2);
  });
});
