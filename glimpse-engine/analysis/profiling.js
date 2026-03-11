/**
 * Data profiling utilities for the Glimpse engine.
 * Analyzes records to build column descriptors and detect dimensions.
 */

import {
  createSemanticIndex,
  guessPrimitiveType,
  includesWord,
  normalizeScalar,
  unique,
} from "../utils/utils.js";

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

export function scoreTaxonomy(text, config) {
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

export function detectTones(text, config) {
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

export { chooseEntityColumn, chooseTypeColumn, inferEntityType };

