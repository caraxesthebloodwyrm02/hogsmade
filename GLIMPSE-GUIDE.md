# Glimpse — Plain-Language Guide

> How the system thinks, how to teach it new things, and how to make it yours.

---

## What Is Glimpse?

Glimpse takes raw data (CSV or JSON) and figures out the best way to show it visually. It doesn't just pick a chart — it reads the data, understands what it's about, and recommends a *context-aware* view.

It does this through **rules**. Rules are simple "if this, then that" statements you write in YAML. The system runs every rule against your data, collects the results (called **evidence**), and uses that evidence to score and rank different ways of seeing the data.

---

## The Four Stages

When data enters Glimpse, it passes through four stages:

```
1. INGEST        2. PROFILE         3. RULES           4. ARTICULATE
Parse the file → Detect fields,  → Fire every rule, → Score lenses,
(CSV or JSON)    types, keywords    collect evidence    rank views,
                                                        render the best one
```

You control stage 3. Everything else is automatic.

---

## Core Concepts (Plain English)

### Lenses
A **lens** is a way of understanding your data. Think of it like putting on a pair of glasses:
- The **history** lens sees timelines and periods
- The **geography** lens sees places and regions
- The **economics** lens sees markets and flows
- The **narrative** lens sees stories and emotions

Data can score high on multiple lenses. The winning lens shapes which view you see.

### Views
A **view** is how the data gets drawn on screen:
- **constellation** — dots connected by lines (a force-directed network)
- **timeline** — events laid out on a time axis
- **clusters** — grouped bubbles
- **explorer** — a sortable detail table
- **matrix** — a grid/heatmap
- **flow** — a Sankey or flow diagram
- **map** — geographic layout

### Evidence
When a rule fires, it produces a piece of **evidence**: "I found this pattern in the data, and here's how confident I am." Evidence has a **score** (0 to 1) that says how strong the signal is. All evidence is collected and used to score lenses and rank views.

### Presets
A **preset** is a personality. It changes the weights without changing the rules:
- An **analyst** wants data density — matrix and explorer score higher
- A **storyteller** wants narrative flow — timeline and constellation score higher
- An **educator** wants clarity — clusters and simple views score higher

---

## How Rules Work

Every rule has the same shape. Here's a complete example with annotations:

```yaml
- id: education-keyword-support          # Unique name (kebab-case)
  label: Boost education lens on keyword match  # Human description
  applies_to: entity                     # What to inspect: dataset, entity, or relation
  enabled: true                          # On/off switch
  priority: 70                           # Higher = runs first (1-100)
  function: taxonomy_score               # Which safe function to call
  args:                                  # Arguments for the function
    path: entity.domain_keyword_hits
    domain: education
    min_score: 1
  returns: score                         # What the function gives back
  weight_strategy: direct_score          # How to interpret the score
  derive:                                # What happens when this fires
    - action: boost_lens
      lens: education
      score: 0.7
  affects:
    - context_lens
  because: "Education terms indicate pedagogical framing."
  promotion: active                      # experimental = testing, active = live
```

**In plain English:** "For each record, count how many education keywords appear. If at least 1 matches, boost the education lens by 0.7."

---

## How to Add a New Rule (Step by Step)

### 1. Decide what you want to detect
Ask yourself: *"When my data has _____, the system should _____.''*

Example: "When my data has words like GDP, inflation, and trade, the system should favor the economics lens."

### 2. Pick the right function
Look at the function list (below) and find the one that matches your detection logic:
- Counting keywords? → `taxonomy_score`
- Checking if a field exists? → `field_exists`
- Detecting data shape? → `data_shape` or `density_score`
- Matching field names? → `field_pattern`

### 3. Write the rule in YAML
Use the template above. Fill in:
- **id** — a short, unique slug
- **applies_to** — `dataset` (whole file), `entity` (each row), or `relation` (pairs of rows)
- **function** — the function name
- **args** — what the function needs
- **derive** — `boost_lens` and/or `prefer_view`
- **because** — explain it to yourself in the future

### 4. Add it to a rule set
In `glimpse.master.yaml`, find `rule_sets` at the bottom. Add your rule's id to the right set:
- `base` — core domain/topic rules
- `ranking` — data shape and view preference rules

### 5. Sync and test
```bash
node scripts/sync-default-master.mjs
```
Then open `glimpse-engine.html`, load some data, and check the rule trace.

### 6. Promote
Once it works, change `promotion: experimental` to `promotion: active`.

---

## Function Quick Reference

| Function | What it does | Key args | Use when... |
|----------|-------------|----------|-------------|
| `taxonomy_score` | Counts keyword matches for a domain | `domain`, `min_score` | Detecting topics |
| `tone_score` | Counts emotional tone cues | `tone`, `min_score` | Data has moods |
| `semantic_proximity` | Fuzzy term matching with synonyms | `term`, `min_matches` | "place" should also find "region" |
| `shared_dimension` | Two records share a dimension value | `dimension` | Comparing records (same country?) |
| `temporal_distance` | Year gap between two records | `max_gap` | Time proximity matters |
| `influence_link` | Detects influence chains | — | Data has influenced_by fields |
| `field_exists` | Checks if a field is present | `path` | Guard: only run if field exists |
| `equals_value` | Compares field to exact value | `path`, `value` | Guard: only run if flag is true |
| `numeric_threshold` | Number vs threshold | `path`, `op`, `value` | Score-based gating |
| `data_shape` | Classifies dataset complexity | `min_records` | Respond to data size/shape |
| `density_score` | Records x fields ratio | `dense_threshold` | Dense → matrix, sparse → graph |
| `relationship_type` | Detects hierarchy/network/sequence | — | Auto-detect data structure |
| `field_pattern` | Match field names by regex | `pattern` | Field names signal structure |
| `cardinality_check` | Count distinct values | `dimension`, `max_distinct` | Low cardinality → clusters |
| `record_range` | Record count in a range | `min`, `max` | Small data → graph, large → table |

