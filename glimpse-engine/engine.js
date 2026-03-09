function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "item";
}

function escRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== "" && value != null))];
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function flattenRecord(record) {
  return Object.entries(record || {}).map(([key, value]) => `${key}: ${value}`).join(" ");
}

function guessPrimitiveType(values) {
  const nonEmpty = values.filter((value) => value !== "" && value != null);
  if (!nonEmpty.length) return "unknown";
  const numericCount = nonEmpty.filter((value) => typeof value === "number").length;
  if (numericCount === nonEmpty.length) return "number";
  const booleanCount = nonEmpty.filter((value) => typeof value === "boolean").length;
  if (booleanCount === nonEmpty.length) return "boolean";
  const dateLikeCount = nonEmpty.filter((value) => /^\d{4}(-\d{2}(-\d{2})?)?$/.test(String(value))).length;
  if (dateLikeCount === nonEmpty.length) return "date";
  return "string";
}

function normalizeScalar(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return "";
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    return trimmed;
  }
  return value;
}

function includesWord(text, term) {
  return new RegExp(`\\b${escRegExp(term)}\\b`, "i").test(text);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resolvePath(scope, path) {
  const parts = String(path || "").split(".").filter(Boolean);
  let current = scope;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

function compareFact(actual, op, expected) {
  if (op === "exists") return actual !== undefined && actual !== null && actual !== "";
  if (op === "is") return actual === expected;
  if (op === "contains") return Array.isArray(actual)
    ? actual.includes(expected)
    : String(actual || "").toLowerCase().includes(String(expected || "").toLowerCase());
  if (op === ">") return Number(actual || 0) > Number(expected || 0);
  if (op === ">=") return Number(actual || 0) >= Number(expected || 0);
  if (op === "<") return Number(actual || 0) < Number(expected || 0);
  if (op === "<=") return Number(actual || 0) <= Number(expected || 0);
  if (op === "!=") return actual !== expected;
  return actual === expected;
}

function bucketYear(value) {
  if (typeof value !== "number") return null;
  return `${Math.floor(value / 10) * 10}s`;
}

function createSemanticIndex(config) {
  const dimensionAliases = config.semantic_packs?.dimension_aliases || {};
  const queryAliases = config.semantic_packs?.query_aliases || {};
  return {
    dimensionAliases,
    queryAliases,
    synonymGroups: config.semantic_packs?.synonym_groups || {},
    phonetics: config.semantic_packs?.phonetics || {},
    literaryVariants: config.semantic_packs?.literary_variants || {},
    toneCues: config.semantic_packs?.tone_cues || {},
    taxonomyDomains: config.taxonomy?.domains || [],
  };
}

export function normalizeRecords(raw, type = "json") {
  if (type === "csv") return Array.isArray(raw) ? raw : raw?.rows || [];
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    for (const value of Object.values(raw)) {
      if (Array.isArray(value) && value.length && typeof value[0] === "object") return value;
    }
    return [raw];
  }
  return [];
}

export function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = splitCSVLine(lines[0]).map((value) => value.trim());
  return lines.slice(1).map((line) => {
    const cells = splitCSVLine(line);
    const record = {};
    headers.forEach((header, index) => {
      record[header] = normalizeScalar((cells[index] || "").trim());
    });
    return record;
  });
}

function splitCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function detectDimension(column, semantics) {
  const normalized = String(column || "").toLowerCase();
  for (const [dimension, aliases] of Object.entries(semantics.dimensionAliases)) {
    if ((aliases || []).some((alias) => normalized === alias || normalized.includes(alias))) {
      return dimension;
    }
  }
  return null;
}

export function buildDataProfile(records, config) {
  const semantics = createSemanticIndex(config);
  const columns = unique(records.flatMap((record) => Object.keys(record || {})));
  const descriptors = columns.map((column) => {
    const values = records.map((record) => normalizeScalar(record[column]));
    const nonEmpty = values.filter((value) => value !== "" && value != null);
    const type = guessPrimitiveType(nonEmpty);
    return {
      name: column,
      type,
      cardinality: unique(nonEmpty.map((value) => String(value))).length,
      density: records.length ? nonEmpty.length / records.length : 0,
      sampleValues: unique(nonEmpty.map((value) => String(value))).slice(0, 4),
      dimension: detectDimension(column, semantics),
      hasText: type === "string" && nonEmpty.some((value) => String(value).length > 12),
    };
  });

  const flags = {
    has_time_dimension: descriptors.some((descriptor) => descriptor.dimension === "time"),
    has_space_dimension: descriptors.some((descriptor) => descriptor.dimension === "space"),
    has_metric_dimension: descriptors.some((descriptor) => descriptor.type === "number"),
    has_text_fields: descriptors.some((descriptor) => descriptor.hasText),
    has_geo_coordinates: descriptors.some((descriptor) => ["latitude", "lat"].includes(descriptor.name.toLowerCase()))
      && descriptors.some((descriptor) => ["longitude", "lng"].includes(descriptor.name.toLowerCase())),
    has_role_or_mood: descriptors.some((descriptor) => /role|mood|event|object|setting/i.test(descriptor.name)),
    has_influence_field: descriptors.some((descriptor) => /influenced|inspired|based_on|derived/i.test(descriptor.name)),
  };

  const timeValues = [];
  records.forEach((record) => {
    descriptors.filter((descriptor) => descriptor.dimension === "time").forEach((descriptor) => {
      const value = normalizeScalar(record[descriptor.name]);
      if (typeof value === "number") timeValues.push(value);
      else if (/^\d{4}$/.test(String(value || ""))) timeValues.push(Number(value));
    });
  });

  return {
    recordCount: records.length,
    columns,
    descriptors,
    dimensionMap: descriptors.reduce((acc, descriptor) => {
      const key = descriptor.dimension || "unmapped";
      if (!acc[key]) acc[key] = [];
      acc[key].push(descriptor.name);
      return acc;
    }, {}),
    flags,
    timeRange: timeValues.length ? { min: Math.min(...timeValues), max: Math.max(...timeValues) } : null,
  };
}

function chooseEntityColumn(profile) {
  const preferred = ["agent", "entity", "name", "character"];
  for (const key of preferred) {
    const columns = profile.dimensionMap[key] || [];
    if (columns.length) return columns[0];
  }
  const fallback = profile.descriptors.find((descriptor) => descriptor.type === "string");
  return fallback?.name || profile.columns[0];
}

function chooseTypeColumn(profile) {
  const explicit = profile.descriptors.find((descriptor) => /type|kind|class|role/i.test(descriptor.name));
  return explicit?.name || null;
}

function scoreTaxonomy(text, config) {
  const scores = {};
  const haystack = String(text || "").toLowerCase();
  (config.taxonomy?.domains || []).forEach((domain) => {
    let score = 0;
    (domain.keywords || []).forEach((keyword) => {
      if (includesWord(haystack, keyword)) score += 1;
    });
    scores[domain.id] = score;
  });
  return scores;
}

function detectTones(text, config) {
  const tones = {};
  const haystack = String(text || "").toLowerCase();
  Object.entries(config.semantic_packs?.tone_cues || {}).forEach(([tone, cues]) => {
    tones[tone] = (cues || []).reduce((count, cue) => count + (includesWord(haystack, cue) ? 1 : 0), 0);
  });
  return tones;
}

