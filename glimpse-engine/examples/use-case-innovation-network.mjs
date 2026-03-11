/**
 * Use Case: Global Innovation Network Analysis
 *
 * Demonstrates the Glimpse engine analyzing a rich dataset of innovations,
 * inventors, and their relationships across time, domains, and geography.
 *
 * This shows:
 * - Multi-dimensional profiling (time, space, domain, influence)
 * - Entity clustering and relationship detection
 * - Context lens scoring and view recommendations
 * - Rule-driven insights and evidence generation
 *
 * Run: node use-case-innovation-network.mjs
 */

import { runContextPipeline } from "../core/engine.js";

const innovationData = [
  // Computing Revolution
  { name: "Charles Babbage", year: 1822, contribution: "Analytical Engine concept", domain: "computing", location: "London", influenced_by: "Ada Lovelace" },
  { name: "Ada Lovelace", year: 1843, contribution: "First computer algorithm", domain: "computing", location: "London", influenced_by: "Charles Babbage" },
  { name: "Herman Hollerith", year: 1889, contribution: "Punched card tabulator", domain: "computing", location: "New York", influenced_by: "Charles Babbage" },
  { name: "Alan Turing", year: 1936, contribution: "Turing machine concept", domain: "computing", location: "Cambridge", influenced_by: "David Hilbert" },
  { name: "Claude Shannon", year: 1948, contribution: "Information theory", domain: "mathematics", location: "Bell Labs", influenced_by: "Norbert Wiener" },
  { name: "John von Neumann", year: 1945, contribution: "Von Neumann architecture", domain: "computing", location: "Princeton", influenced_by: "Alan Turing" },
  { name: "Grace Hopper", year: 1952, contribution: "First compiler", domain: "computing", location: "Cambridge", influenced_by: "John von Neumann" },
  { name: "Tim Berners-Lee", year: 1989, contribution: "World Wide Web", domain: "computing", location: "Geneva", influenced_by: "Ted Nelson" },

  // Physics Breakthroughs
  { name: "Albert Einstein", year: 1905, contribution: "Special relativity", domain: "physics", location: "Bern", influenced_by: "Hermann Minkowski" },
  { name: "Niels Bohr", year: 1913, contribution: "Quantum atom model", domain: "physics", location: "Copenhagen", influenced_by: "Albert Einstein" },
  { name: "Werner Heisenberg", year: 1925, contribution: "Uncertainty principle", domain: "physics", location: "Göttingen", influenced_by: "Niels Bohr" },
  { name: "Erwin Schrödinger", year: 1926, contribution: "Wave equation", domain: "physics", location: "Zurich", influenced_by: "Werner Heisenberg" },

  // Biology/Medicine
  { name: "Gregor Mendel", year: 1865, contribution: "Genetics laws", domain: "biology", location: "Brno", influenced_by: "Charles Darwin" },
  { name: "James Watson", year: 1953, contribution: "DNA structure", domain: "biology", location: "Cambridge", influenced_by: "Rosalind Franklin" },
  { name: "Francis Crick", year: 1953, contribution: "DNA structure", domain: "biology", location: "Cambridge", influenced_by: "James Watson" },
  { name: "Rosalind Franklin", year: 1952, contribution: "DNA X-ray diffraction", domain: "biology", location: "London", influenced_by: "Maurice Wilkins" },

  // Engineering/Technology
  { name: "Thomas Edison", year: 1879, contribution: "Incandescent light bulb", domain: "engineering", location: "Menlo Park", influenced_by: "Joseph Swan" },
  { name: "Nikola Tesla", year: 1888, contribution: "AC motor system", domain: "engineering", location: "New York", influenced_by: "Michael Faraday" },
  { name: "Henry Ford", year: 1913, contribution: "Assembly line production", domain: "engineering", location: "Detroit", influenced_by: "Frederick Taylor" },
  { name: "Wright Brothers", year: 1903, contribution: "Powered flight", domain: "engineering", location: "Dayton", influenced_by: "Otto Lilienthal" },

  // Mathematics Foundations
  { name: "David Hilbert", year: 1899, contribution: "Hilbert problems", domain: "mathematics", location: "Göttingen", influenced_by: "Georg Cantor" },
  { name: "Kurt Gödel", year: 1931, contribution: "Incompleteness theorems", domain: "mathematics", location: "Vienna", influenced_by: "David Hilbert" },
  { name: "John von Neumann", year: 1928, contribution: "Game theory", domain: "mathematics", location: "Berlin", influenced_by: "David Hilbert" },

  // Communication Revolution
  { name: "Samuel Morse", year: 1837, contribution: "Telegraph code", domain: "communication", location: "New York", influenced_by: "Joseph Henry" },
  { name: "Alexander Graham Bell", year: 1876, contribution: "Telephone", domain: "communication", location: "Boston", influenced_by: "Samuel Morse" },
  { name: "Guglielmo Marconi", year: 1895, contribution: "Radio telegraphy", domain: "communication", location: "Bologna", influenced_by: "Heinrich Hertz" },
  { name: "Vint Cerf", year: 1974, contribution: "TCP/IP protocol", domain: "communication", location: "Stanford", influenced_by: "Bob Kahn" },
];

