import { describe, it, expect } from "vitest";
import {
  DEFAULT_HEARTBEAT_CONFIG,
  DEFAULT_SWING,
  PHASE_BASE_WEIGHTS,
  PHASE_SEQUENCE,
  effectiveTempo,
  nextPhase,
  phaseDurations,
  phaseWeight,
  progression,
  swingDisplacement,
  type BeatIndex,
  type Pulse,
} from "../src/dsaa-heartbeat.js";

// ── helpers ───────────────────────────────────────────────────────────────────

function makePulse(overrides: Partial<Pulse> = {}): Pulse {
  return {
    beat_index: 0,
    phase: "intake",
    beat_position: 0,
    swing_offset: 0,
    tempo: 18,
    cycle: 0,
    heat: 0,
    ...overrides,
  };
}

// ── effectiveTempo ────────────────────────────────────────────────────────────

describe("effectiveTempo", () => {
  it("returns base_tempo at heat = 0", () => {
    expect(effectiveTempo(0, DEFAULT_HEARTBEAT_CONFIG)).toBe(18);
  });

  it("returns peak_tempo at heat = 1", () => {
    expect(effectiveTempo(1, DEFAULT_HEARTBEAT_CONFIG)).toBe(72);
  });

  it("interpolates linearly at heat = 0.5", () => {
    expect(effectiveTempo(0.5, DEFAULT_HEARTBEAT_CONFIG)).toBeCloseTo(45, 5);
  });
});

// ── phaseDurations ────────────────────────────────────────────────────────────

describe("phaseDurations", () => {
  it("sums to one full cycle duration at heat = 0", () => {
    const durations = phaseDurations(0, DEFAULT_HEARTBEAT_CONFIG);
    const total = Object.values(durations).reduce((a, b) => a + b, 0);
    const expectedCycleMs = 60_000 / 18;
    expect(total).toBeCloseTo(expectedCycleMs, 1);
  });

  it("sums to one full cycle duration at heat = 1", () => {
    const durations = phaseDurations(1, DEFAULT_HEARTBEAT_CONFIG);
    const total = Object.values(durations).reduce((a, b) => a + b, 0);
    const expectedCycleMs = 60_000 / 72;
    expect(total).toBeCloseTo(expectedCycleMs, 1);
  });

  it("rest duration shrinks under heat", () => {
    const cold = phaseDurations(0, DEFAULT_HEARTBEAT_CONFIG);
    const hot = phaseDurations(1, DEFAULT_HEARTBEAT_CONFIG);
    expect(hot.rest).toBeLessThan(cold.rest);
  });

  it("intake and emit durations scale together (not compressed)", () => {
    // intake and emit should scale uniformly — only rest compresses
    const cold = phaseDurations(0, DEFAULT_HEARTBEAT_CONFIG);
    const hot = phaseDurations(1, DEFAULT_HEARTBEAT_CONFIG);
    const intakeRatio = hot.intake / cold.intake;
    const emitRatio = hot.emit / cold.emit;
    expect(intakeRatio).toBeCloseTo(emitRatio, 5);
  });

  it("all durations are positive", () => {
    [0, 0.5, 1].forEach((heat) => {
      const d = phaseDurations(heat, DEFAULT_HEARTBEAT_CONFIG);
      PHASE_SEQUENCE.forEach((p) => expect(d[p]).toBeGreaterThan(0));
    });
  });
});

// ── swingDisplacement ─────────────────────────────────────────────────────────

describe("swingDisplacement", () => {
  it("returns 0 for non-biased phases", () => {
    expect(swingDisplacement("intake", 0.5, DEFAULT_SWING)).toBe(0);
    expect(swingDisplacement("emit", 0.5, DEFAULT_SWING)).toBe(0);
    expect(swingDisplacement("rest", 0.5, DEFAULT_SWING)).toBe(0);
  });

  it("peaks at beatPosition = 0.5 for groove_bias phase", () => {
    const mid = swingDisplacement("process", 0.5, DEFAULT_SWING);
    const early = swingDisplacement("process", 0.1, DEFAULT_SWING);
    const late = swingDisplacement("process", 0.9, DEFAULT_SWING);
    expect(Math.abs(mid)).toBeGreaterThan(Math.abs(early));
    expect(Math.abs(mid)).toBeGreaterThan(Math.abs(late));
  });

  it("returns 0 at beatPosition = 0 and 1 (phase boundary)", () => {
    expect(swingDisplacement("process", 0, DEFAULT_SWING)).toBeCloseTo(0, 10);
    expect(swingDisplacement("process", 1, DEFAULT_SWING)).toBeCloseTo(0, 10);
  });

  it("positive displacement for triplet swing (laid-back)", () => {
    const d = swingDisplacement("process", 0.5, DEFAULT_SWING);
    // triplet: referenceRatio 0.667 > 0.5 → stretch > 0 → positive
    expect(d).toBeGreaterThan(0);
  });

  it("displacement ≈ 0 for eighth subdivision (symmetric)", () => {
    const d = swingDisplacement("process", 0.5, {
      ...DEFAULT_SWING,
      subdivision: "eighth",
    });
    // referenceRatio = 0.5 → stretch = 0
    expect(d).toBeCloseTo(0, 10);
  });

  it("larger swing_ratio → larger displacement magnitude", () => {
    const low = swingDisplacement("process", 0.5, {
      ...DEFAULT_SWING,
      swing_ratio: 0.2,
    });
    const high = swingDisplacement("process", 0.5, {
      ...DEFAULT_SWING,
      swing_ratio: 0.9,
    });
    expect(Math.abs(high)).toBeGreaterThan(Math.abs(low));
  });
});

