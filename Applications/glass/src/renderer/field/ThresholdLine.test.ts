import { describe, expect, it, vi } from "vitest";
import { ThresholdLine } from "./ThresholdLine";

describe("ThresholdLine", () => {
  function makeCtx(): CanvasRenderingContext2D {
    const gradient = { addColorStop: vi.fn() };
    return {
      createLinearGradient: vi.fn(() => gradient),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      shadowBlur: 0,
      shadowColor: "",
      strokeStyle: "",
      lineWidth: 0,
    } as unknown as CanvasRenderingContext2D;
  }

  it("initializes with zero opacity", () => {
    const line = new ThresholdLine(800, 400);
    expect(line.opacity).toBe(0);
  });

  it("fades in during evaluating state", () => {
    const line = new ThresholdLine(800, 400);
    for (let i = 0; i < 60; i++) line.tick(16, "evaluating");
    expect(line.opacity).toBeGreaterThan(0);
  });

  it("remains visible during floor_rising", () => {
    const line = new ThresholdLine(800, 400);
    for (let i = 0; i < 120; i++) line.tick(16, "evaluating");
    for (let i = 0; i < 60; i++) line.tick(16, "floor_rising");
    expect(line.opacity).toBeGreaterThan(0.2);
  });

  it("dissolves on elevated state", () => {
    const line = new ThresholdLine(800, 400);
    for (let i = 0; i < 200; i++) line.tick(16, "evaluating");
    const peakOpacity = line.opacity;
    for (let i = 0; i < 400; i++) line.tick(16, "elevated");
    expect(line.opacity).toBeLessThan(peakOpacity);
  });

  it("dissolves on denied state", () => {
    const line = new ThresholdLine(800, 400);
    for (let i = 0; i < 200; i++) line.tick(16, "evaluating");
    for (let i = 0; i < 400; i++) line.tick(16, "denied");
    expect(line.opacity).toBeLessThan(0.1);
  });

  it("stays invisible in ground state", () => {
    const line = new ThresholdLine(800, 400);
    for (let i = 0; i < 200; i++) line.tick(16, "ground");
    expect(line.opacity).toBe(0);
  });

  it("draw is a no-op while below visibility threshold", () => {
    const line = new ThresholdLine(800, 400);
    const ctx = makeCtx();
    line.draw(ctx);
    expect(ctx.createLinearGradient).not.toHaveBeenCalled();
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it("draw renders gradient line once opacity is visible", () => {
    const line = new ThresholdLine(800, 400);
    const ctx = makeCtx();
    for (let i = 0; i < 120; i++) line.tick(16, "evaluating");
    line.draw(ctx);

    expect(ctx.createLinearGradient).toHaveBeenCalledTimes(1);
    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(ctx.moveTo).toHaveBeenCalledTimes(1);
    expect(ctx.lineTo).toHaveBeenCalledTimes(1);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
  });

  it("resize updates line geometry", () => {
    const line = new ThresholdLine(800, 400);
    const ctx = makeCtx();
    for (let i = 0; i < 120; i++) line.tick(16, "evaluating");

    line.draw(ctx);
    const firstGradientArgs = (ctx.createLinearGradient as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];

    (ctx.createLinearGradient as unknown as ReturnType<typeof vi.fn>).mockClear();
    line.resize(1000, 600);
    line.draw(ctx);
    const secondGradientArgs = (ctx.createLinearGradient as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[0];

    expect(secondGradientArgs).not.toEqual(firstGradientArgs);
  });
});
