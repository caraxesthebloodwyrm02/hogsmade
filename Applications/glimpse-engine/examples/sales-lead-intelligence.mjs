/**
 * Diff Glimpse — Code Change Intelligence Visualizer
 *
 * Reads git diff output, transforms hunks into Glimpse records,
 * runs the enhanced pipeline (fuzzy matching, multi-pass inference,
 * compression, confidence calibration), and writes a JSON payload
 * for the animated HTML visualizer.
 *
 * Usage:
 *   git diff HEAD~1 | node examples/sales-lead-intelligence.mjs
 *   git diff --staged | node examples/sales-lead-intelligence.mjs
 *   node examples/sales-lead-intelligence.mjs          # uses embedded sample
 *
 * Output: diff-glimpse-output.json (consumed by diff-glimpse.html)
 */

import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { runContextPipeline, loadHistory, applyOverrides, learnFromRun, buildSessionRecap, buildPathContext, runPaths, assessCalibrationNeed, prepareInterview, applyInterviewModulation } from "../core/engine.js";

// ============================================================================
// 1. Parse unified diff into structured records
// ============================================================================

function parseDiff(raw) {
  const files = [];
  let current = null;
  let hunk = null;

  for (const line of raw.split("\n")) {
    if (line.startsWith("diff --git")) {
      current = { path: "", additions: 0, deletions: 0, hunks: [] };
      files.push(current);
      continue;
    }
    if (!current) continue;

    if (line.startsWith("+++ b/")) {
      current.path = line.slice(6);
      continue;
    }
    if (line.startsWith("--- a/")) continue;

    if (line.startsWith("@@")) {
      const m = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@(.*)/);
      hunk = {
        startOld: m ? +m[1] : 0,
        startNew: m ? +m[2] : 0,
        context: (m && m[3] ? m[3].trim() : ""),
        added: [],
        removed: [],
      };
      current.hunks.push(hunk);
      continue;
    }
    if (!hunk) continue;

    if (line.startsWith("+")) {
      hunk.added.push(line.slice(1));
      current.additions++;
    } else if (line.startsWith("-")) {
      hunk.removed.push(line.slice(1));
      current.deletions++;
    }
  }
  return files;
}

// ============================================================================
// 2. Transform parsed files into Glimpse-compatible records
// ============================================================================

function filesToRecords(files) {
  return files.map((f) => {
    const ext = (f.path.split(".").pop() || "unknown").toLowerCase();
    const dir = f.path.includes("/") ? f.path.split("/").slice(0, -1).join("/") : ".";
    const name = f.path.split("/").pop() || f.path;
    const churn = f.additions + f.deletions;
    const ratio = churn > 0 ? +(f.additions / churn).toFixed(2) : 0.5;
    const vectors = classifyChangeVector(f);

    return {
      name,
      path: f.path,
      directory: dir,
      extension: ext,
      additions: f.additions,
      deletions: f.deletions,
      churn,
      addRatio: ratio,
      hunkCount: f.hunks.length,
      vector: vectors.primary,
      vectors: vectors.all,
      hunkContexts: f.hunks.map((h) => h.context).filter(Boolean).join("; "),
    };
  });
}

function classifyChangeVector(file) {
  const all = [];
  const a = file.additions;
  const d = file.deletions;

  if (a > 0 && d === 0) all.push("creation");
  if (d > 0 && a === 0) all.push("removal");
  if (a > 0 && d > 0 && a > d * 2) all.push("expansion");
  if (a > 0 && d > 0 && d > a * 2) all.push("contraction");
  if (a > 0 && d > 0 && Math.abs(a - d) <= Math.max(a, d) * 0.3) all.push("refactor");
  if (file.hunks.length >= 3) all.push("scattered");
  if (file.hunks.length === 1 && (a + d) <= 5) all.push("surgical");

  if (all.length === 0) all.push("mixed");
  return { primary: all[0], all };
}

// ============================================================================
// 3. Glimpse config: concept-match definitions for code changes
// ============================================================================

