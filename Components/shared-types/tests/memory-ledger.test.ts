import { describe, expect, it } from "vitest";
import {
  MEMORY_RETENTION_POLICIES,
  type AssetCategory,
  type AssetRarity,
  type EpisodicEvent,
  type SemanticAsset,
} from "../src/memory-ledger.js";

describe("memory-ledger contracts", () => {
  it("keeps episodic storage bounded and semantic storage durable", () => {
    expect(MEMORY_RETENTION_POLICIES.episodic).toEqual({
      maxEntries: 1000,
      evictionStrategy: "lru_or_ttl",
      ttlHours: 72,
    });
    expect(MEMORY_RETENTION_POLICIES.semantic.maxEntries).toBe(10000);
    expect(MEMORY_RETENTION_POLICIES.semantic.evictionStrategy).toBe("importance_aware_lru");
    expect(MEMORY_RETENTION_POLICIES.semantic.ttlHours).toBeNull();
  });

  it("covers semantic asset categories and rarity tiers used by Glass", () => {
    const categories: AssetCategory[] = [
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
    const rarities: AssetRarity[] = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];

    expect(categories).toContain("blueprint");
    expect(categories).toContain("catalyst");
    expect(rarities).toContain("mythic");
  });

  it("models episodic events with a magnetism snapshot", () => {
    const event: EpisodicEvent = {
      eventId: "evt-1",
      sessionId: "session-1",
      timestamp: "2026-01-01T00:00:00Z",
      triggerId: "tr_anomaly",
      contextSummary: "Safety probe pulled a high-weight anomaly.",
      magnetismState: {
        dominantBias: "safety",
        pullForce: 0.72,
        stability: "HIGH",
      },
    };

    expect(event.magnetismState.dominantBias).toBe("safety");
    expect(event.magnetismState.pullForce).toBeGreaterThan(0.7);
  });

  it("models semantic assets with provenance score", () => {
    const asset: SemanticAsset = {
      assetId: "asset-1",
      category: "relic",
      rarity: "mythic",
      discoveredAt: "2026-01-01T00:00:00Z",
      originSessionId: "session-1",
      payload: { invariant: "rarity is ceremony-gated" },
      provenanceScore: 0.96,
    };

    expect(asset.category).toBe("relic");
    expect(asset.rarity).toBe("mythic");
    expect(asset.provenanceScore).toBeCloseTo(0.96);
  });
});
