# hogsmade-notebook

A modern agentic multi-domain notebook tool for Claude Code, powered by the Hogsmade monorepo.

## Four domains, one notebook

| Domain                   | Commands                                                   | MCP servers backing it                                          |
| ------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------- |
| **software-engineering** | `/grid`, `/echoes`, `/apiguard`                            | grid-server, echoes-server, eligibility-server, maintain-server |
| **enterprise-search**    | `/notebook-query`, `/notebook-summary`, `/notebook-replay` | ori-server (notebook + heatmap), glimpse-engine                 |
| **data**                 | `/seeds-trend`, `/harness-status`                          | seeds-server, pulse-server, harness-server                      |
| **product-management**   | `/7pm`, `/stage6`                                          | overview-server, lots-server, ori-server                        |

All four domains write to and read from the **same ori notebook** (`~/.ori/notebook/notebook.ndjson`). There is no per-domain silo.

## Automated signal loop

Every session end: the Stop hook parses Stage 6 fences and appends them as `decision` entries.

Twice daily (02:00, 14:00): `hogsmade-driver.sh` runs `ecosystem_scan --saveSnapshot`.

Once daily (03:00): `hogsmade-driver.sh` runs `harness_run` over all 4 scenarios (bastiodon, talonflame, exeggutor-a).

Harness runs → ori bridge → ori log store → signal router evaluates → recommendations + trend entries written to notebook.

Heatmap cells gain `confirmedVia: harnessRunId` after each successful scenario run.

## Control flow (Claude Cookbooks vocabulary)

| Pattern              | Hogsmade analog                                                            |
| -------------------- | -------------------------------------------------------------------------- |
| Basic workflow       | `echoes-server` enforce/audit tool calls                                   |
| Evaluator-optimizer  | `ori-server::evaluateSignals` sliding-window router                        |
| Orchestrator-workers | `harness-server::harness_run` driving bastiodon / talonflame / exeggutor-a |

## Agents

- `notebook-pilot` — primary notebook interface; routes queries to domain pilots
- `software-engineering-pilot` — GRID, Echoes, APIGuard, MCP servers
- `enterprise-search-pilot` — notebook querying, decision archaeology
- `data-pilot` — seeds trends, harness signals, threat confirmation
- `product-management-pilot` — session reviews, Stage 6, debt triage

## Stage 6 report convention

The Stop hook captures any assistant output containing this fence:

```
<!-- STAGE-6-REPORT-BEGIN -->
## Row N — title
**What changed:** ...
**Context used:** ...
**Gates:** ...
**Verification:** ...
**Remaining:** ...
<!-- STAGE-6-REPORT-END -->
```

Each fence becomes a `category: "decision"` notebook entry.

## Replay

```
/notebook-replay <runId>
```

Maps to `mcp__ori-server__get_run_result`. Lists available runs with `mcp__ori-server__list_runs`.

## CHAIN routing matrix

Machine-readable routing: `~/.claude/registry/chain.yaml`
Rendered view: `~/.claude/CHAIN.md`
Regenerate: `node CascadeProjects/scripts/registry-build.mjs`

## Skills

Skills are not bundled. Reference `anthropics/skills` marketplace:

- `mcp-builder` — quality standard for MCP servers
- `webapp-testing` — Playwright-based UI testing (T6 tier)
- `gated-execution` — 6-stage execution protocol
- `trust-layer-review` — safety-first code review

## MCP servers

13 TypeScript + 7 Python servers declared in `.mcp.json`. See `mcp_config.json` and `claude_code_config.json` for full entries. Configuration parity is enforced — run `diff <(jq -r '.mcpServers|keys[]' mcp_config.json|sort) <(jq -r '.mcpServers|keys[]' claude_code_config.json|sort)` to verify.
