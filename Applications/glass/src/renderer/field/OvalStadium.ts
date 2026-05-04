import type { OvalBus } from "./ModulationEngine";

// ── OvalStadium ───────────────────────────────────────────────────────────────
// The oval floor surrounding the disk.
// Modeled after early 2000s cricket grounds — The Oval (Kennington), Lord's,
// Eden Gardens: a large atmospheric ellipse with inner circle, field markings,
// and named position markers around the boundary.

const WARM = { r: 200, g: 184, b: 154 };
const COOL = { r: 160, g: 210, b: 220 };

function rgba(c: { r: number; g: number; b: number }, a: number): string {
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}

// Avatar slots around the oval — angle in degrees from top, clockwise.
// radiusFactor: 0 = center, 1 = outer boundary.
// Entities drawn from Glass ecosystem: skills, agents, commands.
export interface OvalSlot {
  angle: number;
  radiusFactor: number;
  entityId: string;
  label: string;
  active: boolean;
}

const SLOTS: Omit<OvalSlot, "active">[] = [
  { angle: 0, radiusFactor: 0.88, entityId: "rift", label: "/rift" },
  { angle: 40, radiusFactor: 0.72, entityId: "hermes", label: "hermes" },
  { angle: 85, radiusFactor: 0.82, entityId: "simplify", label: "/simplify" },
  { angle: 135, radiusFactor: 0.78, entityId: "voice_I", label: "I" },
  { angle: 175, radiusFactor: 0.88, entityId: "gated", label: "/gate" },
  { angle: 215, radiusFactor: 0.78, entityId: "voice_II", label: "II" },
  { angle: 265, radiusFactor: 0.82, entityId: "organizer", label: "organizer" },
  { angle: 310, radiusFactor: 0.72, entityId: "voice_III", label: "III" },
];

export class OvalStadium {
  private cx: number;
  private cy: number;
  private rx: number; // outer boundary semi-major
  private ry: number; // outer boundary semi-minor
  private slots: OvalSlot[];

  constructor(cx: number, cy: number, canvasWidth: number, canvasHeight: number) {
    this.cx = cx;
    this.cy = cy;
    // stadium spans ~60% of canvas width, aspect ratio ~1.6:1 (cricket oval shape)
    this.rx = canvasWidth * 0.38;
    this.ry = canvasHeight * 0.28;
    this.slots = SLOTS.map((s) => ({ ...s, active: false }));
  }

  setSlotActive(entityId: string, active: boolean): void {
    const slot = this.slots.find((s) => s.entityId === entityId);
    if (slot) slot.active = active;
  }

  draw(ctx: CanvasRenderingContext2D, bus: OvalBus): void {
    if (bus.opacity < 0.005) return;

    ctx.save();
    ctx.globalAlpha = bus.opacity;

    this.drawFieldTexture(ctx, bus);
    this.drawInnerCircle(ctx, bus);
    this.drawBoundary(ctx, bus);
    this.drawRadialLines(ctx, bus);
    this.drawCenterMark(ctx, bus);

    ctx.restore();

    // markers drawn at full canvas alpha, with their own opacity
    this.drawPositionMarkers(ctx, bus);
  }

  // ── Outfield texture — concentric mowed-grass arcs (very faint) ───────────

  private drawFieldTexture(ctx: CanvasRenderingContext2D, bus: OvalBus): void {
    const bands = 6;
    for (let i = 1; i <= bands; i++) {
      const t = i / bands;
      const brx = this.rx * t;
      const bry = this.ry * t;
      const alpha = bus.fieldAlpha * 0.4 * (1 - t * 0.5);
      ctx.beginPath();
      ctx.ellipse(this.cx, this.cy, brx, bry, 0, 0, Math.PI * 2);
      ctx.strokeStyle = i % 2 === 0 ? rgba(WARM, alpha) : rgba(COOL, alpha * 0.5);
      ctx.lineWidth = 0.4;
      ctx.stroke();
    }
  }

  // ── Inner circle — 30-yard ring (cricket equivalent) ─────────────────────

