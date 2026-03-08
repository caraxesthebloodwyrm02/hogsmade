# GATE — Envelope staging and audit

Staging directory for sealed envelopes and verification artifacts. Used by grid-server (or other verifiers) and surfaced in **glimpse-artifact** (GATE view).

## Layout

| Path | Purpose |
|------|--------|
| `incoming/` | Sealed envelopes (JSON) awaiting verification |
| `results/` | Verification result payloads |
| `audit.ndjson` | Audit log (one JSON object per line; UTC timestamps) |
| `.nonce_registry.json` | Nonce lifecycle (format may differ from GRID-main `boundaries/transition_gate` NonceRegistry) |
| `*.contract.json` | Contract and schema for receiving agent / partition rules |

## Envelope schema

Envelopes in `incoming/` follow the schema expected by **GRID-main** `boundaries/transition_gate`: required fields include `envelope_id`, `payload`, `payload_hash`, `nonce`, `timestamp`, `user_fingerprint`, `machine_fingerprint`, `scope`, `source_partition`, `target_partition`, `tests_passed`, `lint_passed`. Extra fields (e.g. `sealed_by`, `metadata`) are allowed.

## Paths and case

- This directory is **GATE** (uppercase) in the repo. Contracts may reference `gate` (lowercase); on Windows both resolve to the same path.
- `target_partition` in envelopes often points at this staging area (e.g. `.../gate/incoming` or `.../GATE/incoming`).

## Glimpse-artifact

The **GATE** view in glimpse-artifact shows mock verification data from `createGateSnapshot` / `useGateData`. To wire real data, point the app at grid-server (or another API) that reads `incoming/`, `results/`, and `audit.ndjson`.
