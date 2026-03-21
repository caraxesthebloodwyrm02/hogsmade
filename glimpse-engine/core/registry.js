/**
 * Pattern Registry System
 * 
 * Provides infrastructure for loading, matching, and managing analytical patterns.
 * Patterns are reusable templates that detect common structures in datasets.
 */

import { slugify, unique } from "../utils/utils.js";

/**
 * Pattern definition structure
 * {
 *   id: string,
 *   name: string,
 *   description: string,
 *   category: 'temporal' | 'influence' | 'geographic' | 'domain' | 'structural',
 *   conditions: Array<{
 *     type: 'entity' | 'relation' | 'dataset',
 *     function: string,
 *     args: object,
 *     threshold?: number
 *   }>,
 *   insights: Array<{
 *     type: string,
 *     template: string,
 *     priority: number
 *   }>,
 *   viewRecommendations: Array<{
 *     view: string,
 *     score: number,
 *     reason: string
 *   }>
 * }
 */

export class PatternRegistry {
  constructor() {
    this.patterns = new Map();
    this.matches = new Map(); // Cache pattern matches per dataset
  }

  /**
   * Register a pattern definition
   */
  register(pattern) {
    if (!pattern.id || !pattern.name || !pattern.category) {
      throw new Error('Pattern must have id, name, and category');
    }

    this.patterns.set(pattern.id, {
      ...pattern,
      slug: slugify(pattern.name),
      registeredAt: new Date().toISOString()
    });

    return this;
  }

  /**
   * Load multiple patterns from an array
   */
  loadPatterns(patterns) {
    patterns.forEach(pattern => this.register(pattern));
    return this;
  }

  /**
   * Get pattern by ID
   */
  get(id) {
    return this.patterns.get(id);
  }

  /**
   * List all patterns, optionally filtered by category
   */
  list(category = null) {
    const patterns = Array.from(this.patterns.values());
    return category 
      ? patterns.filter(p => p.category === category)
      : patterns;
  }

  /**
   * Match patterns against dataset context
   */
  matchPatterns(context, registry) {
    const datasetId = this.generateDatasetId(context);
    
    // Check cache first
    if (this.matches.has(datasetId)) {
      return this.matches.get(datasetId);
    }

    const matches = [];
    const functionRegistry = registry;

    for (const pattern of this.patterns.values()) {
      const match = this.evaluatePattern(pattern, context, functionRegistry);
      if (match.score > 0) {
        matches.push({
          patternId: pattern.id,
          patternName: pattern.name,
          category: pattern.category,
          score: match.score,
          confidence: match.confidence,
          evidence: match.evidence,
          insights: pattern.insights.map(insight => ({
            ...insight,
            generated: this.generateInsight(insight.template, match.evidence)
          })),
          viewRecommendations: pattern.viewRecommendations
        });
      }
    }

    // Sort by score and cache
    matches.sort((a, b) => b.score - a.score);
    this.matches.set(datasetId, matches);

    return matches;
  }

  /**
   * Evaluate a single pattern against context
   */
  evaluatePattern(pattern, context, functionRegistry) {
    let totalScore = 0;
    let confidence = 0;
    const evidence = [];

    for (const condition of pattern.conditions) {
      const result = this.evaluateCondition(condition, context, functionRegistry);
      
      if (result.passed) {
        totalScore += result.score || 1;
        evidence.push(result);
        confidence = Math.max(confidence, result.confidence || 0.5);
      } else if (condition.threshold && result.score < condition.threshold) {
        // Failed threshold condition - pattern doesn't match
        return { score: 0, confidence: 0, evidence: [] };
      }
    }

    // Normalize score by number of conditions
    const normalizedScore = pattern.conditions.length > 0 
      ? totalScore / pattern.conditions.length 
      : 0;

    return {
      score: Math.min(normalizedScore, 1),
      confidence,
      evidence
    };
  }

  /**
   * Evaluate a single condition
   */
  evaluateCondition(condition, context, functionRegistry) {
    try {
      const scopeType = condition.type === 'entity' ? 'entity' : 
                       condition.type === 'relation' ? 'relation' : 'dataset';
      
      const items = condition.type === 'entity' ? context.entities :
                   condition.type === 'relation' ? context.relations : [context];

      let passed = false;
      let score = 0;
      let confidence = 0;

      for (const item of items) {
        const evalContext = this.createEvaluationContext(scopeType, item, context);
        const result = functionRegistry.invoke(condition.function, evalContext, condition.args || {});
        
        if (result.matched) {
          passed = true;
          score = Math.max(score, result.score || 1);
          confidence = Math.max(confidence, 0.7);
        }
      }

      return { passed, score, confidence, result };
    } catch (error) {
      console.warn(`Pattern condition evaluation failed: ${error.message}`);
      return { passed: false, score: 0, confidence: 0 };
    }
  }

