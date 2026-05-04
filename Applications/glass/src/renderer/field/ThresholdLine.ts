import type { ThresholdState } from "../../../bridge/schema";

const WARM = { r: 200, g: 184, b: 154 };
const COOL = { r: 160, g: 210, b: 220 };

function rgba(c: { r: number; g: number; b: number }, a: number): string {
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}

const VISIBLE_STATES: ThresholdState[] = ["evaluating", "floor_rising"];

export class ThresholdLine {
  private canvasWidth: number;
  private cy: number;
  private _opacity = 0;

  constructor(canvasWidth: number, canvasHeight: number) {
    this.canvasWidth = canvasWidth;
    this.cy = canvasHeight * 0.48;
  }

  get opacity(): number {
    return this._opacity;
  }

  tick(dt: number, state: ThresholdState): void {
    const target = VISIBLE_STATES.includes(state) ? 0.65 : 0;
    const speed = target > this._opacity ? 0.003 : 0.005;
    this._opacity += (target - this._opacity) * speed * dt;
    if (this._opacity < 0.001) this._opacity = 0;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this._opacity < 0.005) return;

    const margin = this.canvasWidth * 0.08;
    const x0 = margin;
    const x1 = this.canvasWidth - margin;

    const grad = ctx.createLinearGradient(x0, this.cy, x1, this.cy);
    grad.addColorStop(0, rgba(COOL, 0));
    grad.addColorStop(0.15, rgba(COOL, this._opacity * 0.6));
    grad.addColorStop(0.5, rgba(WARM, this._opacity));
    grad.addColorStop(0.85, rgba(COOL, this._opacity * 0.6));
    grad.addColorStop(1, rgba(COOL, 0));

    ctx.save();
    ctx.shadowBlur = 6;
    ctx.shadowColor = rgba(WARM, this._opacity * 0.5);

    ctx.beginPath();
    ctx.moveTo(x0, this.cy);
    ctx.lineTo(x1, this.cy);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 0.8;
    ctx.stroke();

    ctx.restore();
  }

  resize(canvasWidth: number, canvasHeight: number): void {
    this.canvasWidth = canvasWidth;
    this.cy = canvasHeight * 0.48;
  }
}
