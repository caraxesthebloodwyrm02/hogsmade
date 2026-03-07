# Pulse Server

Developer dashboard MCP server that aggregates audit, workflow, and repo-health signals.

## Commands

```bash
npm install
npm run build
npm test
npm run start
```

## Optional Environment

- `PULSE_DATA_DIR`
- `ECHOES_DATA_DIR`
- `ECHOES_AUDIT_PATH`
- `AFLOAT_DATA_DIR`
- `SEEDS_DATA_DIR`

## Notes

- `morning_briefing`, `check_alerts`, and `what_should_i_work_on` are rules-based correlations over local files.
- **Adaptive briefings**: `briefing_preferences_set` stores section skip and priority-promotion preferences in `~/.pulse/preferences.json`; the morning briefing applies them.
- Pulse remains read-only with respect to the other servers' data stores.’ data stores.
