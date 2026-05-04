import type { ThresholdState } from "../../../bridge/schema";

export type SequencerState = "idle" | "voice_1" | "voice_2" | "voice_3" | "complete";

const VOICE_ORDER: SequencerState[] = ["voice_1", "voice_2", "voice_3", "complete"];

const STATE_MAP: Record<SequencerState, ThresholdState> = {
  idle: "ground",
  voice_1: "voice_1_active",
  voice_2: "voice_2_active",
  voice_3: "voice_3_active",
  complete: "elevated",
};

export class VoiceSequencer {
  private _state: SequencerState = "idle";
  private _step = -1;

  get state(): SequencerState {
    return this._state;
  }

  get activeVoiceIndex(): number {
    if (this._step >= 0 && this._step < 3) return this._step;
    return -1;
  }

  begin(): void {
    this._step = 0;
    this._state = VOICE_ORDER[0];
  }

  advance(): void {
    if (this._state === "idle" || this._state === "complete") return;
    this._step++;
    this._state = this._step < VOICE_ORDER.length ? VOICE_ORDER[this._step] : "complete";
  }

  reset(): void {
    this._state = "idle";
    this._step = -1;
  }

  static thresholdStateForVoice(state: SequencerState): ThresholdState {
    return STATE_MAP[state];
  }
}
