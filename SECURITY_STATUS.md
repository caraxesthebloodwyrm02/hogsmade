# Security Implementation Status

Last reviewed: 2026-03-08

## Implemented

- **GATE envelope verification**: SHA-256 payload hashing, nonce-based replay protection, timestamp freshness (600s window), timing-safe comparison
- **8-stage execution pipeline** (mcp-tool-experiment): Input validation, capability checking, rate limiting, SSRF protection, policy evaluation, execution, PII/secret filtering, audit logging
- **Dry-run defaults**: afloat-server and maintain-server require explicit confirmation for destructive operations
- **Confirm-phrase gate**: maintain-server requires `CONFIRM-CLEANUP` string to execute cleanup actions
- **Audit logging**: echoes-server (NDJSON), grid-server (gate audit), maintain-server (cleanup log), pulse-server (journal)
- **Path traversal protection**: lots-server validates script paths stay within experiments directory
- **GRID-main safety bridge**: Detectors, escalation, guardian rules, behavioral shield, parasite guard
- **GRID-main auth**: JWT tokens, RBAC with scopes, bcrypt password hashing, token revocation, account lockout

## Referenced in Config but NOT Implemented

These appear in `mcp_config.json` or documentation but have no backing implementation:

| Reference | Where | Status |
|-----------|-------|--------|
| `${AFLOAT_ENCRYPTION_KEY}` | mcp_config.json | Env var referenced, not used in code |
| SOC2 compliance | mcp_config.json security section | Schema placeholder only |
| GDPR compliance | mcp_config.json security section | Schema placeholder only |
| ISO27001 compliance | mcp_config.json security section | Schema placeholder only |
| RBAC for MCP servers | mcp_config.json | GRID-main has RBAC; individual MCP servers do not |
| Inter-server authentication | — | All servers use local stdio; no auth layer exists |
| Encryption at rest for audit logs | — | NDJSON files are plaintext on disk |

## Recommendations

1. Remove aspirational security references from mcp_config.json or clearly mark them as `"status": "planned"`
2. If MCP servers are ever exposed as network services, add authentication before deployment
3. Consider encrypting `~/.echoes/audit.ndjson` if it captures sensitive metadata
