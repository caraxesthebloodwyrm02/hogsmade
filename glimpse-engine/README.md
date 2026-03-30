# Glimpse Engine

Decision support tool with visualization — fast, synthetic, glanceable. A cognitive data analysis engine with CLI, browser dashboards, and a full test suite.

## Commands

```bash
# CLI
node cli.js --help

# Run tests (from repo root, not glimpse-engine/)
node --test tests/glimpse-engine.test.mjs

# Demos
npm run demo:standup
npm run demo:energy
npm run demo:portfolio
```

## Key Files

- `glimpse.master.yaml` — all domains, rules, presets, view specs
- `core/engine.js` — pipeline runtime (ingest → profile → rules → articulate)
- `view-specs.js` — constellation, timeline, clusters, matrix, flow, map, explorer

## Notes

- Pure JavaScript (ES modules), no build step required.
- 13 integration tests covering the full pipeline.
- See `GLIMPSE-GUIDE.md` for plain-language rule authoring.
