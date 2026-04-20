/**
 * Atlas Character Module — Query Clusters & Discussion Topics
 *
 * Defines probable query patterns grouped by character module axis.
 * Used by the character state tools to route relevance and surface
 * discussion topics that keep runtime telemetry fresh.
 *
 * Each cluster has:
 *   - axis: which character module dimension it belongs to
 *   - queries: probable query patterns (what gets asked)
 *   - topics: discussion seeds (what to explore next)
 *   - telemetryKeys: which metrics to watch for drift
 */

export interface QueryCluster {
  axis: string;
  queries: string[];
  topics: string[];
  telemetryKeys: string[];
}

export const CHARACTER_QUERY_CLUSTERS: QueryCluster[] = [
  // ── Mood Surface ──
  {
    axis: "mood",
    queries: [
      "What mood is active right now?",
      "How has mood shifted this session?",
      "Show mood transition history",
      "Which moods correlate with higher gate confidence?",
      "When does mood drift toward restricted rule-packs?",
    ],
    topics: [
      "Mood stability vs adaptability tradeoff — does high adaptability cause mood thrashing?",
      "Mood-to-rulePack mapping coverage: are CALM and FOCUSED always falling to 'base'?",
      "Session-length mood decay: does mood drift toward CALM in long sessions?",
      "Cross-reference mood with entity complexity: do CREATIVE sessions produce more entities?",
    ],
    telemetryKeys: ["mood", "moodTransitionCount", "moodStabilityScore"],
  },

  // ── Governance Gate ──
  {
    axis: "governance",
    queries: [
      "What was the last gate verdict?",
      "How many operations were denied this session?",
      "Show gate confidence trend",
      "Which scopes trigger the most denials?",
      "Is provenance chain growing monotonically?",
    ],
    topics: [
      "Gate confidence floor: is 0.5 the right threshold or should it adapt to mood?",
      "Provenance chain integrity: are there gaps in the monotonic growth?",
      "Consent-gate vs value-gate denial ratio: which boundary is doing more work?",
      "Pass-through mode frequency: how often is accounting=None in practice?",
    ],
    telemetryKeys: [
      "gateConfidence",
      "gateAllowedRate",
      "gateDeniedCount",
      "provenanceChainLength",
    ],
  },

  // ── Personality Traits ──
  {
    axis: "personality",
    queries: [
      "What are the current trait levels?",
      "Which traits have drifted most from defaults?",
      "Show dominant trait history",
      "How do traits correlate with user interaction patterns?",
      "Is enthusiasm decaying over time?",
    ],
    topics: [
      "Trait ceiling effect: adaptability at 0.9 leaves little room for growth signals",
      "Humor trait as a governance signal: low humor + restricted pack = safe but sterile?",
      "Trait-to-mood coupling: do trait shifts precede or follow mood changes?",
      "Formality drift: does formality_level converge across sessions or stay volatile?",
    ],
    telemetryKeys: ["traitEntropy", "dominantTraitName", "traitDriftFromDefault", "formalityLevel"],
  },

  // ── Graph Compiler ──
  {
    axis: "graph",
    queries: [
      "How many entities were compiled this session?",
      "What entity types dominate: domain, concept, or relation_node?",
      "Are there dual-key validation errors?",
      "What complexity scores are being assigned?",
      "Is the Glimpse bridge active or degraded?",
    ],
    topics: [
      "Entity density per input: are short inputs producing too many sparse entities?",
      "Relation node coverage: do most concept pairs have linking relation_nodes?",
      "Complexity score calibration: is 'medium' correctly mapping to 0.5?",
      "Dual-key drift: any cases where camelCase and snake_case diverge?",
    ],
    telemetryKeys: [
      "entityCount",
      "entityTypeDomain",
      "entityTypeConcept",
      "entityTypeRelation",
      "validationErrorCount",
    ],
  },

  // ── Cluster Notes ──
  {
    axis: "cluster",
    queries: [
      "Are there any active cluster notes?",
      "What phenomenon types are being observed?",
      "Which retrieval keys appear most frequently?",
      "What is the spike value distribution?",
      "Show cluster notes with high spike relevancy",
    ],
    topics: [
      "Spike threshold calibration: what value separates signal from noise?",
      "Retrieval key convergence: are the same keys showing up across sessions?",
      "Event vs density phenomena: which produces more actionable observations?",
      "ClusterNote-to-entity linkage: are cluster_entity_ids tracking graph compiler output?",
    ],
    telemetryKeys: [
      "clusterNoteCount",
      "avgSpikeValue",
      "phenomenonTypeEvent",
      "phenomenonTypeDensity",
      "phenomenonTypeSparsity",
    ],
  },

  // ── Cross-Axis: Character Coherence ──
  {
    axis: "coherence",
    queries: [
      "Is the character module internally consistent?",
      "Do mood, traits, and rule-pack align?",
      "Are governance verdicts consistent with personality state?",
      "Is telemetry coverage complete across all axes?",
    ],
    topics: [
      "Mood-rulePack alignment: CREATIVE mood + restricted pack = governance override — is this logged?",
      "Trait-gate coupling: high empathy + low gate confidence = potential consent friction",
      "Session coherence score: combine mood stability, gate confidence, trait entropy into one number",
      "Telemetry completeness: which axes have gaps in the snapshot timeline?",
    ],
    telemetryKeys: [
      "coherenceScore",
      "axisCoverage",
      "moodRulePackAlignment",
      "sessionIntegrityFlag",
    ],
  },
];

/**
 * Find clusters relevant to a query string.
 * Matches against cluster queries and topics using simple keyword overlap.
 */
export function findRelevantClusters(query: string, minScore?: number): QueryCluster[] {
  const threshold = minScore ?? 1;
  const words = query.toLowerCase().split(/\s+/);

  return CHARACTER_QUERY_CLUSTERS.filter((cluster) => {
    const allText = [...cluster.queries, ...cluster.topics].join(" ").toLowerCase();
    const hits = words.filter((w) => w.length > 3 && allText.includes(w)).length;
    return hits >= threshold;
  });
}
