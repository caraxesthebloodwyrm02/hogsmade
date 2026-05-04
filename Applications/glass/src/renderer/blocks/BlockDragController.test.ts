import { describe, it, expect, vi } from "vitest";
import { BlockDragController } from "./BlockDragController";

function makeController(onDragEnd = vi.fn()) {
  return { ctrl: new BlockDragController({ onDragEnd }), onDragEnd };
}

describe("BlockDragController", () => {
  it("starts not dragging", () => {
    const { ctrl } = makeController();
    expect(ctrl.isDragging()).toBe(false);
    expect(ctrl.activeBlockId()).toBeNull();
  });

  it("tracks drag state after startDrag", () => {
    const { ctrl } = makeController();
    ctrl.startDrag("b1", 100, 200, 50, 60);
    expect(ctrl.isDragging()).toBe(true);
    expect(ctrl.activeBlockId()).toBe("b1");
  });

  it("computes delta-adjusted position on moveDrag", () => {
    const { ctrl } = makeController();
    ctrl.startDrag("b1", 100, 200, 50, 60);
    const pos = ctrl.moveDrag(120, 215);
    expect(pos).toEqual({ id: "b1", x: 70, y: 75 });
  });

  it("returns null from moveDrag when not dragging", () => {
    const { ctrl } = makeController();
    expect(ctrl.moveDrag(100, 200)).toBeNull();
  });

  it("endDragAt returns final position and clears state", () => {
    const { ctrl } = makeController();
    ctrl.startDrag("b1", 100, 200, 50, 60);
    const result = ctrl.endDragAt(130, 220);
    expect(result).toEqual({ id: "b1", x: 80, y: 80 });
    expect(ctrl.isDragging()).toBe(false);
  });

  it("endDrag returns start position when no final mouse given", () => {
    const { ctrl } = makeController();
    ctrl.startDrag("b1", 100, 200, 50, 60);
    const result = ctrl.endDrag();
    expect(result).toEqual({ id: "b1", x: 50, y: 60 });
    expect(ctrl.isDragging()).toBe(false);
  });

  it("returns null from endDrag when not dragging", () => {
    const { ctrl } = makeController();
    expect(ctrl.endDrag()).toBeNull();
  });

  it("handles multiple sequential drags", () => {
    const { ctrl } = makeController();
    ctrl.startDrag("b1", 0, 0, 10, 10);
    ctrl.endDragAt(5, 5);
    ctrl.startDrag("b2", 50, 50, 100, 100);
    expect(ctrl.activeBlockId()).toBe("b2");
    const pos = ctrl.moveDrag(60, 70);
    expect(pos).toEqual({ id: "b2", x: 110, y: 120 });
  });
});
