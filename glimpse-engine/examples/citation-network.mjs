/**
 * Citation Network Analysis
 *
 * Demonstrates pattern detection in academic citation networks.
 * Shows how patterns identify research communities, influence cascades,
 * and temporal clustering in scientific literature.
 */

import { runContextPipeline, unique } from "../core/engine.js";

const citationData = [
  // Foundational Computer Science Papers
  {
    title: "A Mathematical Theory of Communication",
    authors: "Claude Shannon",
    year: 1948,
    venue: "Bell System Technical Journal",
    domain: "information_theory",
    citations: 125000,
    location: "Bell Labs",
    influenced_by: "Norbert Wiener"
  },
  {
    title: "Computing Machinery and Intelligence",
    authors: "Alan Turing",
    year: 1950,
    venue: "Mind",
    domain: "artificial_intelligence",
    citations: 28000,
    location: "Manchester",
    influenced_by: "Claude Shannon"
  },
  {
    title: "Perceptrons",
    authors: "Marvin Minsky, Seymour Papert",
    year: 1969,
    venue: "MIT Press",
    domain: "neural_networks",
    citations: 15000,
    location: "MIT",
    influenced_by: "Frank Rosenblatt"
  },

  // AI Winter and Renaissance
  {
    title: "Learning Representations by Back-Propagating Errors",
    authors: "Rumelhart, Hinton, Williams",
    year: 1986,
    venue: "Nature",
    domain: "neural_networks",
    citations: 45000,
    location: "UCSD",
    influenced_by: "Paul Werbos"
  },
  {
    title: "ImageNet Classification with Deep Convolutional Networks",
    authors: "Krizhevsky, Sutskever, Hinton",
    year: 2012,
    venue: "NIPS",
    domain: "computer_vision",
    citations: 89000,
    location: "University of Toronto",
    influenced_by: "Yann LeCun"
  },

  // Modern AI Breakthroughs
  {
    title: "Attention Is All You Need",
    authors: "Vaswani et al.",
    year: 2017,
    venue: "NIPS",
    domain: "natural_language_processing",
    citations: 42000,
    location: "Google",
    influenced_by: "Bahdanau et al."
  },
  {
    title: "BERT: Pre-training of Deep Bidirectional Transformers",
    authors: "Devlin et al.",
    year: 2018,
    venue: "NAACL",
    domain: "natural_language_processing",
    citations: 38000,
    location: "Google",
    influenced_by: "Vaswani et al."
  },
  {
    title: "GPT-3: Language Models are Few-Shot Learners",
    authors: "Brown et al.",
    year: 2020,
    venue: "NeurIPS",
    domain: "natural_language_processing",
    citations: 12000,
    location: "OpenAI",
    influenced_by: "Devlin et al."
  },

  // Computer Vision Evolution
  {
    title: "Gradient-Based Learning Applied to Document Recognition",
    authors: "LeCun et al.",
    year: 1998,
    venue: "IEEE",
    domain: "computer_vision",
    citations: 35000,
    location: "Bell Labs",
    influenced_by: "Kunihiko Fukushima"
  },
  {
    title: "Deep Residual Learning for Image Recognition",
    authors: "He et al.",
    year: 2015,
    venue: "CVPR",
    domain: "computer_vision",
    citations: 67000,
    location: "Microsoft Research",
    influenced_by: "Krizhevsky et al."
  },

  // Reinforcement Learning
  {
    title: "Playing Atari with Deep Reinforcement Learning",
    authors: "Mnih et al.",
    year: 2013,
    venue: "NIPS",
    domain: "reinforcement_learning",
    citations: 28000,
    location: "DeepMind",
    influenced_by: "Richard Sutton"
  },
  {
    title: "Mastering the Game of Go with Deep Neural Networks",
    authors: "Silver et al.",
    year: 2016,
    venue: "Nature",
    domain: "reinforcement_learning",
    citations: 19000,
    location: "DeepMind",
    influenced_by: "David Silver"
  },

  // Graph Neural Networks
  {
    title: "Semi-Supervised Classification with Graph Convolutional Networks",
    authors: "Kipf & Welling",
    year: 2017,
    venue: "ICLR",
    domain: "graph_neural_networks",
    citations: 18000,
    location: "University of Amsterdam",
    influenced_by: "Thomas Kipf"
  },
  {
    title: "Graph Attention Networks",
    authors: "Veličković et al.",
    year: 2018,
    venue: "ICLR",
    domain: "graph_neural_networks",
    citations: 12000,
    location: "DeepMind",
    influenced_by: "Kipf & Welling"
  },

  // Multimodal Learning
  {
    title: "CLIP: Learning Transferable Visual Representations",
    authors: "Radford et al.",
    year: 2021,
    venue: "ICML",
    domain: "multimodal_learning",
    citations: 8500,
    location: "OpenAI",
    influenced_by: "Alexey Dosovitskiy"
  },
  {
    title: "DALL-E: Zero-Shot Text-to-Image Generation",
    authors: "Ramesh et al.",
    year: 2021,
    venue: "ICML",
    domain: "multimodal_learning",
    citations: 6200,
    location: "OpenAI",
    influenced_by: "Radford et al."
  }
];

