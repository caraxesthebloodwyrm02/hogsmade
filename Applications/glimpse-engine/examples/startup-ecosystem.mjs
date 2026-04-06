/**
 * Startup ecosystem — real Glimpse pipeline + small query utilities
 *
 * Upper half: chained aggregations and optional NLP-style query patterns (educational).
 * Lower half: the same companies as JSON records run through runContextPipeline
 * (rules, lenses, relations, influence edges).
 *
 * Run: node examples/startup-ecosystem.mjs
 */

import { runContextPipeline } from "../core/engine.js";

// ============================================================================
// UTILITY FUNCTIONS — aggregations / filters (not the cognitive engine)
// ============================================================================

const utils = {
  min: (arr, field) => (field ? Math.min(...arr.map((d) => d[field])) : Math.min(...arr)),

  max: (arr, field) => (field ? Math.max(...arr.map((d) => d[field])) : Math.max(...arr)),

  sum: (arr, field) => arr.reduce((acc, d) => acc + (field ? d[field] : d) || 0, 0),

  avg: (arr, field) => utils.sum(arr, field) / arr.length,

  count: (arr, predicate) => (predicate ? arr.filter(predicate).length : arr.length),

  unique: (arr, field) => [...new Set(field ? arr.map((d) => d[field]) : arr)],

  filter: (arr, conditions) => {
    if (typeof conditions === "function") return arr.filter(conditions);
    return arr.filter((item) => {
      return Object.entries(conditions).every(([field, rule]) => {
        const value = item[field];
        if (typeof rule === "object") {
          if ("gt" in rule) return value > rule.gt;
          if ("lt" in rule) return value < rule.lt;
          if ("eq" in rule) return value === rule.eq;
          if ("between" in rule) return value >= rule.between[0] && value <= rule.between[1];
          if ("in" in rule) return rule.in.includes(value);
        }
        return value === rule;
      });
    });
  },

  sort: (arr, field, order = "asc") => {
    return [...arr].sort((a, b) => {
      const valA = typeof field === "function" ? field(a) : a[field];
      const valB = typeof field === "function" ? field(b) : b[field];
      const cmp = valA < valB ? -1 : valA > valB ? 1 : 0;
      return order === "desc" ? -cmp : cmp;
    });
  },

  limit: (arr, n) => arr.slice(0, n),

  groupBy: (arr, keyFn) => {
    const key = typeof keyFn === "function" ? keyFn : (d) => d[keyFn];
    return arr.reduce((groups, item) => {
      const k = key(item);
      (groups[k] = groups[k] || []).push(item);
      return groups;
    }, {});
  },

  query: (arr) => ({
    data: arr,
    filter(conditions) {
      this.data = utils.filter(this.data, conditions);
      return this;
    },
    sort(field, order) {
      this.data = utils.sort(this.data, field, order);
      return this;
    },
    limit(n) {
      this.data = utils.limit(this.data, n);
      return this;
    },
    groupBy(keyFn) {
      this.data = utils.groupBy(this.data, keyFn);
      return this;
    },
    sum(field) {
      return utils.sum(this.data, field);
    },
    avg(field) {
      return utils.avg(this.data, field);
    },
    count(pred) {
      return utils.count(this.data, pred);
    },
    unique(field) {
      return utils.unique(this.data, field);
    },
    result() {
      return this.data;
    },
  }),
};

// ============================================================================
// Tiny pattern → handler map (illustrates how natural phrases become ops)
// ============================================================================

const nlpPatterns = {
  patterns: [
    {
      regex: /show\s+top\s+(\d+)\s+by\s+(\w+)/i,
      handler: (data, match) =>
        utils.query(data).sort(match[2], "desc").limit(parseInt(match[1], 10)).result(),
    },
    {
      regex: /group\s+by\s+(\w+)/i,
      handler: (data, match) => utils.groupBy(data, match[1]),
    },
    {
      regex: /average\s+(\w+)\s+per\s+(\w+)/i,
      handler: (data, match) => {
        const groups = utils.groupBy(data, match[2]);
        return Object.fromEntries(
          Object.entries(groups).map(([k, v]) => [k, utils.avg(v, match[1])]),
        );
      },
    },
    {
      regex: /(\w+)\s+(?:founded\s+)?after\s+(\d+)/i,
      handler: (data, match) => utils.filter(data, { founded: { gt: parseInt(match[2], 10) } }),
    },
    {
      regex: /total\s+(\w+)/i,
      handler: (data, match) => utils.sum(data, match[1].replace("_", "")),
    },
  ],

  parse: (query, data) => {
    for (const pattern of nlpPatterns.patterns) {
      const match = query.match(pattern.regex);
      if (match) return { matched: true, result: pattern.handler(data, match) };
    }
    return { matched: false, result: null };
  },
};

