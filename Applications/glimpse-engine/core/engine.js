/**
 * Glimpse Engine - Entry Point
 *
 * Agentic capabilities added:
 * - Calibration policies for confidence scoring
 * - Contract validation exports
 * - Sync validation utilities
 */

// ═══════════════════════════════════════════════════════════════════
// CORE UTILITIES
// ═══════════════════════════════════════════════════════════════════

export {
  bucketYear,
  clamp,
  clone,
  compareFact,
  createSemanticIndex,
  escRegExp,
  findBestEntityMatch,
  flattenRecord,
  guessPrimitiveType,
  includesWord,
  normalizeName,
  normalizeScalar,
  resolvePath,
  slugify,
  unique,
} from "../utils/utils.js";

export { normalizeRecords, parseCSV } from "../utils/parsing.js";

// ═══════════════════════════════════════════════════════════════════
// ANALYSIS MODULES
// ═══════════════════════════════════════════════════════════════════

export { buildDataProfile, detectTones, scoreTaxonomy } from "../analysis/profiling.js";

export { buildEntities } from "../analysis/entities.js";

export {
  buildBaseRelations,
  buildDatasetScope,
  createEvidence,
  createEvidenceIndex,
} from "../analysis/relations.js";

export {
  computeStringSimilarity,
  computeTokenOverlap,
  computeDimensionSimilarity,
} from "../analysis/similarity.js";

export {
  bucketYearAdaptive,
  computeTemporalRange,
  detectTemporalClusters,
  computeTemporalDensity,
} from "../analysis/temporal.js";

export { crossReferenceEntities, crossReferenceRelations } from "../analysis/cross-reference.js";

// ═══════════════════════════════════════════════════════════════════
// FUNCTION REGISTRY
// ═══════════════════════════════════════════════════════════════════

export {
  FunctionRegistry,
  createSafeFunctionRegistry,
  getFunctionRegistryInventory,
} from "../functions/functions.js";

export { applyRules, summarizeLenses, validateConfigWithRegistry } from "../functions/rules.js";

// ═══════════════════════════════════════════════════════════════════
// PIPELINE & MODES
// ═══════════════════════════════════════════════════════════════════

export { computeClusters, runContextPipeline } from "./pipeline.js";

export {
  PIPELINE_MODES,
  detectDataComplexity,
  selectPipelineMode,
  createModeContext,
} from "./modes.js";

// ═══════════════════════════════════════════════════════════════════
// CONFIDENCE & CALIBRATION
// ═══════════════════════════════════════════════════════════════════

export {
  createConfidenceFrame,
  recordInference,
  recordGap,
  detectGaps,
  calibrateConfidence,
  summarizeConfidence,
  GAP_TYPES,
} from "./confidence.js";

/**
 * @deprecated Use createCalibratedFrame from validators/calibration-engine.js instead
 * Creates a confidence frame with policy-based calibration
 * @param {string} policy - Calibration policy name
 * @returns {Object} Calibrated confidence frame
 */
export function createCalibrationAwareFrame(policy = "adaptive") {
  // Lazy import to avoid circular dependencies
  return import("./validators/calibration-engine.js").then((m) => m.createCalibratedFrame(policy));
}

// ═══════════════════════════════════════════════════════════════════
// CONTRACTS & TYPES
// ═══════════════════════════════════════════════════════════════════

export {
  // Entity factories
  createEntity,
  createRelation,
  // Note: createEvidence is exported from analysis/relations above
  // Validation
  validateShape,
  Shapes,
  // Utilities
  safePath,
  deepEqual,
  computeDiff,
  createChecksum,
  memoize,
} from "./contracts.js";

// ═══════════════════════════════════════════════════════════════════
// AGENTIC VALIDATORS
// ═══════════════════════════════════════════════════════════════════

/**
 * Sync validation - configuration drift detection
 * @module core/validators/sync-validator
 */
