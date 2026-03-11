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

