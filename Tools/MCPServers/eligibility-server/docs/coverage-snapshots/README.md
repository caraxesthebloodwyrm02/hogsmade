# Coverage snapshots (eligibility-server)

Point-in-time copies of Vitest `json-summary` output for trend tracking and CI baselines.

## Latest snapshot

| Field | Value |
| --- | --- |
| **Date** | 2026-04-06 |
| **Artifact** | [2026-04-06.json](./2026-04-06.json) |
| **Command** | `npm run test:coverage` (from package root) |
| **Commit** | `fa4c4f48d0e662c9826ad73daf4b8d7759019a74` (CascadeProjects repo at snapshot time) |
| **Vitest** | 3.2.4 |
| **Coverage provider** | `@vitest/coverage-v8` 3.2.4 (`v8`) |

### Totals (from snapshot `total`)

| Metric | Covered |
| --- | ---: |
| Lines | 93.7% |
| Statements | 93.7% |
| Functions | 92.95% |
| Branches | 85.93% |

### Enforced thresholds (`vitest.config.ts`)

| Metric | Minimum % |
| --- | ---: |
| Lines | 55 |
| Statements | 55 |
| Functions | 50 |
| Branches | 45 |

### Line-audit fixture hook

Isolated structural audits may set both of:

- `ELIGIBILITY_LINE_AUDIT_SRC_DIR`
- `ELIGIBILITY_LINE_AUDIT_TEST_DIR`

When unset, `checkTheLine` / `holdTheLine` scan this package’s `src/` and `tests/` only.

## Adding a new snapshot

1. Run `npm run test:coverage`.
2. Copy `coverage/coverage-summary.json` to `docs/coverage-snapshots/YYYY-MM-DD.json`.
3. Update this README table with date, commit hash (`git rev-parse HEAD` from the repo root), and headline totals.
