/**
 * Relations and evidence management for the Glimpse engine.
 * Builds base relations between entities and manages evidence records.
 */

import {
  bucketYear,
  findBestEntityMatch,
  flattenRecord,
  normalizeName,
} from "../utils/utils.js";
import { scoreTaxonomy } from "./profiling.js";
import { computeDimensionSimilarity } from "./similarity.js";

export function createEvidence(base) {
  return {
    id: base.id || `ev-${Math.random().toString(36).slice(2, 10)}`,
    sourceRuleId: base.sourceRuleId || "system",
    confidence: base.confidence ?? 0.6,
    scope: base.scope || "dataset",
    targetId: base.targetId || null,
    reason: base.reason || "",
    affects: base.affects || [],
    payload: base.payload || {},
    basis: base.basis || null,
  };
}

export function buildBaseRelations(entities) {
  const relations = [];
  const evidences = [];
  // Use normalized names as keys for better matching
  const byName = new Map(
    entities.map((entity) => [normalizeName(entity.name), entity]),
  );

  const influenceColumns = [
    "influenced_by",
    "inspired_by",
    "based_on",
    "derived",
    "source",
  ];
  entities.forEach((entity) => {
    const record = entity.properties || {};
    let explicitInfluence = "";
    influenceColumns.some((column) => {
      if (record[column]) {
        explicitInfluence = String(record[column]);
        return true;
      }
      return false;
    });
    if (explicitInfluence) {
      // Use fuzzy matching to find the best entity match
      const target = findBestEntityMatch(explicitInfluence, entities, byName);
      if (target) {
        const evidence = createEvidence({
          id: `ev-rel-influence-${entity.id}-${target.id}`,
          sourceRuleId: "system-explicit-influence",
          scope: "relation",
          targetId: `${target.id}:${entity.id}`,
          confidence: 0.92,
          affects: ["relation", "view"],
          reason: `${target.name} explicitly appears as a source for ${entity.name}.`,
          payload: {
            relationType: "influenced",
            source: target.id,
            target: entity.id,
          },
        });
        evidences.push(evidence);
        relations.push({
          id: `rel-${target.id}-${entity.id}-influenced`,
          source: target.id,
          target: entity.id,
          type: "influenced",
          weight: 0.85,
          evidenceIds: [evidence.id],
        });
      }
    }
  });

  // Similarity threshold: configurable, default 0.6
  const simThreshold = 0.6;

  for (let index = 0; index < entities.length; index += 1) {
    for (let next = index + 1; next < entities.length; next += 1) {
      const a = entities[index];
      const b = entities[next];

      // Space similarity (fuzzy)
      if (a.dimensions.space && b.dimensions.space) {
        const sim = computeDimensionSimilarity(
          a.dimensions.space, b.dimensions.space, "space"
        );
        if (sim.matched || sim.score >= simThreshold) {
          const scaledConfidence = 0.42 + 0.2 * sim.score; // 0.42..0.62
          const evidence = createEvidence({
            id: `ev-rel-space-${a.id}-${b.id}`,
            sourceRuleId: "system-shared-space",
            scope: "relation",
            targetId: `${a.id}:${b.id}`,
            confidence: Math.round(scaledConfidence * 100) / 100,
            affects: ["relation", "cluster"],
            reason: `${a.name} and ${b.name} share place proximity: ${a.dimensions.space} ~ ${b.dimensions.space} (${sim.method}, ${Math.round(sim.score * 100)}%).`,
            payload: { relationType: "shared-space", source: a.id, target: b.id },
            basis: sim.method,
          });
          evidences.push(evidence);
          relations.push({
            id: `rel-${a.id}-${b.id}-space`,
            source: a.id,
            target: b.id,
            type: "shared-space",
            weight: 0.3 * sim.score,
            similarity: sim.score,
            evidenceIds: [evidence.id],
          });
        }
      }

      // Temporal similarity (continuous distance, replaces decade-only buckets)
      if (a.dimensions.time != null && b.dimensions.time != null) {
        const sim = computeDimensionSimilarity(
          a.dimensions.time, b.dimensions.time, "time"
        );
        // Also keep backward compat: decade bucket match always qualifies
        const bucketA = bucketYear(a.dimensions.time);
        const bucketB = bucketYear(b.dimensions.time);
        const bucketMatch = bucketA && bucketB && bucketA === bucketB;

        if (sim.score >= simThreshold || bucketMatch) {
          const effectiveScore = Math.max(sim.score, bucketMatch ? 0.6 : 0);
          const scaledConfidence = 0.38 + 0.2 * effectiveScore; // 0.38..0.58
          const evidence = createEvidence({
            id: `ev-rel-time-${a.id}-${b.id}`,
            sourceRuleId: "system-shared-era",
            scope: "relation",
            targetId: `${a.id}:${b.id}`,
            confidence: Math.round(scaledConfidence * 100) / 100,
            affects: ["relation", "cluster"],
            reason: `${a.name} and ${b.name} are temporally close: ${a.dimensions.time} ~ ${b.dimensions.time} (${Math.round(effectiveScore * 100)}% proximity).`,
            payload: { relationType: "shared-era", source: a.id, target: b.id, gap: sim.gap },
            basis: sim.method,
          });
          evidences.push(evidence);
          relations.push({
            id: `rel-${a.id}-${b.id}-time`,
            source: a.id,
            target: b.id,
            type: "shared-era",
            weight: 0.28 * effectiveScore,
            similarity: effectiveScore,
            evidenceIds: [evidence.id],
          });
        }
      }

      // Domain similarity (fuzzy)
      if (a.dimensions.domain && b.dimensions.domain) {
        const sim = computeDimensionSimilarity(
          a.dimensions.domain, b.dimensions.domain, "domain"
        );
        if (sim.matched || sim.score >= simThreshold) {
          const scaledConfidence = 0.47 + 0.2 * sim.score; // 0.47..0.67
          const evidence = createEvidence({
            id: `ev-rel-domain-${a.id}-${b.id}`,
            sourceRuleId: "system-shared-domain",
            scope: "relation",
            targetId: `${a.id}:${b.id}`,
            confidence: Math.round(scaledConfidence * 100) / 100,
            affects: ["relation", "cluster"],
            reason: `${a.name} and ${b.name} share domain proximity: ${a.dimensions.domain} ~ ${b.dimensions.domain} (${sim.method}, ${Math.round(sim.score * 100)}%).`,
            payload: {
              relationType: "shared-domain",
              source: a.id,
              target: b.id,
            },
            basis: sim.method,
          });
          evidences.push(evidence);
          relations.push({
            id: `rel-${a.id}-${b.id}-domain`,
            source: a.id,
            target: b.id,
            type: "shared-domain",
            weight: 0.4 * sim.score,
            similarity: sim.score,
            evidenceIds: [evidence.id],
          });
        }
      }
    }
  }

  return { relations, evidences };
}