// ============================================================================
// DATA — Silicon Valley lineage as an influence graph (illustrative, not exhaustive)
// ============================================================================

const startupData = [
  {
    name: "Hewlett-Packard",
    founded: 1939,
    domain: "hardware",
    location: "Palo Alto",
    funding: 500_000,
    exit_type: "IPO",
    exit_value: 50_000_000_000,
    influenced_by: "",
  },
  {
    name: "Intel",
    founded: 1968,
    domain: "semiconductors",
    location: "Santa Clara",
    funding: 2_500_000,
    exit_type: "IPO",
    exit_value: 200_000_000_000,
    influenced_by: "Hewlett-Packard",
  },
  {
    name: "Apple",
    founded: 1976,
    domain: "consumer_electronics",
    location: "Cupertino",
    funding: 250_000,
    exit_type: "IPO",
    exit_value: 3_000_000_000_000,
    influenced_by: "Intel",
  },
  {
    name: "Netscape",
    founded: 1994,
    domain: "internet",
    location: "Mountain View",
    funding: 5_000_000,
    exit_type: "IPO",
    exit_value: 4_200_000_000,
    influenced_by: "Apple",
  },
  {
    name: "Amazon",
    founded: 1994,
    domain: "e-commerce",
    location: "Seattle",
    funding: 1_000_000,
    exit_type: "IPO",
    exit_value: 1_700_000_000_000,
    influenced_by: "",
  },
  {
    name: "Google",
    founded: 1998,
    domain: "search",
    location: "Mountain View",
    funding: 25_000_000,
    exit_type: "IPO",
    exit_value: 2_000_000_000_000,
    influenced_by: "Netscape",
  },
  {
    name: "Facebook",
    founded: 2004,
    domain: "social_media",
    location: "Palo Alto",
    funding: 500_000,
    exit_type: "IPO",
    exit_value: 900_000_000_000,
    influenced_by: "Google",
  },
  {
    name: "OpenAI",
    founded: 2015,
    domain: "artificial_intelligence",
    location: "San Francisco",
    funding: 11_000_000_000,
    exit_type: "Private",
    exit_value: 86_000_000_000,
    influenced_by: "Google",
  },
  {
    name: "Stripe",
    founded: 2010,
    domain: "fintech",
    location: "San Francisco",
    funding: 1_400_000_000,
    exit_type: "Private",
    exit_value: 95_000_000_000,
    influenced_by: "Amazon",
  },
  {
    name: "Theranos",
    founded: 2003,
    domain: "health_tech",
    location: "Palo Alto",
    funding: 700_000_000,
    exit_type: "Bankruptcy",
    exit_value: 0,
    influenced_by: "",
  },
];