---

## How to Add a New Domain

A domain is a topic area (like "education" or "economics"). Adding one takes 3 edits in `glimpse.master.yaml`:

**Step 1:** Add keywords under `taxonomy.domains`:
```yaml
  music:
    id: music
    label: Music & Sound
    keywords:
      - melody
      - rhythm
      - harmony
      - tempo
      - genre
      - album
      - composition
```

**Step 2:** Add a rule that uses those keywords:
```yaml
- id: music-keyword-support
  label: Boost music lens on keyword match
  applies_to: entity
  enabled: true
  priority: 70
  function: taxonomy_score
  args:
    path: entity.domain_keyword_hits
    domain: music
    min_score: 1
  returns: score
  weight_strategy: direct_score
  derive:
    - action: boost_lens
      lens: music
      score: 0.7
  affects:
    - context_lens
  because: "Music terminology indicates audio/compositional framing."
  promotion: experimental
```

**Step 3:** Add the rule id to `rule_sets.base.rules`:
```yaml
rule_sets:
  base:
    rules:
      - ...existing rules...
      - music-keyword-support
```

---

## How to Add a New Preset

Presets are just weight multipliers. They don't add rules — they adjust how much each lens and view matters.

```yaml
  musician:
    label: Musician
    lens_weights:
      arts: 1.6
      narrative: 1.3
      history: 1.1
    view_bias:
      timeline: 1.3
      flow: 1.2
```

This says: "When the musician preset is active, arts lens scores get multiplied by 1.6, and timeline view scores get multiplied by 1.3."

---

## Common Patterns

### "If the data is large, use a different view"
```yaml
- id: large-dataset-matrix
  applies_to: dataset
  function: record_range
  args: { min: 100, max: 999999 }
  derive:
    - action: prefer_view
      view: matrix
      score: 0.5
  because: "Large datasets are more legible in matrix/heatmap layouts."
```

### "If field names look like a hierarchy, prefer flow"
```yaml
- id: hierarchy-prefer-flow
  applies_to: dataset
  function: field_pattern
  args: { pattern: "parent|child|level|depth|rank" }
  derive:
    - action: prefer_view
      view: flow
      score: 0.4
  because: "Hierarchical field names suggest tree/flow visualization."
```

### "Only fire this rule if time data exists"
Use guards:
```yaml
  guards:
    - function: field_exists
      args: { path: dataset.flags.has_time_dimension }
```
This means: "Before running this rule, check that the dataset has a time dimension. If it doesn't, skip this rule entirely."

---

## File Map

| File | What it does |
|------|-------------|
| `glimpse.master.yaml` | All config: domains, rules, presets, view specs, functions |
| `glimpse-engine/engine.js` | Core runtime: loads config, runs pipeline, executes functions |
| `glimpse-engine/app.js` | UI: data loading, chart rendering, rule authoring panel |
| `glimpse-engine/master-config.js` | YAML parser and serializer |
| `glimpse-engine/view-specs.js` | View renderers (constellation, timeline, clusters, etc.) |
| `glimpse-engine/default-master.js` | Embedded fallback YAML (auto-generated, don't edit manually) |
| `glimpse-engine.html` | Main app entry point |
| `glimpse-rule-lab.html` | Interactive rule builder playground |
| `scripts/sync-default-master.mjs` | Syncs YAML → default-master.js |

---

## Key Terminology

| Term | Meaning |
|------|---------|
| **Rule** | An if-then statement: "if data matches X, then boost Y" |
| **Evidence** | The output of a rule: a score + reason |
| **Lens** | A topical perspective (history, economics, narrative...) |
| **View** | A visual layout (constellation, timeline, matrix...) |
| **Preset** | A user profile that adjusts weights |
| **Domain** | A topic category with keywords |
| **Dimension** | A data axis: time, space, agent, domain, catalyst, type |
| **Scope** | What a rule inspects: dataset, entity, or relation |
| **Guard** | A precondition — the rule only fires if the guard passes |
| **Promotion** | Status: experimental (testing) or active (live) |
| **Derive** | What happens when a rule matches: boost_lens or prefer_view |

---

## Tips

- **Start experimental.** Every new rule should begin as `promotion: experimental`. Test it. Then promote.
- **Keep scores between 0.3 and 0.8.** Below 0.3 is too quiet to matter. Above 0.8 can dominate other signals.
- **Use guards.** If your rule only makes sense when time data exists, guard it. Otherwise it fires on every dataset.
- **Read the trace.** In the Glimpse app, the rule trace panel shows exactly which rules fired and why. Use it.
- **One rule, one job.** Don't try to do multiple detections in one rule. Write two simple rules instead.
- **Sync after every YAML change.** Run `node scripts/sync-default-master.mjs` or the embedded fallback will be stale.
