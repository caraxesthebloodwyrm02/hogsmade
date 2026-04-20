# Scenario 01 — Bastiodon: Foundation Layer Anchor

**Scenario ID**: `bastiodon`
**Pokemon**: Bastiodon (Steel/Rock)
**Role**: Lead / Anchor
**Layer**: Foundation
**Quantization Zone**: Buildup (steps 0–43 per cycle)

## Scenario Contract

The Foundation Layer scenario tests **long-running stability under slow energy accumulation**. Bastiodon enters first and holds the field across the full buildup window. The scenario is successful only when the `ARM_FOUNDATION` transistor has been armed and the pipeline has accumulated sufficient signal state to support the drop.

## Domain-Function Constraint

**Function**: Fail-closed anchor — never drops its state, never yields until explicitly relieved.

**Domain**: Infrastructure initialization — equivalent to database migrations, config loading, certificate validation, dependency resolution. These tasks are slow, sequential, and must complete before any higher-order work begins.

**Constraint**: The Foundation Layer must not be interrupted. If the scenario is stopped mid-buildup, the transistor gate is left in `ARMED` state (ON=1) but never fires. The pipeline detects this as a stuck gate and marks the cycle as `FAILED`.

## Transistor Specification

```
hook_id:       ARM_FOUNDATION
armed_at_step: 12   (cycle_index 12, quadrant A, phase=setup)
fires_at_step: 43   (cycle_index 43, last step of buildup)
signal:        HARNESS_TRANSISTOR
state_on_arm:  ON (1)
state_on_fire: OFF (0) → emits {HARNESS_TRANSISTOR_ARM_FOUNDATION: "1"}
```

## Struggle Scenario: Energy Generation Lag

Smack Down (4-turn fast move) generates 8 energy per use. To charge Stone Edge (100 energy), Bastiodon needs 13 Smack Downs — 52 turns. In the 68-step pipeline, this maps to steps 0–43 being consumed by energy generation before the drop zone becomes viable.

**Harness analogy**: The Foundation Layer is inherently slow. It must run through all 44 buildup steps even when the system is ready to proceed. Do not optimize away the buildup — the slow accumulation is a design property, not a bug.

**Verification**: The harness-server `collect_signals()` tool should return `energy_accumulated: 8` at step 12 (first Smack Down), growing linearly through step 43.

## Integration Points

- **Talonflame depends on**: Bastiodon arming `ARM_FOUNDATION` before emitting `EMIT_PROBE`
- **Exeggutor depends on**: Both Bastiodon and Talonflame completing their buildup work before step 48

## Run Command

```
harness_run(scenario="bastiodon")
harness_probe(scenario_id="bastiodon-<id>", signal_type="transistor")
```

## Expected Signals

| Step | Signal                            | Value                    |
| ---- | --------------------------------- | ------------------------ |
| 12   | HARNESS_TRANSISTOR_ARM_FOUNDATION | 0 (armed, not yet fired) |
| 28   | HARNESS_ENERGY_BASTIODON          | 8+ (accumulated)         |
| 43   | HARNESS_TRANSISTOR_ARM_FOUNDATION | 1 (fired)                |

## Failure Modes

| Failure                    | Cause                                                       | Recovery                                                |
| -------------------------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| Gate stuck ON              | Pipeline interrupted at step 12-42                          | Re-run from step 0; transistor resets on cycle re-entry |
| Energy never accumulates   | Scenario registered in wrong zone (drop instead of buildup) | Check `scenario.quantization_zone == "buildup"`         |
| ARM_FOUNDATION never fires | `fires_at_step` overridden to >43                           | Check pipeline config; must be ≤43                      |