  /**
   * Create evaluation context for pattern matching
   */
  createEvaluationContext(scopeType, item, datasetContext) {
    const base = {
      dataset: datasetContext.facts?.dataset || {},
      profile: datasetContext.profile,
      config: datasetContext.config,
      semantic_packs: datasetContext.config?.semantic_packs || {},
    };

    if (scopeType === 'entity') {
      return {
        ...base,
        entity: item
      };
    }

    if (scopeType === 'relation') {
      return {
        ...base,
        relation: item,
        source: datasetContext.entities?.find(e => e.id === item.source),
        target: datasetContext.entities?.find(e => e.id === item.target)
      };
    }

    return base;
  }

  /**
   * Generate insight text from template and evidence.
   * Returns structured insight with compression metadata.
   */
  generateInsight(template, evidence, context) {
    let text = template;

    evidence.forEach((ev, index) => {
      text = text.replace(`{${index}}`, ev.reason || 'detected pattern');
      text = text.replace(`{score${index}}`, (ev.score || 0).toFixed(2));
      text = text.replace(`{value${index}}`, ev.value || 'unknown');
    });

    // Enhanced: return structured insight
    const evidenceIds = evidence.map((ev) => ev.id || ev.reason).filter(Boolean);
    const avgConfidence = evidence.length > 0
      ? evidence.reduce((s, e) => s + (e.confidence || e.score || 0.5), 0) / evidence.length
      : 0;

    // Confidence qualifier
    const qualifier = avgConfidence >= 0.8 ? "high" : avgConfidence >= 0.5 ? "moderate" : "tentative";

    return {
      text,
      confidence: Math.round(avgConfidence * 1000) / 1000,
      confidenceQualifier: qualifier,
      supportingEvidence: evidenceIds,
      evidenceCount: evidence.length,
    };
  }

  /**
   * Compose a new pattern from multiple child patterns.
   * The composed pattern requires ALL children to match.
   */
  compose(parentId, childIds) {
    const children = childIds.map((id) => this.patterns.get(id)).filter(Boolean);
    if (children.length === 0) return null;

    const composed = {
      id: parentId,
      name: `Composed: ${children.map((c) => c.name).join(" + ")}`,
      description: `Composite pattern requiring: ${children.map((c) => c.name).join(", ")}`,
      category: children[0].category,
      conditions: children.flatMap((c) => c.conditions || []),
      insights: children.flatMap((c) => c.insights || []),
      viewRecommendations: children.flatMap((c) => c.viewRecommendations || []),
      composed: true,
      childPatternIds: childIds,
    };

    this.register(composed);
    return composed;
  }

  /**
   * Create a derived pattern that inherits from a base but customizes.
   */
  registerDerived(baseId, overrides) {
    const base = this.patterns.get(baseId);
    if (!base) return null;

    const derived = {
      ...base,
      ...overrides,
      id: overrides.id || `${baseId}-derived`,
      derived: true,
      basePatternId: baseId,
    };

    this.register(derived);
    return derived;
  }

  /**
   * Generate stable dataset ID for caching
   */
  generateDatasetId(context) {
    const key = `${context.profile?.recordCount || 0}-${context.profile?.columns?.length || 0}-${context.entities?.length || 0}`;
    return slugify(key);
  }

  /**
   * Clear pattern match cache
   */
  clearCache() {
    this.matches.clear();
    return this;
  }

  /**
   * Get pattern statistics
   */
  getStats() {
    const categories = {};
    for (const pattern of this.patterns.values()) {
      categories[pattern.category] = (categories[pattern.category] || 0) + 1;
    }

    return {
      totalPatterns: this.patterns.size,
      categories,
      cachedMatches: this.matches.size
    };
  }
}

/**
 * Create a pattern registry with default patterns
 */
export function createPatternRegistry() {
  const registry = new PatternRegistry();
  
  // Load built-in patterns
  const builtInPatterns = getBuiltinPatterns();
  registry.loadPatterns(builtInPatterns);

  return registry;
}

