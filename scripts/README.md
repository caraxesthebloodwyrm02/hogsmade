# Workspace scripts

Root-level scripts for the CascadeProjects workspace. Run from repo root or adjust paths as needed.

## Index

| Script | Purpose |
|--------|--------|
| [sync-default-master.mjs](sync-default-master.mjs) | Sync `glimpse.master.yaml` → `glimpse-engine/default-master.js` (embedded fallback). |
| [bootstrap_glimpse_logic.mjs](bootstrap_glimpse_logic.mjs) | Bootstrap and validate Glimpse logic; run context pipeline on sample datasets. |
| [sync-default-master.mjs](sync-default-master.mjs) | Sync `glimpse.master.yaml` → `glimpse-engine/default-master.js` (embedded fallback). |
| [bootstrap_glimpse_logic.mjs](bootstrap_glimpse_logic.mjs) | Bootstrap and validate Glimpse logic; run context pipeline on sample datasets. |
| [sync-default-master.mjs](sync-default-master.mjs) | Sync `glimpse.master.yaml` → `glimpse-engine/default-master.js` (embedded fallback). |
| [bootstrap_glimpse_logic.mjs](bootstrap_glimpse_logic.mjs) | Bootstrap and validate Glimpse logic; run context pipeline on sample datasets. |
| [emit_phase2_audit_events.ts](emit_phase2_audit_events.ts) | Emit Phase 2 audit events (TypeScript). |
| **gate/** | GATE envelope and verification helpers (Python). |
| [gate/create_test_envelope.py](gate/create_test_envelope.py) | Create a test envelope and write to `GATE/incoming/`. |
| [gate/debug_fingerprint.py](gate/debug_fingerprint.py) | Debug fingerprint mismatch for an envelope in `GATE/incoming/`. |
| [gate/verify_envelope.py](gate/verify_envelope.py) | Run transition gate verification on the next envelope in `GATE/incoming/` (requires GRID-main and TransitionGate secret). |

Gate scripts resolve paths relative to the workspace root (`GATE/`, `GRID-main/`). Run from repo root, e.g.:

```bash
python scripts/gate/create_test_envelope.py
python scripts/gate/verify_envelope.py
```

For local test envelope creation and fingerprint debugging, set `TRANSITION_GATE_TEST_SECRET` to your test secret (never commit this value). Production verification uses the TransitionGate credential from the system store (e.g. Windows Credential Manager) via `verify_envelope.py`.