export function computeDatasetDomainHits(records, config) {
  const text = records.map(flattenRecord).join(" ");
  return scoreTaxonomy(text, config);
}

export function buildDatasetScope(
  records,
  profile,
  entities,
  relations,
  config,
) {
  const domainHits = computeDatasetDomainHits(records, config);
  return {
    dataset: {
      record_count: records.length,
      relation_density:
        entities.length > 1
          ? relations.length / (entities.length * entities.length)
          : 0,
      domain_keyword_hits: domainHits,
      flags: {
        has_time_dimension: profile.flags.has_time_dimension,
        has_space_dimension: profile.flags.has_space_dimension,
        has_metric_dimension: profile.flags.has_metric_dimension,
        has_text_fields: profile.flags.has_text_fields,
        has_geo_coordinates: profile.flags.has_geo_coordinates,
        has_role_or_mood: profile.flags.has_role_or_mood,
        has_influence_links: relations.some(
          (relation) => relation.type === "influenced",
        ),
      },
      dimension_counts: {
        time: (profile.dimensionMap.time || []).length,
        space: (profile.dimensionMap.space || []).length,
        domain: (profile.dimensionMap.domain || []).length,
        catalyst: (profile.dimensionMap.catalyst || []).length,
      },
    },
    profile,
    config,
    semantic_packs: config.semantic_packs || {},
  };
}

export function createEvidenceIndex(evidences) {
  return evidences.reduce((acc, evidence) => {
    acc[evidence.id] = evidence;
    return acc;
  }, {});
}
