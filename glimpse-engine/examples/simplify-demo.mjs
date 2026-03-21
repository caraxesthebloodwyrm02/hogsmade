/**
 * /simplify — Glimpse Engine Enhanced Pipeline Demo
 *
 * Shows the full upgraded pipeline: fuzzy matching, adaptive bucketing,
 * multi-pass inference, mode detection, insight compression, grounding,
 * and confidence calibration — all in one run.
 *
 * Run: node examples/simplify-demo.mjs
 */

import { runContextPipeline } from "../core/engine.js";

// --- Dataset: cross-domain innovations spanning 200 years ---
const data = [
  { name: "Michael Faraday",     year: 1831, contribution: "Electromagnetic induction",        domain: "physics",      location: "London" },
  { name: "Charles Darwin",      year: 1859, contribution: "Theory of natural selection",       domain: "biology",      location: "England" },
  { name: "James Clerk Maxwell", year: 1865, contribution: "Unified electromagnetic theory",    domain: "physics",      location: "London" },
  { name: "Gregor Mendel",       year: 1866, contribution: "Laws of inheritance",               domain: "biology",      location: "Austria" },
  { name: "Nikola Tesla",        year: 1888, contribution: "Alternating current motor",         domain: "engineering",  location: "US" },
  { name: "Max Planck",          year: 1900, contribution: "Quantum hypothesis",                domain: "physics",      location: "Germany" },
  { name: "Albert Einstein",     year: 1905, contribution: "Special relativity",                domain: "physics",      location: "Switzerland" },
  { name: "Niels Bohr",          year: 1913, contribution: "Atomic model",                      domain: "physics",      location: "Denmark" },
  { name: "Alan Turing",         year: 1936, contribution: "Computability theory",              domain: "computing",    location: "England" },
  { name: "Claude Shannon",      year: 1948, contribution: "Information theory",                domain: "mathematics",  location: "United States" },
  { name: "Watson & Crick",      year: 1953, contribution: "DNA structure",                     domain: "biology",      location: "England" },
  { name: "Richard Feynman",     year: 1965, contribution: "Quantum electrodynamics",           domain: "physics",      location: "US" },
  { name: "Tim Berners-Lee",     year: 1989, contribution: "World Wide Web",                    domain: "computing",    location: "Switzerland" },
  { name: "Yoshua Bengio",       year: 2006, contribution: "Deep learning foundations",         domain: "computing",    location: "Canada" },
  { name: "Jennifer Doudna",     year: 2012, contribution: "CRISPR gene editing",              domain: "biology",      location: "United States" },
];

