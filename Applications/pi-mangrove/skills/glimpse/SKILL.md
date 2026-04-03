---
name: glimpse
description: "Maintenance and development guide for the Glimpse cognitive engine, a local-first context analysis system. Use when working on the Glimpse codebase, including rules, domains, views, presets, builtin functions, engine execution, debugging lenses, or understanding file dependencies. Keywords: glimpse, cognitive engine, rules, domains, views, presets, builtin functions, dependency chain."
---

# Glimpse System Reference

## When to Use

- User asks how Glimpse works or which files to change
- Work involves `glimpse.master.yaml`, `glimpse-engine/`, or related scripts
- You need to add or modify domains, rules, views, presets, or builtin functions
- You need to validate or debug Glimpse behavior after code or config changes

## Steps

1. **Identify the target layer**
   - Determine whether the change belongs in master YAML, engine runtime, browser app state, view specs, or support scripts
   - Confirm the dependency chain before editing connected files

2. **Follow the canonical file map**
   - Treat `glimpse.master.yaml` as the source of truth for rules, taxonomy, presets, functions, and views
   - Use `engine.js` for pipeline logic, `app.js` for browser state and render flow, and `view-specs.js` for view rendering and ranking
   - Treat `glimpse-artifact/` as a separate concern unless the task explicitly targets the React app

3. **Apply the right change pattern**
   - For a new domain, update taxonomy, add rules, connect rule sets, and optionally tune presets
   - For a new rule, edit YAML directly or use the available rule-building workflow
   - For a new view, add renderer logic, register it, and wire view scoring support
   - For a new builtin function, update both runtime implementation and YAML registry metadata

4. **Run the required validation**
   - After editing `glimpse.master.yaml`, regenerate the fallback config
   - After editing `glimpse-engine/*.js`, run the bootstrap validation flow
   - Verify missing functions, invalid arguments, and rule activation results before treating the change as complete

## Maintenance Commands

- After editing `glimpse.master.yaml`
  - `node scripts/sync-default-master.mjs`

- After editing `.js` files in `glimpse-engine/`
  - `node scripts/bootstrap_glimpse_logic.mjs`

- To run in browser
  - `python3 -m http.server 4173`
  - open `http://localhost:4173/glimpse-engine.html`

## Hard Constraints

- Do not treat `glimpse-artifact/` as interchangeable with `glimpse-engine/`; they are separate concerns
- Do not edit high-risk calibration points casually:
  - `normalizeRule` in `master-config.js`
  - `deriveConfidence` in `engine.js`
  - `scoreViewBase` in `view-specs.js`
- Do not remove intentional dual-key entity fields such as camelCase and underscore variants without validating all dependent paths
- Do not skip regeneration or bootstrap validation after changing the relevant files
- Do not assume `file://` behavior reflects the live YAML; browser fetch-based loading requires HTTP

## Example Invocation

User: "Add a new domain and make Glimpse prefer a new view for that context."
Use the glimpse skill to:

1. locate the correct config and runtime layers
2. update taxonomy, rules, and optional preset/view bias entries
3. regenerate and validate the system
4. verify the new behavior before completion
