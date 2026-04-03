/**
 * @file core/contracts.js
 * @description Immutable type contracts and shared interfaces
 * Prevents circular dependencies by establishing canonical shapes
 * Zero external dependencies - pure contracts
 */

/**
 * @typedef {Object} Entity
 * @property {string} id - Unique identifier
 * @property {string} name - Display name
 * @property {string} type - Entity classification
 * @property {Object} dimensions - Mapped dimensions (time, space, domain, etc.)
 * @property {Object} metrics - Computed metrics
 * @property {string[]} evidenceIds - References to supporting evidence
 * @property {Object} [domainKeywordHits] - Taxonomy scores
 * @property {Object} [tones] - Detected tone scores
 */

/**
 * @typedef {Object} Relation
 * @property {string} id - Unique identifier
 * @property {string} source - Source entity ID
 * @property {string} target - Target entity ID
 * @property {string} type - Relation classification
 * @property {number} weight - Relation strength 0-1
 * @property {string[]} [tags] - Annotations (e.g., "cross-domain-bridge")
 * @property {string[]} evidenceIds - References to supporting evidence
 */

/**
 * @typedef {Object} Evidence
 * @property {string} id - Unique identifier
 * @property {string} sourceRuleId - Originating rule
 * @property {number} confidence - Confidence score 0-1
 * @property {string} scope - "dataset" | "entity" | "relation"
 * @property {string} targetId - Subject reference
 * @property {string[]} affects - What this evidence impacts
 * @property {string} reason - Human-readable explanation
 * @property {Object} [payload] - Additional structured data
 * @property {number} timestamp - Creation timestamp
 */

/**
 * @typedef {Object} ViewSpec
 * @property {string} id - View identifier
 * @property {boolean} enabled - Availability flag
 * @property {string} label - Display name
 * @property {number} base_weight - Scoring weight
 * @property {Function} [renderer] - Optional custom render function
 * @property {string} [description] - View purpose
 */

/**
 * @typedef {Object} PipelineContext
 * @property {Object[]} records - Normalized input records
 * @property {Object} profile - Data profile with flags
 * @property {Entity[]} entities - Extracted entities
 * @property {Relation[]} relations - Computed relations
 * @property {Evidence[]} evidences - All evidence
 * @property {Object} evidenceIndex - Fast lookup map
 * @property {Object[]} contextLenses - Activated lenses
 * @property {Object} viewPreferences - View scoring preferences
 * @property {string} clusterBy - Active clustering dimension
 * @property {Object} [confidenceReport] - Confidence analysis
 * @property {Object[]} [inferenceGaps] - Detected gaps
 * @property {Object} [validationReport] - Function/rule validation
 */

/**
 * @typedef {Object} DataProfile
 * @property {number} recordCount - Total records
 * @property {string[]} columns - Column names
 * @property {ColumnDescriptor[]} descriptors - Column metadata
 * @property {Object} dimensionMap - Columns grouped by dimension
 * @property {Object} flags - Detected characteristics
 * @property {Object|null} timeRange - Temporal bounds
 */

/**
 * @typedef {Object} ColumnDescriptor
 * @property {string} name - Column name
 * @property {string} type - Detected type
 * @property {number} cardinality - Unique value count
 * @property {number} density - Fill ratio 0-1
 * @property {string[]} sampleValues - Example values
 * @property {string|null} dimension - Mapped dimension
 * @property {boolean} hasText - Contains lengthy strings
 */

/**
 * Canonical validation schemas
 */
export const Shapes = {
  Entity: {
    required: ["id", "name", "type", "dimensions", "metrics", "evidenceIds"],
    types: {
      id: "string",
      name: "string",
      type: "string",
      dimensions: "object",
      metrics: "object",
      evidenceIds: "array",
    },
  },
  Relation: {
    required: ["id", "source", "target", "type", "weight", "evidenceIds"],
    types: {
      id: "string",
      source: "string",
      target: "string",
      type: "string",
      weight: "number",
      evidenceIds: "array",
    },
  },
  Evidence: {
    required: ["id", "sourceRuleId", "confidence", "scope", "targetId", "affects", "reason"],
    types: {
      id: "string",
      sourceRuleId: "string",
      confidence: "number",
      scope: "string",
      targetId: "string",
      affects: "array",
      reason: "string",
    },
  },
};

/**
 * Result type for validation operations
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether validation passed
 * @property {string[]} errors - List of validation errors
 * @property {string[]} warnings - Non-fatal issues
 */

/**
 * Validates data against known shape
 * @param {string} shapeName - Key in Shapes
 * @param {Object} data - Data to validate
 * @returns {ValidationResult}
 */
