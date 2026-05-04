export type AgentState = "idle" | "thinking" | "writing" | "reviewing" | "elevated";

export type ThresholdState =
  | "ground"
  | "evaluating"
  | "floor_rising"
  | "voices_appearing"
  | "voice_1_active"
  | "voice_2_active"
  | "voice_3_active"
  | "elevated"
  | "returning"
  | "denied";

export type BlockType = "code" | "note" | "output";
export type BlockOrigin = "user" | "agent";
export type MessageRole = "user" | "agent";

export type VoiceId = "I" | "II" | "III";
export type VoiceColor = "amber" | "silver" | "gold";
export type VoicePosition = "left" | "center" | "right";

export interface BlockPosition {
  x: number;
  y: number;
}

export interface BridgeBlock {
  id: string;
  type: BlockType;
  language: string;
  content: string;
  position: BlockPosition;
  origin: BlockOrigin;
}

export interface BridgeMessage {
  role: MessageRole;
  text: string;
  timestamp: string;
}

export interface BridgeSignals {
  git_diff_lines: number;
  iteration_count: number;
  session_age_minutes: number;
}

export interface BridgeVoice {
  id: VoiceId;
  color: VoiceColor;
  position: VoicePosition;
  text: string; // what the voice is saying — rendered in the field
  active: boolean; // whether this voice is currently speaking
}

export interface BridgeState {
  timestamp: string;
  session_id: string;
  agent_state: AgentState;
  blocks: BridgeBlock[];
  conversation: BridgeMessage[];
  threshold_state: ThresholdState;
  progress: number; // 0.0–1.0 — ceremony position within current state
  voices: BridgeVoice[]; // populated during voices_appearing → elevated
  signals: BridgeSignals;
}

export const DEFAULT_BRIDGE_STATE: BridgeState = {
  timestamp: new Date().toISOString(),
  session_id: "",
  agent_state: "idle",
  blocks: [],
  conversation: [],
  threshold_state: "ground",
  progress: 0,
  voices: [],
  signals: {
    git_diff_lines: 0,
    iteration_count: 0,
    session_age_minutes: 0,
  },
};
