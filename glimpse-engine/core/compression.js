/**
 * Insight Compression Engine
 *
 * Distills raw insights into high-density invariant principles.
 * Quality formula: statements that satisfy the most domains with
 * the fewest tokens. Like fundamental laws or proverbs — maximum
 * explanatory power per unit of expression.
 *
 * Three criteria:
 * 1. TOKEN_ECONOMY — minimum tokens to express the insight
 * 2. DOMAIN_COVERAGE — domains/scenarios the statement validates across
 * 3. INVARIANCE — stability of truth under varied constraints
 */

/**
 * Simple token counter — splits on whitespace and punctuation.
 * Not a true LLM tokenizer, but sufficient for relative comparison.
 */
function countTokens(text) {
  if (!text) return 0;
  return String(text)
    .split(/[\s,;:.\-!?()[\]{}]+/)
    .filter(Boolean).length;
}

/**
 * Extract domain tags from evidence payloads and reasons.
 */
function extractDomains(evidences, lenses) {
  const domains = new Set();
  for (const lens of lenses) {
    if (lens.id) domains.add(lens.id);
    if (lens.label) domains.add(lens.label.toLowerCase());
  }
  for (const ev of evidences) {
    if (ev.payload?.lens) domains.add(ev.payload.lens);
    if (ev.payload?.relationType) domains.add(ev.payload.relationType);
  }
  return [...domains];
}

/**
 * Check how many domains a statement's evidence spans.
 */
function computeCoverage(evidenceIds, allEvidences, availableDomains) {
  const coveredDomains = new Set();
  const evidenceMap = new Map(allEvidences.map((e) => [e.id, e]));

  for (const id of evidenceIds) {
    const ev = evidenceMap.get(id);
    if (!ev) continue;
    // Check which domains this evidence touches
    if (ev.payload?.lens) coveredDomains.add(ev.payload.lens);
    if (ev.payload?.relationType) coveredDomains.add(ev.payload.relationType);
    // Check reason text against domain names
    const reason = (ev.reason || "").toLowerCase();
    for (const domain of availableDomains) {
      if (reason.includes(domain.toLowerCase())) {
        coveredDomains.add(domain);
      }
    }
  }

  return {
    covered: [...coveredDomains],
    count: coveredDomains.size,
    ratio: availableDomains.length > 0
      ? coveredDomains.size / availableDomains.length
      : 0,
  };
}

/**
 * Score invariance — how stable is this insight under variation?
 *
 * Heuristics:
 * - Evidence from multiple independent rules = more invariant
 * - Evidence spanning multiple scopes (entity + relation + dataset) = more universal
 * - High average confidence = more reliable
 */
function scoreInvariance(evidenceIds, allEvidences) {
  const evidenceMap = new Map(allEvidences.map((e) => [e.id, e]));
  const matched = evidenceIds
    .map((id) => evidenceMap.get(id))
    .filter(Boolean);

  if (matched.length === 0) return 0;

  // Unique rule sources
  const uniqueRules = new Set(matched.map((e) => e.sourceRuleId));
  const ruleSpread = Math.min(1, uniqueRules.size / 3); // 3+ rules = max spread

  // Scope diversity
  const scopes = new Set(matched.map((e) => e.scope));
  const scopeSpread = Math.min(1, scopes.size / 3); // 3 scopes = max

  // Average confidence
  const avgConf =
    matched.reduce((s, e) => s + e.confidence, 0) / matched.length;

  return Math.round(
    (ruleSpread * 0.4 + scopeSpread * 0.3 + avgConf * 0.3) * 1000
  ) / 1000;
}

/**
 * Score the density of an insight.
 *
 * Density = domain coverage / token count — the core quality metric.
 * Higher density means more explanatory power per token.
 *
 * @param {string} insightText - The insight statement
 * @param {Array<string>} evidenceIds - Evidence IDs supporting this insight
 * @param {Array} allEvidences - All evidences in the pipeline
 * @param {Array} lenses - Context lenses
 * @returns {{ tokenCount, domainsCovered, coverageRatio, invarianceScore, densityScore }}
 */
export function scoreInsightDensity(insightText, evidenceIds, allEvidences, lenses) {
  const tokenCount = countTokens(insightText);
  const availableDomains = extractDomains(allEvidences, lenses);
  const coverage = computeCoverage(evidenceIds || [], allEvidences, availableDomains);
  const invarianceScore = scoreInvariance(evidenceIds || [], allEvidences);

  // Density: coverage per token (higher = better compression)
  const rawDensity = tokenCount > 0
    ? coverage.count / tokenCount
    : 0;

  // Normalize: combine coverage ratio, invariance, and token economy
  const densityScore = Math.round(
    (coverage.ratio * 0.4 + invarianceScore * 0.35 + Math.min(1, rawDensity * 5) * 0.25) * 1000
  ) / 1000;

  return {
    tokenCount,
    domainsCovered: coverage.covered,
    coverageRatio: Math.round(coverage.ratio * 1000) / 1000,
    invarianceScore,
    densityScore,
  };
}

