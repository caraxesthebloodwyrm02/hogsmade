/**
 * Use Case: Basic Context Analysis
 *
 * This demonstrates the modularized Glimpse engine processing a simple dataset
 * to identify context lenses and recommend views.
 *
 * Run: node use-case-basic.mjs
 */

import { runContextPipeline } from "../core/engine.js";

const sampleData = [
  {
    name: "Ada Lovelace",
    year: 1843,
    contribution: "First computer algorithm",
    domain: "computing",
  },
  {
    name: "Alan Turing",
    year: 1936,
    contribution: "Turing machine concept",
    domain: "computing",
  },
  {
    name: "Grace Hopper",
    year: 1952,
    contribution: "First compiler",
    domain: "computing",
  },
  {
    name: "Claude Shannon",
    year: 1948,
    contribution: "Information theory",
    domain: "mathematics",
  },
  {
    name: "John von Neumann",
    year: 1945,
    contribution: "Von Neumann architecture",
    domain: "computing",
  },
  {
    name: "Donald Knuth",
    year: 1968,
    contribution: "Analysis of algorithms",
    domain: "computing",
  },
  {
    name: "Edsger Dijkstra",
    year: 1956,
    contribution: "Shortest path algorithm",
    domain: "mathematics",
  },
  {
    name: "Barbara Liskov",
    year: 1974,
    contribution: "Liskov substitution principle",
    domain: "computing",
  },
];

const config = {
  taxonomy: {
    domains: [
      {
        id: "computing",
        label: "Computing",
        keywords: [
          "algorithm",
          "compiler",
          "computer",
          "software",
          "programming",
          "data",
          "code",
          "machine",
        ],
      },
      {
        id: "mathematics",
        label: "Mathematics",
        keywords: [
          "theorem",
          "proof",
          "equation",
          "formula",
          "calculation",
          "logic",
        ],
      },
      {
        id: "physics",
        label: "Physics",
        keywords: ["force", "energy", "mass", "quantum", "wave", "particle"],
      },
    ],
  },
  semantic_packs: {
    query_aliases: {
      views: {
        timeline: ["timeline", "chronology", "history"],
        constellation: ["network", "graph", "connections"],
        clusters: ["group", "cluster", "category"],
      },
    },
  },
  defaults: {
    active_preset: "analyst",
    secondary_lens_threshold: 0.42,
    top_secondary_limit: 3,
    evidence_confidence_floor: 0.35,
  },
  view_specs: {
    timeline: { label: "Timeline" },
    constellation: { label: "Constellation" },
    clusters: { label: "Clusters" },
    matrix: { label: "Matrix" },
    flow: { label: "Flow" },
  },
  function_registry: {
    field_exists: {
      scope: ["dataset", "entity"],
      args: { path: "field_selector" },
    },
    taxonomy_score: {
      scope: ["entity"],
      args: {
        path: "field_selector",
        domain: "lens_id",
        min_score: "numeric_threshold",
      },
    },
    data_shape: {
      scope: ["dataset"],
      args: { min_records: "numeric_threshold" },
    },
    dimension_count: {
      scope: ["dataset"],
      args: { dimension: "dimension_name", min_count: "numeric_threshold" },
    },
    record_range: {
      scope: ["dataset"],
      args: { min: "numeric_threshold", max: "numeric_threshold" },
    },
  },
  rules: [
    {
      id: "rule-computing-domain",
      label: "Computing domain entities",
      applies_to: "entity",
      priority: 80,
      function: "taxonomy_score",
      args: {
        path: "entity.domain_keyword_hits",
        domain: "computing",
        min_score: 1,
      },
      returns: "score",
      weight_strategy: "direct_score",
      derive: [
        { action: "boost_lens", lens: "computing", score: 0.9 },
        { action: "prefer_view", view: "clusters", score: 0.5 },
      ],
      affects: ["context_lens", "view"],
    },
    {
      id: "rule-mathematics-domain",
      label: "Mathematics domain entities",
      applies_to: "entity",
      priority: 80,
      function: "taxonomy_score",
      args: {
        path: "entity.domain_keyword_hits",
        domain: "mathematics",
        min_score: 1,
      },
      returns: "score",
      weight_strategy: "direct_score",
      derive: [
        { action: "boost_lens", lens: "mathematics", score: 0.9 },
        { action: "prefer_view", view: "constellation", score: 0.5 },
      ],
      affects: ["context_lens", "view"],
    },
    {
      id: "rule-time-dimension",
      label: "Dataset has time dimension",
      applies_to: "dataset",
      priority: 60,
      function: "dimension_count",
      args: { dimension: "time", min_count: 1 },
      returns: "score",
      weight_strategy: "direct_score",
      derive: [{ action: "prefer_view", view: "timeline", score: 0.7 }],
      affects: ["view"],
    },
    {
      id: "rule-record-count",
      label: "Small dataset preference",
      applies_to: "dataset",
      priority: 40,
      function: "record_range",
      args: { min: 1, max: 50 },
      returns: "boolean",
      derive: [{ action: "prefer_view", view: "constellation", score: 0.4 }],
      affects: ["view"],
    },
  ],
};

console.log("=== Glimpse Engine Use Case: Basic Context Analysis ===\n");

const result = runContextPipeline(sampleData, "json", config);

console.log("📊 Dataset Summary");
console.log(`   Records: ${result.profile.recordCount}`);
console.log(`   Fields: ${result.profile.columns.join(", ")}`);
console.log(
  `   Time Range: ${result.profile.timeRange?.min} - ${result.profile.timeRange?.max}\n`,
);

console.log("🔍 Context Lenses");
result.contextLenses.forEach((lens, i) => {
  console.log(
    `   ${i + 1}. ${lens.label} (score: ${lens.score}, role: ${lens.role})`,
  );
});
console.log();

console.log("🎯 Primary Lens:", result.primaryLens?.label);
console.log("📈 View Preferences:");
Object.entries(result.viewPreferences)
  .sort((a, b) => b[1] - a[1])
  .forEach(([view, score]) => {
    console.log(`   ${view}: ${score.toFixed(2)}`);
  });
console.log();

console.log("🔗 Relations Detected:", result.relations.length);
result.relations.slice(0, 3).forEach((rel) => {
  console.log(`   - ${rel.type}: ${rel.id}`);
});
console.log();

console.log("✅ Use case complete!");