function inferEntityType(recordText) {
  const text = String(recordText || "").toLowerCase();
  if (/protagonist|antagonist|mentor|ally|witness|informant|inventor|artist|person/.test(text)) return "person";
  if (/invention|engine|telephone|telegraph|radio|device|machine|cinema|photography/.test(text)) return "artifact";
  if (/theory|law|principle/.test(text)) return "theory";
  if (/movement|revolution|era/.test(text)) return "movement";
  if (/event|blackout|revelation|exchange|confrontation/.test(text)) return "event";
  if (/place|region|country|city|location/.test(text)) return "place";
  return "object";
}

export function buildEntities(records, profile, config) {
  const entityColumn = chooseEntityColumn(profile);
  const typeColumn = chooseTypeColumn(profile);
  const timeColumn = profile.dimensionMap.time?.[0] || null;
  const spaceColumn = profile.dimensionMap.space?.[0] || null;
  const domainColumn = profile.dimensionMap.domain?.[0] || null;
  const catalystColumn = profile.dimensionMap.catalyst?.[0] || null;

  return records.map((record, index) => {
    const recordText = flattenRecord(record);
    const domainKeywordHits = scoreTaxonomy(recordText, config);
    const tones = detectTones(recordText, config);
    const metrics = {};
    profile.descriptors.filter((descriptor) => descriptor.type === "number").forEach((descriptor) => {
      const value = normalizeScalar(record[descriptor.name]);
      if (typeof value === "number") metrics[descriptor.name] = value;
    });
    return {
      id: `e-${index}`,
      name: String(record[entityColumn] || `Record ${index + 1}`),
      type: typeColumn ? String(record[typeColumn] || "object").toLowerCase() : inferEntityType(recordText),
      dimensions: {
        time: normalizeScalar(record[timeColumn]),
        space: normalizeScalar(record[spaceColumn]),
        domain: normalizeScalar(record[domainColumn]),
        catalyst: normalizeScalar(record[catalystColumn]),
      },
      metrics,
      text: recordText,
      domainKeywordHits,
      domain_keyword_hits: domainKeywordHits,
      tones,
      tone_hits: tones,
      properties: record,
    };
  });
}

function createEvidence(base) {
  return {
    id: base.id || `ev-${Math.random().toString(36).slice(2, 10)}`,
    sourceRuleId: base.sourceRuleId || "system",
    confidence: base.confidence ?? 0.6,
    scope: base.scope || "dataset",
    targetId: base.targetId || null,
    reason: base.reason || "",
    affects: base.affects || [],
    payload: base.payload || {},
  };
}

