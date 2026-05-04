import type { FieldModulationSpec, ThresholdState } from "../../../bridge/schema";

interface Envelope {
  sustain: number;
  lfoRate: number;
  lfoDepth: number;
}

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
export interface BlockBus {
  levitationMod: number;
}

export interface BusValues {
  disk: DiskBus;
  oval: OvalBus;
  voice: VoiceBus;
  field: FieldBus;
  block: BlockBus;
}

export class ModulationEngine {
  private base: FieldModulationSpec["base"];
  private recipe: FieldModulationSpec["recipe"];
  private envelopes: Record<ThresholdState, Envelope>;
  private elapsed = 0;
  private mod = 0;
  private prevState: ThresholdState = "ground";
  private stateAge = 0;

  constructor(spec: FieldModulationSpec) {
    this.base = spec.base;
    this.recipe = spec.recipe;
    this.envelopes = spec.envelopes;
  }

  tick(dt: number, thresholdState: ThresholdState, progress: number, signalHeat = 0): BusValues {
    this.elapsed += dt;

    if (thresholdState !== this.prevState) {
      this.prevState = thresholdState;
      this.stateAge = 0;
    }
    this.stateAge += dt;

    const env = this.envelopes[thresholdState];
    const target = this.envelopeValue(env, progress);
    const effectiveLfoRate = env.lfoRate * (1 + signalHeat * 0.8);
    const lfo = Math.sin(2 * Math.PI * effectiveLfoRate * (this.elapsed / 1000)) * env.lfoDepth;
    const raw = Math.max(0, Math.min(1, target * (1 + signalHeat * 0.6) + lfo));

    const smoothing = thresholdState === "denied" ? 0.008 : 0.004;
    this.mod += (raw - this.mod) * smoothing * dt;

    return this.route(this.mod, thresholdState);
  }

  private envelopeValue(env: Envelope, progress: number): number {
    if (progress < 0.25) return progress / 0.25;
    if (progress < 0.45) return 1 - ((progress - 0.25) / 0.2) * (1 - env.sustain);
    return env.sustain;
  }

  private route(mod: number, state: ThresholdState): BusValues {
    return {
      disk: {
        scale: this.base.disk.scale + mod * this.recipe.disk.scale,
        brightness: this.base.disk.brightness + mod * this.recipe.disk.brightness,
        rimAlpha: this.base.disk.rimAlpha + mod * this.recipe.disk.rimAlpha,
      },
      oval: {
        opacity: this.base.oval.opacity + mod * this.recipe.oval.opacity,
        lineWidth: this.base.oval.lineWidth + mod * this.recipe.oval.lineWidth,
        markerAlpha: this.base.oval.markerAlpha + mod * this.recipe.oval.markerAlpha,
        fieldAlpha: this.base.oval.fieldAlpha + mod * this.recipe.oval.fieldAlpha,
      },
      voice: {
        alpha: this.base.voice.alpha + mod * this.recipe.voice.alpha,
        scanSpeed: this.base.voice.scanSpeed + mod * this.recipe.voice.scanSpeed,
        glowRadius: this.base.voice.glowRadius + mod * this.recipe.voice.glowRadius,
      },
      field: {
        ambientIntensity:
          this.base.field.ambientIntensity + mod * this.recipe.field.ambientIntensity,
      },
      block: {
        levitationMod:
          state === "ground"
            ? this.base.block.levitationMod + mod * this.recipe.block.levitationMod
            : 1.0,
      },
    };
  }
}
