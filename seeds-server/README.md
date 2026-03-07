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
- Alerting and trend analysis depend on real snapshots created by `ecosystem_scan`.
