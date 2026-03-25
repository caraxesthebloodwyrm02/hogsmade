# Execution Mindmap — 2026-03-25

## Goal
Stabilize the uncommitted CascadeProjects work by fixing the grounding regression, aligning DIO docs with the cleaned test setup, and removing stale generated guidance before commit.

## Workstreams

### 1. Grounding execution path
- Problem: `applyGrounding()` assumes synchronous providers, but `WebGroundingProvider.verify()` is async.
- Actions:
  - add `applyGroundingAsync()`
  - make sync `applyGrounding()` fail loudly on async providers
  - add `runContextPipelineAsync()` for async grounding flows
  - cover both the guardrail and the async path with tests
- Exit criteria:
  - no empty grounding payloads from async providers
  - no `null` adjusted confidence values from async providers
  - targeted grounding tests pass

### 2. DIO python-basics docs alignment
- Problem: `conftest.py` is now effectively empty, but docs still advertise removed fixtures.
- Actions:
  - update `tests/README.md`
  - update `INSIGHTS.md`
- Exit criteria:
  - docs describe the current zero-fixture state

### 3. Generated residue cleanup
- Problem: `.scalpel/tasks.md` still claims the `glimpse-server` editor config gap is open.
- Actions:
  - mark task 5 resolved and correct the context note
- Exit criteria:
  - generated task file no longer encodes known-false guidance

## Verification
- `node --test glimpse-engine/tests/grounding.test.js glimpse-engine/tests/glimpse-engine.test.mjs`
- `python3 -m unittest test_airflow.py` from `DIO/control_room`
- `pytest DIO/program/python-basics/tests -q` when pytest is available