// ── progression ───────────────────────────────────────────────────────────────

describe("progression", () => {
  it("from matches pulse phase, to is the next phase", () => {
    const pulse = makePulse({ beat_index: 0, phase: "intake" });
    const prog = progression(pulse, DEFAULT_HEARTBEAT_CONFIG);
    expect(prog.from).toBe("intake");
    expect(prog.to).toBe("process");
  });

  it("wraps: rest → intake", () => {
    const pulse = makePulse({ beat_index: 3 as BeatIndex, phase: "rest" });
    const prog = progression(pulse, DEFAULT_HEARTBEAT_CONFIG);
    expect(prog.from).toBe("rest");
    expect(prog.to).toBe("intake");
  });

  it("progress equals beat_position", () => {
    const pulse = makePulse({ beat_position: 0.73 });
    const prog = progression(pulse, DEFAULT_HEARTBEAT_CONFIG);
    expect(prog.progress).toBe(0.73);
  });

  it("swing_displacement is non-zero for process phase at midpoint", () => {
    const pulse = makePulse({
      beat_index: 1 as BeatIndex,
      phase: "process",
      beat_position: 0.5,
    });
    const prog = progression(pulse, DEFAULT_HEARTBEAT_CONFIG);
    expect(prog.swing_displacement).not.toBe(0);
  });

  it("swing_displacement is 0 for intake phase", () => {
    const pulse = makePulse({
      beat_index: 0,
      phase: "intake",
      beat_position: 0.5,
    });
    const prog = progression(pulse, DEFAULT_HEARTBEAT_CONFIG);
    expect(prog.swing_displacement).toBe(0);
  });

  it("embeds the pulse in the returned Progression", () => {
    const pulse = makePulse({ heat: 0.7 });
    const prog = progression(pulse, DEFAULT_HEARTBEAT_CONFIG);
    expect(prog.pulse).toBe(pulse);
  });
});

// ── nextPhase ─────────────────────────────────────────────────────────────────

describe("nextPhase", () => {
  it("follows the canonical cycle order", () => {
    expect(nextPhase("intake")).toBe("process");
    expect(nextPhase("process")).toBe("emit");
    expect(nextPhase("emit")).toBe("rest");
    expect(nextPhase("rest")).toBe("intake");
  });
});

// ── phaseWeight ───────────────────────────────────────────────────────────────

describe("phaseWeight", () => {
  it("all phase weights sum to 1.0 at any heat", () => {
    [0, 0.3, 0.7, 1].forEach((heat) => {
      const total = PHASE_SEQUENCE.reduce(
        (acc, p) => acc + phaseWeight(p, heat, DEFAULT_HEARTBEAT_CONFIG),
        0,
      );
      expect(total).toBeCloseTo(1.0, 10);
    });
  });

  it("rest weight decreases under heat", () => {
    const cold = phaseWeight("rest", 0, DEFAULT_HEARTBEAT_CONFIG);
    const hot = phaseWeight("rest", 1, DEFAULT_HEARTBEAT_CONFIG);
    expect(hot).toBeLessThan(cold);
  });

  it("process weight is the largest at heat = 0", () => {
    const weights = PHASE_SEQUENCE.map((p) => phaseWeight(p, 0, DEFAULT_HEARTBEAT_CONFIG));
    const processWeight = phaseWeight("process", 0, DEFAULT_HEARTBEAT_CONFIG);
    expect(processWeight).toBe(Math.max(...weights));
  });
});

// ── PHASE_BASE_WEIGHTS contract ───────────────────────────────────────────────

describe("PHASE_BASE_WEIGHTS", () => {
  it("sum to 1.0 exactly", () => {
    const total = Object.values(PHASE_BASE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1.0, 10);
  });
});
