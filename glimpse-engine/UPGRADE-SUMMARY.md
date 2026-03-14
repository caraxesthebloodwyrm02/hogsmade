# Glimpse Engine — Upgrade Summary

## What Changed (Plain English)

The Glimpse engine used to work like a simple filter: it matched data to rules by exact string comparison, bucketed time into fixed decades, ran rules once in a single pass, and reported whatever came out. There was no way to know if the results were weak, no mechanism to catch contradictions, and no concept of insight quality.

**Now it thinks before it speaks.**

### Phase 1 — Foundation: Fuzzy Understanding

The engine no longer demands exact matches. When it compares two location names like "United States" and "US", it recognizes them as the same place. When two domains share overlapping vocabulary — "machine learning" and "deep learning" — it scores them as related rather than unrelated. Time is no longer forced into decade buckets; a dataset spanning 15 years gets 5-year resolution, while one spanning 300 years gets quarter-century buckets automatically.

**Files**: `analysis/similarity.js`, `analysis/temporal.js`

### Phase 2 — Multi-Pass Inference

Instead of evaluating rules once and accepting whatever falls out, the engine now runs up to three passes:

1. **Standard pass** — evaluate all rules normally
2. **Cross-reference pass** — check where multiple rules agree or disagree on the same entity; validate that "influence" relations flow forward in time, not backward
3. **Consolidation pass** — detect near-contradictions (two lenses scoring almost equally), merge duplicate evidence, keep the strongest signal

**Files**: `core/multi-pass.js`, `analysis/cross-reference.js`

### Phase 3 — Adaptive Mode Selection

Before inference starts, the engine now measures data complexity — entity count, relation density, dimension coverage, taxonomy diversity — and adapts accordingly. Simple datasets (few entities, low density) get single-pass treatment. Complex datasets (many entities, high diversity, dense relations) get full multi-pass with deep compression and grounding recommended.

**Files**: `core/modes.js`

### Phase 4A — Insight Compression

This is the quality core. After inference, the engine scans all evidence for **invariant patterns** — rules that fired across multiple targets and domains. These are ranked by **density**: how many domains does the pattern explain per token of expression? This follows the proverb principle: "to every action there is an equal and opposite reaction" covers physics, philosophy, psychology, social dynamics in twelve words. High density = high quality.

**Files**: `core/compression.js`

### Phase 4B — Local-First Grounding

Insights are verified against the dataset itself, not web search. The local grounding provider checks: does this claim have multi-source agreement? Is the entity well-connected in the relation topology? Does it fill a known inference gap? Web search exists as a secondary provider but is capped at 0.35 confidence — it can corroborate but never lead.

**Files**: `core/grounding.js`

### Phase 5 — Custom Definitions

Patterns, functions, and rules can be installed at runtime, serialized to JSON, and loaded back across sessions. This makes the engine continuously improvable without editing source files.

**Files**: `core/definitions.js`, `core/registry.js`

### Confidence Calibration

Every pipeline run now produces a confidence report: overall score, gap count, top gaps (orphan entities, low dimension coverage, weak evidence basis, conflicting evidence). This makes the engine honest about what it doesn't know.

**Files**: `core/confidence.js`

---

## What Stayed the Same

All original return fields from `runContextPipeline()` are preserved. Existing configs, rules, views, and presets work without modification. The new fields (`complexity`, `modeSettings`, `invariantPatterns`, `groundedInsights`) are additive. Code that reads the old output shape will not break.

---

## Test Results

| Suite | Tests | Pass | Fail |
|-------|-------|------|------|
| similarity.test.js | 20 | 20 | 0 |
| temporal.test.js | 17 | 17 | 0 |
| confidence.test.js | 16 | 16 | 0 |
| compression.test.js | 10 | 10 | 0 |
| **Total** | **63** | **63** | **0** |

Integration examples: `use-case-basic.mjs`, `use-case-innovation-network.mjs`, `citation-network.mjs` — all pass (exit 0).

Backward compatibility: all 18 original return fields present, 4 new fields additive-only. **PASS**.

---

## Usage Instructions

### Basic (unchanged)

```js
import { runContextPipeline } from "./core/engine.js";

const result = runContextPipeline(data, "json", config);
// result.contextLenses, result.relations, result.evidences — same as before
```

### Enable Multi-Pass Inference

```js
const config = {
  ...yourConfig,
  inference: { multi_pass: true },
};
const result = runContextPipeline(data, "json", config);
// result.modeSettings.passCount will be 2 or 3 depending on complexity
```

### Read New Quality Fields

```js
// Complexity assessment
console.log(result.complexity.level);        // "simple" | "moderate" | "complex"
console.log(result.complexity.factors);      // { entityCount, density, dimCoverage, ... }

// Mode settings
console.log(result.modeSettings.passCount);  // 1, 2, or 3
console.log(result.modeSettings.compressionDepth); // "light" | "standard" | "deep"

// Invariant patterns (ranked by density)
result.invariantPatterns.forEach(p => {
  console.log(`${p.pattern} — density: ${p.densityScore}, domains: ${p.domainCount}`);
});

// Confidence report
console.log(result.confidenceReport.overallScore);
result.confidenceReport.topGaps.forEach(g => {
  console.log(`Gap: ${g.type} — ${g.description} (severity: ${g.severity})`);
});
```

### Enable Grounding

```js
const result = runContextPipeline(data, "json", config, {
  grounding: true,             // Force grounding even for simple datasets
  groundingMode: "local",      // "local" (default) | "session" | "web"
});
// result.groundedInsights will have grounding.confirmed and grounding.confidence
```

### Install Custom Definitions at Runtime

```js
import { installCustomDefinition, serializeDefinitions, loadDefinitions } from "./core/engine.js";
import { PatternRegistry } from "./core/engine.js";

const registry = new PatternRegistry();

installCustomDefinition(registry, {
  type: "pattern",
  definition: {
    id: "my-custom-pattern",
    name: "My Pattern",
    category: "structural",
    conditions: [],
    insights: [],
    viewRecommendations: [],
  },
});

// Persist
const json = serializeDefinitions(registry);
localStorage.setItem("glimpse-custom-defs", json);

// Restore
loadDefinitions(registry, localStorage.getItem("glimpse-custom-defs"));
```

### Run Tests

```bash
cd glimpse-engine
node --test tests/similarity.test.js tests/temporal.test.js tests/confidence.test.js tests/compression.test.js
```

### Run Integration Examples

```bash
cd glimpse-engine
node examples/use-case-basic.mjs
node examples/use-case-innovation-network.mjs
node examples/citation-network.mjs
node examples/simplify-demo.mjs
```
