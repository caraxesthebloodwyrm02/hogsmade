/**
 * Query parsing and rule compilation for the Glimpse engine.
 * Transforms natural language queries into structured intents.
 */

import {
  includesWord,
  slugify,
} from "../utils/utils.js";

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
