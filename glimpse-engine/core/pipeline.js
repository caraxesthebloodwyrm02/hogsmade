/**
 * Main pipeline orchestration for the Glimpse engine.
 * Coordinates the full data processing pipeline.
 */

import {
  buildEntities,
} from "../analysis/entities.js";
import {
  buildDataProfile,
} from "../analysis/profiling.js";
import {
  buildBaseRelations,
  buildDatasetScope,
  createEvidence,
  createEvidenceIndex,
} from "../analysis/relations.js";
import {
  applyRules,
  summarizeLenses,
} from "../functions/rules.js";
import {
  runMultiPassInference,
} from "./multi-pass.js";
import {
  detectDataComplexity,
  selectPipelineMode,
} from "./modes.js";
import {
  findInvariantPatterns,
  rankByDensity,
} from "./compression.js";
import {
  selectGroundingProvider,
  applyGrounding,
} from "./grounding.js";
import {
  normalizeRecords
} from "../utils/parsing.js";
import {
  bucketYear,
} from "../utils/utils.js";
import {
  bucketYearAdaptive,
  computeTemporalRange,
} from "../analysis/temporal.js";
import {
  createConfidenceFrame,
  detectGaps,
  summarizeConfidence,
} from "./confidence.js";

export function computeClusters(context, dimension) {
  // Compute temporal range for adaptive bucketing
  let timeRange = 50; // default decade-level
  if (dimension === "time") {
    const timeValues = context.entities
      .map((e) => e.dimensions.time)
      .filter((v) => typeof v === "number");
    const range = computeTemporalRange(timeValues);
    if (range) timeRange = range.range;
  }

  const groups = {};
  context.entities.forEach((entity) => {
    let key = "Other";
    if (dimension === "time") key = bucketYearAdaptive(entity.dimensions.time, timeRange) || bucketYear(entity.dimensions.time) || "Unknown";
    else if (dimension === "space") key = entity.dimensions.space || "Unknown";
    else if (dimension === "domain") key = entity.dimensions.domain || context.contextLenses[0]?.label || entity.type || "General";
    else if (dimension === "catalyst") key = entity.dimensions.catalyst || "Unknown";
    else if (dimension === "type") key = entity.type || "Unknown";
    groups[key] ||= [];
    groups[key].push(entity.id);
  });
  return Object.entries(groups)
    .map(([label, entityIds], index) => ({
      id: `cluster-${index}`,
      label,
      entities: entityIds,
      size: entityIds.length,
      density: context.entities.length ? entityIds.length / context.entities.length : 0,
    }))
    .sort((a, b) => b.size - a.size);
}

export function runContextPipeline(rawData, fileType, config, options = {}) {
  const records = normalizeRecords(rawData, fileType);
  if (!records.length) return null;

  const profile = buildDataProfile(records, config);
  const entities = buildEntities(records, profile, config);
  const base = buildBaseRelations(entities);
  const datasetScope = buildDatasetScope(records, profile, entities, base.relations, config);

  // Phase 3: Mode detection — adapt pipeline depth to data complexity
  const complexity = detectDataComplexity(profile, entities, base.relations);
  const modeSettings = selectPipelineMode(complexity, config);

  // Phase 1C + 2: Confidence-tracked multi-pass inference
  const confidenceFrame = createConfidenceFrame();
  const ruleState = runMultiPassInference(config, datasetScope, entities, base.relations, {
    maxPasses: modeSettings.passCount,
    confidenceFrame,
  });
  const allEvidences = [...base.evidences, ...ruleState.evidences];
  const evidenceIndex = createEvidenceIndex(allEvidences);
  const contextLenses = summarizeLenses(config, ruleState.lensBuckets, options.presetId || config.defaults?.active_preset || "analyst");

  const relations = base.relations.map((relation) => {
    const sourceLens = Object.entries(ruleState.entityLensScores[relation.source] || {}).sort((a, b) => b[1] - a[1])[0]?.[0];
    const targetLens = Object.entries(ruleState.entityLensScores[relation.target] || {}).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (sourceLens && targetLens && sourceLens !== targetLens) {
      relation.tags ||= [];
      relation.tags.push("cross-domain-bridge");
      const evidence = createEvidence({
        sourceRuleId: "system-cross-domain-bridge",
        confidence: 0.56,
        scope: "relation",
        targetId: relation.id,
        affects: ["relation", "context_lens"],
        reason: "This relation bridges two different context lenses.",
        payload: { sourceLens, targetLens },
      });
      relation.evidenceIds.push(evidence.id);
      allEvidences.push(evidence);
      evidenceIndex[evidence.id] = evidence;
    }
    return relation;
  });

  const viewPreferences = ruleState.viewPreferences;
  const clusterBy = profile.flags.has_space_dimension ? "space" : profile.flags.has_time_dimension ? "time" : "domain";

  // Confidence calibration & gap detection
  detectGaps(confidenceFrame, { entities, relations, evidences: allEvidences, profile });
  const confidenceReport = summarizeConfidence(confidenceFrame);

  // Phase 4A: Insight compression — find invariant patterns ranked by density
  const invariantPatterns = findInvariantPatterns(allEvidences, entities, relations, contextLenses);
  const rankedPatterns = rankByDensity(invariantPatterns);

  // Phase 4B: Grounding — local-first verification of top patterns
  let groundedInsights = rankedPatterns;
  if (modeSettings.groundingRecommended || options.grounding) {
    const groundingMode = options.groundingMode || "local";
    const provider = selectGroundingProvider(groundingMode, options);
    groundedInsights = applyGrounding(provider, rankedPatterns.map((p) => ({
      compressed: p.pattern,
      original: p.pattern,
      densityScore: p.densityScore,
      supportingEvidence: [],
      entityId: null,
    })), {
      entities,
      relations,
      evidences: allEvidences,
      inferenceGaps: confidenceFrame.gaps,
    });
  }

  return {
    records,
    profile,
    entities,
    relations,
    facts: {
      dataset: datasetScope.dataset,
      entityLensScores: ruleState.entityLensScores,
    },
    evidences: allEvidences,
    evidenceIndex,
    contextLenses,
    primaryLens: contextLenses[0] || null,
    secondaryLenses: contextLenses.slice(1),
    viewPreferences,
    clusterBy,
    clusters: [],
    ruleTraces: ruleState.ruleTraces,
    validationReport: ruleState.validationReport,
    functionInventory: ruleState.registryInventory,
    confidenceReport,
    inferenceGaps: confidenceFrame.gaps,
    complexity,
    modeSettings,
    invariantPatterns: rankedPatterns,
    groundedInsights,
  };
}

// Re-export for convenience
export { buildEntities } from "../analysis/entities.js";
export { buildDataProfile } from "../analysis/profiling.js";
export { getFunctionRegistryInventory } from "../functions/functions.js";
export { validateConfigWithRegistry } from "../functions/rules.js";
export { normalizeRecords, parseCSV } from "../utils/parsing.js";

