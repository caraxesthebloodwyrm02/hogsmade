import { describe, it, expect, beforeEach } from "vitest";
import { Camera } from "./Camera";

describe("Camera", () => {
  let cam: Camera;

  beforeEach(() => {
    cam = new Camera();
  });

  it("starts at origin", () => {
    expect(cam.x).toBe(0);
    expect(cam.y).toBe(0);
  });

  it("pan shifts the offset", () => {
    cam.pan(10, -5);
    expect(cam.x).toBe(10);
    expect(cam.y).toBe(-5);
  });

  it("multiple pans accumulate", () => {
    cam.pan(10, 0);
    cam.pan(20, 30);
    expect(cam.x).toBe(30);
    expect(cam.y).toBe(30);
  });

  it("setPosition moves directly", () => {
    cam.pan(100, 100);
    cam.setPosition(0, 0);
    expect(cam.x).toBe(0);
    expect(cam.y).toBe(0);
  });

  it("provides a translate transform for canvas", () => {
    cam.pan(50, 25);
    const t = cam.transform();
    expect(t).toEqual({ tx: -50, ty: -25 });
  });

  it("smoothPan eases toward target over time", () => {
    cam.setTarget(100, 50);
    for (let i = 0; i < 100; i++) cam.tick(16);
    expect(cam.x).toBeGreaterThan(50);
    expect(cam.y).toBeGreaterThan(20);
  });
});
