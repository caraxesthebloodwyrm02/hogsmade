import type { ThresholdState } from "../../../bridge/schema";

export interface AudioParams {
  frequency: number;
  gain: number;
  filterFreq: number;
}

const STATE_FREQ: Record<ThresholdState, number> = {
  ground: 82,
  evaluating: 130,
  floor_rising: 165,
  voices_appearing: 196,
  voice_1_active: 196,
  voice_2_active: 220,
  voice_3_active: 247,
  elevated: 330,
  returning: 110,
  denied: 277,
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private gainNode: GainNode | null = null;
  private started = false;

  static frequencyForState(state: ThresholdState): number {
    return STATE_FREQ[state];
  }

  static deriveParams(ambientIntensity: number, state: ThresholdState): AudioParams {
    return {
      frequency: STATE_FREQ[state],
      gain: Math.min(1, ambientIntensity * 0.12),
      filterFreq: 200 + ambientIntensity * 800,
    };
  }

  start(): void {
    if (this.started) return;
    try {
      this.ctx = new AudioContext();
    } catch (err) {
      console.warn(
        `[glass] AudioContext creation failed — ambient audio disabled: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return;
    }

    this.osc = this.ctx.createOscillator();
    this.osc.type = "sine";
    this.osc.frequency.value = STATE_FREQ.ground;

    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 400;

    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = 0;

    this.osc.connect(this.filter);
    this.filter.connect(this.gainNode);
    this.gainNode.connect(this.ctx.destination);
    this.osc.start();
    this.started = true;
  }

  update(params: AudioParams): void {
    if (!this.started || !this.osc || !this.filter || !this.gainNode || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.osc.frequency.linearRampToValueAtTime(params.frequency, t + 0.3);
    this.gainNode.gain.linearRampToValueAtTime(params.gain, t + 0.1);
    this.filter.frequency.linearRampToValueAtTime(params.filterFreq, t + 0.2);
  }

  stop(): void {
    if (!this.started) return;
    this.osc?.stop();
    this.ctx?.close();
    this.started = false;
    this.osc = null;
    this.filter = null;
    this.gainNode = null;
    this.ctx = null;
  }
}