const comprehensiveConfig = {
  taxonomy: {
    domains: [
      {
        id: "computing",
        label: "Computing & Information",
        keywords: ["algorithm", "computer", "software", "programming", "data", "code", "machine", "digital", "network", "protocol", "compiler", "architecture"],
      },
      {
        id: "physics",
        label: "Physics & Quantum",
        keywords: ["quantum", "relativity", "particle", "wave", "energy", "force", "field", "atom", "nuclear", "quantum", "uncertainty", "relativity"],
      },
      {
        id: "biology",
        label: "Biology & Medicine",
        keywords: ["genetics", "dna", "cell", "organism", "evolution", "molecular", "protein", "gene", "chromosome", "mutation", "heredity"],
      },
      {
        id: "engineering",
        label: "Engineering & Technology",
        keywords: ["machine", "engine", "manufacturing", "production", "assembly", "industrial", "mechanical", "electrical", "structural", "design"],
      },
      {
        id: "mathematics",
        label: "Mathematics & Logic",
        keywords: ["theorem", "proof", "equation", "formula", "logic", "set", "number", "geometry", "algebra", "calculus", "probability", "statistics"],
      },
      {
        id: "communication",
        label: "Communication & Media",
        keywords: ["telegraph", "telephone", "radio", "signal", "transmission", "network", "protocol", "broadcast", "media", "information"],
      },
    ],
  },
  semantic_packs: {
    query_aliases: {
      views: {
        timeline: ["timeline", "chronology", "history", "evolution"],
        constellation: ["network", "graph", "connections", "relationships", "influence"],
        clusters: ["group", "cluster", "category", "domain", "field"],
        flow: ["flow", "influence", "causality", "progression"],
        map: ["map", "geography", "location", "spatial"],
        matrix: ["matrix", "comparison", "correlation", "analysis"],
      },
      dimension_aliases: {
        time: ["year", "date", "era", "period", "decade", "century"],
        space: ["location", "place", "city", "country", "region", "geography"],
        domain: ["domain", "field", "discipline", "area", "category"],
        catalyst: ["influenced_by", "inspired_by", "based_on", "derived", "source"],
      },
    },
  },
  defaults: {
    active_preset: "analyst",
    secondary_lens_threshold: 0.3,
    top_secondary_limit: 4,
    evidence_confidence_floor: 0.4,
  },
  presets: {
    analyst: {
      lens_weights: {
        computing: 1.2,
        physics: 1.1,
        biology: 1.0,
        engineering: 0.9,
        mathematics: 1.0,
        communication: 0.8,
      },
      view_bias: {
        timeline: 0.8,
        constellation: 1.1,
        flow: 0.9,
        clusters: 0.7,
      },
    },
  },
  view_specs: {
    timeline: { label: "Timeline" },
    constellation: { label: "Network Constellation" },
    clusters: { label: "Domain Clusters" },
    matrix: { label: "Comparison Matrix" },
    flow: { label: "Influence Flow" },
    map: { label: "Geographic Map" },
  },
  function_registry: {
    field_exists: { scope: ["dataset", "entity"], args: { path: "field_selector" } },
    taxonomy_score: { scope: ["entity"], args: { path: "field_selector", domain: "lens_id", min_score: "numeric_threshold" } },
    data_shape: { scope: ["dataset"], args: { min_records: "numeric_threshold" } },
    dimension_count: { scope: ["dataset"], args: { dimension: "dimension_name", min_count: "numeric_threshold" } },
    record_range: { scope: ["dataset"], args: { min: "numeric_threshold", max: "numeric_threshold" } },
    influence_link: { scope: ["dataset", "relation"] },
    shared_dimension: { scope: ["relation"], args: { dimension: "dimension_name" } },
    temporal_distance: { scope: ["relation"], args: { max_gap: "numeric_threshold" } },
  },
  rules: [
    // Domain Detection Rules
    {
      id: "rule-computing-innovations",
      label: "Computing innovations and pioneers",
      applies_to: "entity",
      priority: 90,
      function: "taxonomy_score",
      args: { path: "entity.domain_keyword_hits", domain: "computing", min_score: 2 },
      returns: "score",
      weight_strategy: "direct_score",
      derive: [
        { action: "boost_lens", lens: "computing", score: 1.0 },
        { action: "prefer_view", view: "flow", score: 0.7 },
        { action: "prefer_view", view: "timeline", score: 0.6 },
      ],
      affects: ["context_lens", "view"],
    },
    {
      id: "rule-physics-breakthroughs",
      label: "Physics breakthroughs",
      applies_to: "entity",
      priority: 85,
      function: "taxonomy_score",
      args: { path: "entity.domain_keyword_hits", domain: "physics", min_score: 2 },
      returns: "score",
      weight_strategy: "direct_score",
      derive: [
        { action: "boost_lens", lens: "physics", score: 0.9 },
        { action: "prefer_view", view: "constellation", score: 0.6 },
      ],
      affects: ["context_lens", "view"],
    },
    {
      id: "rule-biology-discoveries",
      label: "Biology and medical discoveries",
      applies_to: "entity",
      priority: 85,
      function: "taxonomy_score",
      args: { path: "entity.domain_keyword_hits", domain: "biology", min_score: 2 },
      returns: "score",
      weight_strategy: "direct_score",
      derive: [
        { action: "boost_lens", lens: "biology", score: 0.9 },
        { action: "prefer_view", view: "clusters", score: 0.5 },
      ],
      affects: ["context_lens", "view"],
    },
    {
      id: "rule-engineering-achievements",
      label: "Engineering and technology achievements",
      applies_to: "entity",
      priority: 80,
      function: "taxonomy_score",
      args: { path: "entity.domain_keyword_hits", domain: "engineering", min_score: 2 },
      returns: "score",
      weight_strategy: "direct_score",
      derive: [
        { action: "boost_lens", lens: "engineering", score: 0.8 },
        { action: "prefer_view", view: "timeline", score: 0.5 },
      ],
      affects: ["context_lens", "view"],
    },

    // Structural Analysis Rules
    {
      id: "rule-influence-network",
      label: "Strong influence network detected",
      applies_to: "dataset",
      priority: 70,
      function: "influence_link",
      returns: "boolean",
      derive: [
        { action: "prefer_view", view: "flow", score: 0.8 },
        { action: "prefer_view", view: "constellation", score: 0.6 },
      ],
      affects: ["view"],
    },
    {
      id: "rule-temporal-clusters",
      label: "Historical time clustering",
      applies_to: "dataset",
      priority: 60,
      function: "dimension_count",
      args: { dimension: "time", min_count: 1 },
      returns: "score",
      weight_strategy: "direct_score",
      derive: [
        { action: "prefer_view", view: "timeline", score: 0.9 },
        { action: "prefer_view", view: "clusters", score: 0.4 },
      ],
      affects: ["view"],
    },
    {
      id: "rule-geographic-distribution",
      label: "Geographic distribution analysis",
      applies_to: "dataset",
      priority: 55,
      function: "dimension_count",
      args: { dimension: "space", min_count: 1 },
      returns: "score",
      weight_strategy: "direct_score",
      derive: [
        { action: "prefer_view", view: "map", score: 0.7 },
      ],
      affects: ["view"],
    },

    // Dataset Characteristics
    {
      id: "rule-complex-network",
      label: "Complex network dataset",
      applies_to: "dataset",
      priority: 50,
      function: "record_range",
      args: { min: 20, max: 100 },
      returns: "boolean",
      derive: [
        { action: "prefer_view", view: "constellation", score: 0.6 },
        { action: "prefer_view", view: "matrix", score: 0.3 },
      ],
      affects: ["view"],
    },
  ],
};

