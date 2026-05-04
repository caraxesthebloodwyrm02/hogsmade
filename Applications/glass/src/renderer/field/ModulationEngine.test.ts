import { describe, it, expect } from "vitest";
import { ModulationEngine, type BusValues } from "./ModulationEngine";

describe("ModulationEngine", () => {
  it("returns BusValues with all four buses", () => {
    const engine = new ModulationEngine();
    const bus = engine.tick(16, "ground", 0);
    expect(bus).toHaveProperty("disk");
    expect(bus).toHaveProperty("oval");
    expect(bus).toHaveProperty("voice");
    expect(bus).toHaveProperty("field");
  });

  it("ground state produces low modulation values", () => {
    const engine = new ModulationEngine();
    let bus: BusValues = {
      disk: { scale: 0, brightness: 0, rimAlpha: 0 },
      oval: { opacity: 0, lineWidth: 0, markerAlpha: 0, fieldAlpha: 0 },
      voice: { alpha: 0, scanSpeed: 0, glowRadius: 0 },
      field: { ambientIntensity: 0 },
    };
    for (let i = 0; i < 60; i++) bus = engine.tick(16, "ground", 0.5);
    expect(bus.disk.scale).toBeLessThan(0.3);
    expect(bus.oval.opacity).toBeLessThan(0.2);
  });

  it("elevated state drives higher modulation than ground", () => {
    const engine = new ModulationEngine();
    let bus: BusValues;
    for (let i = 0; i < 120; i++) bus = engine.tick(16, "elevated", 0.8);
    expect(bus!.disk.scale).toBeGreaterThan(0.3);
    expect(bus!.oval.opacity).toBeGreaterThan(0.1);
  });

  it("voice alpha rises in voices_appearing state", () => {
    const engine = new ModulationEngine();
    let bus: BusValues;
    for (let i = 0; i < 200; i++) bus = engine.tick(16, "voices_appearing", 0.9);
    expect(bus!.voice.alpha).toBeGreaterThan(0.05);
  });

  it("denied state produces rapid LFO with low sustain", () => {
    const engine = new ModulationEngine();
    let bus: BusValues;
    for (let i = 0; i < 300; i++) bus = engine.tick(16, "denied", 0.5);
    expect(bus!.disk.scale).toBeLessThan(0.25);
  });

  it("state transition resets stateAge", () => {
    const engine = new ModulationEngine();
    engine.tick(16, "ground", 0);
    engine.tick(16, "ground", 0);
    const bus = engine.tick(16, "evaluating", 0.5);
    expect(bus.disk.scale).toBeGreaterThan(0);
  });
});
