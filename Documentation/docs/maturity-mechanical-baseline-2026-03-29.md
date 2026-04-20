# Maturity Mechanical Baseline

Date: 2026-03-29
Mode: structured mechanical-first handoff

## Baseline command

```bash
node /home/caraxes/CascadeProjects/scripts/maturity-baseline-check.mjs
```

## Baseline result snapshot

- `checksTotal`: 6
- `pass`: 5
- `fail`: 1

By pillar:

- `isolation`: 2 pass, 0 fail
- `dependency_completeness`: 1 pass, 1 fail
- `signal_fidelity`: 2 pass, 0 fail

## Raw check outcomes

1. `isolation/mutating_run_mode_flag`: pass
   Evidence: `runMode` controls are present in [`echoes-server/src/server.ts`](/home/caraxes/CascadeProjects/echoes-server/src/server.ts)

2. `isolation/precedent_store_env_scoped`: pass
   Evidence: [`echoes-server/src/precedent-store.ts`](/home/caraxes/CascadeProjects/echoes-server/src/precedent-store.ts) no longer defaults to `homedir()`, and server wiring uses config-scoped precedents dir.

3. `dependency_completeness/echoes_src_dist_tool_parity`: pass
   Evidence: source and dist tool sets match after rebuild.

4. `dependency_completeness/local_python_runtime_deps`: fail
   Evidence: local runtime missing imports:

- `pydantic`
- `httpx`
- `mcp`

5. `signal_fidelity/query_audit_error_filter_pure`: pass
   Evidence: [`echoes-server/src/server.ts`](/home/caraxes/CascadeProjects/echoes-server/src/server.ts) now filters exact status only.

6. `signal_fidelity/parse_error_accounting`: pass
   Evidence: `query_audit` returns `parseErrors`

## Edge discovery

Boundary probes executed:

- `sandbox home-write guard`: pass
  Runtime probe against `record_audit` with `runMode=sandbox` and default home-backed config throws:
  `runMode=sandbox blocked write under HOME: /home/caraxes/.echoes/audit.ndjson, /home/caraxes/.echoes/precedents/precedent-store.json`.
- `check_recurrence read-only behavior`: pass
  Added smoke test confirms `check_recurrence` does not create/modify precedents.
- `status=edge of semantics`: pass
  Added smoke test confirms `query_audit(status="error")` excludes `failure`.

## Mechanical gate sequence

The target is to make confidence match runtime reality by passing strict mechanical gates in order.

### M0: Isolation gate

Required outcomes:

- Mutating tools require explicit `runMode` (`live` or `sandbox`)
- Precedent store path is env-scoped, not hard-wired to home
- Sandbox mode fails hard on mixed-root writes

Minimum code actions:

- Add `ECHOES_PRECEDENTS_DIR` in config and wire `PrecedentStore` to config-resolved path
- Add `runMode` input schema to mutating echoes tools
- Add startup/runtime guard: in `sandbox`, reject home directory targets

Acceptance checks:

- `maturity-baseline-check.mjs` isolation checks both pass
- Synthetic sandbox run writes only under namespace root

Status:

- complete in `echoes-server`.

### M1: Dependency completeness gate

Required outcomes:

- Build artifacts are source-parity correct
- Runtime preflight explicitly reports missing dependencies before execution

Minimum code actions:

- Add CI/local parity check: src registered tool set must equal dist tool set for echoes
- Add preflight command for GRID toolchain imports (`pydantic`, `httpx`, `mcp`) with explicit fail state
- Block execution when mandatory dependencies are missing

Acceptance checks:

- Parity check reports zero missing dist tools
- Preflight exits non-zero when deps missing and zero when complete

Status:

- partially complete.
- pass: echoes src/dist parity.
- fail: local Python runtime dependency preflight (`pydantic`, `httpx`, `mcp` missing).

### M2: Signal fidelity gate

Required outcomes:

- `query_audit(status="error")` is semantically pure
- Any legacy compatibility behavior is explicit and opt-in

Minimum code actions:

- Remove implicit `failure` alias from the `error` filter path
- If backward compatibility is required, add explicit switch such as `includeLegacyErrorAlias`
- Add test coverage for status filter semantics

Acceptance checks:

- Query status filters return only requested status by default
- Existing dashboards continue to work via explicit opt-in compatibility mode

Status:

- complete for current default semantics.

## Handoff packet for human/philosophy review

Mechanical truth at handoff:

- The system now has explicit controlled drift boundaries: `runMode` plus non-live home-write blocking.
- The system can explore at edges without silent mutation in `check_recurrence`.
- Remaining hard blocker is dependency completeness in local Python runtime.
- Confidence should be considered strong on the TypeScript control plane, provisional on the Python intelligence plane until dependencies are complete.

Human review prompts:

1. For your philosophy layer, should `edge` mode always stay non-home-write, or should there be a signed temporary override path?
2. What is your non-negotiable definition of “artistic courage” in system terms: exploration of reasoning only, or exploration with controlled state mutation?
3. At what stage should Python-plane missing dependencies block all cross-plane orchestration versus only degrade specific capabilities?

Decision rule for next session:

- Keep autonomy expansion on hold only for Python-plane actions until M1 is fully green.
- Use `live` only for deliberate operational writes; use `sandbox` or `edge` for discovery and boundary probing.
