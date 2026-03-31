/**
 * Startup Ecosystem Analysis - JavaScript Version
 *
 * Demonstrates pattern detection in startup ecosystems.
 * Shows how patterns identify funding cascades, geographic clusters,
 * domain convergence, and influence networks in entrepreneurial ecosystems.
 *
 * REFERENCE INVOCATION GUIDE:
 * ===========================
 *
 * 1. AGGREGATION OPERATIONS
 *    - min(array, field?)     : Get minimum value, optionally by field
 *    - max(array, field?)     : Get maximum value, optionally by field
 *    - sum(array, field?)     : Sum all values, optionally by field
 *    - avg(array, field?)     : Average of values, optionally by field
 *    - count(array, predicate?): Count items, optionally with filter
 *    - unique(array, field?)  : Get distinct values
 *
 * 2. TRANSFORMATION OPERATIONS
 *    - filter(array, predicate): Filter by condition
 *    - map(array, transform)   : Transform each item
 *    - sort(array, comparator) : Sort with custom comparator
 *    - limit(array, n)         : Take first n items
 *    - groupBy(array, keyFn)   : Group items by key function
 *
 * 3. CONDITIONAL ARGUMENTS
 *    - { field: "name" }                    : Target specific field
 *    - { gt: value }                        : Greater than
 *    - { lt: value }                        : Less than
 *    - { eq: value }                        : Equal to
 *    - { between: [min, max] }              : Range inclusive
 *    - { in: [values] }                     : In set of values
 *    - { sortOrder: "asc" | "desc" }        : Sort direction
 *    - { limit: n }                         : Result limit
 *    - { groupBy: field | fn }              : Grouping key
 *
 * 4. NLP PATTERN MAPPING
 *    - "show top 5 by funding"      → filter + sort(desc) + limit(5)
 *    - "group by location"          → groupBy("location")
 *    - "average funding per domain" → groupBy("domain") + avg("funding")
 *    - "startups founded after 2000"→ filter({ founded: { gt: 2000 } })
 *    - "total exit value"           → sum("exit_value")
 */

// ============================================================================
// UTILITY FUNCTIONS - Core operations for data manipulation
// ============================================================================

const utils = {
  // Aggregations
  min: (arr, field) => field
    ? Math.min(...arr.map(d => d[field]))
    : Math.min(...arr),

  max: (arr, field) => field
    ? Math.max(...arr.map(d => d[field]))
    : Math.max(...arr),

  sum: (arr, field) => arr.reduce((acc, d) => acc + (field ? d[field] : d) || 0, 0),

  avg: (arr, field) => utils.sum(arr, field) / arr.length,

  count: (arr, predicate) => predicate
    ? arr.filter(predicate).length
    : arr.length,

  unique: (arr, field) => [...new Set(field ? arr.map(d => d[field]) : arr)],

  // Transformations
  filter: (arr, conditions) => {
    if (typeof conditions === 'function') return arr.filter(conditions);
    return arr.filter(item => {
      return Object.entries(conditions).every(([field, rule]) => {
        const value = item[field];
        if (typeof rule === 'object') {
          if ('gt' in rule) return value > rule.gt;
          if ('lt' in rule) return value < rule.lt;
          if ('eq' in rule) return value === rule.eq;
          if ('between' in rule) return value >= rule.between[0] && value <= rule.between[1];
          if ('in' in rule) return rule.in.includes(value);
        }
        return value === rule;
      });
    });
  },

  sort: (arr, field, order = 'asc') => {
    return [...arr].sort((a, b) => {
      const valA = typeof field === 'function' ? field(a) : a[field];
      const valB = typeof field === 'function' ? field(b) : b[field];
      const cmp = valA < valB ? -1 : valA > valB ? 1 : 0;
      return order === 'desc' ? -cmp : cmp;
    });
  },

  limit: (arr, n) => arr.slice(0, n),

  groupBy: (arr, keyFn) => {
    const key = typeof keyFn === 'function' ? keyFn : (d) => d[keyFn];
    return arr.reduce((groups, item) => {
      const k = key(item);
      (groups[k] = groups[k] || []).push(item);
      return groups;
    }, {});
  },

  // Chained query builder
  query: (arr) => ({
    data: arr,
    filter(conditions) { this.data = utils.filter(this.data, conditions); return this; },
    sort(field, order) { this.data = utils.sort(this.data, field, order); return this; },
    limit(n) { this.data = utils.limit(this.data, n); return this; },
    groupBy(keyFn) { this.data = utils.groupBy(this.data, keyFn); return this; },
    sum(field) { return utils.sum(this.data, field); },
    avg(field) { return utils.avg(this.data, field); },
    count(pred) { return utils.count(this.data, pred); },
    unique(field) { return utils.unique(this.data, field); },
    result() { return this.data; }
  })
};

