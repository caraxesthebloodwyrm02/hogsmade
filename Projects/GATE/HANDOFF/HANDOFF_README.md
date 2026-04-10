# HANDOFF — Great League Harness Team

**Handoff ID**: `harness-pokego-great-league-2026-04`
**Created**: 2026-04-09
**Status**: Verified — gate passed (`allow_promotion`, overall=0.805)

## What This Is

A Pokemon GO 1500 CP Great League team used as the **long-running architectural harness example** for the Mangrove ecosystem. Each team member maps directly to a domain-function constraint layer and a position in the 136-step harness pipeline. Subsequent custom asset batches reference this team as the canonical harness composition example.

## Contents

```
HANDOFF/
├── deployment_manifest.json     # Machine-readable full spec
├── HANDOFF_README.md            # This file
├── harness-team-spec.md         # Human-readable team + layer contract
└── scenarios/
    ├── 00-team-foundation.md    # Team composition overview
    ├── 01-bastiodon-anchor.md   # Foundation Layer scenario
    ├── 02-talonflame-probe.md   # Probe Layer scenario
    └── 03-exeggutor-coverage.md # Integration Layer scenario
```

## Layer Map

| Member           | Types        | Layer       | Quantization Zone | Transistor Role |
| ---------------- | ------------ | ----------- | ----------------- | --------------- |
| Bastiodon        | Steel/Rock   | Foundation  | Buildup (0-43)    | Arms the gate   |
| Talonflame       | Fire/Flying  | Probe       | Buildup (0-43)    | Emits signals   |
| Alolan Exeggutor | Grass/Dragon | Integration | Drop (48-67)      | Fires the burst |

## Related Deliverables

- **Plugin skill**: `~/plugins/caraxes/skills/harness/SKILL.md`
- **Agent skill**: `~/.agents/skills/harness/SKILL.md`
- **MCP server**: `CascadeProjects/Tools/MCPServers/harness-server/`
- **Python pipeline**: `CascadeProjects/Projects/GATE/harness/src/harness/`

## GATE Context

The envelope `envelope_commit-wave-2026-04` was promoted at nonce `f5495a09`. Scores: governance=0.822, integration=0.779, overall=0.805. Beat advanced to `verify` state. Gate result: `allow_promotion`.

## Usage

The harness-server MCP exposes the Python pipeline as tools. To run a scenario:

```
harness_run(scenario="bastiodon")
harness_probe(scenario_id="...", signal_type="transistor")
collect_signals(scenario_id="...")
get_scenario_insights(scenario_id="...")
```

To arm the autonomous agent loop:

```
agent_arm(interval_seconds=60, max_cycles=2)
agent_status()
agent_disarm()
```