console.log("=== Glimpse Engine: Global Innovation Network Analysis ===\n");

const result = runContextPipeline(innovationData, "json", comprehensiveConfig);

console.log("📊 Dataset Overview");
console.log(`   Total Innovations: ${result.profile.recordCount}`);
console.log(`   Time Span: ${Math.min(...innovationData.map(d => d.year))} - ${Math.max(...innovationData.map(d => d.year))}`);
console.log(`   Dimensions: ${Object.entries(result.profile.dimensionMap).map(([dim, fields]) => `${dim}(${fields.length})`).join(", ")}\n`);

console.log("🔍 Primary Context Lenses");
result.contextLenses.forEach((lens, i) => {
  const entityCount = result.entities.filter(e => result.facts.entityLensScores[e.id]?.[lens.id]).length;
  console.log(`   ${i + 1}. ${lens.label} (score: ${lens.score.toFixed(2)}, role: ${lens.role}, ${entityCount} entities)`);
});
console.log();

console.log("📈 Recommended Views (by preference)");
Object.entries(result.viewPreferences)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 4)
  .forEach(([view, score]) => {
    console.log(`   ${view}: ${score.toFixed(2)}`);
  });
console.log();

console.log("🔗 Network Analysis");
console.log(`   Total Relations: ${result.relations.length}`);
const relationTypes = {};
result.relations.forEach(rel => {
  relationTypes[rel.type] = (relationTypes[rel.type] || 0) + 1;
});
Object.entries(relationTypes).forEach(([type, count]) => {
  console.log(`   ${type}: ${count}`);
});
console.log();

