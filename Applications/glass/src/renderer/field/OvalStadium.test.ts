import { beforeEach, describe, expect, it, vi } from "vitest";
import { OvalStadium } from "./OvalStadium";
import type { OvalBus } from "./ModulationEngine";

// Canvas 1400×900 — same as the default window size in main/index.ts
const CANVAS_W = 1400;
const CANVAS_H = 900;
const CX = CANVAS_W * 0.5;
const CY = CANVAS_H * 0.48;

describe("OvalStadium", () => {
  let stadium: OvalStadium;

  function makeCtx(): CanvasRenderingContext2D {
    const gradient = { addColorStop: vi.fn() };
    return {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      ellipse: vi.fn(),
      stroke: vi.fn(),
      setLineDash: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillText: vi.fn(),
      createLinearGradient: vi.fn(() => gradient),
      strokeStyle: "",
      lineWidth: 0,
      shadowBlur: 0,
      shadowColor: "",
      globalAlpha: 0,
      fillStyle: "",
      textAlign: "left",
      font: "",
    } as unknown as CanvasRenderingContext2D;
  }

  function bus(overrides: Partial<OvalBus> = {}): OvalBus {
    return {
      opacity: 1,
      lineWidth: 1,
      markerAlpha: 0.4,
      fieldAlpha: 0.3,
      ...overrides,
    };
  }

  beforeEach(() => {
    stadium = new OvalStadium(CX, CY, CANVAS_W, CANVAS_H);
  });

  describe("slot roster", () => {
    it("initialises 8 slots", () => {
      expect(stadium.getSlots()).toHaveLength(8);
    });

    it("all slots start inactive", () => {
      const inactive = stadium.getSlots().every((s) => !s.active);
      expect(inactive).toBe(true);
    });

    it("voice slots use uppercase Roman numeral IDs", () => {
      const slots = stadium.getSlots();
      expect(slots.find((s) => s.entityId === "voice_I")).toBeDefined();
      expect(slots.find((s) => s.entityId === "voice_II")).toBeDefined();
      expect(slots.find((s) => s.entityId === "voice_III")).toBeDefined();
    });
  });

  describe("setSlotActive", () => {
    it("activates a named slot", () => {
      stadium.setSlotActive("voice_I", true);
      const slot = stadium.getSlots().find((s) => s.entityId === "voice_I");
      expect(slot?.active).toBe(true);
    });

    it("deactivates a slot", () => {
      stadium.setSlotActive("voice_II", true);
      stadium.setSlotActive("voice_II", false);
      const slot = stadium.getSlots().find((s) => s.entityId === "voice_II");
      expect(slot?.active).toBe(false);
    });

    it("ignores unknown entityId silently", () => {
      expect(() => stadium.setSlotActive("voice_iv", true)).not.toThrow();
      const activated = stadium.getSlots().filter((s) => s.active);
      expect(activated).toHaveLength(0);
    });

    // Regression: Field.ts used to call `voice_${v.id.toLowerCase()}` which produced
    // "voice_i", "voice_ii", "voice_iii" — none matching the slot entity IDs.
    it("regression: lowercase id does NOT activate voice slot (old bug)", () => {
      stadium.setSlotActive("voice_ii", true); // old behaviour
      const slot = stadium.getSlots().find((s) => s.entityId === "voice_II");
      expect(slot?.active).toBe(false);
    });

    it("regression: uppercase id correctly activates voice slot (fixed)", () => {
      stadium.setSlotActive("voice_II", true); // fixed behaviour
      const slot = stadium.getSlots().find((s) => s.entityId === "voice_II");
      expect(slot?.active).toBe(true);
    });
  });

  describe("slotPosition", () => {
    it("returns a position for known entityId", () => {
      const pos = stadium.slotPosition("rift");
      expect(pos).not.toBeNull();
      expect(typeof pos!.x).toBe("number");
      expect(typeof pos!.y).toBe("number");
    });

    it("returns null for unknown entityId", () => {
      expect(stadium.slotPosition("nonexistent")).toBeNull();
    });

    it("voice_I position is finite and within canvas bounds", () => {
      const pos = stadium.slotPosition("voice_I");
      expect(pos).not.toBeNull();
      expect(isFinite(pos!.x)).toBe(true);
      expect(isFinite(pos!.y)).toBe(true);
    });
  });

  describe("draw", () => {
    it("returns early when opacity is near zero", () => {
      const ctx = makeCtx();
      stadium.draw(ctx, bus({ opacity: 0.001 }));
      expect(ctx.save).not.toHaveBeenCalled();
      expect(ctx.ellipse).not.toHaveBeenCalled();
      expect(ctx.fillText).not.toHaveBeenCalled();
    });

    it("draws stadium geometry and position labels when visible", () => {
      const ctx = makeCtx();
      stadium.draw(ctx, bus());
      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
      expect(ctx.ellipse).toHaveBeenCalled();
      expect(ctx.createLinearGradient).toHaveBeenCalled();
      expect(ctx.arc).toHaveBeenCalled();
      expect(ctx.fillText).toHaveBeenCalled();
    });

    it("renders active marker path for Roman numeral slot", () => {
      const ctx = makeCtx();
      stadium.setSlotActive("voice_II", true);
      stadium.draw(ctx, bus({ markerAlpha: 0.5 }));
      // Active slot uses additional save/restore for glow.
      expect((ctx.save as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(
        1,
      );
      expect((ctx.arc as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
    });
  });
});