// ============================================================================
// NLP PATTERN PARSER - Maps natural language to operations
// ============================================================================

const nlpPatterns = {
  patterns: [
    {
      regex: /show\s+top\s+(\d+)\s+by\s+(\w+)/i,
      handler: (data, match) => utils.query(data).sort(match[2], 'desc').limit(parseInt(match[1])).result()
    },
    {
      regex: /group\s+by\s+(\w+)/i,
      handler: (data, match) => utils.groupBy(data, match[1])
    },
    {
      regex: /average\s+(\w+)\s+per\s+(\w+)/i,
      handler: (data, match) => {
        const groups = utils.groupBy(data, match[2]);
        return Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, utils.avg(v, match[1])]));
      }
    },
    {
      regex: /(\w+)\s+(?:founded\s+)?after\s+(\d+)/i,
      handler: (data, match) => utils.filter(data, { founded: { gt: parseInt(match[2]) } })
    },
    {
      regex: /total\s+(\w+)/i,
      handler: (data, match) => utils.sum(data, match[1].replace('_', ''))
    },
    {
      regex: /count\s+(\w+)\s+where\s+(\w+)\s*=\s*"?(\w+)"?/i,
      handler: (data, match) => utils.count(data, d => d[match[2]] === match[3])
    },
  ],

  parse: (query, data) => {
    for (const pattern of nlpPatterns.patterns) {
      const match = query.match(pattern.regex);
      if (match) return { matched: true, result: pattern.handler(data, match) };
    }
    return { matched: false, result: null };
  }
};

// ============================================================================
// PIPELINE FUNCTION - Simulated context analysis
// ============================================================================

const runContextPipeline = (data, formatType, config, options = {}) => {
  const entities = data.map((d, i) => ({
    id: i,
    name: d.name,
    dimensions: {
      space: d.location,
      time: d.founded,
      domain: d.domain
    }
  }));

  const entityLensScores = {};
  data.forEach((d, i) => {
    entityLensScores[i] = {
      ai: d.domain === 'artificial_intelligence' ? 1.0 : 0.3,
      fintech: d.domain === 'fintech' ? 1.0 : 0.2,
      hardware: d.domain === 'hardware' || d.domain === 'semiconductors' ? 0.9 : 0.1
    };
  });

  return {
    profile: {
      recordCount: data.length,
      fields: Object.keys(data[0] || {}),
      timeRange: { min: utils.min(data, 'founded'), max: utils.max(data, 'founded') }
    },
    contextLenses: [
      { id: "ai", label: "Artificial Intelligence", score: 1.3, role: "primary" },
      { id: "fintech", label: "Financial Technology", score: 1.2, role: "secondary" },
      { id: "hardware", label: "Hardware & Semiconductors", score: 0.9, role: "tertiary" },
    ],
    entities,
    facts: { entityLensScores },
    relations: data.flatMap((d, i) =>
      data.slice(0, i)
        .filter(prev => prev.location === d.location || prev.domain === d.domain)
        .map((prev, j) => ({
          id: `rel-${i}-${j}`,
          type: prev.location === d.location ? "co_located" : "domain_peer",
          source: i,
          target: j
        }))
    ),
    evidences: Array(10).fill({ type: 'pattern_match', confidence: 0.85 }),
    ruleTraces: Array(5).fill({ ruleId: 'ecosystem_rule', triggered: true }),
  };
};

// ============================================================================
// STARTUP DATA
// ============================================================================