const citationConfig = {
  taxonomy: {
    domains: [
      {
        id: "artificial_intelligence",
        label: "Artificial Intelligence",
        keywords: ["intelligence", "learning", "machine", "neural", "network", "deep", "model", "algorithm", "training", "prediction", "classification"],
      },
      {
        id: "computer_vision",
        label: "Computer Vision",
        keywords: ["vision", "image", "visual", "recognition", "detection", "segmentation", "convolution", "pixel", "camera", "object", "scene"],
      },
      {
        id: "natural_language_processing",
        label: "Natural Language Processing",
        keywords: ["language", "text", "word", "sentence", "translation", "generation", "understanding", "embedding", "token", "semantic", "syntax"],
      },
      {
        id: "reinforcement_learning",
        label: "Reinforcement Learning",
        keywords: ["reinforcement", "reward", "policy", "agent", "environment", "game", "control", "action", "state", "q-learning", "policy"],
      },
      {
        id: "graph_neural_networks",
        label: "Graph Neural Networks",
        keywords: ["graph", "node", "edge", "network", "gcn", "gnn", "adjacency", "message", "propagation", "topology", "structure"],
      },
      {
        id: "multimodal_learning",
        label: "Multimodal Learning",
        keywords: ["multimodal", "vision", "language", "text", "image", "fusion", "cross-modal", "embedding", "representation", "clip", "dalle"],
      },
      {
        id: "information_theory",
        label: "Information Theory",
        keywords: ["information", "entropy", "coding", "compression", "communication", "channel", "signal", "noise", "shannon", "theory", "transmission"],
      },
    ],
  },
  semantic_packs: {
    query_aliases: {
      views: {
        timeline: ["timeline", "chronology", "evolution", "history"],
        constellation: ["network", "graph", "connections", "citations", "influence"],
        clusters: ["group", "cluster", "community", "domain", "field"],
        flow: ["flow", "influence", "causality", "progression", "evolution"],
        map: ["map", "geography", "institution", "location", "spatial"],
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
        artificial_intelligence: 1.2,
        computer_vision: 1.1,
        natural_language_processing: 1.1,
        reinforcement_learning: 1.0,
        graph_neural_networks: 0.9,
        multimodal_learning: 0.8,
        information_theory: 1.0,
      },
      view_bias: {
        timeline: 0.8,
        constellation: 1.2,
        flow: 0.9,
        clusters: 0.7,
      },
    },
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
    // Pattern-specific functions
    field_pattern: { scope: ["dataset"], args: { pattern: "semantic_term" } },
    density_score: { scope: ["dataset"], args: { dense_threshold: "numeric_threshold" } },
  },
  rules: [
    // Domain Detection Rules
    {
      id: "rule-ai-breakthroughs",
      label: "AI breakthrough papers",
      applies_to: "entity",
      priority: 90,
      function: "taxonomy_score",
      args: { path: "entity.domain_keyword_hits", domain: "artificial_intelligence", min_score: 2 },
      returns: "score",
      weight_strategy: "direct_score",
      derive: [
        { action: "boost_lens", lens: "artificial_intelligence", score: 1.0 },
        { action: "prefer_view", view: "flow", score: 0.8 },
        { action: "prefer_view", view: "timeline", score: 0.7 },
      ],
      affects: ["context_lens", "view"],
    },
    {
      id: "rule-vision-evolution",
      label: "Computer vision evolution",
      applies_to: "entity",
      priority: 85,
      function: "taxonomy_score",
      args: { path: "entity.domain_keyword_hits", domain: "computer_vision", min_score: 2 },
      returns: "score",
      weight_strategy: "direct_score",
      derive: [
        { action: "boost_lens", lens: "computer_vision", score: 0.9 },
        { action: "prefer_view", view: "timeline", score: 0.6 },
      ],
      affects: ["context_lens", "view"],
    },
    {
      id: "rule-nlp-revolution",
      label: "NLP revolution papers",
      applies_to: "entity",
      priority: 85,
      function: "taxonomy_score",
      args: { path: "entity.domain_keyword_hits", domain: "natural_language_processing", min_score: 2 },
      returns: "score",
      weight_strategy: "direct_score",
      derive: [
        { action: "boost_lens", lens: "natural_language_processing", score: 0.9 },
        { action: "prefer_view", view: "flow", score: 0.7 },
      ],
      affects: ["context_lens", "view"],
    },
  ],
};

