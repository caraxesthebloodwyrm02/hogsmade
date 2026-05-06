/**
 * Memory Ledger — Three-Tier (Working, Episodic, Semantic) 3D Persistence Schema
 * This defines the boundaries for database storage, allowing agent workflows
 * to preserve state, track artifacts, and run continuous improvement loops.
 */

export type MemoryTier = "working" | "episodic" | "semantic";

export type AssetCategory =
  | "collectible"
  | "artifact"
  | "relic"
  | "token"
  | "fragment" // Raw/incomplete ideas
  | "echo" // Retained insight from prior sessions
  | "catalyst" // Consumable trigger for state changes
  | "blueprint" // Architectural patterns
  | "seed"; // Core templates or foundational configurations

export type AssetRarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic";

/**
 * Episodic Memory: Event-sourced ledger of recent interactions.
 * Stores 'what happened' in time. Bound by TTL or Max Items limit.
 */
export interface EpisodicEvent {
  eventId: string;
  sessionId: string;
  timestamp: string;
  /** The ID of the BehavioralTrigger that spawned this event */
  triggerId: string;
  contextSummary: string;
  /** Snapshot of the magnetic state when this event occurred */
  magnetismState: {
    dominantBias: string;
    pullForce: number;
    stability: string;
  };
}

/**
 * Semantic Memory: Long-term facts, facts, and persistent assets.
 * Assets outlive sessions and the bridge reset.
 */
export interface SemanticAsset {
  assetId: string;
  category: AssetCategory;
  /**
   * Rarity is gated by the threshold_state of the ceremony at creation time.
   * e.g., 'legendary' can only be minted during an 'elevated' state.
   */
  rarity: AssetRarity;
  discoveredAt: string;
  originSessionId: string;
  /** Descriptive tag or markdown content of the asset */
  payload: unknown;
  /** Trust/Verification score. Starts at 1.0, degrades if conflicted */
  provenanceScore: number;
}

/**
 * Standard configuration for the ledger's persistence policies
 */
export const MEMORY_RETENTION_POLICIES = {
  episodic: {
    maxEntries: 1000,
    evictionStrategy: "lru_or_ttl",
    ttlHours: 72,
  },
  semantic: {
    maxEntries: 10000,
    evictionStrategy: "importance_aware_lru",
    ttlHours: null, // Indefinite, unless explicitly superseded
  },
};
