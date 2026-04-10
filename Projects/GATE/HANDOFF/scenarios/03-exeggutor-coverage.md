# Scenario 03 — Alolan Exeggutor: Integration Layer Coverage

**Scenario ID**: `exeggutor-a`
**Pokemon**: Alolan Exeggutor (Grass/Dragon)
**Role**: Coverage / Closer
**Layer**: Integration
**Quantization Zone**: Drop (steps 48–67 per cycle)

## Scenario Contract

The Integration Layer scenario tests **cross-domain burst execution after two prerequisite layers have primed**. Alolan Exeggutor enters in the drop zone and fires `FIRE_INTEGRATION` at step 65 — the last transistor gate in the chain. The scenario is successful when the gate fires and the harness manifest is written to disk.

## Domain-Function Contract

**Function**: Cross-domain integration executor — makes calls that span multiple subsystems simultaneously.

**Domain**: Integration test suites, API choreography, multi-service workflows, end-to-end checkout flows. These tasks run at full intensity, expect all dependencies to be ready, and produce the final artifact (the manifest).

**Constraint**: The Integration Layer must not be called without a warm Foundation and Probe layer. It is designed to run at full intensity (1.0) and will not degrade gracefully if earlier layers have not completed their buildup work.

## Transistor Specification

```
hook_id:       FIRE_INTEGRATION
armed_at_step: 50   (cycle_index 50, early drop zone, quadrant D)
fires_at_step: 65   (cycle_index 65, late drop zone)
signal:        HARNESS_TRANSISTOR
state_on_arm:  ON (1)
state_on_fire: OFF (0) → emits {HARNESS_TRANSISTOR_FIRE_INTEGRATION: "1"}
```

After `FIRE_INTEGRATION` fires, the pipeline triggers `write_manifest_json()` and `write_manifest()` from the Python harness. The manifest path is reported by `harness_manifest()`.

## Struggle Scenario: Double-Weakness to Ice

Alolan Exeggutor is Grass/Dragon — both types are weak to Ice (×2 each = ×4 effective). Any integration call that routes through a "cold" dependency (cold cache, cold storage, cold database connection) will hit the double-weakness. Two independent subsystems that both depend on the same cold layer will fail simultaneously.

**Harness analogy**: Integration tests that rely on cold database connections AND cold cache simultaneously will both fail when the infrastructure is cold. The fix is not to warm both independently — it is to design integration calls that share the cold-start path (one init, two consumers) rather than hitting it twice.

**Verification**: `get_scenario_insights()` should flag any integration scenario that has two or more signal paths converging on the same decorated var. If `HARNESS_COLD_PATH` appears in both the Foundation and Probe signal collections, the double-weakness is present.

## Integration Points

- **Requires**: `ARM_FOUNDATION` fired (step 43) AND `EMIT_PROBE` fired (step 28)
- **Requires**: Silence zone (44–47) complete — no active signals
- **Produces**: Full harness manifest (markdown + JSON) in `GATE/harness/manifests/`
- **Produces**: Echoes audit event via `emitAudit({ source: "harness-server", tool: "harness_run", status: "success" })`

## Run Command

```
harness_run(scenario="exeggutor-a")
harness_probe(scenario_id="exeggutor-a-<id>", signal_type="transistor")
harness_manifest()
```

## Expected Signals

| Step | Signal                              | Value                 |
| ---- | ----------------------------------- | --------------------- |
| 48   | (drop zone entry)                   | intensity=1.0         |
| 50   | HARNESS_TRANSISTOR_FIRE_INTEGRATION | 0 (armed)             |
| 65   | HARNESS_TRANSISTOR_FIRE_INTEGRATION | 1 (fired)             |
| 67   | HARNESS_MANIFEST_WRITTEN            | path to manifest file |

## Failure Modes

| Failure                      | Cause                                                     | Recovery                                                              |
| ---------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------- |
| Manifest not written         | `FIRE_INTEGRATION` gate stuck (ARM never reached step 50) | Verify Foundation and Probe ran first                                 |
| Double-weakness triggered    | Two signal paths share a cold dependency                  | Redesign integration call to use shared init path                     |
| Integration fires in buildup | Scenario registered in wrong zone                         | Check `scenario.quantization_zone == "drop"`                          |
| Cycle 1 manifest missing     | Exeggutor only ran in cycle 0                             | The full run requires both cycles; check `agent_status()` cycle count |

## Manifest Output

After `FIRE_INTEGRATION` fires, the manifest is written to:

```
CascadeProjects/Projects/GATE/harness/manifests/harness-manifest-<timestamp>.md
CascadeProjects/Projects/GATE/harness/manifests/harness-manifest-<timestamp>.json
```

Use `harness_manifest()` to retrieve the path without re-running the pipeline.
