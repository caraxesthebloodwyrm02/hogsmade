# Eligibility Server

Dedicated MCP server for integration eligibility routines, multi-form compilation, and evolution cycle management.

## Commands

```bash
npm install
# Build dependencies first:
#   cd ../shared-types && npm run build
#   cd ../shared-pipeline && npm run build
npm run build
npm test
npm run start
```

## Optional Environment

- `ELIGIBILITY_DATA_DIR`: override the default `~/.eligibility` data directory

## Notes

- Evaluates candidates against a weighted analog hierarchy with 5 dimensions (usability, integration, governance, observability, operationalFit).
- Evolution cycles track promotion readiness through verify-beat progression.
- Depends on both `@cascade/shared-types` and `@cascade/shared-pipeline`.
