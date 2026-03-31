# Security Hardening Manifest
# Generated: 2026-03-30T16:15:00Z
# Status: UNPROVISIONED - Network activity isolated until further notice

## Hardening Actions Applied

### 1. Network Isolation
- All external network access blocked for AI tools
- Localhost-only enforcement (127.0.0.1, ::1)
- No external API endpoints permitted

### 2. API Guardrails
- Rate limiting: 10 requests/second per endpoint
- Timeout: 30 seconds for all API calls
- Request size limit: 1MB
- Response size limit: 10MB
- Circuit breaker: 5 consecutive failures = 60s cooldown

### 3. Secret Rotation
- New session identifiers generated
- Hashes rotated for audit trail
- API keys invalidated (none were active)

### 4. Audit Trail
- Integrity verification enabled
- Tamper-evidence logging active
- Append-only enforcement

### 5. Tool-Specific Hardening
- Windsurf: Network guardrails applied
- Cursor: Localhost-only enforcement
- OpenCode: External API blocking
- Zed: Network isolation active
- Claude Code: Guardrails enabled
- Pi: Unprovisioned mode
- Codex: Network blocked

## Configuration Changes

### MCP Servers
- All servers: `OLLAMA_BASE_URL=http://localhost:11434` (enforced)
- All servers: `GRID_API_URL=http://localhost:8080` (enforced)
- No external URLs permitted

### Environment Variables
- `NETWORK_ISOLATION_MODE=unprovisioned`
- `EXTERNAL_API_ACCESS=disabled`
- `RATE_LIMIT_ENABLED=true`
- `AUDIT_INTEGRITY_CHECK=true`

## Verification Commands

```bash
# Check network listeners (should only show localhost)
ss -tlnp | grep -v '127.0.0.1\|::1'

# Verify firewall rules
sudo nft list ruleset

# Check audit trail integrity
tail -20 ~/.echoes/audit.ndjson

# Verify no external connections
lsof -i -P -n | grep -v '127.0.0.1\|::1'
```

## Rollback Procedure

To restore normal operations:
1. Set `NETWORK_ISOLATION_MODE=normal`
2. Remove rate limiting if needed
3. Re-enable external API access
4. Update this manifest with new timestamp

## Next Steps

1. Monitor audit trail for anomalies
2. Review firewall logs weekly
3. Rotate secrets monthly
4. Update this manifest on any changes

---
**TUV-001 Compliance**: All changes trace to stated objective (security hardening)
**Scope**: Network isolation, API guardrails, secret rotation
**Risk**: Low - all changes are reversible and non-destructive
