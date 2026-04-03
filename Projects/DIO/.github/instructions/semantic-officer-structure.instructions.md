---
description: Load when working on Semantic Officer contract structure in DIO code, tests, agent configs, hooks, or skill docs.
applyTo:
  - "combined_space.py"
  - "control_room/**/*.py"
  - "test_combined_space.py"
  - "control_room/test_*.py"
  - ".github/agents/*.agent.md"
  - ".github/hooks/*.json"
  - ".claude/skills/**/*.md"
---

# Structure Instructions

## When To Load

Load these instructions if the task touches orchestration structure, prompt structure, or validation structure for the Semantic Officer domain:

- episode flow in combined_space
- constants and pass cadence in control_room/constants
- airflow and light mapping in control_room/airflow and control_room/light_control
- contract-facing tests
- agent, hook, and skill configuration files tied to this contract

## Structural Priorities

1. Start with source-of-truth modules before editing docs or prompts.
2. Keep module ownership explicit:
   - episode owner: combined_space.py
   - constants owner: control_room/constants.py
   - airflow owner: control_room/airflow.py
   - light owner: control_room/light_control.py
3. Keep generated guidance constrained to validated public symbols.
4. Reflect behavioral constraints already enforced by tests.

## Required Response Structure

Return results in this order:

1. Scope
2. Contract
3. Changes
4. Validation
5. Risk

## Editing Rules

- Prefer minimal edits over broad rewrites.
- Do not introduce new APIs unless explicitly requested.
- Do not claim validation without listing commands that were run.
- If a requested expansion changes tested contracts, call out the contract drift explicitly.

## Validation Baseline

For code changes in this domain, prefer:

- python -m pytest test_combined_space.py -q
- python -m pytest control_room/test_constants.py -q
- python -m pytest control_room/test_airflow.py -q
- python -m pytest control_room/test_light_control.py -q
- python -m pytest control_room/test_smoke.py -q
