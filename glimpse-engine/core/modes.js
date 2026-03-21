/**
 * Adaptive Pipeline Mode System
 *
 * Detects data complexity and selects the appropriate pipeline mode.
 * Modes control inference depth, compression behavior, and grounding strategy.
 */

export const PIPELINE_MODES = {
  INFERENCE: "inference",
  COMPRESSION: "compression",
  GROUNDING: "grounding",
};

/**
 * Detect the complexity level of the dataset.
 *
 * @param {object} profile - Data profile from buildDataProfile
 * @param {Array} entities - Entity array
 * @param {Array} relations - Relation array
 * @returns {{ level: string, factors: object }}
 */
export function detectDataComplexity(profile, entities, relations) {
  const entityCount = entities.length;
  const relationCount = relations.length;
  const descriptorCount = (profile.descriptors || []).length;

  // Relation density (0..1)
  const maxRelations = entityCount > 1 ? entityCount * (entityCount - 1) : 1;
  const density = Math.min(1, relationCount / maxRelations);

  // Dimension coverage: how many of the 4 dimensions are populated
  const dims = ["time", "space", "domain", "catalyst"];
  const dimCoverage = dims.filter((d) =>
    entities.some((e) => e.dimensions?.[d] != null)
  ).length / dims.length;

  // Taxonomy diversity: unique domains across entities
  const domains = new Set(
    entities.map((e) => e.dimensions?.domain).filter(Boolean)
  );
  const taxonomyDiversity = Math.min(1, domains.size / Math.max(entityCount, 1));

  // Composite complexity score
  const score =
    (entityCount > 50 ? 0.3 : entityCount > 15 ? 0.2 : 0.1) +
    density * 0.2 +
    dimCoverage * 0.2 +
    taxonomyDiversity * 0.15 +
    (descriptorCount > 8 ? 0.15 : descriptorCount > 4 ? 0.1 : 0.05);

  const level = score >= 0.6 ? "complex" : score >= 0.35 ? "moderate" : "simple";

  return {
    level,
    factors: {
      entityCount,
      relationCount,
      density: Math.round(density * 100) / 100,
      dimCoverage: Math.round(dimCoverage * 100) / 100,
      taxonomyDiversity: Math.round(taxonomyDiversity * 100) / 100,
      descriptorCount,
      compositeScore: Math.round(score * 100) / 100,
    },
  };
}

/**
 * Select the pipeline mode based on complexity.
 *
 * @param {{ level: string }} complexity
 * @param {object} config
 * @returns {{ mode: string, reason: string, passCount: number }}
 */
export function selectPipelineMode(complexity, config) {
  const multiPassEnabled = config.inference?.multi_pass === true;

  if (complexity.level === "complex") {
    return {
      mode: PIPELINE_MODES.INFERENCE,
      reason: "Complex dataset requires multi-pass inference with cross-referencing.",
      passCount: multiPassEnabled ? 3 : 1,
      compressionDepth: "deep",
      groundingRecommended: true,
    };
  }

  if (complexity.level === "moderate") {
    return {
      mode: PIPELINE_MODES.INFERENCE,
      reason: "Moderate dataset benefits from multi-pass inference.",
      passCount: multiPassEnabled ? 2 : 1,
      compressionDepth: "standard",
      groundingRecommended: false,
    };
  }

  return {
    mode: PIPELINE_MODES.INFERENCE,
    reason: "Simple dataset processed with single-pass inference.",
    passCount: 1,
    compressionDepth: "light",
    groundingRecommended: false,
  };
}

/**
 * Create a mode context with all settings for the current pipeline run.
 *
 * @param {string} mode - Pipeline mode
 * @param {object} profile - Data profile
 * @param {object} config - Master config
 * @param {{ level: string, factors: object }} complexity
 * @returns {ModeContext}
 */
export function createModeContext(mode, profile, config, complexity) {
  return {
    mode,
    complexity: complexity.level,
    factors: complexity.factors,
    settings: selectPipelineMode(complexity, config),
  };
}