const startupData = [
  { name: "Hewlett-Packard", founded: 1939, domain: "hardware", location: "Palo Alto", funding: 500000, exit_type: "IPO", exit_value: 50000000000 },
  { name: "Intel", founded: 1968, domain: "semiconductors", location: "Santa Clara", funding: 2500000, exit_type: "IPO", exit_value: 200000000000 },
  { name: "Apple", founded: 1976, domain: "consumer_electronics", location: "Cupertino", funding: 250000, exit_type: "IPO", exit_value: 3000000000000 },
  { name: "Netscape", founded: 1994, domain: "internet", location: "Mountain View", funding: 5000000, exit_type: "IPO", exit_value: 4200000000 },
  { name: "Amazon", founded: 1994, domain: "e-commerce", location: "Seattle", funding: 1000000, exit_type: "IPO", exit_value: 1700000000000 },
  { name: "Google", founded: 1998, domain: "search", location: "Mountain View", funding: 25000000, exit_type: "IPO", exit_value: 2000000000000 },
  { name: "Facebook", founded: 2004, domain: "social_media", location: "Palo Alto", funding: 500000, exit_type: "IPO", exit_value: 900000000000 },
  { name: "OpenAI", founded: 2015, domain: "artificial_intelligence", location: "San Francisco", funding: 11000000000, exit_type: "Private", exit_value: 86000000000 },
  { name: "Stripe", founded: 2010, domain: "fintech", location: "San Francisco", funding: 1400000000, exit_type: "Private", exit_value: 95000000000 },
  { name: "Theranos", founded: 2003, domain: "health_tech", location: "Palo Alto", funding: 700000000, exit_type: "Bankruptcy", exit_value: 0 },
];

const startupConfig = {
  taxonomy: { domains: utils.unique(startupData, 'domain') },
  defaults: { active_preset: "analyst" },
  presets: { analyst: { lens_weights: { ai: 1.5, fintech: 1.2 }, view_bias: { timeline: 0.8 } } },
  rules: [
    { id: 'high_value_exit', condition: { exit_value: { gt: 1000000000 } }, weight: 1.5 },
    { id: 'recent_startup', condition: { founded: { gt: 2000 } }, weight: 1.2 }
  ],
};

// ============================================================================
// MAIN EXECUTION
// ============================================================================

console.log("=== Glimpse Engine: Startup Ecosystem Pattern Analysis ===\n");

const result = runContextPipeline(startupData, "json", startupConfig);

// CONDITION 1: Basic aggregations using utility functions
console.log("📊 Startup Ecosystem Overview");
console.log(`   Total Startups: ${utils.count(startupData)}`);
console.log(`   Time Span: ${utils.min(startupData, 'founded')} - ${utils.max(startupData, 'founded')}`);
console.log(`   Domains: ${utils.unique(startupData, 'domain').join(", ")}\n`);

// CONDITION 2: Iterate with index and filter by lens scores
console.log("🔍 Primary Context Lenses");
result.contextLenses.forEach((lens, i) => {
  const entityCount = utils.count(result.entities, e => result.facts.entityLensScores[e.id]?.[lens.id] > 0.5);
  console.log(`   ${i + 1}. ${lens.label} (score: ${lens.score.toFixed(2)}, role: ${lens.role}, ${entityCount} startups)`);
});
console.log();

// CONDITION 3: Group by relation type using utility
console.log("🔗 Startup Network Analysis");
console.log(`   Total Relations: ${result.relations.length}`);
const relationGroups = utils.groupBy(result.relations, 'type');
Object.entries(relationGroups).forEach(([type, rels]) => {
  console.log(`   ${type}: ${rels.length}`);
});
console.log();

// CONDITION 4: Group by location, sort by count descending, limit to top 5
console.log("🌍 Geographic Distribution");
const locationGroups = utils.groupBy(result.entities, e => e.dimensions.space);
utils.query(Object.entries(locationGroups).map(([loc, ents]) => ({ location: loc, count: ents.length })))
  .sort('count', 'desc')
  .limit(5)
  .result()
  .forEach(({ location, count }) => {
    console.log(`   ${location}: ${count} startups`);
  });
console.log();

// CONDITION 5: Math operations using utility functions
console.log("💰 Funding Analysis");
const totalFunding = utils.sum(startupData, 'funding');
const avgFunding = utils.avg(startupData, 'funding');
console.log(`   Total Funding: $${Math.floor(totalFunding / 1000000)}M`);
console.log(`   Average Funding: $${(avgFunding / 1000000).toFixed(1)}M`);
console.log();

// CONDITION 6: Chained query - filter, sort, limit
console.log("🚀 High-Value
