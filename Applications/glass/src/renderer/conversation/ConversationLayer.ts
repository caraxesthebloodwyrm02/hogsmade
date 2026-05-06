import type { MessageRole } from "../../../bridge/schema";

const MAX_HISTORY = 50;
const FADE_START_MS = 8000;
const FADE_DURATION_MS = 25000;

const AGENT_COLOR = "rgba(240, 234, 216, ALPHA)";
const USER_COLOR = "rgba(232, 238, 244, ALPHA)";

export interface ConversationMessage {
  role: MessageRole;
  text: string;
  timestamp: string;
  age: number;
}

export class ConversationLayer {
  private _messages: ConversationMessage[] = [];
  private anchorX: number;
  private anchorY: number;

  constructor(canvasWidth: number, canvasHeight: number) {
    this.anchorX = canvasWidth * 0.5;
    this.anchorY = canvasHeight * 0.65;
  }

  get messages(): ConversationMessage[] {
    return this._messages;
  }

  sync(msgs: ConversationMessage[]): void {
    const existingAges = new Map(this._messages.map((m) => [this.messageKey(m), m.age]));

    this._messages = msgs.slice(-MAX_HISTORY).map((m) => ({
      ...m,
      age: existingAges.get(this.messageKey(m)) ?? m.age,
    }));
  }

  private messageKey(m: ConversationMessage): string {
    return `${m.role}\0${m.timestamp}\0${m.text}`;
  }

  tick(dt: number): void {
    for (const m of this._messages) {
      m.age += dt;
    }
  }

  opacityForAge(age: number): number {
    if (age < FADE_START_MS) return 0.85;
    const t = Math.min(1, (age - FADE_START_MS) / FADE_DURATION_MS);
    return Math.max(0.05, 0.85 * (1 - t));
  }

  colorForRole(role: MessageRole): string {
    return role === "agent" ? AGENT_COLOR : USER_COLOR;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this._messages.length === 0) return;

    const lineHeight = 16;
    const maxWidth = 320;
    const visible = this._messages.filter((m) => this.opacityForAge(m.age) > 0.05);
    const startIdx = Math.max(0, visible.length - 12);
    const slice = visible.slice(startIdx);

    ctx.save();
    ctx.font = "12px monospace";
    ctx.textAlign = "left";

    let y = this.anchorY;

    for (const msg of slice) {
      const alpha = this.opacityForAge(msg.age);
      const template = this.colorForRole(msg.role);
      ctx.fillStyle = template.replace("ALPHA", String(alpha));

      const words = msg.text.split(" ");
      const lines: string[] = [];
      let current = "";
      for (const word of words) {
        const test = current ? `${current} ${word}` : word;
        if (ctx.measureText(test).width > maxWidth) {
          if (current) lines.push(current);
          current = word;
        } else {
          current = test;
        }
      }
      if (current) lines.push(current);

      for (const line of lines) {
        ctx.fillText(line, this.anchorX - maxWidth / 2, y);
        y += lineHeight;
      }
      y += 4;
    }

    ctx.restore();
  }

  resize(canvasWidth: number, canvasHeight: number): void {
    this.anchorX = canvasWidth * 0.5;
    this.anchorY = canvasHeight * 0.65;
  }
}
