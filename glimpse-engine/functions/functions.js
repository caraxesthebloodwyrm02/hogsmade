/**
 * Function registry and builtin functions for the Glimpse engine.
 * Provides the core function evaluation infrastructure for rules.
 */

import {
  clamp,
  compareFact,
  includesWord,
  resolvePath,
} from "../utils/utils.js";

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
  if (type === "string" && typeof value !== "string")
    errors.push(`${label} must be a string.`);
  if (type === "number" && !Number.isFinite(Number(value)))
    errors.push(`${label} must be a number.`);
  if (type === "boolean" && typeof value !== "boolean")
    errors.push(`${label} must be a boolean.`);

  if (argType.values && !argType.values.includes(value)) {
    errors.push(`${label} must be one of: ${argType.values.join(", ")}.`);
  }

  if (
    argType.source === "taxonomy.domains" &&
    !listAllowedDomains(config).includes(value)
  ) {
    errors.push(`${label} must reference a known taxonomy domain.`);
  }
  if (
    argType.source === "view_specs" &&
    !listAllowedViews(config).includes(value)
  ) {
    errors.push(`${label} must reference a known view id.`);
  }

  if (
    type === "object" &&
    argType.shape &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    Object.entries(argType.shape).forEach(([key, nestedType]) => {
      validateArgValue(
        nestedType,
        value[key],
        config,
        `${label}.${key}`,
      ).forEach((error) => errors.push(error));
    });
  }

  if (type === "array" && argType.items) {
    if (!Array.isArray(value)) {
      errors.push(`${label} must be an array.`);
    } else {
      value.forEach((item, index) => {
        validateArgValue(
          argType.items,
          item,
          config,
          `${label}[${index}]`,
        ).forEach((error) => errors.push(error));
      });
    }
  }

  return errors;
}

export function createEvaluationContext(
  scopeType,
  item,
  datasetScope,
  entitiesById,
  config,
) {
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
        domain_keyword_hits:
          item.domainKeywordHits || item.domain_keyword_hits || {},
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
  Object.entries(config.semantic_packs?.synonym_groups || {}).forEach(
    ([group, values]) => {
      const all = [group, ...(values || [])].map((value) =>
        String(value).toLowerCase(),
      );
      if (all.includes(lower)) all.forEach((value) => terms.add(value));
    },
  );
  Object.entries(config.semantic_packs?.phonetics || {}).forEach(
    ([root, values]) => {
      const all = [root, ...(values || [])].map((value) =>
        String(value).toLowerCase(),
      );
      if (all.includes(lower)) all.forEach((value) => terms.add(value));
    },
  );
  Object.entries(config.semantic_packs?.literary_variants || {}).forEach(
    ([root, values]) => {
      const all = [root, ...(values || [])].map((value) =>
        String(value).toLowerCase(),
      );
      if (all.includes(lower)) all.forEach((value) => terms.add(value));
    },
  );
  return [...terms];
}

