/**
 * Glimpse Engine - Entry Point
 */

export {
  bucketYear, clamp, clone, compareFact, createSemanticIndex, escRegExp, findBestEntityMatch, flattenRecord,
  guessPrimitiveType, includesWord, normalizeName, normalizeScalar, resolvePath, slugify, unique
} from "../utils/utils.js";

export { normalizeRecords, parseCSV } from "../utils/parsing.js";

export {
  buildDataProfile, detectTones, scoreTaxonomy
} from "../analysis/profiling.js";

export { buildEntities } from "../analysis/entities.js";

export {
  buildBaseRelations,
  buildDatasetScope, createEvidence, createEvidenceIndex
} from "../analysis/relations.js";

export {
  FunctionRegistry,
  createSafeFunctionRegistry,
  getFunctionRegistryInventory
} from "../functions/functions.js";

export {
  applyRules,
  summarizeLenses,
  validateConfigWithRegistry
} from "../functions/rules.js";

export {
  computeClusters, runContextPipeline
} from "./pipeline.js";

export {
  buildSemanticHints, compileRuleFromConversation, parseQueryIntent
} from "./query.js";

// Phase 1: Foundation
export {
  computeStringSimilarity, computeTokenOverlap, computeDimensionSimilarity
} from "../analysis/similarity.js";

export {
  bucketYearAdaptive, computeTemporalRange, detectTemporalClusters, computeTemporalDensity
} from "../analysis/temporal.js";

export {
  createConfidenceFrame, recordInference, recordGap, detectGaps,
  calibrateConfidence, summarizeConfidence, GAP_TYPES
} from "./confidence.js";

// Phase 2: Multi-pass & Cross-reference
export {
  runMultiPassInference, detectContradictions, mergeEvidenceSets
} from "./multi-pass.js";

export {
  crossReferenceEntities, crossReferenceRelations
} from "../analysis/cross-reference.js";

// Phase 3: Modes
export {
  PIPELINE_MODES, detectDataComplexity, selectPipelineMode, createModeContext
} from "./modes.js";

// Phase 4: Compression & Grounding
export {
  scoreInsightDensity, compressInsight, findInvariantPatterns, rankByDensity
} from "./compression.js";

export {
  GroundingProvider, LocalGroundingProvider, ContextWindowGroundingProvider,
  WebGroundingProvider, selectGroundingProvider, applyGrounding
} from "./grounding.js";

// Phase 5: Definitions
export {
  installCustomDefinition, serializeDefinitions, loadDefinitions
} from "./definitions.js";

