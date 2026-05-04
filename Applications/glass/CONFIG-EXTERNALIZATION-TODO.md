# Configuration Externalization — Execution Board

## Goal Statement

**Separate behavior from code** so Glass can load its field personality and ceremony gating from structured data instead of hardcoded TypeScript constants.

## Success Scenario — Hard Constraints

- [x] A single JSON profile owns the default modulation map and rarity gate.
- [x] The main process can load that profile and support an override path through an environment variable.
- [x] The renderer can bootstrap from the loaded profile without direct Node access.
- [x] Asset rarity validation is driven by the loaded profile, not by a hardcoded gate constant.
- [x] Typecheck, tests, and production build remain green after the refactor.

## Action Lanes

### Lane 1 — Source of Truth

- [x] Add a checked-in `config/field-profile.json` as the default structured data map.
- [x] Define shared TypeScript schema for the field profile and generic rarity-gate evaluation.
- [x] Add a main-process loader that validates and normalizes profile data.

### Lane 2 — Runtime Wiring

- [x] Expose profile retrieval through Electron IPC/preload.
- [x] Bootstrap the renderer with the loaded profile before constructing `Field` behavior.
- [x] Update `Field` / `ModulationEngine` to consume profile data instead of hardcoded constants.

### Lane 3 — Ceremony Gate Untangling

- [x] Route asset rarity checks through the loaded profile inside the bridge watcher.
- [x] Remove the hardcoded rarity gate constant from shared schema state definitions.

### Lane 4 — Verification

- [x] Update tests for profile wiring and generic rarity gating.
- [x] Run typecheck, tests, and build to verify the success scenario.
