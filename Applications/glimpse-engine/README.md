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

## Security and privacy

- **DOM:** Dynamic text and attributes use shared escaping (`core/dom-safe.js`). Lens roles are restricted for CSS class tokens. The main UI still renders via `innerHTML` composed from templates; high-risk interpolations are sanitized—see tests under `tests/dom-injection-safety.test.js`.
- **Pipeline:** Running `runPipeline` requires an internal symbol and validated session digest prefix (`core/digest-validator.js`); ceremony validation gates phase transitions (`core/ceremony-validator.js`).
- **Pathway logs:** JSONL entries include `schemaVersion`, `glimpseVersion`, and optionally `digest_prefix` (first 12 hex chars of the bound session digest) when a digest is bound; filenames are redacted by default. See `pathway-logger.js`.
- **Exports:** `exportJSON` deep-sanitizes paths (`core/config-sanitizer.js`).
- **Reporting:** See [SECURITY.md](SECURITY.md).

## Notes

- Pure JavaScript (ES modules), no build step required.
- 13 integration tests covering the full pipeline.
- See `GLIMPSE-GUIDE.md` for plain-language rule authoring.
