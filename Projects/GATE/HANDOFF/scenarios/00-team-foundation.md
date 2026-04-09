# Scenario 00 — Team Foundation

**Scenario ID**: `00-team-foundation`  
**Type**: Overview  
**Harness Layer**: All three layers  
**Quantization Zone**: Full cycle

## Summary

This scenario introduces the full team as a coherent architectural unit. Before running any individual layer scenario, this document establishes the dependency chain and the correct order of operations across the 136-step pipeline.

## Dependency Chain

```
Bastiodon (Foundation)
  └── arms transistor ARM_FOUNDATION at step 12
        └── Talonflame (Probe)
              └── emits EMIT_PROBE at step 28, primes energy
                    └── Silence zone (steps 44-47): quiesce
                          └── Alolan Exeggutor (Integration)
                                └── fires FIRE_INTEGRATION at step 65
                                      └── Manifest written: harness complete
```

## Correct Invocation Order

1. Run `bastiodon` scenario first — arms the gate
2. Run `talonflame` scenario second — primes signals during buildup
3. Enter silence zone (automatic in the pipeline — no action required)
4. Run `exeggutor-a` scenario — executes the drop and writes the manifest

## Constraints

- Do not run Exeggutor before Bastiodon arms. The transistor gate is fail-closed: if `ARM_FOUNDATION` has not fired, the drop will not execute.
- Do not skip the silence zone. It is a deliberate quiesce; bypassing it causes the drop to fire with unresolved signal state.
- Both cycles must complete. The harness manifest is not considered valid until cycle 1 exits successfully.

## Verification

After all three scenarios complete, verify:
- `harness_manifest()` returns a complete 136-step manifest
- `get_scenario_insights()` shows `total_transistors_fired: 2` (ARM + FIRE)
- `collect_signals()` shows probe signals from both Bastiodon and Talonflame buildup windows

## Failure Mode

If the team composition fails, check the quantization zone assignment first. The most common failure is a scenario running in the wrong zone — Exeggutor registered as a buildup actor, or Bastiodon registered as a drop actor. Zone assignment is fixed by `QuantizationProfile.zone_for(cycle_index)` in the Python pipeline.
