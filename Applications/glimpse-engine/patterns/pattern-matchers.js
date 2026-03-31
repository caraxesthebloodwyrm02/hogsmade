/**
 * Pattern Detection Functions
 * 
 * Additional functions specifically for pattern matching beyond the core builtin functions.
 * These functions are designed to work with the pattern registry system.
 */

import {
  clamp,
  resolvePath,
  unique,
  bucketYear,
} from "../utils/utils.js";

/**
 * Field pattern detection - checks if field names match patterns
 */
export function field_pattern(context, args) {
  const descriptors = context.profile?.descriptors || [];
  const pattern = new RegExp(args.pattern, "i");
  const matches = descriptors.filter(d => pattern.test(d.name));
  
  return {
    matched: matches.length > 0,
    value: matches.length,
    score: clamp(matches.length / Math.max(descriptors.length, 1), 0, 1),
    reason: matches.length
      ? `${matches.length} field(s) match pattern /${args.pattern}/: ${matches.map(m => m.name).join(", ")}.`
      : `No fields match pattern /${args.pattern}/.`,
    payload: { matchedFields: matches.map(m => m.name) }
  };
}

/**
 * Temporal distance analysis for pattern matching
 */
export function temporal_distance(context, args) {
  if (context.relation) {
    // For relations, check temporal distance between entities
    const left = Number(context.source?.dimensions?.time || NaN);
    const right = Number(context.target?.dimensions?.time || NaN);
    const gap = Number.isFinite(left) && Number.isFinite(right) ? Math.abs(left - right) : Number.POSITIVE_INFINITY;
    
    return {
      matched: gap <= Number(args.max_gap || 10),
      value: gap,
      score: Number.isFinite(gap) ? clamp(1 - (gap / Math.max(Number(args.max_gap) || 10, 1)), 0, 1) : 0,
      reason: Number.isFinite(gap) ? `Temporal gap is ${gap} years.` : "Temporal gap is unavailable."
    };
  }
  
  // For entities, find temporal clusters
  if (context.entity) {
    const entities = context.dataset?.entities || [];
    const entityTime = Number(context.entity.dimensions?.time || NaN);
    
    if (!Number.isFinite(entityTime)) {
      return { matched: false, value: 0, score: 0, reason: "Entity has no valid time dimension" };
    }
    
    const closeEntities = entities.filter(other => {
      if (other.id === context.entity.id) return false;
      const otherTime = Number(other.dimensions?.time || NaN);
      return Number.isFinite(otherTime) && Math.abs(entityTime - otherTime) <= Number(args.max_gap || 10);
    });
    
    return {
      matched: closeEntities.length > 0,
      value: closeEntities.length,
      score: clamp(closeEntities.length / Math.max(entities.length - 1, 1), 0, 1),
      reason: `Found ${closeEntities.length} entities within ${args.max_gap || 10} years.`,
      payload: { closeEntityIds: closeEntities.map(e => e.id) }
    };
  }
  
  // For dataset, check overall temporal clustering
  const entities = context.dataset?.entities || [];
  const timeValues = entities
    .map(e => Number(e.dimensions?.time))
    .filter(t => Number.isFinite(t))
    .sort((a, b) => a - b);
  
  if (timeValues.length < 2) {
    return { matched: false, value: 0, score: 0, reason: "Insufficient temporal data for clustering analysis" };
  }
  
  // Count pairs within threshold
  let closePairs = 0;
  for (let i = 0; i < timeValues.length; i++) {
    for (let j = i + 1; j < timeValues.length; j++) {
      if (timeValues[j] - timeValues[i] <= Number(args.max_gap || 10)) {
        closePairs++;
      }
    }
  }
  
  const maxPairs = (timeValues.length * (timeValues.length - 1)) / 2;
  const clusteringScore = clamp(closePairs / maxPairs, 0, 1);
  
  return {
    matched: clusteringScore > 0.3,
    value: closePairs,
    score: clusteringScore,
    reason: `${closePairs} temporal pairs within ${args.max_gap || 10} years (clustering: ${(clusteringScore * 100).toFixed(1)}%).`
  };
}

/**
 * Shared dimension analysis for pattern matching
 */
export function shared_dimension(context, args) {
  const dimension = args.dimension;
  
  if (context.relation) {
    const left = context.source?.dimensions?.[dimension];
    const right = context.target?.dimensions?.[dimension];
    
    if (left == null || right == null) {
      return { matched: false, value: null, score: 0, reason: `${dimension} dimension missing for one or both entities.` };
    }
    
    const exactMatch = String(left).toLowerCase() === String(right).toLowerCase();
    const similarity = exactMatch ? 1.0 : 0.0;
    
    return {
      matched: similarity > 0.5,
      value: left,
      score: similarity,
      reason: exactMatch ? `${dimension} matches across the relation.` : `${dimension} does not match across the relation.`,
      payload: { left, right, exactMatch }
    };
  }
  
  // For entities, find others sharing the same dimension
  if (context.entity) {
    const entities = context.dataset?.entities || [];
    const entityValue = context.entity.dimensions?.[dimension];
    
    if (entityValue == null) {
      return { matched: false, value: null, score: 0, reason: `Entity has no ${dimension} dimension.` };
    }
    
    const sharedEntities = entities.filter(other => {
      if (other.id === context.entity.id) return false;
      const otherValue = other.dimensions?.[dimension];
      return otherValue != null && String(otherValue).toLowerCase() === String(entityValue).toLowerCase();
    });
    
    return {
      matched: sharedEntities.length > 0,
      value: entityValue,
      score: clamp(sharedEntities.length / Math.max(entities.length - 1, 1), 0, 1),
      reason: `Found ${sharedEntities.length} entities sharing ${dimension}: ${entityValue}.`,
      payload: { sharedEntityIds: sharedEntities.map(e => e.id), value: entityValue }
    };
  }
  
  return { matched: false, value: null, score: 0, reason: "Shared dimension analysis requires entity or relation context." };
}