const startupConfig = {
  semantic_packs: {
    dimension_aliases: {
      time: ["year", "founded", "date"],
      space: ["location", "city", "region"],
      domain: ["domain", "sector"],
      catalyst: ["influenced_by", "inspired_by", "mentor"],
    },
    query_aliases: {
      views: {
        timeline: ["timeline", "history", "founded"],
        constellation: ["network", "graph", "cap table"],
        flow: ["influence", "lineage", "spillover"],
        clusters: ["sector", "domain", "batch"],
        map: ["geography", "bay area", "hq"],
      },
    },
  },
  taxonomy: {
    domains: [
      {
        id: "hardware",
        label: "Hardware roots",
        keywords: ["hardware", "instrument", "oscilloscope", "packard", "garage"],
      },
      {
        id: "semiconductors",
        label: "Semiconductors",
        keywords: ["semiconductor", "chip", "intel", "transistor", "fab"],
      },
      {
        id: "consumer_electronics",
        label: "Devices",
        keywords: ["consumer", "iphone", "mac", "apple", "device"],
      },
      {
        id: "internet",
        label: "Web 1.0",
        keywords: ["browser", "netscape", "internet", "http", "mosaic"],
      },
      {
        id: "e-commerce",
        label: "Commerce",
        keywords: ["amazon", "retail", "e-commerce", "marketplace", "logistics"],
      },
      {
        id: "search",
        label: "Search & ads",
        keywords: ["google", "search", "index", "rank", "ads"],
      },
      {
        id: "social_media",
        label: "Social graph",
        keywords: ["facebook", "social", "feed", "graph", "sharing"],
      },
      {
        id: "artificial_intelligence",
        label: "AI wave",
        keywords: ["openai", "model", "neural", "learning", "intelligence", "gpt"],
      },
      {
        id: "fintech",
        label: "Fintech",
        keywords: ["stripe", "payments", "fintech", "card", "ledger"],
      },
      {
        id: "health_tech",
        label: "Health tech",
        keywords: ["theranos", "lab", "health", "diagnostic", "blood"],
      },
    ],
  },
  defaults: {
    active_preset: "analyst",
    secondary_lens_threshold: 0.38,
    top_secondary_limit: 4,
    evidence_confidence_floor: 0.35,
  },
  presets: {
    analyst: {
      lens_weights: {
        artificial_intelligence: 1.35,
        fintech: 1.15,
        semiconductors: 1.1,
        health_tech: 0.85,
      },
      view_bias: {
        flow: 1.15,
        constellation: 1.05,
        timeline: 1.0,
        map: 0.95,
      },
    },
  },
  view_specs: {
    timeline: { label: "Timeline" },
    constellation: { label: "Constellation" },
    clusters: { label: "Clusters" },
    matrix: { label: "Matrix" },
    flow: { label: "Influence flow" },
    map: { label: "Map" },
  },
  function_registry: {
    field_exists: { scope: ["dataset", "entity"], args: { path: "field_selector" } },
    taxonomy_score: {
      scope: ["entity"],
      args: { path: "field_selector", domain: "lens_id", min_score: "numeric_threshold" },
    },
    data_shape: { scope: ["dataset"], args: { min_records: "numeric_threshold" } },
    dimension_count: {
      scope: ["dataset"],
      args: { dimension: "dimension_name", min_count: "numeric_threshold" },
    },
    record_range: {
      scope: ["dataset"],
      args: { min: "numeric_threshold", max: "numeric_threshold" },
    },
    influence_link: { scope: ["dataset", "relation"] },
  },
  rules: [
    {
      id: "rule-ai-wave",
      label: "AI-heavy companies",
      applies_to: "entity",
      priority: 92,
      function: "taxonomy_score",
      args: { path: "entity.domain_keyword_hits", domain: "artificial_intelligence", min_score: 1 },
      returns: "score",
      weight_strategy: "direct_score",
      derive: [
        { action: "boost_lens", lens: "artificial_intelligence", score: 1.0 },
        { action: "prefer_view", view: "flow", score: 0.65 },
      ],
      affects: ["context_lens", "view"],
    },
    {
      id: "rule-fintech",
      label: "Payments / fintech",
      applies_to: "entity",
      priority: 88,
      function: "taxonomy_score",
      args: { path: "entity.domain_keyword_hits", domain: "fintech", min_score: 1 },
      returns: "score",
      weight_strategy: "direct_score",
      derive: [
        { action: "boost_lens", lens: "fintech", score: 0.95 },
        { action: "prefer_view", view: "matrix", score: 0.45 },
      ],
      affects: ["context_lens", "view"],
    },
    {
      id: "rule-semiconductor",
      label: "Chip / fab lineage",
      applies_to: "entity",
      priority: 86,
      function: "taxonomy_score",
      args: { path: "entity.domain_keyword_hits", domain: "semiconductors", min_score: 1 },
      returns: "score",
      weight_strategy: "direct_score",
      derive: [
        { action: "boost_lens", lens: "semiconductors", score: 0.9 },
        { action: "prefer_view", view: "timeline", score: 0.55 },
      ],
      affects: ["context_lens", "view"],
    },
    {
      id: "rule-influence-network",
      label: "Explicit influence edges",
      applies_to: "dataset",
      priority: 78,
      function: "influence_link",
      returns: "boolean",
      derive: [
        { action: "prefer_view", view: "flow", score: 0.85 },
        { action: "prefer_view", view: "constellation", score: 0.7 },
      ],
      affects: ["view"],
    },
    {
      id: "rule-time-dim",
      label: "Founding years present",
      applies_to: "dataset",
      priority: 62,
      function: "dimension_count",
      args: { dimension: "time", min_count: 1 },
      returns: "score",
      weight_strategy: "direct_score",
      derive: [{ action: "prefer_view", view: "timeline", score: 0.75 }],
      affects: ["view"],
    },
    {
      id: "rule-geo",
      label: "HQ locations",
      applies_to: "dataset",
      priority: 58,
      function: "dimension_count",
      args: { dimension: "space", min_count: 1 },
      returns: "score",
      weight_strategy: "direct_score",
      derive: [{ action: "prefer_view", view: "map", score: 0.65 }],
      affects: ["view"],
    },
    {
      id: "rule-small-batch",
      label: "Demo-sized cohort",
      applies_to: "dataset",
      priority: 45,
      function: "record_range",
      args: { min: 5, max: 40 },
      returns: "boolean",
      derive: [{ action: "prefer_view", view: "constellation", score: 0.4 }],
      affects: ["view"],
    },
  ],
};