function normalizeFunctionResult(result) {
  if (result && typeof result === "object" && !Array.isArray(result))
    return result;
  return {
    matched: Boolean(result),
    value: result,
    score: Boolean(result) ? 1 : 0,
  };
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
      return {
        ok: false,
        errors: [`Function "${name}" is not exposed in function_registry.`],
      };
    }

    const definition = this.get(name);
    if (!definition) {
      return {
        ok: false,
        errors: [
          `Function "${name}" is listed in YAML but has no runtime handler.`,
        ],
      };
    }

    const allowedScopes = metadata.scope || definition.scope || [];
    const scopeErrors =
      allowedScopes.length && !allowedScopes.includes(scopeType)
        ? [`Function "${name}" does not allow the "${scopeType}" scope.`]
        : [];

    const schema = metadata.args || definition.argSchema || {};
    const argErrors = [];
    Object.entries(schema).forEach(([key, typeName]) => {
      validateArgValue(
        typeName,
        args?.[key],
        this.config,
        `${name}.${key}`,
      ).forEach((error) => argErrors.push(error));
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
    argSchema: {
      path: "field_selector",
      op: "comparison_operator",
      value: "numeric_threshold",
    },
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
    argSchema: {
      path: "field_selector",
      domain: "lens_id",
      min_score: "numeric_threshold",
    },
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
    argSchema: {
      path: "field_selector",
      tone: "tone_name",
      min_score: "numeric_threshold",
    },
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
    description:
      "Measures whether expanded semantic terms appear in a target text.",
    argSchema: {
      path: "field_selector",
      term: "semantic_term",
      min_matches: "numeric_threshold",
    },
    handler(context, args, config) {
      const text = String(resolvePath(context, args.path) || "").toLowerCase();
      const terms = expandSemanticTerms(args.term, config);
      const hits = terms.filter((term) => includesWord(text, term)).length;
      return {
        matched: hits >= Number(args.min_matches || 1),
        value: hits,
        score: clamp(hits / Math.max(Number(args.min_matches) || 1, 1), 0, 1),
        reason: `${hits} semantic matches found for ${args.term}.`,
        payload: {
          matchedTerms: terms.filter((term) => includesWord(text, term)),
        },
      };
    },
  },
  {
    name: "shared_dimension",
    scope: ["relation"],
    returns: "boolean",
    description:
      "Checks whether the relation endpoints share a dimension value.",
    argSchema: { dimension: "dimension_name" },
    handler(context, args) {
      const left = context.source?.dimensions?.[args.dimension];
      const right = context.target?.dimensions?.[args.dimension];
      const matched =
        left != null &&
        right != null &&
        String(left).toLowerCase() === String(right).toLowerCase();
      return {
        matched,
        value: left,
        reason: matched
          ? `${args.dimension} matches across the relation.`
          : `${args.dimension} does not match across the relation.`,
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
      const gap =
        Number.isFinite(left) && Number.isFinite(right)
          ? Math.abs(left - right)
          : Number.POSITIVE_INFINITY;
      return {
        matched: gap <= Number(args.max_gap || 0),
        value: gap,
        score: Number.isFinite(gap)
          ? clamp(1 - gap / Math.max(Number(args.max_gap) || 1, 1), 0, 1)
          : 0,
        reason: Number.isFinite(gap)
          ? `Temporal gap is ${gap} years.`
          : "Temporal gap is unavailable.",
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
      const matched = context.relation
        ? context.relation.type === "influenced"
        : Boolean(context.dataset?.flags?.has_influence_links);
      return {
        matched,
        value: matched,
        reason: matched
          ? "Influence structure is present."
          : "No influence structure was found.",
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
        const raw = item.path
          ? Number(resolvePath(context, item.path) || 0)
          : Number(item.value || 0);
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
    argSchema: {
      preset: "preset_id",
      target_type: "bias_target_type",
      target: "bias_target_id",
    },
    handler(context, args, config) {
      const preset = config.presets?.[args.preset] || {};
      const source =
        args.target_type === "view"
          ? preset.view_bias || {}
          : preset.lens_weights || {};
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
  // Data Shape Analysis Functions
  {
    name: "data_shape",
    scope: ["dataset"],
    returns: "score",
    description:
      "Classify the dataset shape: how many records, dimensions, categorical vs quantitative ratio.",
    argSchema: { min_records: "numeric_threshold" },
    handler(context, args) {
      const ds = context.dataset || {};
      const profile = context.profile || {};
      const n = ds.record_count || 0;
      const descriptors = profile.descriptors || [];
      const numericCount = descriptors.filter(
        (d) => d.type === "number",
      ).length;
      const stringCount = descriptors.filter((d) => d.type === "string").length;
      const totalDims = descriptors.length || 1;
      const quantRatio = numericCount / totalDims;
      const catRatio = stringCount / totalDims;
      const complexity = clamp(
        Math.log2(n + 1) / 10 + totalDims / 20 + quantRatio * 0.3,
        0,
        1,
      );
      return {
        matched: n >= Number(args.min_records || 1),
        value: n,
        score: complexity,
        reason: `Dataset has ${n} records, ${totalDims} fields (${numericCount} numeric, ${stringCount} categorical). Complexity: ${complexity.toFixed(2)}.`,
        payload: {
          recordCount: n,
          dimensions: totalDims,
          numericCount,
          stringCount,
          quantRatio,
          catRatio,
        },
      };
    },
  },
  {
    name: "density_score",
    scope: ["dataset"],
    returns: "score",
    description:
      "Measure information density: records * dimensions ratio to determine dense vs sparse view preference.",
    argSchema: { dense_threshold: "numeric_threshold" },
    handler(context, args) {
      const ds = context.dataset || {};
      const profile = context.profile || {};
      const n = ds.record_count || 0;
      const dims = (profile.descriptors || []).length || 1;
      const density = (n * dims) / 1000;
      const isDense = density >= Number(args.dense_threshold || 1);
      return {
        matched: isDense,
        value: density,
        score: clamp(
          density / Math.max(Number(args.dense_threshold) || 1, 1),
          0,
          1,
        ),
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
    description:
      "Detect the dominant relationship type: hierarchy, network, sequence, comparison, or part-whole.",
    argSchema: {},
    handler(context) {
      const ds = context.dataset || {};
      const profile = context.profile || {};
      const flags = ds.flags || {};
      const descriptors = profile.descriptors || [];
      const types = {
        hierarchy: 0,
        network: 0,
        sequence: 0,
        comparison: 0,
        part_whole: 0,
        correlation: 0,
      };

      if (
        descriptors.some((d) => /parent|child|level|depth|nested/i.test(d.name))
      )
        types.hierarchy += 2;
      if (flags.has_influence_links) types.network += 2;
      if (descriptors.some((d) => /source|target|from|to|edge/i.test(d.name)))
        types.network += 1;
      if (flags.has_time_dimension) types.sequence += 2;
      if (
        descriptors.some((d) => /step|phase|stage|order|sequence/i.test(d.name))
      )
        types.sequence += 1;
      if (descriptors.filter((d) => d.type === "number").length >= 2)
        types.comparison += 1;
      if (descriptors.some((d) => /group|category|class/i.test(d.name)))
        types.comparison += 1;
      if (
        descriptors.some((d) =>
          /percentage|share|portion|ratio|proportion/i.test(d.name),
        )
      )
        types.part_whole += 2;
      if (descriptors.filter((d) => d.type === "number").length >= 2)
        types.correlation += 1;

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
    description:
      "Score how well a specific view matches the dataset's encoding needs based on data types present.",
    argSchema: { view: "view_id" },
    handler(context, args) {
      const profile = context.profile || {};
      const flags = context.dataset?.flags || {};
      const descriptors = profile.descriptors || [];
      const view = args.view;
      const numericCount = descriptors.filter(
        (d) => d.type === "number",
      ).length;
      const catCount = descriptors.filter((d) => d.type === "string").length;
      const hasTime = flags.has_time_dimension;
      const hasSpace = flags.has_space_dimension;
      const hasInfluence = flags.has_influence_links;
      const n = context.dataset?.record_count || 0;

      let fit = 0.3;
      const reasons = [];

      if (view === "timeline" && hasTime) {
        fit = 0.9;
        reasons.push("temporal data fits timeline");
      }
      if (view === "timeline" && !hasTime) {
        fit = 0.05;
        reasons.push("no temporal dimension");
      }
      if (view === "map" && hasSpace) {
        fit = 0.85;
        reasons.push("spatial data fits map");
      }
      if (view === "map" && !hasSpace) {
        fit = 0.05;
        reasons.push("no spatial dimension");
      }
      if (view === "flow" && hasInfluence) {
        fit = 0.92;
        reasons.push("influence links fit flow");
      }
      if (view === "flow" && !hasInfluence) {
        fit = 0.1;
        reasons.push("no influence structure");
      }
      if (view === "constellation" && n <= 50 && catCount >= 1) {
        fit = 0.8;
        reasons.push("small graph with categories");
      }
      if (view === "constellation" && n > 200) {
        fit = 0.3;
        reasons.push("too many nodes for constellation");
      }
      if (view === "matrix" && numericCount >= 2) {
        fit = 0.85;
        reasons.push("multiple metrics suit matrix");
      }
      if (view === "clusters" && catCount >= 1) {
        fit = 0.75;
        reasons.push("categorical fields suit clusters");
      }
      if (view === "explorer") {
        fit = 0.7;
        reasons.push("explorer always applicable");
      }

      return {
        matched: fit >= 0.5,
        value: fit,
        score: fit,
        reason:
          reasons.join("; ") ||
          `View ${view} has a base fit of ${fit.toFixed(2)}.`,
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
      const matches = descriptors.filter((d) => pattern.test(d.name));
      return {
        matched: matches.length > 0,
        value: matches.length,
        score: clamp(matches.length / Math.max(descriptors.length, 1), 0, 1),
        reason: matches.length
          ? `${matches.length} field(s) match pattern /${args.pattern}/: ${matches.map((m) => m.name).join(", ")}.`
          : `No fields match pattern /${args.pattern}/.`,
        payload: { matchedFields: matches.map((m) => m.name) },
      };
    },
  },
  {
    name: "cardinality_check",
    scope: ["dataset"],
    returns: "score",
    description:
      "Check the cardinality (unique value count) of a dimension to decide encoding strategy.",
    argSchema: {
      dimension: "dimension_name",
      max_distinct: "numeric_threshold",
    },
    handler(context, args) {
      const descriptors = context.profile?.descriptors || [];
      const dimFields = descriptors.filter(
        (d) => d.dimension === args.dimension,
      );
      const maxCard = Math.max(...dimFields.map((d) => d.cardinality || 0), 0);
      const threshold = Number(args.max_distinct || 12);
      return {
        matched: maxCard <= threshold,
        value: maxCard,
        score: clamp(1 - maxCard / threshold, 0, 1),
        reason: `${args.dimension} has max cardinality ${maxCard} (threshold: ${threshold}).`,
        payload: { cardinality: maxCard, fields: dimFields.map((d) => d.name) },
      };
    },
  },
  {
    name: "dimension_count",
    scope: ["dataset"],
    returns: "score",
    description:
      "Count how many active dimensions of a given type exist in the data.",
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
    description:
      "Check if the record count falls within a range, useful for selecting appropriate density views.",
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
  // Foundation Functions
  {
    name: "signal_signature",
    scope: ["dataset"],
    returns: "score",
    description:
      "Score signal-like characteristics by scanning field names and values for acoustic parameters.",
    argSchema: { min_signal_fields: "numeric_threshold" },
    handler(context, args) {
      const profile = context.profile || {};
      const descriptors = profile.descriptors || [];
      const fieldNames = descriptors.map((d) => (d.name || "").toLowerCase());
      const signalTerms = [
        "frequency",
        "amplitude",
        "phase",
        "delay",
        "decay",
        "feedback",
        "density",
        "reverb",
        "signal",
        "attenuation",
        "resonance",
        "waveform",
        "pitch",
        "gain",
        "spectrum",
      ];
      const matched = fieldNames.filter((f) =>
        signalTerms.some((t) => f.includes(t)),
      );
      const min = Number(args.min_signal_fields || 2);
      const ratio = matched.length / Math.max(fieldNames.length, 1);
      const coherence = matched.length >= min ? 1 : matched.length / min;
      const spatial = ratio;
      const reliability =
        matched.length >= 3 ? 0.9 : matched.length >= 1 ? 0.6 : 0;
      const connectivity = fieldNames.length > 4 ? 0.8 : 0.4;
      const score = clamp(
        coherence * 0.4 +
        spatial * 0.3 +
        reliability * 0.2 +
        connectivity * 0.1,
        0,
        1,
      );
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
    description:
      "Detect botanical branching patterns — parent-child, root-leaf, depth, level, nested structure indicators.",
    argSchema: { min_branch_signals: "numeric_threshold" },
    handler(context, args) {
      const profile = context.profile || {};
      const descriptors = profile.descriptors || [];
      const fieldNames = descriptors.map((d) => (d.name || "").toLowerCase());
      const branchTerms = [
        "parent",
        "child",
        "root",
        "leaf",
        "branch",
        "depth",
        "level",
        "nested",
        "trunk",
        "stem",
        "node",
        "ancestor",
        "descendant",
        "subtree",
        "hierarchy",
      ];
      const matched = fieldNames.filter((f) =>
        branchTerms.some((t) => f.includes(t)),
      );
      const min = Number(args.min_branch_signals || 2);
      const ds = context.dataset || {};
      const hasInfluence = ds.flags?.has_influence_links || false;
      const implicitBranch = hasInfluence ? 1 : 0;
      const totalSignals = matched.length + implicitBranch;
      const branchingFactor = clamp(totalSignals / Math.max(min, 1), 0, 1);
      const depthSignal = fieldNames.some(
        (f) => f.includes("depth") || f.includes("level"),
      )
        ? 0.3
        : 0;
      const score = clamp(
        branchingFactor * 0.7 + depthSignal + (hasInfluence ? 0.15 : 0),
        0,
        1,
      );
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