export {
  computeChecksum,
  detectDrift,
  validateSyncHealth,
  autoSync,
  ciCheck,
  loadSyncRegistry,
  saveSyncRegistry,
} from "./validators/sync-validator.js";

/**
 * Calibration engine - dynamic confidence policies
 * @module core/validators/calibration-engine
 */
export {
  createCalibrationEngine,
  createCalibratedFrame,
  comparePolicies,
  CALIBRATION_POLICIES,
  GAP_TYPES as CALIBRATION_GAP_TYPES,
} from "./validators/calibration-engine.js";

/**
 * Function contract validation
 * @module core/validators/function-contract
 */
export {
  validateFunctionContracts,
  generateFunctionStub,
  generateHealingPatch,
  wrapWithContract,
  formatReport,
  quickValidate,
} from "./validators/function-contract.js";

// ═══════════════════════════════════════════════════════════════════
// MULTI-PASS & CROSS-REF
// ═══════════════════════════════════════════════════════════════════

export { runMultiPassInference, detectContradictions, mergeEvidenceSets } from "./multi-pass.js";

// ═══════════════════════════════════════════════════════════════════
// COMPRESSION & GROUNDING
// ═══════════════════════════════════════════════════════════════════

export {
  scoreInsightDensity,
  compressInsight,
  findInvariantPatterns,
  rankByDensity,
} from "./compression.js";

export {
  GroundingProvider,
  LocalGroundingProvider,
  ContextWindowGroundingProvider,
  WebGroundingProvider,
  selectGroundingProvider,
  applyGrounding,
} from "./grounding.js";

// ═══════════════════════════════════════════════════════════════════
// QUERY & INTERVIEW
// ═══════════════════════════════════════════════════════════════════

export { buildSemanticHints, compileRuleFromConversation, parseQueryIntent } from "./query.js";

export {
  POSTURES,
  assessCalibrationNeed,
  selectQuestions,
  scoreInterview,
  prepareInterview,
  applyInterviewModulation,
} from "./interview.js";

// ═══════════════════════════════════════════════════════════════════
// LEARNING & PATHS
// ═══════════════════════════════════════════════════════════════════

export {
  buildTrace,
  appendTrace,
  loadHistory,
  saveHistory,
  collectTrace,
  refineRun,
  suggestImprovements,
  applyOverrides,
  learnFromRun,
  buildSessionRecap,
  compareToRecent,
} from "./learning.js";

export {
  evaluatePath,
  evaluateAllPaths,
  getBuiltinPaths,
  loadPaths,
  savePaths,
  mergePaths,
  buildPathContext,
  runPaths,
  getSignalInventory,
} from "./paths.js";

// ═══════════════════════════════════════════════════════════════════
// SCENARIOS & DISPLAY
// ═══════════════════════════════════════════════════════════════════

export * from "./scenarios.js";

// display.js exports - statusTable is available
export { statusTable } from "./display.js";

// ═══════════════════════════════════════════════════════════════════
// DEFINITIONS
// ═══════════════════════════════════════════════════════════════════

export { installCustomDefinition, serializeDefinitions, loadDefinitions } from "./definitions.js";

// ═══════════════════════════════════════════════════════════════════
// DRIFTGUARD — Anti-Drift Architecture
// ═══════════════════════════════════════════════════════════════════

export {
  DriftGuard,
  DriftFormulas,
  DriftDetector,
  DriftResolver,
  DriftTelemetry,
  DRIFT_POLICIES,
  createDriftGuard,
} from "./drift-guard/index.js";

export { withDriftProtection, createGuardedFrame } from "./drift-guard/adapter.js";

// ═══════════════════════════════════════════════════════════════════
// VERSION
// ═══════════════════════════════════════════════════════════════════

export const VERSION = "2.1.0";
export const AGENTIC_CAPABILITIES = [
  "sync-validation",
  "drift-detection",
  "auto-healing",
  "calibration-policies",
  "contract-validation",
  "function-registry-check",
  "driftguard-orchestration",
];
