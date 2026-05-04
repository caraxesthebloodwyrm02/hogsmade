import { describe, it, expect } from "vitest";
import { ModulationEngine, type BusValues } from "./ModulationEngine";
import type { FieldProfile } from "../../../bridge/schema";

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

describe("ModulationEngine", () => {
  it("returns BusValues with all five buses", () => {
    const engine = new ModulationEngine(TEST_PROFILE.modulation);
    const bus = engine.tick(16, "ground", 0);
    expect(bus).toHaveProperty("disk");
    expect(bus).toHaveProperty("oval");
    expect(bus).toHaveProperty("voice");
    expect(bus).toHaveProperty("field");
    expect(bus).toHaveProperty("block");
  });

  it("ground state produces low modulation values", () => {
    const engine = new ModulationEngine(TEST_PROFILE.modulation);
    let bus: BusValues = {
      disk: { scale: 0, brightness: 0, rimAlpha: 0 },
      oval: { opacity: 0, lineWidth: 0, markerAlpha: 0, fieldAlpha: 0 },
      voice: { alpha: 0, scanSpeed: 0, glowRadius: 0 },
      field: { ambientIntensity: 0 },
      block: { levitationMod: 0.88 },
    };
    for (let i = 0; i < 60; i++) bus = engine.tick(16, "ground", 0.5);
    expect(bus.disk.scale).toBeLessThan(0.3);
    expect(bus.oval.opacity).toBeLessThan(0.2);
  });

  it("elevated state drives higher modulation than ground", () => {
    const engine = new ModulationEngine(TEST_PROFILE.modulation);
    let bus: BusValues;
    for (let i = 0; i < 120; i++) bus = engine.tick(16, "elevated", 0.8);
    expect(bus!.disk.scale).toBeGreaterThan(0.3);
    expect(bus!.oval.opacity).toBeGreaterThan(0.1);
  });

  it("voice alpha rises in voices_appearing state", () => {
    const engine = new ModulationEngine(TEST_PROFILE.modulation);
    let bus: BusValues;
    for (let i = 0; i < 200; i++) bus = engine.tick(16, "voices_appearing", 0.9);
    expect(bus!.voice.alpha).toBeGreaterThan(0.05);
  });

  it("denied state produces rapid LFO with low sustain", () => {
    const engine = new ModulationEngine(TEST_PROFILE.modulation);
    let bus: BusValues;
    for (let i = 0; i < 300; i++) bus = engine.tick(16, "denied", 0.5);
    expect(bus!.disk.scale).toBeLessThan(0.25);
  });

  it("state transition resets stateAge", () => {
    const engine = new ModulationEngine(TEST_PROFILE.modulation);
    engine.tick(16, "ground", 0);
    engine.tick(16, "ground", 0);
    const bus = engine.tick(16, "evaluating", 0.5);
    expect(bus.disk.scale).toBeGreaterThan(0);
  });

  it("signalHeat=1.0 produces higher ambient intensity than signalHeat=0.0", () => {
    const cold = new ModulationEngine(TEST_PROFILE.modulation);
    const hot = new ModulationEngine(TEST_PROFILE.modulation);
    let coldBus: BusValues;
    let hotBus: BusValues;
    // Run enough ticks for mod to settle toward its target.
    for (let i = 0; i < 300; i++) {
      coldBus = cold.tick(16, "ground", 0.5, 0);
      hotBus = hot.tick(16, "ground", 0.5, 1.0);
    }
    expect(hotBus!.field.ambientIntensity).toBeGreaterThan(coldBus!.field.ambientIntensity);
  });

  it("ground state block.levitationMod is less than 1.0 and >= 0.88", () => {
    const engine = new ModulationEngine(TEST_PROFILE.modulation);
    let bus: BusValues;
    for (let i = 0; i < 60; i++) bus = engine.tick(16, "ground", 0.5);
    expect(bus!.block.levitationMod).toBeLessThan(1.0);
    expect(bus!.block.levitationMod).toBeGreaterThanOrEqual(0.88);
  });

  it("non-ground state block.levitationMod is exactly 1.0", () => {
    const engine = new ModulationEngine(TEST_PROFILE.modulation);
    let bus: BusValues;
    for (let i = 0; i < 60; i++) bus = engine.tick(16, "elevated", 0.8);
    expect(bus!.block.levitationMod).toBe(1.0);
  });

  it("denied state block.levitationMod is exactly 1.0", () => {
    const engine = new ModulationEngine(TEST_PROFILE.modulation);
    let bus: BusValues;
    for (let i = 0; i < 60; i++) bus = engine.tick(16, "denied", 0.5);
    expect(bus!.block.levitationMod).toBe(1.0);
  });

  it("ground levitation stays bounded across varied progress and heat", () => {
    const engine = new ModulationEngine(TEST_PROFILE.modulation);
    for (let i = 0; i < 600; i++) {
      const progress = (i % 100) / 100;
      const heat = (i % 7) / 6;
      const bus = engine.tick(16, "ground", progress, heat);
      expect(bus.block.levitationMod).toBeGreaterThanOrEqual(0.88);
      expect(bus.block.levitationMod).toBeLessThanOrEqual(1.0);
    }
  });

  it("non-ground levitation remains pinned at 1.0 even at max heat", () => {
    const engine = new ModulationEngine(TEST_PROFILE.modulation);
    const states: Array<"evaluating" | "floor_rising" | "elevated" | "denied"> = [
      "evaluating",
      "floor_rising",
      "elevated",
      "denied",
    ];

    for (const state of states) {
      const bus = engine.tick(16, state, 0.37, 1.0);
      expect(bus.block.levitationMod).toBe(1.0);
    }
  });
});
