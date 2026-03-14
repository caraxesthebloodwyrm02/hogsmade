/**
 * Multi-Pass Inference Engine
 *
 * Wraps the single-pass applyRules() with iterative refinement:
 * Pass 1: Standard rule evaluation
 * Pass 2: Cross-reference — evidence from pass 1 informs additional analysis
 * Pass 3: Consolidation — merge duplicates, resolve contradictions
 *
 * Falls back to single-pass when config.inference?.multi_pass !== true.
 */

import { applyRules } from "../functions/rules.js";
import { createEvidence } from "../analysis/relations.js";
import {
  recordInference,
  recordGap,
  GAP_TYPES,
} from "./confidence.js";

/**
 * Run multi-pass inference over the dataset.
 *
 * @param {object} config - Master config
 * @param {object} datasetScope - Dataset scope from buildDatasetScope
 * @param {Array} entities - Entity array
 * @param {Array} relations - Relation array
 * @param {object} [options]
 * @param {number} [options.maxPasses=3]
 * @param {object} [options.confidenceFrame] - Optional confidence frame for gap tracking
 * @returns {object} Combined rule state (same shape as applyRules output)
 */
export function runMultiPassInference(config, datasetScope, entities, relations, options = {}) {
  const multiPass = config.inference?.multi_pass === true;
  const maxPasses = options.maxPasses || 3;
  const frame = options.confidenceFrame || null;

  // Pass 1: Standard rule evaluation
  const state = applyRules(config, datasetScope, entities, relations);

  if (frame) {
    for (const trace of state.ruleTraces) {
      if (trace.status === "fired") {
        recordInference(frame, {
          ruleId: trace.ruleId,
          claimed: trace.output?.reason || trace.ruleLabel || "",
          basis: trace.mode === "function" ? trace.functionName : "legacy-fact",
          confidence: trace.output?.score ?? 0.5,
        });
      }
    }
  }

  if (!multiPass || maxPasses <= 1) {
    return state;
  }

  // Pass 2: Cross-reference pass
  const crossRefEvidences = crossReferencePass(state, entities, relations);
  if (crossRefEvidences.length > 0) {
    state.evidences.push(...crossRefEvidences);

    // Boost lens scores for cross-referenced entities
    for (const ev of crossRefEvidences) {
      if (ev.payload?.lens && ev.payload?.entityId) {
        state.entityLensScores[ev.payload.entityId] ||= {};
        state.entityLensScores[ev.payload.entityId][ev.payload.lens] =
          (state.entityLensScores[ev.payload.entityId][ev.payload.lens] || 0) +
          ev.confidence * 0.3;
        state.lensBuckets[ev.payload.lens] ||= { score: 0, evidenceIds: [], label: ev.payload.lens };
        state.lensBuckets[ev.payload.lens].score += ev.confidence * 0.2;
        state.lensBuckets[ev.payload.lens].evidenceIds.push(ev.id);
      }
    }
  }

  // Pass 3: Consolidation — detect contradictions
  const contradictions = detectContradictions(state.evidences, state.entityLensScores);
  if (contradictions.length > 0 && frame) {
    for (const contradiction of contradictions) {
      recordGap(frame, {
        type: GAP_TYPES.CONFLICTING_EVIDENCE,
        description: contradiction.description,
        severity: 0.6,
        affectedIds: [contradiction.entityId],
      });
    }
  }

  // Merge duplicate evidences (same sourceRuleId + targetId)
  state.evidences = mergeEvidenceSets(state.evidences);

  return state;
}

/**
 * Cross-reference pass: find entities where multiple rules agree or disagree.
 */