/**
 * Built-in pattern definitions
 */
function getBuiltinPatterns() {
  return [
    // Temporal Patterns
    {
      id: 'temporal-clustering',
      name: 'Temporal Clustering',
      description: 'Innovations cluster in specific time periods with high activity',
      category: 'temporal',
      conditions: [
        {
          type: 'dataset',
          function: 'dimension_count',
          args: { dimension: 'time', min_count: 1 },
          threshold: 0.5
        },
        {
          type: 'entity',
          function: 'temporal_distance',
          args: { max_gap: 10 },
          threshold: 0.3
        }
      ],
      insights: [
        {
          type: 'temporal-hotspot',
          template: 'Temporal clustering detected: {0} innovations within 10-year periods',
          priority: 80
        }
      ],
      viewRecommendations: [
        { view: 'timeline', score: 0.9, reason: 'Temporal patterns best visualized chronologically' },
        { view: 'clusters', score: 0.6, reason: 'Time-based clustering benefits from cluster view' }
      ]
    },

    // Influence Patterns
    {
      id: 'influence-cascade',
      name: 'Influence Cascade',
      description: 'Key influencers create branching influence trees across domains',
      category: 'influence',
      conditions: [
        {
          type: 'dataset',
          function: 'influence_link',
          threshold: 0.5
        },
        {
          type: 'relation',
          function: 'shared_dimension',
          args: { dimension: 'domain' },
          threshold: 0.2 // Allow cross-domain
        }
      ],
      insights: [
        {
          type: 'influence-network',
          template: 'Influence cascade detected: {0} with cross-domain connections',
          priority: 90
        }
      ],
      viewRecommendations: [
        { view: 'flow', score: 0.95, reason: 'Influence relationships best shown as flow' },
        { view: 'constellation', score: 0.8, reason: 'Network structure visible in constellation' }
      ]
    },

    // Geographic Patterns
    {
      id: 'geographic-hotspot',
      name: 'Geographic Hotspot',
      description: 'Innovation activity concentrates in specific locations',
      category: 'geographic',
      conditions: [
        {
          type: 'dataset',
          function: 'dimension_count',
          args: { dimension: 'space', min_count: 1 },
          threshold: 0.5
        },
        {
          type: 'entity',
          function: 'shared_dimension',
          args: { dimension: 'space' },
          threshold: 0.3
        }
      ],
      insights: [
        {
          type: 'geographic-concentration',
          template: 'Geographic hotspot detected: {0} innovations in same location',
          priority: 70
        }
      ],
      viewRecommendations: [
        { view: 'map', score: 0.9, reason: 'Geographic patterns require map visualization' },
        { view: 'clusters', score: 0.5, reason: 'Location-based clustering' }
      ]
    },

    // Domain Bridge Patterns
    {
      id: 'domain-bridging',
      name: 'Domain Bridging',
      description: 'Cross-domain influence and interdisciplinary connections',
      category: 'domain',
      conditions: [
        {
          type: 'relation',
          function: 'shared_dimension',
          args: { dimension: 'domain' },
          threshold: 0.1 // Low threshold = different domains
        }
      ],
      insights: [
        {
          type: 'interdisciplinary',
          template: 'Domain bridging detected: {0} cross-domain influences',
          priority: 85
        }
      ],
      viewRecommendations: [
        { view: 'constellation', score: 0.8, reason: 'Cross-domain connections visible in network' },
        { view: 'matrix', score: 0.6, reason: 'Domain relationships shown in matrix' }
      ]
    },

    // Structural Patterns
    {
      id: 'complex-network',
      name: 'Complex Network',
      description: 'Dense network with multiple relationship types',
      category: 'structural',
      conditions: [
        {
          type: 'dataset',
          function: 'record_range',
          args: { min: 15, max: 100 },
          threshold: 0.5
        },
        {
          type: 'dataset',
          function: 'data_shape',
          args: { min_records: 10 },
          threshold: 0.4
        }
      ],
      insights: [
        {
          type: 'network-complexity',
          template: 'Complex network structure: {0} entities with {1} relationship types',
          priority: 75
        }
      ],
      viewRecommendations: [
        { view: 'constellation', score: 0.9, reason: 'Complex networks best shown as constellation' },
        { view: 'matrix', score: 0.7, reason: 'Network complexity benefits from matrix view' }
      ]
    }
  ];
}
