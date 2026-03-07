# Lots Server

Experiment runner MCP server for the `experiments/` sandbox.

## Commands

```bash
npm install
npm run build
npm test
npm run start
```

## Required Environment

- `LOTS_EXPERIMENTS_DIR`

## Optional Environment

- `ECHOES_AUDIT_PATH`: where experiment audit records are appended

## Notes

- Script execution is limited to files inside `LOTS_EXPERIMENTS_DIR`.
- Experiments tagged like `repo:GRID-main` are used by pulse correlations.
