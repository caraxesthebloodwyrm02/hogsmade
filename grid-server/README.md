# Grid Server

GATE envelope verification MCP server.

## Commands

```bash
npm install
npm run build
npm test
npm run start
```

## Required Environment

- `CASCADE_WORKSPACE_ROOT`
- `GATE_DIR`

## Optional Environment

- `GRID_API_URL`: enables additive GRID-main validation after local checks pass

## Notes

- The server fails fast when required machine-specific roots are missing.
- Remote GRID validation is optional and never replaces local envelope checks.
