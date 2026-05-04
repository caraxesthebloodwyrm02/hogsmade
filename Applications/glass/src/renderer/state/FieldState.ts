import type { BridgeState, AgentState, ThresholdState, BridgeVoice } from "../../../bridge/schema";
import { DEFAULT_BRIDGE_STATE } from "../../../bridge/schema";

type Listener = (state: FieldState) => void;

export class FieldState {
  private _bridge: BridgeState = { ...DEFAULT_BRIDGE_STATE };
  private _listeners: Listener[] = [];

  get agentState(): AgentState {
    return this._bridge.agent_state;
  }
  get thresholdState(): ThresholdState {
    return this._bridge.threshold_state;
  }
  get progress(): number {
    return this._bridge.progress;
  }
  get voices(): BridgeVoice[] {
    return this._bridge.voices;
  }
  get blocks() {
    return this._bridge.blocks;
  }
  get conversation() {
    return this._bridge.conversation;
  }

  update(bridge: BridgeState): void {
    this._bridge = bridge;
    this._listeners.forEach((l) => l(this));
  }

  subscribe(listener: Listener): () => void {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== listener);
    };
  }
}