// --- Config: multi-pass enabled, broad taxonomy ---
const config = {
  inference: { multi_pass: true },
  taxonomy: {
    domains: [
      { id: "physics",      label: "Physics",      keywords: ["electromagnetic", "quantum", "relativity", "atomic", "energy", "wave", "particle", "force"] },
      { id: "biology",      label: "Biology",      keywords: ["evolution", "selection", "inheritance", "dna", "gene", "crispr", "organism", "cell"] },
      { id: "computing",    label: "Computing",    keywords: ["algorithm", "computation", "information", "web", "learning", "software", "data", "machine"] },
      { id: "mathematics",  label: "Mathematics",  keywords: ["theory", "information", "logic", "proof", "formula", "equation"] },
      { id: "engineering",  label: "Engineering",  keywords: ["motor", "current", "electrical", "design", "system", "alternating"] },
    ],
  },
  defaults: {
    active_preset: "analyst",
    secondary_lens_threshold: 0.42,
    top_secondary_limit: 3,
    evidence_confidence_floor: 0.35,
  },
  view_specs: {
    timeline:      { label: "Timeline" },
    constellation: { label: "Constellation" },
    clusters:      { label: "Clusters" },
    matrix:        { label: "Matrix" },
    flow:          { label: "Flow" },
  },
  function_registry: {
    field_exists:     { scope: ["dataset", "entity"], args: { path: "field_selector" } },
    taxonomy_score:   { scope: ["entity"], args: { path: "field_selector", domain: "lens_id", min_score: "numeric_threshold" } },
    data_shape:       { scope: ["dataset"], args: { min_records: "numeric_threshold" } },
    dimension_count:  { scope: ["dataset"], args: { dimension: "dimension_name", min_count: "numeric_threshold" } },
    record_range:     { scope: ["dataset"], args: { min: "numeric_threshold", max: "numeric_threshold" } },
  },
  rules: [
    { id: "rule-physics",     label: "Physics domain",     applies_to: "entity", priority: 80, function: "taxonomy_score", args: { path: "entity.domain_keyword_hits", domain: "physics",     min_score: 1 }, returns: "score", weight_strategy: "direct_score", derive: [{ action: "boost_lens", lens: "physics",     score: 0.9 }, { action: "prefer_view", view: "timeline",      score: 0.5 }], affects: ["context_lens", "view"] },
    { id: "rule-biology",     label: "Biology domain",     applies_to: "entity", priority: 80, function: "taxonomy_score", args: { path: "entity.domain_keyword_hits", domain: "biology",     min_score: 1 }, returns: "score", weight_strategy: "direct_score", derive: [{ action: "boost_lens", lens: "biology",     score: 0.9 }, { action: "prefer_view", view: "clusters",      score: 0.5 }], affects: ["context_lens", "view"] },
    { id: "rule-computing",   label: "Computing domain",   applies_to: "entity", priority: 80, function: "taxonomy_score", args: { path: "entity.domain_keyword_hits", domain: "computing",   min_score: 1 }, returns: "score", weight_strategy: "direct_score", derive: [{ action: "boost_lens", lens: "computing",   score: 0.9 }, { action: "prefer_view", view: "constellation",  score: 0.5 }], affects: ["context_lens", "view"] },
    { id: "rule-math",        label: "Mathematics domain",  applies_to: "entity", priority: 80, function: "taxonomy_score", args: { path: "entity.domain_keyword_hits", domain: "mathematics", min_score: 1 }, returns: "score", weight_strategy: "direct_score", derive: [{ action: "boost_lens", lens: "mathematics", score: 0.9 }], affects: ["context_lens"] },
    { id: "rule-engineering",  label: "Engineering domain",  applies_to: "entity", priority: 80, function: "taxonomy_score", args: { path: "entity.domain_keyword_hits", domain: "engineering", min_score: 1 }, returns: "score", weight_strategy: "direct_score", derive: [{ action: "boost_lens", lens: "engineering", score: 0.9 }], affects: ["context_lens"] },
    { id: "rule-time-dim",    label: "Has time dimension", applies_to: "dataset", priority: 60, function: "dimension_count", args: { dimension: "time", min_count: 1 }, returns: "score", weight_strategy: "direct_score", derive: [{ action: "prefer_view", view: "timeline", score: 0.7 }], affects: ["view"] },
    { id: "rule-space-dim",   label: "Has space dimension", applies_to: "dataset", priority: 60, function: "dimension_count", args: { dimension: "space", min_count: 1 }, returns: "score", weight_strategy: "direct_score", derive: [{ action: "prefer_view", view: "clusters", score: 0.5 }], affects: ["view"] },
    { id: "rule-size",        label: "Medium dataset",      applies_to: "dataset", priority: 40, function: "record_range", args: { min: 5, max: 100 }, returns: "boolean", derive: [{ action: "prefer_view", view: "constellation", score: 0.4 }], affects: ["view"] },
  ],
};

// --- Run the full enhanced pipeline ---
console.log("=== /simplify — Glimpse Engine Enhanced Pipeline ===\n");

const result = runContextPipeline(data, "json", config, { grounding: true });

// 1. Dataset overview
console.log("# Dataset");
console.log(`  Records: ${result.profile.recordCount}`);
console.log(`  Fields: ${result.profile.columns.join(", ")}`);
console.log(`  Time: ${result.profile.timeRange?.min || "?"} - ${result.profile.timeRange?.max || "?"}\n`);