function buildBaseRelations(entities) {
  const relations = [];
  const evidences = [];
  const byName = new Map(entities.map((entity) => [entity.name.toLowerCase(), entity]));

  const influenceColumns = ["influenced_by", "inspired_by", "based_on", "derived", "source"];
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
      const target = byName.get(explicitInfluence.toLowerCase())
        || entities.find((candidate) => explicitInfluence.toLowerCase().includes(candidate.name.toLowerCase()));
      if (target) {
        const evidence = createEvidence({
          id: `ev-rel-influence-${entity.id}-${target.id}`,
          sourceRuleId: "system-explicit-influence",
          scope: "relation",
          targetId: `${target.id}:${entity.id}`,
          confidence: 0.92,
          affects: ["relation", "view"],
          reason: `${target.name} explicitly appears as a source for ${entity.name}.`,
          payload: { relationType: "influenced", source: target.id, target: entity.id },
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

  for (let index = 0; index < entities.length; index += 1) {
    for (let next = index + 1; next < entities.length; next += 1) {
      const a = entities[index];
      const b = entities[next];
      if (a.dimensions.space && b.dimensions.space && String(a.dimensions.space).toLowerCase() === String(b.dimensions.space).toLowerCase()) {
        const evidence = createEvidence({
          id: `ev-rel-space-${a.id}-${b.id}`,
          sourceRuleId: "system-shared-space",
          scope: "relation",
          targetId: `${a.id}:${b.id}`,
          confidence: 0.62,
          affects: ["relation", "cluster"],
          reason: `${a.name} and ${b.name} share the same place: ${a.dimensions.space}.`,
          payload: { relationType: "shared-space", source: a.id, target: b.id },
        });
        evidences.push(evidence);
        relations.push({
          id: `rel-${a.id}-${b.id}-space`,
          source: a.id,
          target: b.id,
          type: "shared-space",
          weight: 0.3,
          evidenceIds: [evidence.id],
        });
      }

      const bucketA = bucketYear(a.dimensions.time);
      const bucketB = bucketYear(b.dimensions.time);
      if (bucketA && bucketB && bucketA === bucketB) {
        const evidence = createEvidence({
          id: `ev-rel-time-${a.id}-${b.id}`,
          sourceRuleId: "system-shared-era",
          scope: "relation",
          targetId: `${a.id}:${b.id}`,
          confidence: 0.58,
          affects: ["relation", "cluster"],
          reason: `${a.name} and ${b.name} land in the same time bucket: ${bucketA}.`,
          payload: { relationType: "shared-era", source: a.id, target: b.id },
        });
        evidences.push(evidence);
        relations.push({
          id: `rel-${a.id}-${b.id}-time`,
          source: a.id,
          target: b.id,
          type: "shared-era",
          weight: 0.28,
          evidenceIds: [evidence.id],
        });
      }

      if (a.dimensions.domain && b.dimensions.domain && String(a.dimensions.domain).toLowerCase() === String(b.dimensions.domain).toLowerCase()) {
        const evidence = createEvidence({
          id: `ev-rel-domain-${a.id}-${b.id}`,
          sourceRuleId: "system-shared-domain",
          scope: "relation",
          targetId: `${a.id}:${b.id}`,
          confidence: 0.67,
          affects: ["relation", "cluster"],
          reason: `${a.name} and ${b.name} share the same declared domain: ${a.dimensions.domain}.`,
          payload: { relationType: "shared-domain", source: a.id, target: b.id },
        });
        evidences.push(evidence);
        relations.push({
          id: `rel-${a.id}-${b.id}-domain`,
          source: a.id,
          target: b.id,
          type: "shared-domain",
          weight: 0.4,
          evidenceIds: [evidence.id],
        });
      }
    }
  }

  return { relations, evidences };
}

function computeDatasetDomainHits(records, config) {
  const text = records.map(flattenRecord).join(" ");
  return scoreTaxonomy(text, config);
}

function buildDatasetScope(records, profile, entities, relations, config) {
  const domainHits = computeDatasetDomainHits(records, config);
  return {
    dataset: {
      record_count: records.length,
      relation_density: entities.length > 1 ? relations.length / (entities.length * entities.length) : 0,
      domain_keyword_hits: domainHits,
      flags: {
        has_time_dimension: profile.flags.has_time_dimension,
        has_space_dimension: profile.flags.has_space_dimension,
        has_metric_dimension: profile.flags.has_metric_dimension,
        has_text_fields: profile.flags.has_text_fields,
        has_geo_coordinates: profile.flags.has_geo_coordinates,
        has_role_or_mood: profile.flags.has_role_or_mood,
        has_influence_links: relations.some((relation) => relation.type === "influenced"),
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

function createEvidenceIndex(evidences) {
  return evidences.reduce((acc, evidence) => {
    acc[evidence.id] = evidence;
    return acc;
  }, {});
}

function listAllowedDomains(config) {
  return (config.taxonomy?.domains || []).map((domain) => domain.id);
}

function listAllowedViews(config) {
  return Object.keys(config.view_specs || {});
}

function validateArgValue(typeName, value, config, label) {
  const argType = config.arg_types?.[typeName] || {};
  const type = argType.type || typeName || "string";
  const errors = [];

  if (value == null) {
    if (argType.required === false) return errors;
    errors.push(`${label} is required.`);
    return errors;
  }

  if (type === "any") return errors;
  if (type === "string" && typeof value !== "string") errors.push(`${label} must be a string.`);
  if (type === "number" && !Number.isFinite(Number(value))) errors.push(`${label} must be a number.`);
  if (type === "boolean" && typeof value !== "boolean") errors.push(`${label} must be a boolean.`);

  if (argType.values && !argType.values.includes(value)) {
    errors.push(`${label} must be one of: ${argType.values.join(", ")}.`);
  }

  if (argType.source === "taxonomy.domains" && !listAllowedDomains(config).includes(value)) {
    errors.push(`${label} must reference a known taxonomy domain.`);
  }
  if (argType.source === "view_specs" && !listAllowedViews(config).includes(value)) {
    errors.push(`${label} must reference a known view id.`);
  }

  if (type === "object" && argType.shape && typeof value === "object" && !Array.isArray(value)) {
    Object.entries(argType.shape).forEach(([key, nestedType]) => {
      validateArgValue(nestedType, value[key], config, `${label}.${key}`).forEach((error) => errors.push(error));
    });
  }

  if (type === "array" && argType.items) {
    if (!Array.isArray(value)) {
      errors.push(`${label} must be an array.`);
    } else {
      value.forEach((item, index) => {
        validateArgValue(argType.items, item, config, `${label}[${index}]`).forEach((error) => errors.push(error));
      });
    }
  }

  return errors;
}

function createEvaluationContext(scopeType, item, datasetScope, entitiesById, config) {
  const base = {
    dataset: datasetScope.dataset,
    profile: datasetScope.profile,
    config,
    semantic_packs: config.semantic_packs || {},
  };
  if (scopeType === "entity") {
    return {
      ...base,
      entity: {
        ...item,
        domain_keyword_hits: item.domainKeywordHits || item.domain_keyword_hits || {},
        tone_hits: item.tones || item.tone_hits || {},
      },
    };
  }
  if (scopeType === "relation") {
    return {
      ...base,
      relation: item,
      source: entitiesById[item.source],
      target: entitiesById[item.target],
    };
  }
  if (scopeType === "view") {
    return {
      ...base,
      view: item,
    };
  }
  return base;
}

function expandSemanticTerms(term, config) {
  const lower = String(term || "").toLowerCase();
  if (!lower) return [];
  const terms = new Set([lower]);
  Object.entries(config.semantic_packs?.synonym_groups || {}).forEach(([group, values]) => {
    const all = [group, ...(values || [])].map((value) => String(value).toLowerCase());
    if (all.includes(lower)) all.forEach((value) => terms.add(value));
  });
  Object.entries(config.semantic_packs?.phonetics || {}).forEach(([root, values]) => {
    const all = [root, ...(values || [])].map((value) => String(value).toLowerCase());
    if (all.includes(lower)) all.forEach((value) => terms.add(value));
  });
  Object.entries(config.semantic_packs?.literary_variants || {}).forEach(([root, values]) => {
    const all = [root, ...(values || [])].map((value) => String(value).toLowerCase());
    if (all.includes(lower)) all.forEach((value) => terms.add(value));
  });
  return [...terms];
}

function normalizeFunctionResult(result) {
  if (result && typeof result === "object" && !Array.isArray(result)) return result;
  return { matched: Boolean(result), value: result, score: Boolean(result) ? 1 : 0 };
}

export class FunctionRegistry {
  constructor(config) {
    this.config = config;
    this.definitions = new Map();
  }

  register(definition) {
    this.definitions.set(definition.name, definition);
  }

  get(name) {
    return this.definitions.get(name);
  }

  list() {
    return [...this.definitions.values()].map((definition) => ({
      name: definition.name,
      scope: definition.scope,
      returns: definition.returns,
      description: definition.description,
      argSchema: definition.argSchema,
    }));
  }

  validate(name, args, scopeType) {
    const metadata = this.config.function_registry?.[name];
    if (!metadata) {
      return { ok: false, errors: [`Function "${name}" is not exposed in function_registry.`] };
    }

    const definition = this.get(name);
    if (!definition) {
      return { ok: false, errors: [`Function "${name}" is listed in YAML but has no runtime handler.`] };
    }

    const allowedScopes = metadata.scope || definition.scope || [];
    const scopeErrors = allowedScopes.length && !allowedScopes.includes(scopeType)
      ? [`Function "${name}" does not allow the "${scopeType}" scope.`]
      : [];

    const schema = metadata.args || definition.argSchema || {};
    const argErrors = [];
    Object.entries(schema).forEach(([key, typeName]) => {
      validateArgValue(typeName, args?.[key], this.config, `${name}.${key}`).forEach((error) => argErrors.push(error));
    });

    return {
      ok: scopeErrors.length === 0 && argErrors.length === 0,
      errors: [...scopeErrors, ...argErrors],
      definition,
      metadata,
    };
  }

  invoke(name, context, args) {
    const definition = this.get(name);
    const result = definition.handler(context, args, this.config);
    return normalizeFunctionResult(result);
  }
}

const BUILTIN_FUNCTIONS = [
  {
    name: "field_exists",
    scope: ["dataset", "entity", "relation", "view"],
    returns: "boolean",
    description: "Checks whether a path resolves to a present value.",
    argSchema: { path: "field_selector" },
    handler(context, args) {
      const actual = resolvePath(context, args.path);
      return {
        matched: actual !== undefined && actual !== null && actual !== "",
        value: actual,
        reason: `${args.path} is ${actual !== undefined && actual !== null && actual !== "" ? "available" : "missing"}.`,
      };
    },
  },
  {
    name: "equals_value",
    scope: ["dataset", "entity", "relation", "view"],
    returns: "boolean",
    description: "Compares a path against an expected value.",
    argSchema: { path: "field_selector", value: "any_value" },
    handler(context, args) {
      const actual = resolvePath(context, args.path);
      return {
        matched: actual === args.value,
        value: actual,
        reason: `${args.path} ${actual === args.value ? "matches" : "does not match"} ${String(args.value)}.`,
      };
    },
  },
  {
    name: "numeric_threshold",
    scope: ["dataset", "entity", "relation"],
    returns: "score",
    description: "Compares a numeric path against a threshold.",
    argSchema: { path: "field_selector", op: "comparison_operator", value: "numeric_threshold" },
    handler(context, args) {
      const actual = Number(resolvePath(context, args.path) || 0);
      return {
        matched: compareFact(actual, args.op, Number(args.value)),
        value: actual,
        score: clamp(actual / Math.max(Number(args.value) || 1, 1), 0, 1),
        reason: `${args.path} resolved to ${actual}.`,
      };
    },
  },
  {
    name: "type_check",
    scope: ["dataset", "entity", "relation"],
    returns: "boolean",
    description: "Validates a primitive type at a path.",
    argSchema: { path: "field_selector", expected_type: "primitive_type" },
    handler(context, args) {
      const actual = resolvePath(context, args.path);
      const actualType = Array.isArray(actual) ? "array" : typeof actual;
      return {
        matched: actualType === args.expected_type,
        value: actualType,
        reason: `${args.path} resolved to ${actualType}.`,
      };
    },
  },
  {
    name: "taxonomy_score",
    scope: ["dataset", "entity"],
    returns: "score",
    description: "Reads a taxonomy score for a named domain.",
    argSchema: { path: "field_selector", domain: "lens_id", min_score: "numeric_threshold" },
    handler(context, args) {
      const scores = resolvePath(context, args.path) || {};
      const score = Number(scores[args.domain] || 0);
      return {
        matched: score >= Number(args.min_score || 0),
        value: score,
        score: clamp(score / Math.max(Number(args.min_score) || 1, 1), 0, 1),
        reason: `${args.domain} scored ${score} from ${args.path}.`,
      };
    },
  },
  {
    name: "tone_score",
    scope: ["dataset", "entity"],
    returns: "score",
    description: "Reads a tone score for a named tone cue.",
    argSchema: { path: "field_selector", tone: "tone_name", min_score: "numeric_threshold" },
    handler(context, args) {
      const scores = resolvePath(context, args.path) || {};
      const score = Number(scores[args.tone] || 0);
      return {
        matched: score >= Number(args.min_score || 0),
        value: score,
        score: clamp(score / Math.max(Number(args.min_score) || 1, 1), 0, 1),
        reason: `${args.tone} scored ${score} from ${args.path}.`,
      };
    },
  },
  {
    name: "semantic_proximity",
    scope: ["dataset", "entity"],
    returns: "score",
    description: "Measures whether expanded semantic terms appear in a target text.",
    argSchema: { path: "field_selector", term: "semantic_term", min_matches: "numeric_threshold" },
    handler(context, args, config) {
      const text = String(resolvePath(context, args.path) || "").toLowerCase();
      const terms = expandSemanticTerms(args.term, config);
      const hits = terms.filter((term) => includesWord(text, term)).length;
      return {
        matched: hits >= Number(args.min_matches || 1),
        value: hits,
        score: clamp(hits / Math.max(Number(args.min_matches) || 1, 1), 0, 1),
        reason: `${hits} semantic matches found for ${args.term}.`,
        payload: { matchedTerms: terms.filter((term) => includesWord(text, term)) },
      };
    },
  },
  {
    name: "shared_dimension",
    scope: ["relation"],
    returns: "boolean",
    description: "Checks whether the relation endpoints share a dimension value.",
    argSchema: { dimension: "dimension_name" },
    handler(context, args) {
      const left = context.source?.dimensions?.[args.dimension];
      const right = context.target?.dimensions?.[args.dimension];
      const matched = left != null && right != null && String(left).toLowerCase() === String(right).toLowerCase();
      return {
        matched,
        value: left,
        reason: matched ? `${args.dimension} matches across the relation.` : `${args.dimension} does not match across the relation.`,
      };
    },
  },
  {
    name: "temporal_distance",
    scope: ["relation"],
    returns: "score",
    description: "Measures year distance across relation endpoints.",
    argSchema: { max_gap: "numeric_threshold" },
    handler(context, args) {
      const left = Number(context.source?.dimensions?.time || NaN);
      const right = Number(context.target?.dimensions?.time || NaN);
      const gap = Number.isFinite(left) && Number.isFinite(right) ? Math.abs(left - right) : Number.POSITIVE_INFINITY;
      return {
        matched: gap <= Number(args.max_gap || 0),
        value: gap,
        score: Number.isFinite(gap) ? clamp(1 - (gap / Math.max(Number(args.max_gap) || 1, 1)), 0, 1) : 0,
        reason: Number.isFinite(gap) ? `Temporal gap is ${gap} years.` : "Temporal gap is unavailable.",
      };
    },
  },
  {
    name: "influence_link",
    scope: ["dataset", "relation"],
    returns: "boolean",
    description: "Checks for explicit influence links.",
    argSchema: {},
    handler(context) {
      const matched = context.relation ? context.relation.type === "influenced" : Boolean(context.dataset?.flags?.has_influence_links);
      return {
        matched,
        value: matched,
        reason: matched ? "Influence structure is present." : "No influence structure was found.",
      };
    },
  },
  {
    name: "weighted_sum",
    scope: ["dataset", "entity", "relation"],
    returns: "score",
    description: "Aggregates several numeric inputs into a bounded score.",
    argSchema: { inputs: "weighted_inputs", min_score: "numeric_threshold" },
    handler(context, args) {
      const total = (args.inputs || []).reduce((sum, item) => {
        const weight = Number(item.weight || 1);
        const raw = item.path ? Number(resolvePath(context, item.path) || 0) : Number(item.value || 0);
        return sum + raw * weight;
      }, 0);
      return {
        matched: total >= Number(args.min_score || 0),
        value: total,
        score: clamp(total / Math.max(Number(args.min_score) || 1, 1), 0, 1),
        reason: `Weighted sum resolved to ${total.toFixed(2)}.`,
      };
    },
  },
  {
    name: "threshold_gate",
    scope: ["dataset", "entity", "relation", "view"],
    returns: "boolean",
    description: "Converts a raw numeric value into a pass/fail gate.",
    argSchema: { value_path: "field_selector", min_score: "numeric_threshold" },
    handler(context, args) {
      const actual = Number(resolvePath(context, args.value_path) || 0);
      return {
        matched: actual >= Number(args.min_score || 0),
        value: actual,
        score: clamp(actual / Math.max(Number(args.min_score) || 1, 1), 0, 1),
        reason: `${args.value_path} resolved to ${actual}.`,
      };
    },
  },
  {
    name: "preset_bias",
    scope: ["dataset", "view"],
    returns: "score",
    description: "Reads preset weighting for a lens or a view target.",
    argSchema: { preset: "preset_id", target_type: "bias_target_type", target: "bias_target_id" },
    handler(context, args, config) {
      const preset = config.presets?.[args.preset] || {};
      const source = args.target_type === "view" ? preset.view_bias || {} : preset.lens_weights || {};
      const score = Number(source[args.target] || 0);
      return {
        matched: score > 0,
        value: score,
        score: clamp(score / 2, 0, 1),
        reason: `${args.target} has a ${score} preset bias under ${args.preset}.`,
      };
    },
  },
  {
    name: "enum_match",
    scope: ["dataset", "entity", "relation", "view"],
    returns: "boolean",
    description: "Matches a path value against an enum list.",
    argSchema: { path: "field_selector", values: "string_list" },
    handler(context, args) {
      const actual = resolvePath(context, args.path);
      return {
        matched: (args.values || []).includes(actual),
        value: actual,
        reason: `${args.path} resolved to ${String(actual)}.`,
      };
    },
  },

  // --- NEW FUNCTIONS: Data Shape Analysis ---

  {
    name: "data_shape",
    scope: ["dataset"],
    returns: "score",
    description: "Classify the dataset shape: how many records, dimensions, categorical vs quantitative ratio.",
    argSchema: { min_records: "numeric_threshold" },
    handler(context, args) {
      const ds = context.dataset || {};
      const profile = context.profile || {};
      const n = ds.record_count || 0;
      const descriptors = profile.descriptors || [];
      const numericCount = descriptors.filter(d => d.type === "number").length;
      const stringCount = descriptors.filter(d => d.type === "string").length;
      const totalDims = descriptors.length || 1;
      const quantRatio = numericCount / totalDims;
      const catRatio = stringCount / totalDims;
      // score: higher = more complex/interesting data shape
      const complexity = clamp((Math.log2(n + 1) / 10) + (totalDims / 20) + (quantRatio * 0.3), 0, 1);
      return {
        matched: n >= Number(args.min_records || 1),
        value: n,
        score: complexity,
        reason: `Dataset has ${n} records, ${totalDims} fields (${numericCount} numeric, ${stringCount} categorical). Complexity: ${complexity.toFixed(2)}.`,
        payload: { recordCount: n, dimensions: totalDims, numericCount, stringCount, quantRatio, catRatio },
      };
    },
  },

  {
    name: "density_score",
    scope: ["dataset"],
    returns: "score",
    description: "Measure information density: records * dimensions ratio to determine dense vs sparse view preference.",
    argSchema: { dense_threshold: "numeric_threshold" },
    handler(context, args) {
      const ds = context.dataset || {};
      const profile = context.profile || {};
      const n = ds.record_count || 0;
      const dims = (profile.descriptors || []).length || 1;
      const density = (n * dims) / 1000; // normalized density metric
      const isDense = density >= Number(args.dense_threshold || 1);
      return {
        matched: isDense,
        value: density,
        score: clamp(density / Math.max(Number(args.dense_threshold) || 1, 1), 0, 1),
        reason: isDense
          ? `High density (${density.toFixed(1)}): prefer matrix, heatmap, or parallel views.`
          : `Low density (${density.toFixed(1)}): prefer graph, tree, or flow views.`,
        payload: { density, isDense },
      };
    },
  },

  {
    name: "relationship_type",
    scope: ["dataset"],
    returns: "score",
    description: "Detect the dominant relationship type: hierarchy, network, sequence, comparison, or part-whole.",
    argSchema: {},
    handler(context) {
      const ds = context.dataset || {};
      const profile = context.profile || {};
      const flags = ds.flags || {};
      const descriptors = profile.descriptors || [];
      const types = { hierarchy: 0, network: 0, sequence: 0, comparison: 0, part_whole: 0, correlation: 0 };

      // hierarchy signals
      if (descriptors.some(d => /parent|child|level|depth|nested/i.test(d.name))) types.hierarchy += 2;
      // network signals
      if (flags.has_influence_links) types.network += 2;
      if (descriptors.some(d => /source|target|from|to|edge/i.test(d.name))) types.network += 1;
      // sequence signals
      if (flags.has_time_dimension) types.sequence += 2;
      if (descriptors.some(d => /step|phase|stage|order|sequence/i.test(d.name))) types.sequence += 1;
      // comparison signals
      if (descriptors.filter(d => d.type === "number").length >= 2) types.comparison += 1;
      if (descriptors.some(d => /group|category|class/i.test(d.name))) types.comparison += 1;
      // part-whole signals
      if (descriptors.some(d => /percentage|share|portion|ratio|proportion/i.test(d.name))) types.part_whole += 2;
      // correlation signals
      if (descriptors.filter(d => d.type === "number").length >= 2) types.correlation += 1;

      const entries = Object.entries(types).sort((a, b) => b[1] - a[1]);
      const dominant = entries[0];
      const total = entries.reduce((s, e) => s + e[1], 0) || 1;
      return {
        matched: dominant[1] > 0,
        value: dominant[0],
        score: clamp(dominant[1] / total, 0, 1),
        reason: `Dominant relationship type: ${dominant[0]} (strength: ${dominant[1]}).`,
        payload: { types: Object.fromEntries(entries), dominant: dominant[0] },
      };
    },
  },

  {
    name: "visual_channel_fit",
    scope: ["dataset", "view"],
    returns: "score",
    description: "Score how well a specific view matches the dataset's encoding needs based on data types present.",
    argSchema: { view: "view_id" },
    handler(context, args) {
      const profile = context.profile || {};
      const flags = context.dataset?.flags || {};
      const descriptors = profile.descriptors || [];
      const view = args.view;
      const numericCount = descriptors.filter(d => d.type === "number").length;
      const catCount = descriptors.filter(d => d.type === "string").length;
      const hasTime = flags.has_time_dimension;
      const hasSpace = flags.has_space_dimension;
      const hasInfluence = flags.has_influence_links;
      const n = context.dataset?.record_count || 0;

      let fit = 0.3; // base fit
      const reasons = [];

      if (view === "timeline" && hasTime) { fit = 0.9; reasons.push("temporal data fits timeline"); }
      if (view === "timeline" && !hasTime) { fit = 0.05; reasons.push("no temporal dimension"); }
      if (view === "map" && hasSpace) { fit = 0.85; reasons.push("spatial data fits map"); }
      if (view === "map" && !hasSpace) { fit = 0.05; reasons.push("no spatial dimension"); }
      if (view === "flow" && hasInfluence) { fit = 0.92; reasons.push("influence links fit flow"); }
      if (view === "flow" && !hasInfluence) { fit = 0.1; reasons.push("no influence structure"); }
      if (view === "constellation" && n <= 50 && catCount >= 1) { fit = 0.8; reasons.push("small graph with categories"); }
      if (view === "constellation" && n > 200) { fit = 0.3; reasons.push("too many nodes for constellation"); }
      if (view === "matrix" && numericCount >= 2) { fit = 0.85; reasons.push("multiple metrics suit matrix"); }
      if (view === "clusters" && catCount >= 1) { fit = 0.75; reasons.push("categorical fields suit clusters"); }
      if (view === "explorer") { fit = 0.7; reasons.push("explorer always applicable"); }

      return {
        matched: fit >= 0.5,
        value: fit,
        score: fit,
        reason: reasons.join("; ") || `View ${view} has a base fit of ${fit.toFixed(2)}.`,
      };
    },
  },

  {
    name: "field_pattern",
    scope: ["dataset"],
    returns: "boolean",
    description: "Check if any field name matches a regex pattern.",
    argSchema: { pattern: "semantic_term" },
    handler(context, args) {
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
        payload: { matchedFields: matches.map(m => m.name) },
      };
    },
  },

  {
    name: "cardinality_check",
    scope: ["dataset"],
    returns: "score",
    description: "Check the cardinality (unique value count) of a dimension to decide encoding strategy.",
    argSchema: { dimension: "dimension_name", max_distinct: "numeric_threshold" },
    handler(context, args) {
      const descriptors = context.profile?.descriptors || [];
      const dimFields = descriptors.filter(d => d.dimension === args.dimension);
      const maxCard = Math.max(...dimFields.map(d => d.cardinality || 0), 0);
      const threshold = Number(args.max_distinct || 12);
      return {
        matched: maxCard <= threshold,
        value: maxCard,
        score: clamp(1 - (maxCard / threshold), 0, 1),
        reason: `${args.dimension} has max cardinality ${maxCard} (threshold: ${threshold}).`,
        payload: { cardinality: maxCard, fields: dimFields.map(d => d.name) },
      };
    },
  },

  {
    name: "dimension_count",
    scope: ["dataset"],
    returns: "score",
    description: "Count how many active dimensions of a given type exist in the data.",
    argSchema: { dimension: "dimension_name", min_count: "numeric_threshold" },
    handler(context, args) {
      const count = context.dataset?.dimension_counts?.[args.dimension] || 0;
      const min = Number(args.min_count || 1);
      return {
        matched: count >= min,
        value: count,
        score: clamp(count / Math.max(min, 1), 0, 1),
        reason: `${args.dimension} dimension has ${count} mapped field(s).`,
      };
    },
  },

  {
    name: "record_range",
    scope: ["dataset"],
    returns: "boolean",
    description: "Check if the record count falls within a range, useful for selecting appropriate density views.",
    argSchema: { min: "numeric_threshold", max: "numeric_threshold" },
    handler(context, args) {
      const n = context.dataset?.record_count || 0;
      const min = Number(args.min || 0);
      const max = Number(args.max || Infinity);
      return {
        matched: n >= min && n <= max,
        value: n,
        score: clamp(n / Math.max(max, 1), 0, 1),
        reason: `Record count ${n} is ${n >= min && n <= max ? "within" : "outside"} range [${min}, ${max}].`,
      };
    },
  },

  // --- FOUNDATION FUNCTIONS ---

  {
    name: "signal_signature",
    scope: ["dataset"],
    returns: "score",
    description: "Score signal-like characteristics by scanning field names and values for acoustic parameters (frequency, amplitude, phase, delay, decay, feedback, density).",
    argSchema: { min_signal_fields: "numeric_threshold" },
    handler(context, args) {
      const profile = context.profile || {};
      const descriptors = profile.descriptors || [];
      const fieldNames = descriptors.map(d => (d.name || "").toLowerCase());
      const signalTerms = ["frequency", "amplitude", "phase", "delay", "decay", "feedback", "density", "reverb", "signal", "attenuation", "resonance", "waveform", "pitch", "gain", "spectrum"];
      const matched = fieldNames.filter(f => signalTerms.some(t => f.includes(t)));
      const min = Number(args.min_signal_fields || 2);
      const ratio = matched.length / Math.max(fieldNames.length, 1);
      // Stability-weighted score: inspired by Atmosphere's formula
      // coherence(0.4) + spatial(0.3) + reliability(0.2) + connectivity(0.1)
      const coherence = matched.length >= min ? 1 : matched.length / min;
      const spatial = ratio;
      const reliability = matched.length >= 3 ? 0.9 : matched.length >= 1 ? 0.6 : 0;
      const connectivity = fieldNames.length > 4 ? 0.8 : 0.4;
      const score = clamp(coherence * 0.4 + spatial * 0.3 + reliability * 0.2 + connectivity * 0.1, 0, 1);
      return {
        matched: matched.length >= min,
        value: matched.length,
        score,
        reason: `Found ${matched.length} signal-related fields (${matched.join(", ") || "none"}). Stability score: ${score.toFixed(2)}.`,
        payload: { signal_fields: matched, ratio },
      };
    },
  },

  {
    name: "growth_pattern",
    scope: ["dataset"],
    returns: "score",
    description: "Detect botanical branching patterns — parent-child, root-leaf, depth, level, nested structure indicators.",
    argSchema: { min_branch_signals: "numeric_threshold" },
    handler(context, args) {
      const profile = context.profile || {};
      const descriptors = profile.descriptors || [];
      const fieldNames = descriptors.map(d => (d.name || "").toLowerCase());
      const branchTerms = ["parent", "child", "root", "leaf", "branch", "depth", "level", "nested", "trunk", "stem", "node", "ancestor", "descendant", "subtree", "hierarchy"];
      const matched = fieldNames.filter(f => branchTerms.some(t => f.includes(t)));
      const min = Number(args.min_branch_signals || 2);
      // Also check for implicit branching: if any field has values referencing other record IDs
      const ds = context.dataset || {};
      const hasInfluence = ds.flags?.has_influence_links || false;
      const implicitBranch = hasInfluence ? 1 : 0;
      const totalSignals = matched.length + implicitBranch;
      const branchingFactor = clamp(totalSignals / Math.max(min, 1), 0, 1);
      const depthSignal = fieldNames.some(f => f.includes("depth") || f.includes("level")) ? 0.3 : 0;
      const score = clamp(branchingFactor * 0.7 + depthSignal + (hasInfluence ? 0.15 : 0), 0, 1);
      return {
        matched: totalSignals >= min,
        value: totalSignals,
        score,
        reason: `Found ${totalSignals} branching signals (${matched.join(", ") || "none"}${hasInfluence ? " + influence links" : ""}). Growth score: ${score.toFixed(2)}.`,
        payload: { branch_fields: matched, has_influence: hasInfluence },
      };
    },
  },
];

export function createSafeFunctionRegistry(config) {
  const registry = new FunctionRegistry(config);
  BUILTIN_FUNCTIONS.forEach((definition) => registry.register(definition));
  return registry;
}

export function getFunctionRegistryInventory(config) {
  return createSafeFunctionRegistry(config).list();
}

function inferRuleScope(rule, config) {
  if (rule.applies_to && rule.applies_to !== "auto") return rule.applies_to;
  if (rule.function) {
    const functionScope = config.function_registry?.[rule.function]?.scope || [];
    if (functionScope.length === 1) return functionScope[0];
  }
  const facts = [...(rule.when || []), ...(rule.guards || [])].map((condition) => condition.fact || "");
  if (facts.some((fact) => fact.startsWith("relation.") || fact.startsWith("source.") || fact.startsWith("target."))) return "relation";
  if (facts.some((fact) => fact.startsWith("entity."))) return "entity";
  if (facts.some((fact) => fact.startsWith("view."))) return "view";
  return "dataset";
}

function buildRuleTrace(rule, scopeType, targetId) {
  return {
    ruleId: rule.id,
    ruleLabel: rule.label,
    scope: scopeType,
    targetId,
    status: "skipped",
    mode: rule.function ? "function" : "legacy",
    functionName: rule.function || "",
    args: clone(rule.args || {}),
    guardResult: "not-run",
    guardFailures: [],
    validationErrors: [],
    output: null,
    emittedEvidenceIds: [],
    finalImpact: {
      lenses: [],
      views: [],
      relations: [],
    },
  };
}

function evaluateCondition(condition, context, scopeType, registry) {
  if (condition.function) {
    const validation = registry.validate(condition.function, condition.args || {}, scopeType);
    if (!validation.ok) {
      return {
        passed: false,
        validationErrors: validation.errors,
        mode: "function",
        output: null,
      };
    }
    try {
      const output = registry.invoke(condition.function, context, condition.args || {});
      return {
        passed: output.matched !== false,
        validationErrors: [],
        mode: "function",
        output,
      };
    } catch (error) {
      return {
        passed: false,
        validationErrors: [error.message],
        mode: "function",
        output: null,
      };
    }
  }

  const actual = resolvePath(context, condition.fact);
  return {
    passed: compareFact(actual, condition.op, condition.value),
    validationErrors: [],
    mode: "legacy",
    output: { matched: compareFact(actual, condition.op, condition.value), value: actual },
  };
}

function evaluateGuardSet(rule, context, scopeType, registry, trace) {
  const guards = rule.guards || [];
  if (!guards.length) {
    trace.guardResult = "none";
    return { ok: true };
  }

  for (const guard of guards) {
    const result = evaluateCondition(guard, context, scopeType, registry);
    if (result.validationErrors.length) {
      trace.guardResult = "validation_error";
      trace.guardFailures.push(...result.validationErrors);
      return { ok: false, validationErrors: result.validationErrors };
    }
    if (!result.passed) {
      trace.guardResult = "blocked";
      trace.guardFailures.push(guard.function ? `Guard ${guard.function} returned false.` : `${guard.fact} did not match.`);
      return { ok: false };
    }
  }

  trace.guardResult = "passed";
  return { ok: true };
}

function deriveConfidence(rule, result, config) {
  const floor = Number(config.defaults?.evidence_confidence_floor || 0.35);
  const strategy = rule.weight_strategy || "priority";
  if (strategy === "direct_score") return clamp(Math.max(floor, Number(result.score ?? result.value ?? 0)), floor, 1);
  if (strategy === "normalized_value") return clamp(Math.max(floor, Number(result.value || 0)), floor, 1);
  if (strategy === "boolean_boost") return result.matched ? Math.max(floor, 0.7) : floor;
  return clamp(Math.max(floor, 0.4 + Math.min(0.45, rule.priority / 220)), floor, 1);
}

function applyAction(action, context, evidence, state, trace) {
  if (action.action === "boost_lens") {
    const lens = action.lens;
    const weight = Number(action.score || 0);
    if (!state.lensBuckets[lens]) {
      state.lensBuckets[lens] = { score: 0, evidenceIds: [], label: state.lensLabels[lens] || lens };
    }
    state.lensBuckets[lens].score += weight * evidence.confidence;
    state.lensBuckets[lens].evidenceIds.push(evidence.id);
    trace.finalImpact.lenses.push(lens);
    if (context.entity?.id) {
      state.entityLensScores[context.entity.id] ||= {};
      state.entityLensScores[context.entity.id][lens] = (state.entityLensScores[context.entity.id][lens] || 0) + weight * evidence.confidence;
    }
  }

  if (action.action === "prefer_view") {
    const view = action.view;
    state.viewPreferences[view] = (state.viewPreferences[view] || 0) + Number(action.score || 0) * evidence.confidence;
    trace.finalImpact.views.push(view);
  }

  if (action.action === "annotate_relation" && context.relation) {
    context.relation.tags ||= [];
    context.relation.tags.push(action.tag || "annotated");
    context.relation.evidenceIds.push(evidence.id);
    trace.finalImpact.relations.push(context.relation.id);
  }
}

function emitDiagnosticEvidence(rule, scopeType, targetId, message, state) {
  const evidence = createEvidence({
    sourceRuleId: rule.id,
    confidence: 0.4,
    scope: scopeType,
    targetId,
    affects: ["diagnostics"],
    reason: message,
    payload: { diagnostic: true },
  });
  state.evidences.push(evidence);
  state.validationReport.diagnostics.push(message);
  return evidence;
}

function applyRules(config, datasetScope, entities, relations) {
  const registry = createSafeFunctionRegistry(config);
  const entitiesById = Object.fromEntries(entities.map((entity) => [entity.id, entity]));
  const state = {
    lensBuckets: {},
    lensLabels: Object.fromEntries((config.taxonomy?.domains || []).map((domain) => [domain.id, domain.label])),
    entityLensScores: {},
    viewPreferences: {},
    evidences: [],
    ruleTraces: [],
    registryInventory: registry.list(),
    validationReport: {
      configErrors: [],
      missingFunctions: [],
      invalidArgs: [],
      skippedRules: [],
      diagnostics: [],
    },
  };

  (config.rules || []).filter((rule) => rule.enabled !== false).forEach((rule) => {
    const scopeType = inferRuleScope(rule, config);
    const items = scopeType === "entity" ? entities : scopeType === "relation" ? relations : [datasetScope];

    items.forEach((item) => {
      const targetId = scopeType === "entity" ? item.id : scopeType === "relation" ? item.id : "dataset";
      const context = createEvaluationContext(scopeType, item, datasetScope, entitiesById, config);
      const trace = buildRuleTrace(rule, scopeType, targetId);
      const guardResult = evaluateGuardSet(rule, context, scopeType, registry, trace);

      if (!guardResult.ok) {
        trace.status = trace.guardResult === "validation_error" ? "validation_error" : "guard_blocked";
        if (guardResult.validationErrors?.length) {
          state.validationReport.invalidArgs.push(...guardResult.validationErrors);
          if (config.diagnostics?.fail_closed !== false) {
            const evidence = emitDiagnosticEvidence(rule, scopeType, targetId, guardResult.validationErrors.join(" "), state);
            trace.emittedEvidenceIds.push(evidence.id);
          }
        } else {
          state.validationReport.skippedRules.push(`${rule.id}:${targetId}`);
        }
        state.ruleTraces.push(trace);
        return;
      }

      let matched = false;
      let output = null;

      if (rule.function) {
        const validation = registry.validate(rule.function, rule.args || {}, scopeType);
        if (!validation.ok) {
          trace.status = "validation_error";
          trace.validationErrors.push(...validation.errors);
          state.validationReport.invalidArgs.push(...validation.errors);
          if (validation.errors.some((error) => error.includes("no runtime handler") || error.includes("not exposed"))) {
            state.validationReport.missingFunctions.push(rule.function);
          }
          if (config.diagnostics?.fail_closed !== false) {
            const evidence = emitDiagnosticEvidence(rule, scopeType, targetId, validation.errors.join(" "), state);
            trace.emittedEvidenceIds.push(evidence.id);
          }
          state.ruleTraces.push(trace);
          return;
        }

        try {
          output = registry.invoke(rule.function, context, rule.args || {});
          trace.output = output;
          matched = output.matched !== false;
        } catch (error) {
          trace.status = "execution_error";
          trace.validationErrors.push(error.message);
          state.validationReport.diagnostics.push(error.message);
          if (config.diagnostics?.fail_closed !== false) {
            const evidence = emitDiagnosticEvidence(rule, scopeType, targetId, error.message, state);
            trace.emittedEvidenceIds.push(evidence.id);
          }
          state.ruleTraces.push(trace);
          return;
        }
      } else {
        matched = (rule.when || []).every((condition) => {
          const actual = resolvePath(context, condition.fact);
          return compareFact(actual, condition.op, condition.value);
        });
        trace.output = { matched };
      }

      if (!matched) {
        trace.status = "skipped";
        state.validationReport.skippedRules.push(`${rule.id}:${targetId}`);
        state.ruleTraces.push(trace);
        return;
      }

      const evidence = createEvidence({
        sourceRuleId: rule.id,
        confidence: deriveConfidence(rule, output || { matched: true }, config),
        scope: scopeType,
        targetId,
        affects: rule.affects || [],
        reason: output?.reason || rule.because || rule.label,
        payload: {
          ruleLabel: rule.label,
          functionName: rule.function || null,
          args: clone(rule.args || {}),
          returns: rule.returns || null,
          result: output ? clone(output) : null,
        },
      });
      state.evidences.push(evidence);
      trace.status = "fired";
      trace.emittedEvidenceIds.push(evidence.id);
      (rule.derive || []).forEach((action) => applyAction(action, context, evidence, state, trace));
      state.ruleTraces.push(trace);
    });
  });

  return state;
}

function summarizeLenses(config, lensBuckets, presetId) {
  const preset = config.presets?.[presetId] || {};
  const weights = preset.lens_weights || {};
  const scored = Object.entries(lensBuckets)
    .map(([id, bucket]) => ({
      id,
      label: bucket.label,
      rawScore: bucket.score,
      score: bucket.score * (weights[id] || 1),
      evidenceIds: unique(bucket.evidenceIds),
    }))
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    return [{ id: "general", label: "General", score: 1, rawScore: 1, role: "primary", evidenceIds: [] }];
  }

  const primary = scored[0];
  const threshold = config.defaults?.secondary_lens_threshold || 0.42;
  const limit = config.defaults?.top_secondary_limit || 3;
  return scored
    .filter((lens, index) => index === 0 || lens.score >= primary.score * threshold)
    .slice(0, 1 + limit)
    .map((lens, index) => ({
      ...lens,
      score: Number((lens.score / primary.score).toFixed(3)),
      role: index === 0 ? "primary" : "secondary",
    }));
}

export function computeClusters(context, dimension) {
  const groups = {};
  context.entities.forEach((entity) => {
    let key = "Other";
    if (dimension === "time") key = bucketYear(entity.dimensions.time) || "Unknown";
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

export function validateConfigWithRegistry(config) {
  const registry = createSafeFunctionRegistry(config);
  const report = {
    configErrors: [],
    missingFunctions: [],
    invalidArgs: [],
    skippedRules: [],
    diagnostics: [],
    registryInventory: registry.list(),
  };

  (config.rules || []).filter((rule) => rule.enabled !== false && rule.function).forEach((rule) => {
    const scopeType = inferRuleScope(rule, config);
    const validation = registry.validate(rule.function, rule.args || {}, scopeType);
    if (!validation.ok) {
      if (validation.errors.some((error) => error.includes("no runtime handler") || error.includes("not exposed"))) {
        report.missingFunctions.push(rule.function);
      }
      report.invalidArgs.push(...validation.errors.map((error) => `${rule.id}: ${error}`));
    }
  });

  return report;
}

export function runContextPipeline(rawData, fileType, config, options = {}) {
  const records = normalizeRecords(rawData, fileType);
  if (!records.length) return null;

  const profile = buildDataProfile(records, config);
  const entities = buildEntities(records, profile, config);
  const base = buildBaseRelations(entities);
  const datasetScope = buildDatasetScope(records, profile, entities, base.relations, config);
  const ruleState = applyRules(config, datasetScope, entities, base.relations);
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
  };
}

export function buildSemanticHints(config) {
  const taxonomyDomains = config.taxonomy?.domains || [];
  return taxonomyDomains.map((domain) => ({
    id: domain.id,
    label: domain.label,
    sampleTerms: (domain.keywords || []).slice(0, 4),
  }));
}

function normalizeQuery(query) {
  return String(query || "").trim().toLowerCase();
}

function queryHasAlias(query, aliases) {
  return (aliases || []).some((alias) => {
    const normalized = String(alias || "").toLowerCase();
    if (!normalized) return false;
    if (normalized.includes(" ")) return query.includes(normalized);
    return includesWord(query, normalized);
  });
}

export function parseQueryIntent(query, config) {
  const normalized = normalizeQuery(query);
  const viewAliases = config.semantic_packs?.query_aliases?.views || {};

  if (!normalized) return { kind: "none" };
  if (/best view|best views|recommended view/.test(normalized)) return { kind: "show_best_views" };
  if (/explain relation between/.test(normalized)) {
    const names = normalized.replace("explain relation between", "").split(" and ").map((value) => value.trim()).filter(Boolean);
    return { kind: "explain_relation", names };
  }
  if (/compare context|compare lens/.test(normalized)) return { kind: "compare_contexts" };
  if (/trace rules|show trace|logic trace/.test(normalized)) return { kind: "show_trace" };
  if (/cluster by|group by/.test(normalized)) {
    if (queryHasAlias(normalized, config.semantic_packs?.query_aliases?.space)) return { kind: "cluster_by", dimension: "space" };
    if (queryHasAlias(normalized, config.semantic_packs?.query_aliases?.time)) return { kind: "cluster_by", dimension: "time" };
    if (normalized.includes("type")) return { kind: "cluster_by", dimension: "type" };
    return { kind: "cluster_by", dimension: "domain" };
  }

  for (const [viewId, aliases] of Object.entries(viewAliases)) {
    if (queryHasAlias(normalized, aliases)) return { kind: "show_view", viewId };
  }

  return { kind: "focus_entity", text: normalized };
}

function pickDetectedLens(text, config) {
  const lower = text.toLowerCase();
  const matched = (config.taxonomy?.domains || []).find((domain) => {
    return includesWord(lower, domain.id) || (domain.keywords || []).some((keyword) => includesWord(lower, keyword));
  });
  return matched?.id || null;
}

function pickDetectedView(text, config) {
  const lower = text.toLowerCase();
  const entries = Object.entries(config.semantic_packs?.query_aliases?.views || {});
  const match = entries.find(([, aliases]) => queryHasAlias(lower, aliases));
  return match?.[0] || null;
}

function pickTone(text, config) {
  return Object.keys(config.semantic_packs?.tone_cues || {}).find((tone) => includesWord(text.toLowerCase(), tone)) || null;
}

export function compileRuleFromConversation(input, config) {
  const text = String(input || "").trim();
  if (!text) return null;
  const lower = text.toLowerCase();

  const affects = new Set();
  const derive = [];
  let appliesTo = "auto";
  let functionName = "";
  let args = {};
  const guards = [];
  let returns = "boolean";
  let weightStrategy = "priority";

  if (/same place|same region|same country|same location/.test(lower)) {
    appliesTo = "relation";
    functionName = "shared_dimension";
    args = { dimension: "space" };
    affects.add("relation");
  } else if (/same time|same era|same decade/.test(lower)) {
    appliesTo = "relation";
    functionName = "temporal_distance";
    args = { max_gap: 10 };
    returns = "score";
    weightStrategy = "direct_score";
    affects.add("relation");
  } else if (/influence|inspired|based on|derived/.test(lower)) {
    appliesTo = "relation";
    functionName = "influence_link";
    args = {};
    affects.add("view");
  } else if (/mood|tone|sentiment|emotion/.test(lower)) {
    appliesTo = "entity";
    functionName = "tone_score";
    args = { path: "entity.tone_hits", tone: pickTone(text, config) || "anxious", min_score: 1 };
    returns = "score";
    weightStrategy = "direct_score";
    affects.add("context_lens");
  } else if (/keyword|domain|field|subject/.test(lower)) {
    const lens = pickDetectedLens(text, config) || "analytics";
    appliesTo = "entity";
    functionName = "taxonomy_score";
    args = { path: "entity.domain_keyword_hits", domain: lens, min_score: 1 };
    returns = "score";
    weightStrategy = "direct_score";
    affects.add("context_lens");
  }

  if (/place|region|country|geograph|location|map/.test(lower)) {
    derive.push({ action: "boost_lens", lens: "geography", score: 0.7 });
    derive.push({ action: "prefer_view", view: "map", score: 0.55 });
    guards.push({ function: "equals_value", args: { path: "dataset.flags.has_space_dimension", value: true } });
    affects.add("context_lens");
    affects.add("view");
  }

  if (/time|era|year|history|timeline|century/.test(lower)) {
    derive.push({ action: "boost_lens", lens: "history", score: 0.65 });
    derive.push({ action: "prefer_view", view: "timeline", score: 0.45 });
    guards.push({ function: "equals_value", args: { path: "dataset.flags.has_time_dimension", value: true } });
    affects.add("context_lens");
    affects.add("view");
  }

  const lens = pickDetectedLens(text, config);
  if (lens) {
    derive.push({ action: "boost_lens", lens, score: 0.8 });
    affects.add("context_lens");
  }

  const view = pickDetectedView(text, config);
  if (view) {
    derive.push({ action: "prefer_view", view, score: 0.6 });
    affects.add("view");
  }

  if (!derive.length && appliesTo === "relation") {
    derive.push({ action: "annotate_relation", tag: slugify(text).slice(0, 20) });
    affects.add("relation");
  }

  const legacyWhen = !functionName ? [{ fact: "dataset.record_count", op: ">", value: 0 }] : [];
  const rule = {
    id: `custom-${slugify(text).slice(0, 24)}`,
    label: text.length > 72 ? `${text.slice(0, 69)}...` : text,
    applies_to: appliesTo,
    enabled: true,
    priority: 72,
    when: legacyWhen,
    guards,
    function: functionName,
    args,
    returns,
    weight_strategy: weightStrategy,
    derive,
    affects: [...affects],
    because: text,
    promotion: "experimental",
  };

  return {
    rule,
    confidence: functionName || derive.length ? 0.84 : 0.38,
    ambiguous: !functionName && derive.length === 0,
  };
}
