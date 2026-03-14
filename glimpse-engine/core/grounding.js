/**
 * Local-First Grounding Providers
 *
 * Grounding verifies insights against available context — NOT web search.
 * Local context (entities, relations, patterns, pathway logs) is the primary
 * truth source. Web search is secondary, low-emphasis, background-only.
 *
 * Provider hierarchy:
 * 1. LocalGroundingProvider — cross-references within the dataset (always available)
 * 2. ContextWindowGroundingProvider — session memory (web interface)
 * 3. WebGroundingProvider — external search (injected, low weight)
 */

import { createEvidence } from "../analysis/relations.js";

/**
 * Base grounding provider.
 */
export class GroundingProvider {
  verify(_claim, _context) {
    return { confirmed: false, confidence: 0, basis: "unimplemented" };
  }

  getCapabilities() {
    return [];
  }
}

/**
 * Local grounding: cross-references claims against the dataset itself.
 * No external calls. Always available.
 */
export class LocalGroundingProvider extends GroundingProvider {
  getCapabilities() {
    return ["entity-cross-ref", "relation-validation", "pattern-corroboration", "gap-filling"];
  }

  /**
   * Verify a claim against local context.
   *
   * @param {{ text: string, type: string, entityId?: string, evidenceIds?: string[] }} claim
   * @param {{ entities: Array, relations: Array, evidences: Array, inferenceGaps?: Array }} context
   * @returns {{ confirmed: boolean, confidence: number, basis: string, details?: string }}
   */
  verify(claim, context) {
    const { entities, relations, evidences, inferenceGaps } = context;

    // Strategy 1: Check if multiple evidences support this claim
    const supportingEvidence = (claim.evidenceIds || [])
      .map((id) => evidences.find((e) => e.id === id))
      .filter(Boolean);

    const uniqueRules = new Set(supportingEvidence.map((e) => e.sourceRuleId));
    const multiSourced = uniqueRules.size >= 2;

    // Strategy 2: Check if the claim fills a known inference gap
    const fillsGap = (inferenceGaps || []).some((gap) =>
      (gap.affectedIds || []).includes(claim.entityId)
    );

    // Strategy 3: Cross-reference with relation topology
    const entityRelations = claim.entityId
      ? relations.filter(
          (r) => r.source === claim.entityId || r.target === claim.entityId
        )
      : [];
    const wellConnected = entityRelations.length >= 2;

    // Compute grounding confidence
    let confidence = 0.3; // base
    let basis = "local-baseline";

    if (multiSourced) {
      confidence += 0.25;
      basis = "multi-source-agreement";
    }
    if (wellConnected) {
      confidence += 0.15;
      basis = multiSourced ? "multi-source+connected" : "topology-connected";
    }
    if (fillsGap) {
      confidence += 0.1;
      basis += "+gap-filling";
    }

    const avgEvConfidence = supportingEvidence.length > 0
      ? supportingEvidence.reduce((s, e) => s + e.confidence, 0) / supportingEvidence.length
      : 0;
    confidence = Math.min(0.95, confidence + avgEvConfidence * 0.2);

    return {
      confirmed: confidence >= 0.5,
      confidence: Math.round(confidence * 1000) / 1000,
      basis,
      details: `${uniqueRules.size} sources, ${entityRelations.length} relations, gap-fill: ${fillsGap}`,
    };
  }
}

/**
 * Context window grounding: for web interfaces, resolves claims against
 * session memory and past interactions.
 */
export class ContextWindowGroundingProvider extends GroundingProvider {
  constructor(sessionMemory = []) {
    super();
    this.sessionMemory = sessionMemory;
  }

  getCapabilities() {
    return ["session-memory", "thread-resolution", "pattern-emphasis"];
  }

  verify(claim, context) {
    // Check session memory for corroboration
    const claimText = (claim.text || "").toLowerCase();
    const memoryHits = this.sessionMemory.filter((entry) =>
      (entry.text || "").toLowerCase().includes(claimText.slice(0, 20))
    );

    const base = new LocalGroundingProvider().verify(claim, context);

    if (memoryHits.length > 0) {
      return {
        ...base,
        confidence: Math.min(0.95, base.confidence + 0.1),
        basis: base.basis + "+session-memory",
        details: `${base.details}, memory-hits: ${memoryHits.length}`,
      };
    }

    return base;
  }
}

/**
 * Web grounding: secondary, background-only.
 * Requires an injected search function. Low weight in confidence.
 */
export class WebGroundingProvider extends GroundingProvider {
  constructor(searchFn) {
    super();
    this.searchFn = searchFn;
  }

  getCapabilities() {
    return ["web-cross-reference"];
  }

  async verify(claim, context) {
    if (!this.searchFn) {
      return { confirmed: false, confidence: 0, basis: "no-search-function" };
    }

    try {
      const query = buildSearchQuery(claim);
      const results = await this.searchFn(query);
      const hasResults = results && results.length > 0;

      return {
        confirmed: hasResults,
        confidence: hasResults ? 0.35 : 0.1, // Low weight — web is secondary
        basis: "web-cross-reference",
        details: `Web search: ${hasResults ? results.length + " results" : "no results"}`,
      };
    } catch {
      return { confirmed: false, confidence: 0, basis: "web-search-error" };
    }
  }
}

/**
 * Build a search query from a claim (for web grounding).
 */
function buildSearchQuery(claim) {
  const parts = [claim.text || ""];
  if (claim.entityName) parts.push(claim.entityName);
  return parts.join(" ").trim().slice(0, 100);
}

/**
 * Select the appropriate grounding provider.
 *
 * @param {string} mode - "local" | "session" | "web"
 * @param {object} config
 * @returns {GroundingProvider}
 */
export function selectGroundingProvider(mode, config) {
  if (mode === "session") {
    return new ContextWindowGroundingProvider(config?.sessionMemory || []);
  }
  if (mode === "web" && config?.searchFn) {
    return new WebGroundingProvider(config.searchFn);
  }
  return new LocalGroundingProvider();
}

/**
 * Apply grounding to a set of compressed insights.
 *
 * @param {GroundingProvider} provider
 * @param {Array} insights - Compressed insights from compression.js
 * @param {object} context - Pipeline context
 * @returns {Array} Insights with grounding results attached
 */
export function applyGrounding(provider, insights, context) {
  return insights.map((insight) => {
    const claim = {
      text: insight.compressed || insight.original || "",
      type: "insight",
      entityId: insight.entityId || null,
      evidenceIds: insight.supportingEvidence || [],
    };

    const result = provider.verify(claim, context);

    return {
      ...insight,
      grounding: {
        confirmed: result.confirmed,
        confidence: result.confidence,
        basis: result.basis,
        details: result.details,
      },
      // Adjust insight confidence based on grounding
      adjustedConfidence: Math.round(
        ((insight.densityScore || 0.5) * 0.7 + result.confidence * 0.3) * 1000
      ) / 1000,
    };
  });
}
