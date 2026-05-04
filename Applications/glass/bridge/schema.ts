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

/**
 * Rarity tiers.
 * Ceiling at mint time is enforced by RARITY_GATE[threshold_state].
 */
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

/**
 * Maximum rarity an agent may mint at each ThresholdState.
 *
 *   ground / evaluating          → uncommon ceiling  (early work)
 *   floor_rising                 → rare ceiling       (build is real)
 *   voices_appearing / voice_*   → epic ceiling       (voices engaged)
 *   elevated                     → mythic ceiling     (Rift crossed)
 *   returning                    → rare ceiling       (descending)
 *   denied                       → common only        (punitive gate)
 */
export const RARITY_GATE: Record<ThresholdState, AssetRarity> = {
  ground: "uncommon",
  evaluating: "uncommon",
  floor_rising: "rare",
  voices_appearing: "epic",
  voice_1_active: "epic",
  voice_2_active: "epic",
  voice_3_active: "epic",
  elevated: "mythic",
  returning: "rare",
  denied: "common",
};

/**
 * Returns true if the requested rarity is permitted at the given ceremony state.
 * Called in main's bridge:add-block handler before accepting an asset block.
 */
export function isRarityPermitted(rarity: AssetRarity, state: ThresholdState): boolean {
  return RARITY_ORDER[rarity] <= RARITY_ORDER[RARITY_GATE[state]];
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