function crossReferencePass(state, entities, relations) {
  const newEvidences = [];

  // For each entity, check if multiple rules assigned the same lens
  for (const [entityId, lensScores] of Object.entries(state.entityLensScores)) {
    const lenses = Object.entries(lensScores).sort((a, b) => b[1] - a[1]);
    if (lenses.length < 2) continue;

    const [primaryLens, primaryScore] = lenses[0];
    const [secondaryLens, secondaryScore] = lenses[1];

    // Strong agreement: primary lens has 2x+ the score of secondary
    if (primaryScore >= secondaryScore * 2) {
      const entity = entities.find((e) => e.id === entityId);
      newEvidences.push(createEvidence({
        sourceRuleId: "system-cross-reference-agreement",
        confidence: 0.75,
        scope: "entity",
        targetId: entityId,
        affects: ["context_lens"],
        reason: `Multiple rules converge on ${primaryLens} for ${entity?.name || entityId}.`,
        payload: { lens: primaryLens, entityId, agreement: "strong" },
      }));
    }

    // Close competition: lenses within 20% — potential ambiguity
    if (secondaryScore > 0 && primaryScore < secondaryScore * 1.2) {
      const entity = entities.find((e) => e.id === entityId);
      newEvidences.push(createEvidence({
        sourceRuleId: "system-cross-reference-ambiguity",
        confidence: 0.45,
        scope: "entity",
        targetId: entityId,
        affects: ["context_lens", "diagnostics"],
        reason: `${entity?.name || entityId} has competing lens assignments: ${primaryLens} vs ${secondaryLens}.`,
        payload: { lens: primaryLens, entityId, competing: secondaryLens, agreement: "ambiguous" },
      }));
    }
  }

  // Check temporal ordering of influence relations
  for (const rel of relations) {
    if (rel.type !== "influenced") continue;
    const source = entities.find((e) => e.id === rel.source);
    const target = entities.find((e) => e.id === rel.target);
    if (!source?.dimensions?.time || !target?.dimensions?.time) continue;

    const sourceTime = Number(source.dimensions.time);
    const targetTime = Number(target.dimensions.time);

    if (Number.isFinite(sourceTime) && Number.isFinite(targetTime) && sourceTime <= targetTime) {
      // Temporally consistent influence — boost
      newEvidences.push(createEvidence({
        sourceRuleId: "system-temporal-consistency",
        confidence: 0.72,
        scope: "relation",
        targetId: rel.id,
        affects: ["relation"],
        reason: `${source.name} (${sourceTime}) precedes ${target.name} (${targetTime}), confirming influence direction.`,
        payload: { source: rel.source, target: rel.target },
      }));
    }
  }

  return newEvidences;
}

/**
 * Detect contradictions in evidence — cases where the same entity has
 * conflicting claims from different rules.
 *
 * @param {Array} evidences
 * @param {object} entityLensScores
 * @returns {Array<{entityId, description, a, b}>}
 */
export function detectContradictions(evidences, entityLensScores) {
  const contradictions = [];

  // Check for entities with near-equal competing lenses
  for (const [entityId, scores] of Object.entries(entityLensScores || {})) {
    const lenses = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    if (lenses.length >= 2) {
      const [topLens, topScore] = lenses[0];
      const [nextLens, nextScore] = lenses[1];
      if (nextScore > 0 && topScore > 0 && topScore < nextScore * 1.1) {
        contradictions.push({
          entityId,
          description: `Entity ${entityId}: lens ${topLens} (${topScore.toFixed(2)}) barely leads ${nextLens} (${nextScore.toFixed(2)}) — near-contradiction.`,
          a: topLens,
          b: nextLens,
        });
      }
    }
  }

  return contradictions;
}

/**
 * Merge duplicate evidences — keep the one with the highest confidence
 * when sourceRuleId + targetId match.
 *
 * @param {Array} evidences
 * @returns {Array}
 */
export function mergeEvidenceSets(evidences) {
  const seen = new Map();

  for (const ev of evidences) {
    const key = `${ev.sourceRuleId}::${ev.targetId}`;
    const existing = seen.get(key);
    if (!existing || ev.confidence > existing.confidence) {
      seen.set(key, ev);
    }
  }

  return [...seen.values()];
}