// ============================================================================
// MAIN
// ============================================================================

console.log("=== Startup ecosystem — utilities + real Glimpse pipeline ===\n");

console.log("— Aggregations (plain JS)");
console.log(`   Companies: ${utils.count(startupData)}`);
console.log(
  `   Era: ${utils.min(startupData, "founded")}–${utils.max(startupData, "founded")}   Sectors: ${utils.unique(startupData, "domain").join(", ")}`,
);
console.log();

const nlpTry = nlpPatterns.parse("show top 3 by funding", startupData);
if (nlpTry.matched) {
  console.log("— NLP pattern demo: “show top 3 by funding”");
  nlpTry.result.forEach((s, i) => {
    console.log(`   ${i + 1}. ${s.name} — $${(s.funding / 1_000_000).toFixed(1)}M`);
  });
  console.log();
}

console.log("— runContextPipeline (engine)");
const result = runContextPipeline(startupData, "json", startupConfig);

console.log(`   Primary lens: ${result.primaryLens?.label ?? "(none)"}`);
console.log("   Lenses:");
result.contextLenses.forEach((lens, i) => {
  const n = result.entities.filter((e) => result.facts.entityLensScores[e.id]?.[lens.id]).length;
  console.log(`     ${i + 1}. ${lens.label} (${lens.role}, score ${lens.score}) — ${n} entities tagged`);
});
console.log();

const influenced = result.relations.filter((r) => r.type === "influenced");
console.log(`   Relations: ${result.relations.length} total, ${influenced.length} explicit influence edges`);
if (influenced.length) {
  influenced.forEach((r) => {
    const a = result.entities.find((e) => e.id === r.source);
    const b = result.entities.find((e) => e.id === r.target);
    if (a && b) console.log(`     ${a.name} → ${b.name}`);
  });
}
console.log();

console.log("   View preferences:");
Object.entries(result.viewPreferences)
  .sort((a, b) => b[1] - a[1])
  .forEach(([v, s]) => console.log(`     ${v}: ${s.toFixed(2)}`));
console.log();

console.log("— Funding leaders (utility query, funding > $10M)");
utils
  .query(startupData)
  .filter((s) => s.funding > 10_000_000)
  .sort("funding", "desc")
  .limit(5)
  .result()
  .forEach((s, i) => {
    console.log(`   ${i + 1}. ${s.name} — $${(s.funding / 1_000_000).toFixed(1)}M`);
  });
console.log();

console.log("=== done ===");
