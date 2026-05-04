import type { ThresholdState } from "../../../bridge/schema";

// ── Signal chain ──────────────────────────────────────────────────────────────
// threshold_state + progress + time
//   → ADSR envelope value
//   → LFO overlay
//   → mod signal (0..1)
//   → bus routing
//   → per-component parameter recipe

// Envelope: shapes how a state breathes over time.
// Attack/decay/release in ms describe the curve shape; sustain is the held level.
// lfoRate (Hz) and lfoDepth drive the ongoing cycle after sustain is reached.
interface Envelope {
  sustain: number; // 0..1 — held intensity in the sustained portion
  lfoRate: number; // Hz — cycle rate while in sustain
  lfoDepth: number; // 0..1 — oscillation amplitude around sustain
}

const ENVELOPES: Record<ThresholdState, Envelope> = {
  ground: { sustain: 0.12, lfoRate: 0.04, lfoDepth: 0.025 },
  evaluating: { sustain: 0.5, lfoRate: 0.18, lfoDepth: 0.07 },
  floor_rising: { sustain: 1.0, lfoRate: 0.22, lfoDepth: 0.04 },
  voices_appearing: { sustain: 0.85, lfoRate: 0.12, lfoDepth: 0.05 },
  voice_1_active: { sustain: 0.88, lfoRate: 0.1, lfoDepth: 0.06 },
  voice_2_active: { sustain: 0.88, lfoRate: 0.13, lfoDepth: 0.06 },
  voice_3_active: { sustain: 0.88, lfoRate: 0.09, lfoDepth: 0.06 },
  elevated: { sustain: 1.0, lfoRate: 0.07, lfoDepth: 0.03 },
  returning: { sustain: 0.25, lfoRate: 0.06, lfoDepth: 0.03 },
  denied: { sustain: 0.08, lfoRate: 0.35, lfoDepth: 0.1 },
};

// Bus output types — one per rendering component
export interface DiskBus {
  scale: number;
  brightness: number;
  rimAlpha: number;
}
export interface OvalBus {
  opacity: number;
  lineWidth: number;
  markerAlpha: number;
  fieldAlpha: number;
}
export interface VoiceBus {
  alpha: number;
  scanSpeed: number;
  glowRadius: number;
}
export interface FieldBus {
  ambientIntensity: number;
}

export interface BusValues {
  disk: DiskBus;
  oval: OvalBus;
  voice: VoiceBus;
  field: FieldBus;
}

// Base values — floor of each parameter before modulation is applied
const BASE = {
  disk: { scale: 0.06, brightness: 0.04, rimAlpha: 0.05 },
  oval: { opacity: 0.03, lineWidth: 0.3, markerAlpha: 0.04, fieldAlpha: 0.02 },
  voice: { alpha: 0.0, scanSpeed: 0.4, glowRadius: 8 },
  field: { ambientIntensity: 0.28 },
};

// Recipe — how the mod signal allocates to each bus parameter.
// These are max-swing values added on top of BASE when mod = 1.0.
const RECIPE = {
  disk: { scale: 0.94, brightness: 0.96, rimAlpha: 0.95 },
  oval: { opacity: 0.72, lineWidth: 2.1, markerAlpha: 0.82, fieldAlpha: 0.55 },
  voice: { alpha: 0.9, scanSpeed: 1.8, glowRadius: 18 },
  field: { ambientIntensity: 0.44 },
};

// ── ModulationEngine ──────────────────────────────────────────────────────────

export class ModulationEngine {
  private elapsed = 0;
  private mod = 0; // current smooth mod value
  private prevState: ThresholdState = "ground";
  private stateAge = 0; // ms spent in current state

  tick(dt: number, thresholdState: ThresholdState, progress: number): BusValues {
    this.elapsed += dt;

    if (thresholdState !== this.prevState) {
      this.prevState = thresholdState;
      this.stateAge = 0;
    }
    this.stateAge += dt;

    const env = ENVELOPES[thresholdState];
    const target = this.envelopeValue(env, progress);
    const lfo = Math.sin(2 * Math.PI * env.lfoRate * (this.elapsed / 1000)) * env.lfoDepth;
    const raw = Math.max(0, Math.min(1, target + lfo));

    // smooth pursuit — mod chases raw with inertia
    const smoothing = thresholdState === "denied" ? 0.008 : 0.004;
    this.mod += (raw - this.mod) * smoothing * dt;

    return this.route(this.mod);
  }

  private envelopeValue(env: Envelope, progress: number): number {
    // progress 0→1 = attack → decay → sustain arc
    if (progress < 0.25) return progress / 0.25; // attack: 0→1
    if (progress < 0.45) return 1 - ((progress - 0.25) / 0.2) * (1 - env.sustain); // decay: 1→sustain
    return env.sustain; // sustain
  }

  private route(mod: number): BusValues {
    return {
      disk: {
        scale: BASE.disk.scale + mod * RECIPE.disk.scale,
        brightness: BASE.disk.brightness + mod * RECIPE.disk.brightness,
        rimAlpha: BASE.disk.rimAlpha + mod * RECIPE.disk.rimAlpha,
      },
      oval: {
        opacity: BASE.oval.opacity + mod * RECIPE.oval.opacity,
        lineWidth: BASE.oval.lineWidth + mod * RECIPE.oval.lineWidth,
        markerAlpha: BASE.oval.markerAlpha + mod * RECIPE.oval.markerAlpha,
        fieldAlpha: BASE.oval.fieldAlpha + mod * RECIPE.oval.fieldAlpha,
      },
      voice: {
        alpha: BASE.voice.alpha + mod * RECIPE.voice.alpha,
        scanSpeed: BASE.voice.scanSpeed + mod * RECIPE.voice.scanSpeed,
        glowRadius: BASE.voice.glowRadius + mod * RECIPE.voice.glowRadius,
      },
      field: {
        ambientIntensity: BASE.field.ambientIntensity + mod * RECIPE.field.ambientIntensity,
      },
    };
  }
}