const config = {
  inference: { multi_pass: true },

  semantic_packs: {
    synonym_groups: {
      "js":   ["javascript", "js", "mjs", "cjs"],
      "ts":   ["typescript", "ts", "tsx"],
      "style": ["css", "scss", "less", "tailwind"],
      "config": ["json", "yaml", "yml", "toml", "ini", "env"],
      "test":  ["test", "spec", "tests", "specs"],
      "src":   ["src", "lib", "core", "utils"],
    },
  },

  taxonomy: {
    domains: [
      { id: "logic",    label: "Logic",        keywords: ["function", "return", "if", "else", "switch", "for", "while", "class", "export", "import", "const", "let", "async", "await"] },
      { id: "structure", label: "Structure",    keywords: ["rename", "move", "directory", "file", "path", "module", "package", "index", "entry"] },
      { id: "data",     label: "Data",          keywords: ["schema", "model", "type", "interface", "record", "field", "column", "table", "json", "yaml"] },
      { id: "style",    label: "Presentation",  keywords: ["css", "color", "font", "margin", "padding", "display", "flex", "grid", "animation", "transition"] },
      { id: "test",     label: "Testing",       keywords: ["test", "spec", "expect", "assert", "describe", "it", "mock", "stub", "coverage"] },
      { id: "config",   label: "Configuration", keywords: ["config", "env", "setting", "option", "flag", "threshold", "parameter", "default"] },
    ],
  },

  function_registry: {
    field_exists:     { scope: ["dataset", "entity"], args: { path: "field_selector" } },
    taxonomy_score:   { scope: ["entity"], args: { path: "field_selector", domain: "lens_id", min_score: "numeric_threshold" } },
    data_shape:       { scope: ["dataset"], args: { min_records: "numeric_threshold" } },
    dimension_count:  { scope: ["dataset"], args: { dimension: "dimension_name", min_count: "numeric_threshold" } },
    record_range:     { scope: ["dataset"], args: { min: "numeric_threshold", max: "numeric_threshold" } },
  },

  rules: [
    { id: "rule-logic",     label: "Logic changes",      applies_to: "entity", priority: 80, function: "taxonomy_score", args: { path: "entity.domain_keyword_hits", domain: "logic",     min_score: 1 }, returns: "score", weight_strategy: "direct_score", derive: [{ action: "boost_lens", lens: "logic",     score: 0.9 }], affects: ["context_lens"] },
    { id: "rule-structure",  label: "Structural changes",  applies_to: "entity", priority: 80, function: "taxonomy_score", args: { path: "entity.domain_keyword_hits", domain: "structure", min_score: 1 }, returns: "score", weight_strategy: "direct_score", derive: [{ action: "boost_lens", lens: "structure", score: 0.9 }], affects: ["context_lens"] },
    { id: "rule-data",       label: "Data layer changes",  applies_to: "entity", priority: 80, function: "taxonomy_score", args: { path: "entity.domain_keyword_hits", domain: "data",      min_score: 1 }, returns: "score", weight_strategy: "direct_score", derive: [{ action: "boost_lens", lens: "data",      score: 0.9 }], affects: ["context_lens"] },
    { id: "rule-style",      label: "Style changes",       applies_to: "entity", priority: 75, function: "taxonomy_score", args: { path: "entity.domain_keyword_hits", domain: "style",     min_score: 1 }, returns: "score", weight_strategy: "direct_score", derive: [{ action: "boost_lens", lens: "style",     score: 0.9 }], affects: ["context_lens"] },
    { id: "rule-test",       label: "Test changes",        applies_to: "entity", priority: 75, function: "taxonomy_score", args: { path: "entity.domain_keyword_hits", domain: "test",      min_score: 1 }, returns: "score", weight_strategy: "direct_score", derive: [{ action: "boost_lens", lens: "test",      score: 0.9 }], affects: ["context_lens"] },
    { id: "rule-config",     label: "Config changes",      applies_to: "entity", priority: 70, function: "taxonomy_score", args: { path: "entity.domain_keyword_hits", domain: "config",    min_score: 1 }, returns: "score", weight_strategy: "direct_score", derive: [{ action: "boost_lens", lens: "config",    score: 0.9 }], affects: ["context_lens"] },
    { id: "rule-has-dirs",   label: "Has directory spread", applies_to: "dataset", priority: 60, function: "dimension_count", args: { dimension: "space", min_count: 1 }, returns: "score", derive: [{ action: "prefer_view", view: "clusters", score: 0.6 }], affects: ["view"] },
    { id: "rule-size",       label: "Diff size",           applies_to: "dataset", priority: 40, function: "record_range", args: { min: 2, max: 200 }, returns: "boolean", derive: [{ action: "prefer_view", view: "constellation", score: 0.4 }], affects: ["view"] },
  ],

  defaults: {
    active_preset: "analyst",
    secondary_lens_threshold: 0.35,
    top_secondary_limit: 3,
    evidence_confidence_floor: 0.35,
  },

  view_specs: {
    constellation: { label: "Change Network" },
    clusters:      { label: "Directory Clusters" },
    timeline:      { label: "Hunk Sequence" },
    matrix:        { label: "File-Domain Matrix" },
    flow:          { label: "Change Flow" },
  },
};

