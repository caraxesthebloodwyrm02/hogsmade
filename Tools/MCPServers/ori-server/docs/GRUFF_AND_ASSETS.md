# GRUFF geometry box & asset inventory rhythm

## GRUFF geometry box

**GRUFF** (Grid Rendering for Unified Forensics & Flow) is the stable SVG projection of the same JSON contract as `buildThreatProjectHeatmap` in `src/heatmap.ts`. Use `renderGruffGeometrySvg` from `src/geometry-box.ts` when you need:

- Higher visual clarity than raw JSON (axis labels, legend, truncation footnote).
- Deterministic colors for automation (`GRUFF_PALETTE` is fixed release-to-release).
- Embeds in Canvas MCP, HTML reports, or CI artifacts.

The JSON payload remains canonical for LLM tools; SVG is a **derived view**.

### Reports (`generate_report`)

When **`includeGruffSvg: true`** is passed to the `generate_report` tool (or **`ORI_REPORT_GRUFF_SVG`** is set to `1` / `true` / `yes`), the reporter writes **`<stem>-gruff.svg`** next to the markdown report and appends **## Threat × project (GRUFF)** with a relative image link. The tool response includes **`gruffSvgPath`** when a file was written. **`publish: true`** also copies the SVG beside the published doc in `Documentation/docs/` when that directory exists.

### CI snapshot

**`npm run gruff-ci-snapshot`** writes **`$ORI_DATA_DIR/reports/YYYY-MM-DD-ci-gruff.svg`** (default under `~/.ori/reports/`). GitHub Actions runs this after tests and uploads the SVG as a workflow artifact.

## Asset inventory (registry) — staying current

Ori’s **project list** lives in two layers:

1. **Seed**: `src/registry-data.ts` (`DEFAULT_PROJECTS`) — versioned defaults for new installs.
2. **Living state**: `~/.ori/registry/registry.json` — updated after runs and discovery (see `src/config.ts` / storage).

### Automation

- **CI**: `.github/workflows/ori-server-ci.yml` runs `build` + `test`, then **`gruff-ci-snapshot`** and uploads the SVG artifact, on every push/PR touching `ori-server`, plus a **weekly** schedule.
- **Local**: After adding/removing MCP servers or canopy projects, refresh the seed or run your discovery flow so `registry.json` and reports stay aligned.

### Suggested human cadence

| Cadence        | Action                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| Weekly         | Skim `DEFAULT_PROJECTS` paths vs actual `Tools/MCPServers/*` layout; open PR if ids/locations drift. |
| On new server  | Add a `ProjectEntry` + threat ids; run `npm test` in `ori-server`.                                   |
| Before release | Run full vitest + confirm heatmap + GRUFF SVG in any report you publish.                             |

Persistent improvement: keep **tests** (heatmap + geometry-box) green; extend `geometry-box` only with snapshot-friendly, deterministic output.
