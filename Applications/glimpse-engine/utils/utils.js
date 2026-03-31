/**
 * Core utilities for the Glimpse engine.
 * Pure functions with no external dependencies.
 */

export function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "item";
}

export function normalizeName(name) {
  return String(name || "").toLowerCase().trim().replace(/\s+/g, " ");
}

export function findBestEntityMatch(name, entities, byName) {
  const normalized = normalizeName(name);
  if (!normalized) return null;
  
  // Exact match first
  const exact = byName.get(normalized);
  if (exact) return exact;
  
  // Try slug match
  const slug = slugify(name);
  for (const entity of entities) {
    if (slugify(entity.name) === slug) return entity;
  }
  
  // Partial match: input contains entity name
  for (const entity of entities) {
    const entityNorm = normalizeName(entity.name);
    if (normalized.includes(entityNorm)) return entity;
  }
  
  // Partial match: entity name contains input
  for (const entity of entities) {
    const entityNorm = normalizeName(entity.name);
    if (entityNorm.includes(normalized)) return entity;
  }
  
  return null;
}

export function escRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function unique(values) {
  return [...new Set(values.filter((value) => value !== "" && value != null))];
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function flattenRecord(record) {
  return Object.entries(record || {}).map(([key, value]) => `${key}: ${value}`).join(" ");
}

export function guessPrimitiveType(values) {
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

export function normalizeScalar(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return "";
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    return trimmed;
  }
  return value;
}

export function includesWord(text, term) {
  return new RegExp(`\\b${escRegExp(term)}\\b`, "i").test(text);
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function resolvePath(scope, path) {
  const parts = String(path || "").split(".").filter(Boolean);
  let current = scope;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

export function compareFact(actual, op, expected) {
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

export function bucketYear(value) {
  if (typeof value !== "number") return null;
  return `${Math.floor(value / 10) * 10}s`;
}

export function createSemanticIndex(config) {
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
