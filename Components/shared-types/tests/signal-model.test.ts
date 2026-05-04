import { describe, expect, it } from "vitest";
import { computeMagneticPull, TOKEN_TYPE_WEIGHTS } from "../src/signal-model.js";

describe("signal-model magnetism", () => {
  it("amplifies anomaly pull under safety bias", () => {
    const result = computeMagneticPull({
      tokenType: "anomaly",
      agentBias: "safety",
      distance: 0,
    });

    expect(result.effectiveWeight).toBeCloseTo(TOKEN_TYPE_WEIGHTS.anomaly * 1.8);
    expect(result.pullForce).toBeCloseTo(result.effectiveWeight);
  });

  it("reduces pull as conceptual distance increases", () => {
    const close = computeMagneticPull({
      tokenType: "transistor",
      agentBias: "neutral",
      distance: 0,
    });
    const far = computeMagneticPull({
      tokenType: "transistor",
      agentBias: "neutral",
      distance: 1,
    });

    expect(close.pullForce).toBeGreaterThan(far.pullForce);
    expect(far.pullForce).toBeCloseTo(close.effectiveWeight * 0.2);
  });

  it("uses caller-supplied base weight before applying bias", () => {
    const result = computeMagneticPull({
      tokenType: "anomaly",
      agentBias: "clarity",
      baseWeight: 2,
      distance: 0,
    });

    expect(result.effectiveWeight).toBeCloseTo(0.4);
    expect(result.pullForce).toBeCloseTo(0.4);
  });
});
