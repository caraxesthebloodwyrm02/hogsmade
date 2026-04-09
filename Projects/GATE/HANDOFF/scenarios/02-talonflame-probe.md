# Scenario 02 — Talonflame: Probe Layer Emitter

**Scenario ID**: `talonflame`  
**Pokemon**: Talonflame (Fire/Flying)  
**Role**: Safe Switch / Probe  
**Layer**: Probe  
**Quantization Zone**: Buildup (steps 0–43), transition through Silence (44–47)

## Scenario Contract

The Probe Layer scenario tests **fixed-cadence signal emission during the buildup window**. Talonflame enters as a safe switch after Bastiodon arms the gate. The scenario is successful when `EMIT_PROBE` has fired and the decorated variable `HARNESS_PROBE_CADENCE` is set in the pipeline environment before the silence zone begins.

## Domain-Function Constraint

**Function**: High-throughput scanner with a fixed poll interval — emits signals at a rigid cadence, not on demand.

**Domain**: Observability infrastructure — equivalent to health check loops, metric collection agents, log stream processors, canary probes. These systems operate on fixed schedules; the rest of the pipeline must accommodate the schedule, not the other way around.

**Constraint**: The Probe Layer emits on a 5-step cadence (mirroring Incinerate's 5-turn channel). Consumers of probe signals must tolerate up to 5 steps of staleness. If a consumer requires fresher signals, the architecture is wrong — not the probe.

## Transistor Specification

```
hook_id:       EMIT_PROBE
armed_at_step: 15   (cycle_index 15, after Bastiodon arms at 12)
fires_at_step: 28   (cycle_index 28, mid-buildup)
signal:        HARNESS_PROBE
state_on_arm:  ON (1)
state_on_fire: OFF (0) → emits {HARNESS_PROBE_EMIT_PROBE: "1"}
```

## Decorated Variable

```
name:          PROBE_CADENCE
env_key:       HARNESS_PROBE_CADENCE
value:         "5"
trigger_step:  28
zone:          buildup
fire_on:       step_enter
```

## Struggle Scenario: Incinerate's Channel Window

Incinerate (5-turn fast move) is the longest fast move channel in Pokemon GO. During those 5 turns, Talonflame cannot do anything else — cannot switch, cannot use a charged move, cannot react to incoming charged moves. The probe is committed for 5 full steps.

**Harness analogy**: When a probe is scanning, it cannot also be responding to external commands. If the harness-server calls `harness_probe()` while the scenario is mid-emission (steps 15–19, 20–24, 25–29), the result will be stale by up to 4 steps. The `harness_probe()` tool must document this staleness window.

**Verification**: `collect_signals()` should show probe emissions at steps 28, 33, 38, 43 (5-step cadence from step 28 to end of buildup). Step 43 is the last valid buildup emission before silence.

## Silence Transition (Steps 44–47)

During the silence zone, Talonflame does not emit. This is the deliberate quiesce before Exeggutor fires. Any signal collected in the silence window is an artifact — treat it as noise, not data.

## Integration Points

- **Requires**: Bastiodon to have armed `ARM_FOUNDATION` before step 15
- **Provides**: Primed energy state and `HARNESS_PROBE_CADENCE` decorated var for Exeggutor to read on drop entry

## Run Command

```
harness_run(scenario="talonflame")
harness_probe(scenario_id="talonflame-<id>", signal_type="decorated_var")
```

## Expected Signals

| Step | Signal | Value |
|------|--------|-------|
| 15 | HARNESS_PROBE_EMIT_PROBE | 0 (armed) |
| 28 | HARNESS_PROBE_EMIT_PROBE | 1 (fired) |
| 28 | HARNESS_PROBE_CADENCE | 5 |
| 33 | HARNESS_PROBE_EMIT_PROBE | 1 (re-armed and fired) |
| 44–47 | (silence) | No emissions |

## Failure Modes

| Failure | Cause | Recovery |
|---------|-------|----------|
| Probe fires before ARM_FOUNDATION | Talonflame entered before Bastiodon armed | Run scenarios in order: bastiodon → talonflame |
| Probe emits in silence zone | `fires_at_step` set to 44+ | Cap `fires_at_step` to ≤43 |
| No PROBE_CADENCE in environment | Decorated var trigger_step misconfigured | Verify trigger_step=28 in scenario definition |
| Stale probe data on consumer | Consumer polling faster than 5-step cadence | Design consumers to tolerate 5-step staleness window |