console.log("🌍 Geographic Distribution");
const locations = {};
result.entities.forEach(entity => {
  const loc = entity.dimensions.space;
  if (loc) locations[loc] = (locations[loc] || 0) + 1;
});
Object.entries(locations)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .forEach(([location, count]) => {
    console.log(`   ${location}: ${count} innovations`);
  });
console.log();

console.log("⏰ Temporal Clusters");
const decades = {};
result.entities.forEach(entity => {
  const year = entity.dimensions.time;
  if (year) {
    const decade = `${Math.floor(year / 10) * 10}s`;
    decades[decade] = (decades[decade] || 0) + 1;
  }
});
Object.entries(decades)
  .sort((a, b) => a[0].localeCompare(b[0]))
  .forEach(([decade, count]) => {
    console.log(`   ${decade}: ${count} innovations`);
  });
console.log();

console.log("🎯 Key Insights");
const insights = [];

// Find most influential entities
const influenceCounts = {};
result.relations.forEach(rel => {
  if (rel.type === "influenced") {
    influenceCounts[rel.source] = (influenceCounts[rel.source] || 0) + 1;
  }
});
const topInfluencers = Object.entries(influenceCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 3);

if (topInfluencers.length > 0) {
  insights.push(`Top influencers: ${topInfluencers.map(([id, count]) => {
    const entity = result.entities.find(e => e.id === id);
    return `${entity.name} (${count})`;
  }).join(", ")}`);
}

// Find cross-domain connections
const crossDomainRelations = result.relations.filter(rel => {
  const source = result.entities.find(e => e.id === rel.source);
  const target = result.entities.find(e => e.id === rel.target);
  return source && target && source.dimensions.domain !== target.dimensions.domain;
});

if (crossDomainRelations.length > 0) {
  insights.push(`Cross-domain influences: ${crossDomainRelations.length} connections between different fields`);
}

// Find temporal proximity clusters
const closeTemporalRelations = result.relations.filter(rel => {
  const source = result.entities.find(e => e.id === rel.source);
  const target = result.entities.find(e => e.id === rel.target);
  return source && target && Math.abs(source.dimensions.time - target.dimensions.time) <= 10;
});

if (closeTemporalRelations.length > 0) {
  insights.push(`Temporal clusters: ${closeTemporalRelations.length} innovations within 10 years of each other`);
}

insights.forEach(insight => console.log(`   • ${insight}`));
console.log();

console.log("✅ Innovation network analysis complete!");
console.log(`   Processed ${result.evidences.length} evidence points across ${result.ruleTraces.length} rule evaluations.`);
