/**
 * Fuzzy Dimension Similarity
 *
 * Replaces exact string equality with scored similarity for relation detection.
 * All functions are pure, browser-compatible, zero dependencies.
 */

/**
 * Normalized Levenshtein distance.
 * Returns 1.0 for identical strings, 0.0 for completely different.
 */
export function computeStringSimilarity(a, b) {
  const sa = String(a || "").toLowerCase().trim();
  const sb = String(b || "").toLowerCase().trim();
  if (sa === sb) return 1;
  if (!sa.length || !sb.length) return 0;

  const lenA = sa.length;
  const lenB = sb.length;
  const maxLen = Math.max(lenA, lenB);

  // Single-row Levenshtein
  let prev = new Array(lenB + 1);
  let curr = new Array(lenB + 1);
  for (let j = 0; j <= lenB; j++) prev[j] = j;

  for (let i = 1; i <= lenA; i++) {
    curr[0] = i;
    for (let j = 1; j <= lenB; j++) {
      const cost = sa[i - 1] === sb[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,       // deletion
        curr[j - 1] + 1,   // insertion
        prev[j - 1] + cost  // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  const distance = prev[lenB];
  return 1 - distance / maxLen;
}

/**
 * Jaccard index over word tokens.
 * Returns 1.0 for identical token sets, 0.0 for disjoint.
 */
export function computeTokenOverlap(a, b) {
  const tokenize = (s) =>
    String(s || "")
      .toLowerCase()
      .split(/[\s,;:_\-/]+/)
      .filter(Boolean);

  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));

  if (!tokensA.size && !tokensB.size) return 1;
  if (!tokensA.size || !tokensB.size) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }

  const union = tokensA.size + tokensB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Common aliases for geographic and domain terms.
 * Kept minimal — extend via config.semantic_packs.synonym_groups.
 */
const SPACE_ALIASES = {
  usa: ["united states", "us", "america", "united states of america"],
  uk: ["united kingdom", "britain", "great britain", "england"],
  uae: ["united arab emirates"],
};

/**
 * Check if two strings are aliases of each other.
 */
function areAliases(a, b, aliasTable) {
  const la = String(a || "").toLowerCase().trim();
  const lb = String(b || "").toLowerCase().trim();
  if (la === lb) return true;

  for (const [key, aliases] of Object.entries(aliasTable)) {
    const group = [key, ...aliases];
    if (group.includes(la) && group.includes(lb)) return true;
  }
  return false;
}

/**
 * Expand alias table with config-provided synonym groups.
 */
function mergeAliases(base, config) {
  const synonymGroups = config?.semantic_packs?.synonym_groups || {};
  const merged = { ...base };
  for (const [key, values] of Object.entries(synonymGroups)) {
    if (merged[key]) {
      const existing = new Set(merged[key]);
      (values || []).forEach((v) => existing.add(String(v).toLowerCase()));
      merged[key] = [...existing];
    } else {
      merged[key] = (values || []).map((v) => String(v).toLowerCase());
    }
  }
  return merged;
}

/**
 * Compute similarity between two dimension values.
 *
 * @param {string|number} a - First dimension value
 * @param {string|number} b - Second dimension value
 * @param {string} dimension - "space" | "domain" | "time"
 * @param {object} [config] - Optional master config for semantic packs
 * @returns {{ score: number, method: string, matched: boolean }}
 */
export function computeDimensionSimilarity(a, b, dimension, config) {
  if (a == null || b == null) {
    return { score: 0, method: "null", matched: false };
  }

  if (dimension === "time") {
    const yearA = Number(a);
    const yearB = Number(b);
    if (!Number.isFinite(yearA) || !Number.isFinite(yearB)) {
      return { score: 0, method: "invalid-time", matched: false };
    }
    const gap = Math.abs(yearA - yearB);
    // Score decays linearly over 50 years, 0 at 100+
    const score = Math.max(0, 1 - gap / 100);
    return {
      score,
      method: "temporal-distance",
      matched: score >= 0.5, // within ~50 years
      gap,
    };
  }

  const sa = String(a).toLowerCase().trim();
  const sb = String(b).toLowerCase().trim();

  if (sa === sb) {
    return { score: 1, method: "exact", matched: true };
  }

  if (dimension === "space") {
    const aliases = mergeAliases(SPACE_ALIASES, config);
    if (areAliases(sa, sb, aliases)) {
      return { score: 0.95, method: "alias", matched: true };
    }
    // Combine token overlap and string similarity
    const tokenScore = computeTokenOverlap(sa, sb);
    const stringScore = computeStringSimilarity(sa, sb);
    const score = Math.max(tokenScore, stringScore * 0.9);
    return { score, method: "fuzzy-space", matched: score >= 0.6 };
  }

  if (dimension === "domain") {
    // For domains, token overlap is more meaningful
    const tokenScore = computeTokenOverlap(sa, sb);
    const stringScore = computeStringSimilarity(sa, sb);
    // Weight tokens higher for domain matching
    const score = tokenScore * 0.7 + stringScore * 0.3;
    return { score, method: "fuzzy-domain", matched: score >= 0.5 };
  }

  // Fallback for any other dimension
  const score = computeStringSimilarity(sa, sb);
  return { score, method: "string-similarity", matched: score >= 0.6 };
}
