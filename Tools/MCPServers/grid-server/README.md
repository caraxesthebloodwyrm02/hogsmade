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

## GRID-main integration (optional)

When `GRID_API_URL` is set, grid-server calls `POST {GRID_API_URL}/api/v1/gate/validate` **after** local envelope checks pass. The response is used only to attach `enhancedValidation` to the tool result; local validation remains authoritative.

When `GRID_API_URL` is unset or the request fails (e.g. GRID-main down or unreachable), grid-server does not block: it either skips the call (when unset) or uses a fallback result with `approved: true` and `flags: ['grid_unavailable']`. Base validation therefore works when GRID-main is unavailable.

The GRID-main `/api/v1/gate/validate` endpoint is **optional and not yet implemented** in GRID-main. When implemented, it should follow the request/response shape used by grid-server (see `src/server.ts`: request body `source_agent`, `target`, `action`, `payload_hash`, `test_status`; response with `approved`, `flags`, `reasoning`).

Startup probe behavior:
- `grid-server` probes `GET /health` first.
- If `/health` is unavailable, it falls back to `GET /api/v1/health`.
- Admission MCP tools (`admission_*`) still require `GET /admission/*` endpoints to be reachable.

## Notes

- The server fails fast when required machine-specific roots are missing.
- Remote GRID validation is optional and never replaces local envelope checks.