  private drawInnerCircle(ctx: CanvasRenderingContext2D, bus: OvalBus): void {
    const irx = this.rx * 0.42;
    const iry = this.ry * 0.42;

    ctx.beginPath();
    ctx.ellipse(this.cx, this.cy, irx, iry, 0, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(COOL, bus.opacity * 0.35);
    ctx.lineWidth = bus.lineWidth * 0.6;
    ctx.setLineDash([6, 10]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── Outer boundary ring ───────────────────────────────────────────────────

  private drawBoundary(ctx: CanvasRenderingContext2D, bus: OvalBus): void {
    ctx.save();
    ctx.shadowBlur = 8;
    ctx.shadowColor = rgba(WARM, bus.opacity * 0.4);

    ctx.beginPath();
    ctx.ellipse(this.cx, this.cy, this.rx, this.ry, 0, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(WARM, bus.opacity * 0.55);
    ctx.lineWidth = bus.lineWidth;
    ctx.stroke();
    ctx.restore();
  }

  // ── Radial field lines from center to boundary — like pitch rays ──────────

  private drawRadialLines(ctx: CanvasRenderingContext2D, bus: OvalBus): void {
    const count = 8;
    for (let i = 0; i < count; i++) {
      const angleDeg = (i / count) * 360;
      const angleRad = (angleDeg - 90) * (Math.PI / 180);
      const ex = this.cx + this.rx * Math.cos(angleRad);
      const ey = this.cy + this.ry * Math.sin(angleRad);

      const grad = ctx.createLinearGradient(this.cx, this.cy, ex, ey);
      grad.addColorStop(0, rgba(WARM, bus.fieldAlpha * 0.5));
      grad.addColorStop(0.6, rgba(WARM, bus.fieldAlpha * 0.15));
      grad.addColorStop(1, rgba(WARM, 0));

      ctx.beginPath();
      ctx.moveTo(this.cx, this.cy);
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }

  // ── Center mark — pitch crosshair ─────────────────────────────────────────

  private drawCenterMark(ctx: CanvasRenderingContext2D, bus: OvalBus): void {
    const size = 12;
    const alpha = bus.opacity * 0.6;

    ctx.beginPath();
    ctx.moveTo(this.cx - size, this.cy);
    ctx.lineTo(this.cx + size, this.cy);
    ctx.strokeStyle = rgba(WARM, alpha);
    ctx.lineWidth = 0.7;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(this.cx, this.cy - size);
    ctx.lineTo(this.cx, this.cy + size);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(this.cx, this.cy, 4, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(COOL, alpha);
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }

  // ── Position markers — entity slots around the boundary ───────────────────

  private drawPositionMarkers(ctx: CanvasRenderingContext2D, bus: OvalBus): void {
    for (const slot of this.slots) {
      const angleRad = (slot.angle - 90) * (Math.PI / 180);
      const x = this.cx + this.rx * slot.radiusFactor * Math.cos(angleRad);
      const y = this.cy + this.ry * slot.radiusFactor * Math.sin(angleRad);

      const baseAlpha = bus.markerAlpha;
      const alpha = slot.active ? Math.min(1, baseAlpha * 3.5) : baseAlpha;

      // connector line from center to marker
      const grad = ctx.createLinearGradient(this.cx, this.cy, x, y);
      grad.addColorStop(0, rgba(WARM, 0));
      grad.addColorStop(0.7, rgba(WARM, alpha * 0.3));
      grad.addColorStop(1, rgba(WARM, 0));
      ctx.beginPath();
      ctx.moveTo(this.cx, this.cy);
      ctx.lineTo(x, y);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 0.4;
      ctx.stroke();

      // marker dot
      if (slot.active) {
        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = rgba(WARM, 0.6);
      }
      ctx.beginPath();
      ctx.arc(x, y, slot.active ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = rgba(WARM, alpha);
      ctx.fill();
      if (slot.active) ctx.restore();

      // label
      if (alpha > 0.05) {
        ctx.save();
        ctx.globalAlpha = alpha * 0.9;
        ctx.font = "9px monospace";
        ctx.fillStyle = rgba(WARM, 1);
        ctx.textAlign = "center";
        // offset label away from center
        const labelOffsetX = Math.cos(angleRad) * 14;
        const labelOffsetY = Math.sin(angleRad) * 12;
        ctx.fillText(slot.label, x + labelOffsetX, y + labelOffsetY);
        ctx.restore();
      }
    }
  }

  // ── Slot accessors for external activation ────────────────────────────────

  getSlots(): OvalSlot[] {
    return this.slots;
  }

  slotPosition(entityId: string): { x: number; y: number } | null {
    const slot = this.slots.find((s) => s.entityId === entityId);
    if (!slot) return null;
    const angleRad = (slot.angle - 90) * (Math.PI / 180);
    return {
      x: this.cx + this.rx * slot.radiusFactor * Math.cos(angleRad),
      y: this.cy + this.ry * slot.radiusFactor * Math.sin(angleRad),
    };
  }
}