/**
 * Influence link detection for pattern matching
 */
export function influence_link(context, args) {
  if (context.relation) {
    const isInfluenced = context.relation.type === "influenced";
    return {
      matched: isInfluenced,
      value: isInfluenced,
      score: isInfluenced ? 0.9 : 0,
      reason: isInfluenced ? "Influence structure is present in this relation." : "No influence structure in this relation."
    };
  }
  
  // For dataset, count influence relations
  const relations = context.dataset?.relations || [];
  const influenceRelations = relations.filter(r => r.type === "influenced");
  const influenceRatio = relations.length > 0 ? influenceRelations.length / relations.length : 0;
  
  return {
    matched: influenceRelations.length > 0,
    value: influenceRelations.length,
    score: clamp(influenceRatio * 2, 0, 1), // Scale up for visibility
    reason: `Found ${influenceRelations.length} influence relations out of ${relations.length} total.`,
    payload: { influenceCount: influenceRelations.length, totalRelations: relations.length }
  };
}

/**
 * Density score calculation for pattern matching
 */
export function density_score(context, args) {
  const entities = context.dataset?.entities || [];
  const relations = context.dataset?.relations || [];
  
  if (entities.length < 2) {
    return { matched: false, value: 0, score: 0, reason: "Insufficient entities for density calculation." };
  }
  
  const maxPossibleRelations = entities.length * (entities.length - 1);
  const density = maxPossibleRelations > 0 ? relations.length / maxPossibleRelations : 0;
  const threshold = Number(args.dense_threshold || 0.5);
  const isDense = density >= threshold;
  
  return {
    matched: isDense,
    value: density,
    score: clamp(density / Math.max(threshold, 1), 0, 1),
    reason: isDense
      ? `High density (${(density * 100).toFixed(1)}%): dense network structure.`
      : `Low density (${(density * 100).toFixed(1)}%): sparse network structure.`,
    payload: { density, isDense, entityCount: entities.length, relationCount: relations.length }
  };
}

/**
 * Record range analysis for pattern matching
 */
export function record_range(context, args) {
  const n = context.dataset?.record_count || 0;
  const min = Number(args.min || 0);
  const max = Number(args.max || Infinity);
  
  return {
    matched: n >= min && n <= max,
    value: n,
    score: clamp(n / Math.max(max, 1), 0, 1),
    reason: `Record count ${n} is ${n >= min && n <= max ? "within" : "outside"} range [${min}, ${max}].`,
    payload: { recordCount: n, min, max, inRange: n >= min && n <= max }
  };
}

/**
 * Data shape analysis for pattern matching
 */
export function data_shape(context, args) {
  const ds = context.dataset || {};
  const profile = context.profile || {};
  const n = ds.record_count || 0;
  const descriptors = profile.descriptors || [];
  const numericCount = descriptors.filter(d => d.type === "number").length;
  const stringCount = descriptors.filter(d => d.type === "string").length;
  const totalDims = descriptors.length || 1;
  const quantRatio = numericCount / totalDims;
  const catRatio = stringCount / totalDims;
  const complexity = clamp((Math.log2(n + 1) / 10) + (totalDims / 20) + (quantRatio * 0.3), 0, 1);
  
  return {
    matched: n >= Number(args.min_records || 1),
    value: n,
    score: complexity,
    reason: `Dataset has ${n} records, ${totalDims} fields (${numericCount} numeric, ${stringCount} categorical). Complexity: ${complexity.toFixed(2)}.`,
    payload: { recordCount: n, dimensions: totalDims, numericCount, stringCount, quantRatio, catRatio, complexity }
  };
}

/**
 * Dimension count analysis for pattern matching
 */
export function dimension_count(context, args) {
  const count = context.dataset?.dimension_counts?.[args.dimension] || 0;
  const min = Number(args.min_count || 1);
  
  return {
    matched: count >= min,
    value: count,
    score: clamp(count / Math.max(min, 1), 0, 1),
    reason: `${args.dimension} dimension has ${count} mapped field(s).`,
    payload: { dimension: args.dimension, count, min, hasDimension: count >= min }
  };
}

/**
 * Register pattern-specific functions with the function registry
 */
export function registerPatternFunctions(registry) {
  const patternFunctions = [
    { name: 'field_pattern', handler: field_pattern },
    { name: 'temporal_distance', handler: temporal_distance },
    { name: 'shared_dimension', handler: shared_dimension },
    { name: 'influence_link', handler: influence_link },
    { name: 'density_score', handler: density_score },
    { name: 'record_range', handler: record_range },
    { name: 'data_shape', handler: data_shape },
    { name: 'dimension_count', handler: dimension_count },
  ];
  
  patternFunctions.forEach(({ name, handler }) => {
    registry.register({
      name,
      scope: ["dataset", "entity", "relation"],
      returns: "score",
      description: `Pattern detection function: ${name}`,
      argSchema: {}, // Will be defined per pattern
      handler
    });
  });
  
  return registry;
}
