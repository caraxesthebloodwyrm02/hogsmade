import { describe, it, expect } from "vitest";
import { applyTriadicGuard } from "./triadic-guard.js";

const DEFAULT_WEIGHTS = { safety: 1.0, correctness: 0.85, autonomy: 0.7 };
const GROUND_STATE = { threshold_state: "ground", agent_state: "idle", progress: 0 };

describe("triadic-guard", () => {
  it("allows valid patches", () => {
    const result = applyTriadicGuard(
      { agent_state: "thinking", threshold_state: "evaluating" },
      GROUND_STATE,
      DEFAULT_WEIGHTS,
    );
    expect(result.allowed).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("blocks jump from ground to elevated (safety DAG)", () => {
    const result = applyTriadicGuard(
      { threshold_state: "elevated", progress: 1.0 },
      GROUND_STATE,
      DEFAULT_WEIGHTS,
    );
    expect(result.allowed).toBe(false);
    expect(result.warnings[0]).toContain("transition ground → elevated is not permitted");
  });

  it("blocks invalid threshold_state (safety)", () => {
    const result = applyTriadicGuard(
      { threshold_state: "nonexistent" },
      GROUND_STATE,
      DEFAULT_WEIGHTS,
    );
    expect(result.allowed).toBe(false);
    expect(result.warnings[0]).toContain("invalid threshold_state");
  });

  it("blocks jump from ground to denied (safety DAG)", () => {
    const result = applyTriadicGuard(
      { threshold_state: "denied", progress: 1.0 },
      GROUND_STATE,
      DEFAULT_WEIGHTS,
    );
    expect(result.allowed).toBe(false);
    expect(result.warnings[0]).toContain("transition ground → denied is not permitted");
  });

  it("blocks invalid agent_state (safety)", () => {
    const result = applyTriadicGuard({ agent_state: "floating" }, GROUND_STATE, DEFAULT_WEIGHTS);
    expect(result.allowed).toBe(false);
    expect(result.warnings[0]).toContain("invalid agent_state");
  });

  it("blocks malformed conversation entries (correctness)", () => {
    const result = applyTriadicGuard(
      { conversation: [{ role: "user" }] },
      GROUND_STATE,
      DEFAULT_WEIGHTS,
    );
    expect(result.allowed).toBe(false);
    expect(result.warnings[0]).toContain("missing required fields");
  });

  it("blocks malformed block entries (correctness)", () => {
    const result = applyTriadicGuard({ blocks: [{ id: "I" }] }, GROUND_STATE, DEFAULT_WEIGHTS);
    expect(result.allowed).toBe(false);
    expect(result.warnings[0]).toContain("blocks[0] missing required fields");
  });

  it("blocks elevated with low progress when autonomy < 0.8", () => {
    const voice3 = { ...GROUND_STATE, threshold_state: "voice_3_active" };
    const result = applyTriadicGuard({ threshold_state: "elevated", progress: 0.5 }, voice3, {
      ...DEFAULT_WEIGHTS,
      autonomy: 0.7,
    });
    expect(result.allowed).toBe(false);
    expect(result.warnings[0]).toContain("progress >= 0.9");
  });

  it("allows elevated with high progress when autonomy < 0.8", () => {
    const voice3 = { ...GROUND_STATE, threshold_state: "voice_3_active" };
    const result = applyTriadicGuard({ threshold_state: "elevated", progress: 0.95 }, voice3, {
      ...DEFAULT_WEIGHTS,
      autonomy: 0.7,
    });
    expect(result.allowed).toBe(true);
  });

  it("allows elevated with low progress when autonomy >= 0.8", () => {
    const voice3 = { ...GROUND_STATE, threshold_state: "voice_3_active" };
    const result = applyTriadicGuard({ threshold_state: "elevated", progress: 0.2 }, voice3, {
      ...DEFAULT_WEIGHTS,
      autonomy: 0.85,
    });
    expect(result.allowed).toBe(true);
  });

  it("allows valid DAG transitions", () => {
    const evaluating = { ...GROUND_STATE, threshold_state: "evaluating" };
    const result = applyTriadicGuard(
      { threshold_state: "floor_rising" },
      evaluating,
      DEFAULT_WEIGHTS,
    );
    expect(result.allowed).toBe(true);
  });

  it("blocks evaluating to elevated (must go through full ceremony)", () => {
    const evaluating = { ...GROUND_STATE, threshold_state: "evaluating" };
    const result = applyTriadicGuard({ threshold_state: "elevated" }, evaluating, DEFAULT_WEIGHTS);
    expect(result.allowed).toBe(false);
    expect(result.warnings[0]).toContain("transition evaluating → elevated is not permitted");
  });

  it("skips correctness checks when correctness weight is low", () => {
    const result = applyTriadicGuard({ conversation: [{ role: "user" }] }, GROUND_STATE, {
      ...DEFAULT_WEIGHTS,
      correctness: 0.6,
    });
    expect(result.allowed).toBe(true);
  });

  it("skips safety checks when weight is low", () => {
    const result = applyTriadicGuard({ threshold_state: "elevated" }, GROUND_STATE, {
      safety: 0.5,
      correctness: 0.5,
      autonomy: 0.9,
    });
    expect(result.allowed).toBe(true);
  });
});
