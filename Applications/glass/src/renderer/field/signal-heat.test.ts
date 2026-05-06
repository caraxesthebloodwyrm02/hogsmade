import { describe, it, expect } from "vitest";
import { computeSignalHeat } from "./signal-heat";

const DEFAULT_HT = { git_diff_lines: 200, iteration_count: 15, session_age_minutes: 60 };

describe("computeSignalHeat", () => {
  it("returns 0 when all signals are zero", () => {
    const signals = { git_diff_lines: 0, iteration_count: 0, session_age_minutes: 0 };
    expect(computeSignalHeat(signals, DEFAULT_HT)).toBe(0);
  });

  it("returns 1 when iteration_count equals threshold", () => {
    const signals = { git_diff_lines: 0, iteration_count: 15, session_age_minutes: 0 };
    expect(computeSignalHeat(signals, DEFAULT_HT)).toBe(1);
  });

  it("returns 1 when git_diff_lines equals threshold", () => {
    const signals = { git_diff_lines: 200, iteration_count: 0, session_age_minutes: 0 };
    expect(computeSignalHeat(signals, DEFAULT_HT)).toBe(1);
  });

  it("returns 1 when session_age_minutes equals threshold", () => {
    const signals = { git_diff_lines: 0, iteration_count: 0, session_age_minutes: 60 };
    expect(computeSignalHeat(signals, DEFAULT_HT)).toBe(1);
  });

  it("clamps above threshold to 1", () => {
    const signals = { git_diff_lines: 500, iteration_count: 30, session_age_minutes: 120 };
    expect(computeSignalHeat(signals, DEFAULT_HT)).toBe(1);
  });

  it("picks the hottest signal via max", () => {
    const signals = { git_diff_lines: 100, iteration_count: 12, session_age_minutes: 10 };
    // normalized: 100/200=0.5, 12/15=0.8, 10/60=0.167
    expect(computeSignalHeat(signals, DEFAULT_HT)).toBeCloseTo(0.8);
  });

  it("respects custom hot_threshold values", () => {
    const ht = { git_diff_lines: 100, iteration_count: 10, session_age_minutes: 30 };
    const signals = { git_diff_lines: 50, iteration_count: 5, session_age_minutes: 15 };
    // all normalize to 0.5
    expect(computeSignalHeat(signals, ht)).toBeCloseTo(0.5);
  });

  it("handles partial signals gracefully", () => {
    const signals = { git_diff_lines: 0, iteration_count: 0, session_age_minutes: 0 };
    expect(computeSignalHeat(signals, DEFAULT_HT)).toBe(0);
  });
});