// ============================================================================
// 4. Get diff input (piped stdin or fallback to HEAD~1, or embedded sample)
// ============================================================================

function getDiffText() {
  // Try git diff HEAD~1 from the workspace root
  try {
    const diff = execSync("git diff HEAD~1", {
      cwd: process.cwd(),
      encoding: "utf-8",
      timeout: 5000,
    });
    if (diff.trim().length > 0) return { source: "git diff HEAD~1", text: diff };
  } catch (_) { /* fall through */ }

  // Embedded sample: a realistic multi-file diff
  return { source: "embedded sample", text: SAMPLE_DIFF };
}

const SAMPLE_DIFF = `diff --git a/src/core/pipeline.js b/src/core/pipeline.js
--- a/src/core/pipeline.js
+++ b/src/core/pipeline.js
@@ -12,6 +12,8 @@ import { buildEntities } from "../analysis/entities.js";
+import { findInvariantPatterns, rankByDensity } from "./compression.js";
+import { selectGroundingProvider, applyGrounding } from "./grounding.js";
@@ -86,10 +88,18 @@ export function runContextPipeline(rawData, fileType, config, options = {}) {
-  const ruleState = applyRules(config, datasetScope, entities, relations);
+  const confidenceFrame = createConfidenceFrame();
+  const ruleState = runMultiPassInference(config, datasetScope, entities, relations, {
+    maxPasses: modeSettings.passCount,
+    confidenceFrame,
+  });
+  detectGaps(confidenceFrame, { entities, relations, evidences: allEvidences, profile });
+  const confidenceReport = summarizeConfidence(confidenceFrame);
+  const invariantPatterns = findInvariantPatterns(allEvidences, entities, relations, contextLenses);
+  const rankedPatterns = rankByDensity(invariantPatterns);
diff --git a/src/core/compression.js b/src/core/compression.js
--- a/src/core/compression.js
+++ b/src/core/compression.js
@@ -0,0 +1,45 @@
+/**
+ * Insight Compression Engine
+ */
+function countTokens(text) {
+  if (!text) return 0;
+  return String(text).split(/[\\s,;:.\\-!?()]+/).filter(Boolean).length;
+}
+export function scoreInsightDensity(insightText, evidenceIds, allEvidences, lenses) {
+  const tokenCount = countTokens(insightText);
+  return { tokenCount, densityScore: 0 };
+}
+export function findInvariantPatterns(evidences, entities, relations, lenses) {
+  return [];
+}
+export function rankByDensity(insights) {
+  return [...insights].sort((a, b) => (b.densityScore || 0) - (a.densityScore || 0));
+}
diff --git a/src/analysis/similarity.js b/src/analysis/similarity.js
--- a/src/analysis/similarity.js
+++ b/src/analysis/similarity.js
@@ -42,3 +42,12 @@ export function computeStringSimilarity(a, b) {
+export function computeTokenOverlap(a, b) {
+  const tokenize = (s) => String(s || "").toLowerCase().split(/[\\s,;:_\\-/]+/).filter(Boolean);
+  const tokensA = new Set(tokenize(a));
+  const tokensB = new Set(tokenize(b));
+  if (!tokensA.size && !tokensB.size) return 1;
+  let intersection = 0;
+  for (const t of tokensA) { if (tokensB.has(t)) intersection++; }
+  const union = tokensA.size + tokensB.size - intersection;
+  return union > 0 ? intersection / union : 0;
+}
diff --git a/tests/compression.test.js b/tests/compression.test.js
--- a/tests/compression.test.js
+++ b/tests/compression.test.js
@@ -0,0 +1,20 @@
+import { describe, it } from "node:test";
+import assert from "node:assert/strict";
+import { scoreInsightDensity, rankByDensity } from "../core/compression.js";
+describe("compression", () => {
+  it("scores density", () => {
+    const r = scoreInsightDensity("test insight", [], [], []);
+    assert.ok(r.tokenCount >= 1);
+  });
+  it("ranks by density", () => {
+    const out = rankByDensity([{ densityScore: 0.3 }, { densityScore: 0.9 }]);
+    assert.ok(out[0].densityScore >= out[1].densityScore);
+  });
+});
diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -5,7 +5,7 @@
-  "version": "2.5.0",
+  "version": "2.6.0",
`;

// ============================================================================
// 5. Run
// ============================================================================

