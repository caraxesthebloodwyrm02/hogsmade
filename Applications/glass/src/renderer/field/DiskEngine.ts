import type { ThresholdState } from "../../../bridge/schema";
import type { DiskBus } from "./ModulationEngine";

const WARM = { r: 200, g: 184, b: 154 };
const COOL = { r: 160, g: 210, b: 220 };

function rgba(c: { r: number; g: number; b: number }, a: number): string {
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}

export class DiskEngine {
  private cx: number;
  private cy: number;

  constructor(cx: number, cy: number) {
    this.cx = cx;
    this.cy = cy + 24;
  }

  reposition(cx: number, cy: number): void {
    this.cx = cx;
    this.cy = cy + 24;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    bus: DiskBus,
    thresholdState: ThresholdState,
    progress: number,
  ): void {
    if (bus.scale < 0.01) return;

    const maxRx = 120;
    const maxRy = 28;
    const rx = maxRx * bus.scale;
    const ry = maxRy * bus.scale;

    this.drawFloodLayer(ctx, rx, ry, bus, thresholdState);
    this.drawRimRing(ctx, rx, ry, bus, thresholdState, progress);

    if (thresholdState === "evaluating" || thresholdState === "floor_rising") {
      this.drawEvaluationPulse(ctx, rx, ry, progress);
    }
  }

  private drawFloodLayer(
    ctx: CanvasRenderingContext2D,
    rx: number,
    ry: number,
    bus: DiskBus,
    state: ThresholdState,
  ): void {
    const isElevated =
      state === "elevated" ||
      state === "voice_1_active" ||
      state === "voice_2_active" ||
      state === "voice_3_active" ||
      state === "voices_appearing";

    const g = ctx.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, rx);

    if (isElevated) {
      g.addColorStop(0, rgba(WARM, bus.brightness * 0.22));
      g.addColorStop(0.4, rgba(COOL, bus.brightness * 0.1));
      g.addColorStop(0.8, rgba(WARM, bus.brightness * 0.04));
      g.addColorStop(1, rgba(WARM, 0));
    } else if (state === "evaluating" || state === "floor_rising") {
      g.addColorStop(0, rgba(COOL, bus.brightness * 0.14));
      g.addColorStop(0.5, rgba(WARM, bus.brightness * 0.06));
      g.addColorStop(1, rgba(WARM, 0));
    } else {
      g.addColorStop(0, rgba(WARM, bus.brightness * 0.08));
      g.addColorStop(0.6, rgba(WARM, bus.brightness * 0.02));
      g.addColorStop(1, rgba(WARM, 0));
    }

    ctx.save();
    ctx.scale(1, ry / rx);
    ctx.beginPath();
    ctx.arc(this.cx, this.cy * (rx / ry), rx, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  }

  private drawRimRing(
    ctx: CanvasRenderingContext2D,
    rx: number,
    ry: number,
    bus: DiskBus,
    state: ThresholdState,
    progress: number,
  ): void {
    const isElevated =
      state === "elevated" ||
      state === "voices_appearing" ||
      state === "voice_1_active" ||
      state === "voice_2_active" ||
      state === "voice_3_active";

    ctx.save();
    ctx.shadowBlur = isElevated ? 10 : 4;
    ctx.shadowColor = rgba(isElevated ? WARM : COOL, 0.5);
    ctx.beginPath();
    ctx.ellipse(this.cx, this.cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(isElevated ? WARM : COOL, bus.rimAlpha);
    ctx.lineWidth = isElevated ? 1.2 : 0.6;
    ctx.stroke();
    ctx.restore();

    if (state === "floor_rising" && progress > 0) {
      ctx.save();
      ctx.shadowBlur = 8;
      ctx.shadowColor = rgba(WARM, 0.7);
      ctx.beginPath();
      ctx.ellipse(this.cx, this.cy, rx, ry, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      ctx.strokeStyle = rgba(WARM, 0.8);
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawEvaluationPulse(
    ctx: CanvasRenderingContext2D,
    rx: number,
    ry: number,
    progress: number,
  ): void {
    const pulseRx = rx * (1 + progress * 0.4);
    const pulseRy = ry * (1 + progress * 0.4);
    ctx.beginPath();
    ctx.ellipse(this.cx, this.cy, pulseRx, pulseRy, 0, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(COOL, (1 - progress) * 0.18);
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
}