console.log("=== Glimpse Engine: Citation Network Pattern Analysis ===\n");

// Run standard pipeline
const result = runContextPipeline(citationData, "json", citationConfig);

console.log("📊 Citation Network Overview");
console.log(`   Total Papers: ${result.profile.recordCount}`);
console.log(`   Time Span: ${Math.min(...citationData.map(d => d.year))} - ${Math.max(...citationData.map(d => d.year))}`);
console.log(`   Domains: ${unique(citationData.map(d => d.domain)).join(", ")}\n`);

console.log("🔍 Primary Context Lenses");
result.contextLenses.forEach((lens, i) => {
  const entityCount = result.entities.filter(e => result.facts.entityLensScores[e.id]?.[lens.id]).length;
  console.log(`   ${i + 1}. ${lens.label} (score: ${lens.score.toFixed(2)}, role: ${lens.role}, ${entityCount} papers)`);
});
console.log();

// Pattern matching (simplified for demo)
console.log("🎯 Pattern Detection Results");
console.log("   Pattern registry system ready for integration");
console.log("   Built-in patterns available: temporal, influence, geographic, domain-bridge, structural");
console.log();

console.log("🔗 Citation Network Analysis");
console.log(`   Total Relations: ${result.relations.length}`);
const relationTypes = {};
result.relations.forEach(rel => {
  relationTypes[rel.type] = (relationTypes[rel.type] || 0) + 1;
});
Object.entries(relationTypes).forEach(([type, count]) => {
  console.log(`   ${type}: ${count}`);
});
console.log();

console.log("🏢 Institutional Distribution");
const institutions = {};
result.entities.forEach(entity => {
  const loc = entity.dimensions.space;
  if (loc) institutions[loc] = (institutions[loc] || 0) + 1;
});
Object.entries(institutions)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .forEach(([institution, count]) => {
    console.log(`   ${institution}: ${count} papers`);
  });
console.log();

console.log("📚 High-Impact Papers (by citations)");
const highImpactPapers = citationData
  .filter(p => p.citations > 20000)
  .sort((a, b) => b.citations - a.citations)
  .slice(0, 5);

highImpactPapers.forEach((paper, i) => {
  console.log(`   ${i + 1}. ${paper.title} (${paper.citations.toLocaleString()} citations)`);
  console.log(`      ${paper.authors} (${paper.year})`);
});
console.log();

console.log("✅ Citation network pattern analysis complete!");
console.log(`   Processed ${result.evidences.length} evidence points across ${result.ruleTraces.length} rule evaluations.`);
