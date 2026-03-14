/**
 * Cross-Reference Engine
 *
 * Validates entity and relation claims against each other.
 * Boosts confidence where independent sources agree,
 * downgrades where evidence conflicts with entity properties.
 */

import { createEvidence } from "./relations.js";
import { computeDimensionSimilarity } from "./similarity.js";

/**
 * Cross-reference entities: check if multiple independent evidences
 * agree or conflict on classifications.
 *
 * @param {Array} entities
 * @param {Array} relations
 * @param {Array} evidences
 * @returns {Array<Evidence>} New evidences from cross-referencing
 */
export function crossReferenceEntities(entities, relations, evidences) {
  const newEvidences = [];

  // Group evidences by target entity
  const byEntity = new Map();
  for (const ev of evidences) {
    if (ev.scope === "entity" && ev.targetId) {
      if (!byEntity.has(ev.targetId)) byEntity.set(ev.targetId, []);
      byEntity.get(ev.targetId).push(ev);
    }
  }

  for (const [entityId, entityEvidences] of byEntity) {
    // Check for multiple independent rules agreeing
    const uniqueRules = new Set(entityEvidences.map((e) => e.sourceRuleId));
    if (uniqueRules.size >= 3) {
      const avgConfidence =
        entityEvidences.reduce((s, e) => s + e.confidence, 0) /
        entityEvidences.length;
      const entity = entities.find((e) => e.id === entityId);
      newEvidences.push(
        createEvidence({
          sourceRuleId: "cross-ref-multi-agreement",
          confidence: Math.min(0.9, avgConfidence + 0.1),
          scope: "entity",
          targetId: entityId,
          affects: ["context_lens"],
          reason: `${entity?.name || entityId} is supported by ${uniqueRules.size} independent rules.`,
          payload: { ruleCount: uniqueRules.size, entityId },
          basis: "cross-reference",
        })
      );
    }
  }

  return newEvidences;
}

/**
 * Cross-reference relations: validate relation claims against
 * entity properties.
 *
 * @param {Array} entities
 * @param {Array} relations
 * @param {Array} evidences
 * @returns {Array<Evidence>} New evidences from cross-referencing
 */
export function crossReferenceRelations(entities, relations, evidences) {
  const newEvidences = [];
  const entityMap = new Map(entities.map((e) => [e.id, e]));

  for (const rel of relations) {
    const source = entityMap.get(rel.source);
    const target = entityMap.get(rel.target);
    if (!source || !target) continue;

    // Validate shared-space: check actual similarity
    if (rel.type === "shared-space" && source.dimensions.space && target.dimensions.space) {
      const sim = computeDimensionSimilarity(
        source.dimensions.space,
        target.dimensions.space,
        "space"
      );
      if (sim.score < 0.4) {
        // Weak space claim — downgrade
        newEvidences.push(
          createEvidence({
            sourceRuleId: "cross-ref-space-validation",
            confidence: 0.35,
            scope: "relation",
            targetId: rel.id,
            affects: ["relation", "diagnostics"],
            reason: `Shared-space claim between ${source.name} and ${target.name} is weak (${Math.round(sim.score * 100)}% similarity).`,
            payload: { relationType: rel.type, similarity: sim.score },
            basis: "cross-reference-validation",
          })
        );
      }
    }

    // Validate influence: temporal ordering
    if (rel.type === "influenced") {
      const sourceTime = Number(source.dimensions?.time);
      const targetTime = Number(target.dimensions?.time);
      if (
        Number.isFinite(sourceTime) &&
        Number.isFinite(targetTime) &&
        sourceTime > targetTime
      ) {
        // Source is AFTER target — suspicious influence direction
        newEvidences.push(
          createEvidence({
            sourceRuleId: "cross-ref-temporal-inconsistency",
            confidence: 0.4,
            scope: "relation",
            targetId: rel.id,
            affects: ["relation", "diagnostics"],
            reason: `Influence direction questionable: ${source.name} (${sourceTime}) comes after ${target.name} (${targetTime}).`,
            payload: {
              source: rel.source,
              target: rel.target,
              sourceTime,
              targetTime,
            },
            basis: "cross-reference-validation",
          })
        );
      } else if (
        Number.isFinite(sourceTime) &&
        Number.isFinite(targetTime) &&
        sourceTime <= targetTime
      ) {
        // Temporally consistent — boost
        newEvidences.push(
          createEvidence({
            sourceRuleId: "cross-ref-temporal-confirmation",
            confidence: 0.78,
            scope: "relation",
            targetId: rel.id,
            affects: ["relation"],
            reason: `Influence confirmed: ${source.name} (${sourceTime}) precedes ${target.name} (${targetTime}).`,
            payload: { source: rel.source, target: rel.target },
            basis: "cross-reference-confirmation",
          })
        );
      }
    }
  }

  return newEvidences;
}