export function validateShape(shapeName, data) {
  const shape = Shapes[shapeName];
  if (!shape) {
    return { valid: false, errors: [`Unknown shape: ${shapeName}`], warnings: [] };
  }

  const errors = [];
  const warnings = [];

  // Check required fields
  for (const field of shape.required) {
    if (data[field] === undefined || data[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Check types
  for (const [field, expectedType] of Object.entries(shape.types)) {
    if (data[field] !== undefined && data[field] !== null) {
      const actualType = Array.isArray(data[field]) ? "array" : typeof data[field];
      if (actualType !== expectedType) {
        errors.push(`Field ${field} expected ${expectedType}, got ${actualType}`);
      }
    }
  }

  // Warn on extra fields
  const knownFields = new Set([...shape.required, ...Object.keys(shape.types)]);
  const extraFields = Object.keys(data).filter((k) => !knownFields.has(k));
  if (extraFields.length > 0) {
    warnings.push(`Extra fields present: ${extraFields.join(", ")}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Factory for creating validated entities
 * @param {Object} partial - Partial entity data
 * @returns {Entity} Validated and frozen entity
 * @throws {TypeError} If validation fails
 */
export function createEntity(partial) {
  const entity = {
    id: partial.id || `entity-${Math.random().toString(36).slice(2, 10)}`,
    name: partial.name || "Unnamed",
    type: partial.type || "general",
    dimensions: partial.dimensions || {},
    metrics: partial.metrics || {},
    evidenceIds: partial.evidenceIds || [],
    domainKeywordHits: partial.domainKeywordHits || partial.domain_keyword_hits || {},
    tones: partial.tones || partial.tone_hits || {},
  };

  const validation = validateShape("Entity", entity);
  if (!validation.valid) {
    throw new TypeError(`Invalid Entity: ${validation.errors.join(", ")}`);
  }

  return Object.freeze(entity);
}

/**
 * Factory for creating validated relations
 * @param {Object} partial - Partial relation data
 * @returns {Relation} Validated and frozen relation
 * @throws {TypeError} If validation fails
 */
export function createRelation(partial) {
  const relation = {
    id: partial.id || `relation-${Math.random().toString(36).slice(2, 10)}`,
    source: partial.source,
    target: partial.target,
    type: partial.type || "related",
    weight: Number.isFinite(partial.weight) ? partial.weight : 0.5,
    tags: partial.tags || [],
    evidenceIds: partial.evidenceIds || [],
  };

  const validation = validateShape("Relation", relation);
  if (!validation.valid) {
    throw new TypeError(`Invalid Relation: ${validation.errors.join(", ")}`);
  }

  return Object.freeze(relation);
}

/**
 * Factory for creating validated evidence
 * @param {Object} partial - Partial evidence data
 * @returns {Evidence} Validated and frozen evidence
 * @throws {TypeError} If validation fails
 */
export function createEvidence(partial) {
  const evidence = {
    id: partial.id || `evidence-${Math.random().toString(36).slice(2, 10)}`,
    sourceRuleId: partial.sourceRuleId || "unknown",
    confidence: Number.isFinite(partial.confidence) ? partial.confidence : 0.5,
    scope: partial.scope || "dataset",
    targetId: partial.targetId || "unknown",
    affects: partial.affects || [],
    reason: partial.reason || "No reason provided",
    payload: partial.payload || {},
    timestamp: partial.timestamp || Date.now(),
  };

  const validation = validateShape("Evidence", evidence);
  if (!validation.valid) {
    throw new TypeError(`Invalid Evidence: ${validation.errors.join(", ")}`);
  }

  return Object.freeze(evidence);
}

/**
 * Safely resolve nested path with default
 * @param {Object} obj - Source object
 * @param {string} path - Dot-separated path
 * @param {*} defaultValue - Fallback value
 * @returns {*} Resolved value or default
 */
export function safePath(obj, path, defaultValue = undefined) {
  if (!obj || typeof path !== "string") return defaultValue;
  return path.split(".").reduce((acc, part) => {
    return acc && acc[part] !== undefined ? acc[part] : defaultValue;
  }, obj);
}

/**
 * Deep equality for change detection
 * @param {*} a - First value
 * @param {*} b - Second value
 * @returns {boolean}
 */
export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object" || a === null || b === null) return false;

  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  return keysA.every((key) => deepEqual(a[key], b[key]));
}

/**
 * Compute difference between two objects
 * @param {Object} oldObj - Previous state
 * @param {Object} newObj - Current state
 * @returns {Object} Changes { added: {}, removed: {}, modified: {} }
 */
export function computeDiff(oldObj, newObj) {
  const added = {};
  const removed = {};
  const modified = {};

  const allKeys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);

  for (const key of allKeys) {
    const hasOld = key in (oldObj || {});
    const hasNew = key in (newObj || {});

    if (hasOld && !hasNew) {
      removed[key] = oldObj[key];
    } else if (!hasOld && hasNew) {
      added[key] = newObj[key];
    } else if (!deepEqual(oldObj[key], newObj[key])) {
      modified[key] = { from: oldObj[key], to: newObj[key] };
    }
  }

  return { added, removed, modified };
}

/**
 * Creates a checksum for content-addressable caching
 * @param {*} content - Serializable content
 * @returns {string} Hex checksum
 */
export function createChecksum(content) {
  // Simple hash for browser compatibility
  const str = typeof content === "string" ? content : JSON.stringify(content);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

/**
 * Memoize function with cache invalidation
 * @param {Function} fn - Function to memoize
 * @param {Function} [keyFn] - Cache key generator
 * @returns {Function} Memoized function with .clear() method
 */
export function memoize(fn, keyFn = (...args) => JSON.stringify(args)) {
  const cache = new Map();

  const memoized = function (...args) {
    const key = keyFn(...args);
    if (cache.has(key)) {
      return cache.get(key);
    }
    const result = fn(...args);
    cache.set(key, result);
    return result;
  };

  memoized.clear = () => cache.clear();
  memoized.size = () => cache.size;

  return memoized;
}
