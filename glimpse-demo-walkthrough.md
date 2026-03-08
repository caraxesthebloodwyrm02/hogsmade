# Glimpse Dynamic Context Engine Demo

Use this file to inspect the refactor quickly.

## Files

- Engine entry: `C:\Users\USER\CascadeProjects\glimpse-engine.html`
- Master config: `C:\Users\USER\CascadeProjects\glimpse.master.yaml`
- Mixed-context demo data: `C:\Users\USER\CascadeProjects\sample-cross-context-demo.json`

## What This Demo Shows

This sample is intentionally broad:

- communication systems
- innovation and methods
- geography and coastal routing
- memory, story, and arts
- time-based progression

The point is to show that the engine no longer collapses everything into one hard-coded domain.

## Expected Result

When you load `sample-cross-context-demo.json` with the default master YAML:

- primary lens should be `Communication & Networks`
- secondary lenses should include `Innovation & Science`
- secondary lenses should also include `History & Society`
- secondary lenses should also include `Narrative & Storytelling`

Top-ranked views should start roughly like this:

1. `Flow`
2. `Timeline`
3. `Explorer`
4. `Constellation`
5. `Matrix`

The reason `Flow` should win is that the sample includes an explicit influence chain:

`Storm Warning Telegraph -> Harbor Signal Tower -> Relief Mapping Ledger -> River Exchange Network -> Civic Signal Playbook`

There is also a second memory/story branch:

`Storm Warning Telegraph -> Lantern Radio Circle -> Flood Ballad Archive -> Estuary Memory Atlas`

## What Changed And Where To Look

Inside the engine UI, look for these updates:

- `Context Lenses` panel:
  It should show one primary lens and multiple secondary lenses with percentages.

- `View Recommendation` card:
  It should explain why a view was auto-ranked first instead of just switching modes blindly.

- `Evidence Trail`:
  It should list fired rules and discovered relation evidence rather than only a plain summary paragraph.

- `Master Config` panel:
  It should show the active preset, semantic hints, and YAML control flow.

- `Rule Authoring` panel:
  It should let you describe a new law in natural language, preview the compiled rule, and save it into the master-config state.

- New visual syntaxes:
  `Matrix`, `Flow`, and `Map` should appear in the mode bar alongside the original views.

## Queries To Try

Run these in the query bar:

- `best views`
- `show flow`
- `timeline`
- `cluster by region`
- `show map`
- `explain relation between Storm Warning Telegraph and Harbor Signal Tower`

## Rule Authoring Demo

Paste this in the rule authoring panel:

`When records share the same country, favor the map view and treat geography as a supporting context.`

Expected preview:

- scope should resolve to a relation-oriented rule
- it should boost the `geography` lens
- it should prefer the `map` view

## Why This Demo Matters

This dataset proves the architecture shift:

- data profile is separate from context scoring
- rules create evidence
- evidence drives context lenses
- view specs are ranked independently
- narrative is now evidence-backed instead of being mostly freeform