const HISTORY_PATH = new URL("../../.glimpse-history.json", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const TRACES_PATH  = new URL("../../.glimpse-traces.jsonl", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

const t0 = performance.now();

const { source, text: diffText } = getDiffText();
const files = parseDiff(diffText);
const records = filesToRecords(files);

// Silent until recap — no pre-pipeline noise

if (records.length === 0) {
  console.log("  No changes found. Nothing to analyze.");
  process.exit(0);
}

// Load history and apply any auto-tuned overrides from previous runs
const priorHistory = loadHistory(HISTORY_PATH);
const activeConfig = applyOverrides(config, priorHistory.thresholds || {});

const result = runContextPipeline(records, "json", activeConfig, {
  grounding: true,
  groundingMode: "local",
});

const elapsed = (performance.now() - t0).toFixed(1);

// Run the full learning cycle: log -> collect -> refine -> improve
const learning = learnFromRun(records, result, activeConfig, { source, elapsed: +elapsed }, {
  historyPath: HISTORY_PATH,
  tracesPath: TRACES_PATH,
});

// ============================================================================
// 6. PATH evaluation — weighted accumulation of session signals
// ============================================================================

const pathCtx = buildPathContext(
  records, result, learning.trace,
  loadHistory(HISTORY_PATH), learning.comparison, learning.refinement
);
const pathResult = runPaths(pathCtx);

// ============================================================================
// 7. Session recap — compact, glanceable, terminal-first
// ============================================================================

const recap = buildSessionRecap(records, result, learning.refinement, { source, elapsed: +elapsed }, learning.comparison, pathResult);
console.log("");
recap.forEach(line => console.log(line));

// ============================================================================
// 8. Decisional Interview — calibration suggestion + manual invocation
// ============================================================================

const calibration = assessCalibrationNeed(pathResult, pathCtx);
const wantsInterview = process.argv.includes("--interview");

if (calibration.suggested && !wantsInterview) {
  console.log(`  ⚑ calibration available (${calibration.severity}) — rerun with --interview`);
}

if (wantsInterview) {
  const interview = prepareInterview(pathResult, pathCtx);
  if (interview.questions.length > 0) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q) => new Promise(resolve => rl.question(q, resolve));

    console.log(`\n  ── Decisional Interview (${interview.assessment.severity}, ${interview.questions.length} questions) ──`);
    console.log(`  ${interview.assessment.reason}\n`);

    const answers = [];
    for (const q of interview.questions) {
      console.log(`  [${q.domain}/${q.mechanic}] ${q.text}`);
      q.options.forEach(o => console.log(`    ${o.label}. ${o.text}`));
      const selected = (await ask("  > ")).trim().toUpperCase();
      answers.push({ questionId: q.id, selectedLabel: selected });
      console.log("");
    }
    rl.close();

    const interviewResult = interview.score(answers);
    const modulated = applyInterviewModulation(pathResult, interviewResult);

    console.log(`  ── Interview Result ──`);
    console.log(`  posture: ${interviewResult.postureLabel} (${(interviewResult.confidence * 100).toFixed(0)}% alignment)`);
    console.log(`  → ${modulated.nudge}`);
  } else {
    console.log(`\n  No calibration needed — session is clean.`);
  }
}

// Vectorcounts still needed for JSON payload
const vectorCounts = {};
records.forEach((r) => r.vectors.forEach((v) => { vectorCounts[v] = (vectorCounts[v] || 0) + 1; }));

// ============================================================================
// 7. Write JSON for the HTML visualizer
// ============================================================================

const payload = {
  meta: { source, elapsed: +elapsed, timestamp: new Date().toISOString() },
  files: records,
  vectorCounts,
  lenses: result.contextLenses,
  complexity: result.complexity,
  mode: result.modeSettings,
  confidence: result.confidenceReport,
  patterns: result.invariantPatterns,
  grounded: result.groundedInsights,
  learning: {
    runNumber: learning.history.runs,
    hotFiles: learning.refinement.hotFiles,
    confidenceDelta: learning.refinement.confidenceDelta,
    churnTrend: learning.refinement.churnTrend,
    driftWarnings: learning.refinement.driftWarnings,
    improvements: learning.improvements,
    confidenceTrend: (loadHistory(HISTORY_PATH).confidenceTrend || []).map(c => ({
      ts: c.ts, overall: c.overall, gaps: c.gaps,
    })),
  },
  entities: result.entities.map((e) => ({
    id: e.id, name: e.name, type: e.type,
    dims: e.dimensions,
    lensScores: result.facts.entityLensScores[e.id] || {},
  })),
  relations: result.relations.map((r) => ({
    id: r.id, source: r.source, target: r.target, type: r.type,
    similarity: r.similarity ?? null,
    tags: r.tags || [],
  })),
};

const outPath = new URL("../../diff-glimpse-output.json", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf-8");
console.log(`\n  Output: ${outPath}`);
console.log(`  Open diff-glimpse.html to visualize.\n`);
