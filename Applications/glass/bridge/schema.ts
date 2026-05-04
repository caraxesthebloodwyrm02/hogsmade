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

export const THRESHOLD_STATES: readonly ThresholdState[] = [
  "ground",
  "evaluating",
  "floor_rising",
  "voices_appearing",
  "voice_1_active",
  "voice_2_active",
  "voice_3_active",
  "elevated",
  "returning",
  "denied",
];

export function isThresholdState(value: unknown): value is ThresholdState {
  return typeof value === "string" && THRESHOLD_STATES.includes(value as ThresholdState);
}

// ─── Asset / Collectible types ──────────────────────────────────────────────

/**
 * Category progression (linear maturation path):
 *   fragment (raw) → token (exchange) → artifact (constructed) → relic (precedent)
 *
 * Off-path categories:
 *   echo        retained insight from past sessions; ties to echoes audit trails
 *   seed        foundational idea, template, or config; ties to seeds-server
 *   catalyst    consumable; spent by agent to trigger a state change
 *   blueprint   architectural pattern or schema — distinct from code artifact
 *   collectible earned through ceremony milestones (threshold crossings, voice completions)
 */
export type AssetCategory =
  | "fragment"
  | "token"
  | "artifact"
  | "relic"
  | "echo"
  | "seed"
  | "catalyst"
  | "blueprint"
  | "collectible";

export const ASSET_CATEGORIES: readonly AssetCategory[] = [
  "fragment",
  "token",
  "artifact",
  "relic",
  "echo",
  "seed",
  "catalyst",
  "blueprint",
  "collectible",
];

/** Rarity tiers. */
export type AssetRarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic";

export const ASSET_RARITIES: readonly AssetRarity[] = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "mythic",
];

export function isAssetCategory(value: unknown): value is AssetCategory {
  return typeof value === "string" && ASSET_CATEGORIES.includes(value as AssetCategory);
}

export function isAssetRarity(value: unknown): value is AssetRarity {
  return typeof value === "string" && ASSET_RARITIES.includes(value as AssetRarity);
}

/** Numeric order for ceiling comparison in isRarityPermitted. */
export const RARITY_ORDER: Record<AssetRarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
  mythic: 5,
};

export type RarityGateMap = Record<ThresholdState, AssetRarity>;

/**
 * Returns true if the requested rarity is permitted at the given ceremony state
 * using a caller-provided gate map.
 */
export function isRarityPermitted(
  rarity: AssetRarity,
  state: ThresholdState,
  gate: RarityGateMap,
): boolean {
  return RARITY_ORDER[rarity] <= RARITY_ORDER[gate[state]];
}

export interface FieldEnvelope {
  sustain: number;
  lfoRate: number;
  lfoDepth: number;
}

export interface FieldDiskBusSpec {
  scale: number;
  brightness: number;
  rimAlpha: number;
}

export interface FieldOvalBusSpec {
  opacity: number;
  lineWidth: number;
  markerAlpha: number;
  fieldAlpha: number;
}

export interface FieldVoiceBusSpec {
  alpha: number;
  scanSpeed: number;
  glowRadius: number;
}

export interface FieldAmbientBusSpec {
  ambientIntensity: number;
}

export interface FieldBlockBusSpec {
  levitationMod: number;
}

export interface FieldModulationSpec {
  envelopes: Record<ThresholdState, FieldEnvelope>;
  base: {
    disk: FieldDiskBusSpec;
    oval: FieldOvalBusSpec;
    voice: FieldVoiceBusSpec;
    field: FieldAmbientBusSpec;
    block: FieldBlockBusSpec;
  };
  recipe: {
    disk: FieldDiskBusSpec;
    oval: FieldOvalBusSpec;
    voice: FieldVoiceBusSpec;
    field: FieldAmbientBusSpec;
    block: FieldBlockBusSpec;
  };
}

export interface CeremonyProfile {
  rarityGate: RarityGateMap;
}

export interface WorkflowFunctionProfile {
  id: string;
  label: string;
  intent: string;
  inputs: string[];
  outputs: string[];
}

export interface WorkflowLaneProfile {
  id: string;
  label: string;
  intent: string;
  inputs: string[];
  outputs: string[];
  discoveryRoom: string[];
}

export interface WorkflowProfile {
  goalStatement: string;
  hardConstraints: string[];
  functions: WorkflowFunctionProfile[];
  lanes: WorkflowLaneProfile[];
}

export interface FieldEngineSpec {
  physics: {
    pulseRadiusBase: number;
    pulseIntensityMod: number;
    transitionSpeedUp: number;
    transitionSpeedDown: number;
  };
  visuals: {
    ovalAlphaMod: number;
    slotIntensityMod: number;
    presenceAlphaBase: number;
  };
}

export interface FieldProfile {
  profileName: string;
  version: string;
  modulation: FieldModulationSpec;
  ceremony: CeremonyProfile;
  workflow: WorkflowProfile;
  engine: FieldEngineSpec;
}

export interface AssetMeta {
  category: AssetCategory;
  rarity: AssetRarity;
  label: string; // short name rendered in field
  glyph?: string; // single unicode char for canvas glyph render
  acquired_at: string; // ISO timestamp of mint
  source_ceremony: ThresholdState; // ceremony state at mint
  source_session: string; // session_id that minted this asset
  consumed?: boolean; // catalyst only: true once spent
  ledger_id?: string; // future: cross-ref to ~/.caraxes/glass-inventory.json
}

export type SemanticSearchSource = "block" | "asset";

export interface SemanticSearchResult {
  id: string;
  source: SemanticSearchSource;
  title: string;
  snippet: string;
  score: number;
  matchedTerms: string[];
  blockType?: BlockType;
  language?: string;
  position?: BlockPosition;
  asset?: AssetMeta;
}

// ────────────────────────────────────────────────────────────────────────────

export type BlockType = "code" | "note" | "output" | "asset";
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
  asset?: AssetMeta; // present only when type === "asset"
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

export interface BridgeHotThreshold {
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
  _hot_threshold?: BridgeHotThreshold;
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
  _hot_threshold: {
    git_diff_lines: 200,
    iteration_count: 15,
    session_age_minutes: 60,
  },
};