/**
 * Compress a raw insight into its most dense form.
 *
 * This doesn't rewrite the text (that requires an LLM) — instead it
 * evaluates the insight's compression quality and identifies which
 * domains it covers. The compressed form is the subset of evidence
 * that achieves maximum coverage with minimum evidence count.
 *
 * @param {string} rawInsight - Original insight text
 * @param {Array<string>} evidenceIds - Supporting evidence IDs
 * @param {{ allEvidences: Array, lenses: Array, entities: Array }} context
 * @returns {{ compressed, original, densityScore, domainsValidated, counterexamples }}
 */
export function compressInsight(rawInsight, evidenceIds, context) {
  const { allEvidences, lenses } = context;
  const density = scoreInsightDensity(rawInsight, evidenceIds, allEvidences, lenses);

  // Identify counterexamples: entities not covered by this insight's evidence
  const evidenceMap = new Map(allEvidences.map((e) => [e.id, e]));
  const coveredEntityIds = new Set();
  for (const id of (evidenceIds || [])) {
    const ev = evidenceMap.get(id);
    if (ev?.targetId && ev.scope === "entity") {
      coveredEntityIds.add(ev.targetId);
    }
  }
  const uncoveredEntities = (context.entities || [])
    .filter((e) => !coveredEntityIds.has(e.id))
    .slice(0, 3)
    .map((e) => e.name);

  return {
    compressed: rawInsight, // Text compression requires LLM — preserve original
    original: rawInsight,
    densityScore: density.densityScore,
    tokenCount: density.tokenCount,
    domainsValidated: density.domainsCovered,
    coverageRatio: density.coverageRatio,
    invarianceScore: density.invarianceScore,
    counterexamples: uncoveredEntities,
  };
}

/**
 * Find invariant patterns across all evidences.
 *
 * Scans evidence for recurring themes that span multiple domains,
 * then ranks by density: (domains explained) / (tokens needed).
 *
 * @param {Array} evidences - All pipeline evidences
 * @param {Array} entities - All entities
 * @param {Array} relations - All relations
 * @param {Array} lenses - Context lenses
 * @returns {Array<{ pattern, scope, confidence, tokenCount, densityScore, domains }>}
 */
export function findInvariantPatterns(evidences, entities, relations, lenses) {
  const patterns = [];
  const availableDomains = extractDomains(evidences, lenses);

  // Group evidences by sourceRuleId to find rules that fire across many targets
  const byRule = new Map();
  for (const ev of evidences) {
    const key = ev.sourceRuleId;
    if (!byRule.has(key)) byRule.set(key, []);
    byRule.get(key).push(ev);
  }

  for (const [ruleId, ruleEvidences] of byRule) {
    if (ruleEvidences.length < 2) continue; // need 2+ firings for a pattern

    // Compute scope: how many unique targets does this rule hit?
    const uniqueTargets = new Set(ruleEvidences.map((e) => e.targetId));
    const scopes = new Set(ruleEvidences.map((e) => e.scope));
    const avgConfidence =
      ruleEvidences.reduce((s, e) => s + e.confidence, 0) / ruleEvidences.length;

    // Build pattern description from the most common reason
    const reasonCounts = new Map();
    for (const ev of ruleEvidences) {
      const key = ev.reason || "";
      reasonCounts.set(key, (reasonCounts.get(key) || 0) + 1);
    }
    const topReason = [...reasonCounts.entries()]
      .sort((a, b) => b[1] - a[1])[0]?.[0] || ruleId;

    // Check domain coverage
    const evIds = ruleEvidences.map((e) => e.id);
    const coverage = computeCoverage(evIds, evidences, availableDomains);
    const tokenCount = countTokens(topReason);

    // Density: domains per token
    const densityScore = tokenCount > 0
      ? Math.round((coverage.count / tokenCount) * 1000) / 1000
      : 0;

    patterns.push({
      pattern: topReason,
      ruleId,
      scope: uniqueTargets.size,
      scopeTypes: [...scopes],
      confidence: Math.round(avgConfidence * 1000) / 1000,
      tokenCount,
      densityScore,
      domains: coverage.covered,
      domainCount: coverage.count,
      firingCount: ruleEvidences.length,
    });
  }

  // Sort by density (coverage per token), then by scope
  patterns.sort((a, b) => {
    const densityDiff = b.densityScore - a.densityScore;
    if (Math.abs(densityDiff) > 0.01) return densityDiff;
    return b.scope - a.scope;
  });

  return patterns;
}

/**
 * Rank insights by density — primary sort by densityScore, tiebreak by invariance.
 *
 * @param {Array<{ densityScore: number, invarianceScore?: number }>} insights
 * @returns {Array} Sorted array (highest density first)
 */
export function rankByDensity(insights) {
  return [...insights].sort((a, b) => {
    const densityDiff = (b.densityScore || 0) - (a.densityScore || 0);
    if (Math.abs(densityDiff) > 0.001) return densityDiff;
    return (b.invarianceScore || 0) - (a.invarianceScore || 0);
  });
}
