import type { AgentState, BridgeVoice, ThresholdState } from "../../../bridge/schema";

interface TrailPoint {
  x: number;
  y: number;
  age: number;
}

export class UserPresence {
  x = 0;
  y = 0;
  private trail: TrailPoint[] = [];

  move(x: number, y: number): void {
    this.trail.push({ x: this.x, y: this.y, age: 0 });
    if (this.trail.length > 20) this.trail.shift();
    this.x = x;
    this.y = y;
  }

  draw(ctx: CanvasRenderingContext2D, dt: number): void {
    this.trail.forEach((p) => {
      p.age += dt;
    });
    this.trail = this.trail.filter((p) => p.age < 400);

    this.trail.forEach((p) => {
      const alpha = Math.max(0, 1 - p.age / 400) * 0.3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(240, 234, 216, ${alpha})`;
      ctx.fill();
    });

    ctx.beginPath();
    ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(240, 234, 216, 0.9)";
    ctx.fill();
  }
}

// ── Holographic agent presence ───────────────────────────────────────────────

const WARM = { r: 200, g: 184, b: 154 };
const COOL = { r: 160, g: 210, b: 220 };

function rgba(c: { r: number; g: number; b: number }, a: number): string {
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}

export class AgentPresence {
  x: number;
  y: number;

  private active = false;
  private pulsePhase = 0;
  private scanOffset = 0;

  // flicker state
  private flickerAlpha = 1;
  private flickerTimer = 0;
  private nextFlicker = 3000 + Math.random() * 4000;

  constructor(cx: number, cy: number) {
    this.x = cx;
    this.y = cy;
  }

  reposition(cx: number, cy: number): void {
    this.x = cx;
    this.y = cy;
  }

  setAgentState(state: AgentState): void {
    this.active = state === "writing" || state === "thinking";
  }

  draw(ctx: CanvasRenderingContext2D, dt: number): void {
    // animate
    if (this.active) {
      this.pulsePhase += dt * 0.0018;
      this.scanOffset = (this.scanOffset + dt * 0.05) % 6;
    }

    // occasional flicker — brief drop + recovery
    this.flickerTimer += dt;
    if (this.flickerTimer >= this.nextFlicker) {
      this.flickerAlpha = 0.25 + Math.random() * 0.35;
      this.flickerTimer = 0;
      this.nextFlicker = 2500 + Math.random() * 5000;
      setTimeout(
        () => {
          this.flickerAlpha = 1;
        },
        60 + Math.random() * 80,
      );
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.globalAlpha = this.flickerAlpha;

    this.drawProjectionBase(ctx);
    this.drawDepthLayers(ctx);
    this.drawScanLines(ctx);
    this.drawRimGlow(ctx);
    this.drawVisor(ctx);
    if (this.active) this.drawPulseHalo(ctx);

    ctx.restore();
  }

  // ── projection base: soft ground ellipse beneath the figure ──────────────

  private drawProjectionBase(ctx: CanvasRenderingContext2D): void {
    const g = ctx.createRadialGradient(0, 24, 0, 0, 24, 20);
    g.addColorStop(0, rgba(COOL, 0.1));
    g.addColorStop(0.5, rgba(WARM, 0.05));
    g.addColorStop(1, rgba(WARM, 0));
    ctx.beginPath();
    ctx.ellipse(0, 24, 20, 5, 0, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
  }

  // ── depth layers: 3 passes at slight offsets, each with a dim fill + stroke

  private drawDepthLayers(ctx: CanvasRenderingContext2D): void {
    const layers = [
      { dx: -0.6, dy: -0.3, fillA: 0.04, strokeA: 0.18, blur: 0 },
      { dx: 0.0, dy: 0.0, fillA: 0.07, strokeA: 0.55, blur: 6 },
      { dx: 0.6, dy: 0.3, fillA: 0.03, strokeA: 0.14, blur: 0 },
    ];

    for (const l of layers) {
      ctx.save();
      ctx.translate(l.dx, l.dy);
      ctx.shadowBlur = l.blur;
      ctx.shadowColor = rgba(WARM, 0.6);
      this.traceFigure(ctx);
      ctx.fillStyle = rgba(WARM, l.fillA);
      ctx.fill();
      ctx.strokeStyle = rgba(WARM, l.strokeA);
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.restore();
    }
  }

  // ── scan lines: horizontal bands clipped to the figure silhouette ─────────

  private drawScanLines(ctx: CanvasRenderingContext2D): void {
    ctx.save();

    // clip to figure bounding region
    this.traceFigure(ctx);
    ctx.clip();

    const spacing = 3;
    const top = -22;
    const bottom = 17;
    const startY = top + (this.scanOffset % spacing);

    ctx.lineWidth = 0.4;
    for (let y = startY; y <= bottom; y += spacing) {
      // brightness varies by vertical position — top and bottom cooler, mid warmer
      const t = (y - top) / (bottom - top);
      const alpha = 0.08 + 0.14 * Math.sin(t * Math.PI);
      ctx.beginPath();
      ctx.moveTo(-13, y);
      ctx.lineTo(13, y);
      ctx.strokeStyle = rgba(WARM, alpha);
      ctx.stroke();

      // every third line gets a cooler shimmer
      if (Math.floor((y - top) / spacing) % 3 === 0) {
        ctx.beginPath();
        ctx.moveTo(-13, y + 0.5);
        ctx.lineTo(13, y + 0.5);
        ctx.strokeStyle = rgba(COOL, 0.06);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  // ── rim glow: bright outline drawn once on top of fill layers ────────────

  private drawRimGlow(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.shadowBlur = 12;
    ctx.shadowColor = rgba(WARM, 0.45);
    this.traceFigure(ctx);
    ctx.strokeStyle = rgba(WARM, 0.7);
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.restore();
  }

  // ── visor: dark lens with cool edge reflection ────────────────────────────

  private drawVisor(ctx: CanvasRenderingContext2D): void {
    ctx.beginPath();
    ctx.ellipse(0, -14, 4, 3, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(10, 10, 12, 0.75)";
    ctx.fill();

    // reflection sliver
    ctx.beginPath();
    ctx.ellipse(-1, -15.5, 2, 1, -0.4, 0, Math.PI * 2);
    ctx.fillStyle = rgba(COOL, 0.35);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(0, -14, 4, 3, 0, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(COOL, 0.5);
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }

  // ── pulse halo: active-state breathing ring ───────────────────────────────

  private drawPulseHalo(ctx: CanvasRenderingContext2D): void {
    const intensity = 0.5 + Math.sin(this.pulsePhase) * 0.5;
    const radius = 32 + intensity * 6;

    const g = ctx.createRadialGradient(0, 0, 10, 0, 0, radius);
    g.addColorStop(0, rgba(WARM, intensity * 0.08));
    g.addColorStop(0.6, rgba(COOL, intensity * 0.04));
    g.addColorStop(1, rgba(WARM, 0));

    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
  }

  // ── figure path: the complete suit silhouette as a single traceable path ──

  private traceFigure(ctx: CanvasRenderingContext2D): void {
    ctx.beginPath();
    ctx.arc(0, -14, 7, 0, Math.PI * 2);
    ctx.closePath();
    ctx.moveTo(-6 + 3, -7);
    ctx.roundRect(-6, -7, 12, 14, 3);
    ctx.moveTo(-11 + 2, -6);
    ctx.roundRect(-11, -6, 5, 9, 2);
    ctx.moveTo(6 + 2, -6);
    ctx.roundRect(6, -6, 5, 9, 2);
    ctx.moveTo(-5 + 2, 7);
    ctx.roundRect(-5, 7, 4, 8, 2);
    ctx.moveTo(1 + 2, 7);
    ctx.roundRect(1, 7, 4, 8, 2);
  }
}

// ── Voice color palettes ──────────────────────────────────────────────────────

const VOICE_COLORS = {
  amber: { r: 200, g: 168, b: 83 }, // Voice I  — left
  silver: { r: 176, g: 196, b: 204 }, // Voice II — center
  gold: { r: 212, g: 168, b: 83 }, // Voice III — right
} as const;

// ── VoicePresence ─────────────────────────────────────────────────────────────
// A single holographic Voice figure. Same silhouette as AgentPresence,
// lower base opacity, distinct color, positioned by field anchor.

export class VoicePresence {
  x: number;
  y: number;
  private voice: BridgeVoice;
  private appearProgress = 0; // 0→1 fade-in when voice becomes active
  private scanOffset = 0;
  private flickerAlpha = 1;
  private flickerTimer = 0;
  private nextFlicker = 4000 + Math.random() * 6000;

  constructor(voice: BridgeVoice, canvasWidth: number, canvasHeight: number) {
    this.voice = voice;
    const pos = this.anchorPosition(voice.position, canvasWidth, canvasHeight);
    this.x = pos.x;
    this.y = pos.y;
  }

  private anchorPosition(
    position: BridgeVoice["position"],
    w: number,
    h: number,
  ): { x: number; y: number } {
    const y = h * 0.35;
    if (position === "left") return { x: w * 0.22, y };
    if (position === "center") return { x: w * 0.5, y };
    return { x: w * 0.78, y };
  }

  update(voice: BridgeVoice): void {
    this.voice = voice;
  }

  resize(canvasWidth: number, canvasHeight: number): void {
    const pos = this.anchorPosition(this.voice.position, canvasWidth, canvasHeight);
    this.x = pos.x;
    this.y = pos.y;
  }

  draw(ctx: CanvasRenderingContext2D, dt: number): void {
    // fade in when active
    const targetAppear = this.voice.active ? 1 : 0;
    this.appearProgress += (targetAppear - this.appearProgress) * 0.002 * dt;
    if (this.appearProgress < 0.02) return;

    this.scanOffset = (this.scanOffset + dt * 0.03) % 6;

    this.flickerTimer += dt;
    if (this.flickerTimer >= this.nextFlicker) {
      this.flickerAlpha = 0.3 + Math.random() * 0.4;
      this.flickerTimer = 0;
      this.nextFlicker = 4000 + Math.random() * 7000;
      setTimeout(
        () => {
          this.flickerAlpha = 1;
        },
        70 + Math.random() * 60,
      );
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.globalAlpha = this.appearProgress * this.flickerAlpha * 0.55; // dimmer than Spaceman

    const c = VOICE_COLORS[this.voice.color];

    this.drawVoiceGlow(ctx, c);
    this.drawDepthLayers(ctx, c);
    this.drawScanLines(ctx, c);
    this.drawRimGlow(ctx, c);
    this.drawVisor(ctx);
    if (this.voice.active) this.drawActiveIndicator(ctx, c);

    ctx.restore();

    if (this.voice.active && this.voice.text) {
      this.drawVoiceText(ctx, this.voice.text);
    }
  }

  private drawVoiceGlow(
    ctx: CanvasRenderingContext2D,
    c: { r: number; g: number; b: number },
  ): void {
    const g = ctx.createRadialGradient(0, 0, 5, 0, 0, 36);
    g.addColorStop(0, `rgba(${c.r},${c.g},${c.b},0.07)`);
    g.addColorStop(1, `rgba(${c.r},${c.g},${c.b},0)`);
    ctx.beginPath();
    ctx.arc(0, 0, 36, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
  }

  private drawDepthLayers(
    ctx: CanvasRenderingContext2D,
    c: { r: number; g: number; b: number },
  ): void {
    const col = `rgb(${c.r},${c.g},${c.b})`;
    const layers = [
      { dx: -0.5, dy: -0.25, fillA: 0.03, strokeA: 0.12, blur: 0 },
      { dx: 0.0, dy: 0.0, fillA: 0.05, strokeA: 0.4, blur: 5 },
      { dx: 0.5, dy: 0.25, fillA: 0.02, strokeA: 0.1, blur: 0 },
    ];
    for (const l of layers) {
      ctx.save();
      ctx.translate(l.dx, l.dy);
      ctx.shadowBlur = l.blur;
      ctx.shadowColor = `rgba(${c.r},${c.g},${c.b},0.5)`;
      this.traceFigure(ctx);
      ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},${l.fillA})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${l.strokeA})`;
      ctx.lineWidth = 0.7;
      ctx.stroke();
      ctx.restore();
    }
    void col;
  }

  private drawScanLines(
    ctx: CanvasRenderingContext2D,
    c: { r: number; g: number; b: number },
  ): void {
    ctx.save();
    this.traceFigure(ctx);
    ctx.clip();
    const spacing = 3;
    for (let y = -22 + (this.scanOffset % spacing); y <= 17; y += spacing) {
      const t = (y + 22) / 39;
      const alpha = 0.06 + 0.1 * Math.sin(t * Math.PI);
      ctx.beginPath();
      ctx.moveTo(-13, y);
      ctx.lineTo(13, y);
      ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${alpha})`;
      ctx.lineWidth = 0.4;
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawRimGlow(ctx: CanvasRenderingContext2D, c: { r: number; g: number; b: number }): void {
    ctx.save();
    ctx.shadowBlur = 10;
    ctx.shadowColor = `rgba(${c.r},${c.g},${c.b},0.4)`;
    this.traceFigure(ctx);
    ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},0.55)`;
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.restore();
  }

  private drawVisor(ctx: CanvasRenderingContext2D): void {
    ctx.beginPath();
    ctx.ellipse(0, -14, 4, 3, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(10, 10, 12, 0.7)";
    ctx.fill();
    ctx.strokeStyle = "rgba(180, 200, 210, 0.35)";
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  private drawActiveIndicator(
    ctx: CanvasRenderingContext2D,
    c: { r: number; g: number; b: number },
  ): void {
    // small pulsing dot above helmet when voice is speaking
    ctx.beginPath();
    ctx.arc(0, -24, 2, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},0.8)`;
    ctx.fill();
  }

  private drawVoiceText(ctx: CanvasRenderingContext2D, text: string): void {
    const maxWidth = 180;
    const lineHeight = 14;
    const words = text.split(" ");
    const lines: string[] = [];
    let current = "";

    ctx.font = "11px monospace";
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

    const c = VOICE_COLORS[this.voice.color];
    const totalHeight = lines.length * lineHeight;
    const startY = this.y - 38 - totalHeight;

    ctx.save();
    ctx.globalAlpha = this.appearProgress * 0.75;
    ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},0.85)`;
    ctx.textAlign = "center";
    lines.forEach((line, i) => {
      ctx.fillText(line, this.x, startY + i * lineHeight);
    });
    ctx.restore();
  }

  private traceFigure(ctx: CanvasRenderingContext2D): void {
    ctx.beginPath();
    ctx.arc(0, -14, 7, 0, Math.PI * 2);
    ctx.closePath();
    ctx.moveTo(-6 + 3, -7);
    ctx.roundRect(-6, -7, 12, 14, 3);
    ctx.moveTo(-11 + 2, -6);
    ctx.roundRect(-11, -6, 5, 9, 2);
    ctx.moveTo(6 + 2, -6);
    ctx.roundRect(6, -6, 5, 9, 2);
    ctx.moveTo(-5 + 2, 7);
    ctx.roundRect(-5, 7, 4, 8, 2);
    ctx.moveTo(1 + 2, 7);
    ctx.roundRect(1, 7, 4, 8, 2);
  }
}

// ── VoiceLayer ────────────────────────────────────────────────────────────────
// Manages the three Voice presences. Instantiated once, updated from bridge.

const VOICE_ELEVATED_STATES: ThresholdState[] = [
  "voices_appearing",
  "voice_1_active",
  "voice_2_active",
  "voice_3_active",
  "elevated",
];

export class VoiceLayer {
  private presences: Map<string, VoicePresence> = new Map();
  private canvasWidth: number;
  private canvasHeight: number;

  constructor(canvasWidth: number, canvasHeight: number) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
  }

  resize(canvasWidth: number, canvasHeight: number): void {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    for (const presence of this.presences.values()) {
      presence.resize(canvasWidth, canvasHeight);
    }
  }

  update(voices: BridgeVoice[], thresholdState: ThresholdState): void {
    const visible = VOICE_ELEVATED_STATES.includes(thresholdState);

    for (const voice of voices) {
      if (!this.presences.has(voice.id)) {
        this.presences.set(voice.id, new VoicePresence(voice, this.canvasWidth, this.canvasHeight));
      }
      const p = this.presences.get(voice.id)!;
      p.update({ ...voice, active: visible && voice.active });
    }

    // clear presences not in the current voices list
    const ids = new Set(voices.map((v) => v.id));
    for (const key of this.presences.keys()) {
      if (!ids.has(key as BridgeVoice["id"])) this.presences.delete(key);
    }
  }

  draw(ctx: CanvasRenderingContext2D, dt: number): void {
    for (const presence of this.presences.values()) {
      presence.draw(ctx, dt);
    }
  }
}