// 2. Complexity & mode
console.log("# Complexity Assessment");
console.log(`  Level: ${result.complexity.level}`);
console.log(`  Composite score: ${result.complexity.factors.compositeScore}`);
console.log(`  Entity count: ${result.complexity.factors.entityCount}`);
console.log(`  Relation density: ${result.complexity.factors.density}`);
console.log(`  Dimension coverage: ${result.complexity.factors.dimCoverage}`);
console.log(`  Taxonomy diversity: ${result.complexity.factors.taxonomyDiversity}\n`);

console.log("# Pipeline Mode");
console.log(`  Mode: ${result.modeSettings.mode}`);
console.log(`  Passes: ${result.modeSettings.passCount}`);
console.log(`  Compression depth: ${result.modeSettings.compressionDepth}`);
console.log(`  Grounding recommended: ${result.modeSettings.groundingRecommended}`);
console.log(`  Reason: ${result.modeSettings.reason}\n`);

// 3. Context lenses
console.log("# Context Lenses");
result.contextLenses.forEach((lens, i) => {
  console.log(`  ${i + 1}. ${lens.label} (score: ${lens.score}, role: ${lens.role})`);
});
console.log();

// 4. Relations (with similarity scores from Phase 1)
console.log("# Relations");
console.log(`  Total: ${result.relations.length}`);
const withSimilarity = result.relations.filter(r => r.similarity != null);
if (withSimilarity.length > 0) {
  console.log(`  With similarity scores: ${withSimilarity.length}`);
  withSimilarity.slice(0, 5).forEach(r => {
    console.log(`    ${r.type} (sim: ${r.similarity?.toFixed(2) || "n/a"}) — ${r.id}`);
  });
}
console.log();

// 5. Confidence report
console.log("# Confidence Report");
console.log(`  Overall score: ${result.confidenceReport.overallScore}`);
console.log(`  Avg confidence: ${result.confidenceReport.avgConfidence}`);
console.log(`  Inference entries: ${result.confidenceReport.entryCount}`);
console.log(`  Gaps detected: ${result.confidenceReport.gapCount}`);
if (result.confidenceReport.topGaps.length > 0) {
  console.log("  Top gaps:");
  result.confidenceReport.topGaps.forEach(g => {
    console.log(`    [${g.type}] ${g.description} (severity: ${g.severity})`);
  });
}
console.log();

// 6. Invariant patterns (Phase 4A)
console.log("# Invariant Patterns (ranked by density)");
if (result.invariantPatterns.length === 0) {
  console.log("  No invariant patterns found (rules may have fired only once each).");
} else {
  result.invariantPatterns.slice(0, 5).forEach((p, i) => {
    console.log(`  ${i + 1}. "${p.pattern}"`);
    console.log(`     Rule: ${p.ruleId} | Firings: ${p.firingCount} | Scope: ${p.scope} targets`);
    console.log(`     Density: ${p.densityScore} | Domains: ${p.domainCount} | Tokens: ${p.tokenCount}`);
  });
}
console.log();

// 7. Grounded insights (Phase 4B)
console.log("# Grounded Insights");
if (result.groundedInsights.length === 0) {
  console.log("  No insights to ground.");
} else {
  result.groundedInsights.slice(0, 5).forEach((g, i) => {
    const label = g.compressed || g.pattern || "(unnamed)";
    const conf = g.grounding?.confidence ?? g.adjustedConfidence ?? "n/a";
    const basis = g.grounding?.basis ?? "ungrounded";
    console.log(`  ${i + 1}. "${label}"`);
    console.log(`     Grounding: ${basis} | Confidence: ${conf}`);
  });
}
console.log();

// 8. View preferences
console.log("# View Preferences");
Object.entries(result.viewPreferences)
  .sort((a, b) => b[1] - a[1])
  .forEach(([view, score]) => {
    console.log(`  ${view}: ${score.toFixed(2)}`);
  });
console.log();

console.log("=== /simplify complete ===");
