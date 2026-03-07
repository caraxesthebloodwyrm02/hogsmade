# Seeds Server

Cross-repository health monitor for the Seeds workspace.

## Commands

```bash
npm install
npm run build
npm test
npm run start
```

## Required Environment

- `SEEDS_ROOT`

## Optional Environment

- `SEEDS_DATA_DIR`: override the default `~/.seeds-server` data directory

## Notes

- `SEEDS_ROOT` is required and intentionally fails fast when missing.
- Alerting and trend analysis depend on real snapshots created by `ecosystem_scan` with `saveSnapshot: true`.

## Snapshot contract

Snapshots saved by `ecosystem_scan` are JSON files with `overallScore` (number) and `repos` (array of `{ name, healthScore, ... }`). pulse-server’s `check_alerts` and morning briefing read the latest snapshot and rely on these fields. See [docs/DATA_CONTRACTS.md](../docs/DATA_CONTRACTS.md) for the full contract.
