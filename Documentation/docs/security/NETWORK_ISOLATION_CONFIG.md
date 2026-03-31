# Network Isolation Configuration
# Applied: 2026-03-30T16:15:00Z
# Mode: UNPROVISIONED

## Allowed Endpoints

### Localhost Only
- `http://127.0.0.1:*` - All ports
- `http://[::1]:*` - IPv6 localhost
- `http://localhost:*` - Localhost alias

### Specific Services
- `http://localhost:8080` - GRID API
- `http://localhost:11434` - Ollama
- `http://localhost:5357` - VS Code
- `http://localhost:21894` - VS Code
- `http://localhost:18789` - OpenClaw Gateway
- `http://localhost:18791` - OpenClaw Gateway
- `http://localhost:8889` - Python service

## Blocked Endpoints

### External APIs (BLOCKED)
- `https://api.openai.com/*`
- `https://api.anthropic.com/*`
- `https://api.google.com/*`
- `https://*.amazonaws.com/*`
- `https://*.cloudflare.com/*`
- `https://*.github.com/*`
- All other external domains

### Internal Network (BLOCKED)
- `192.168.*/*`
- `10.*/*`
- `172.16.*/*`
- All LAN traffic

## Rate Limits

### Per Endpoint
- Requests: 10/second
- Burst: 30 requests
- Window: 1 second

### Per Client
- Requests: 100/minute
- Burst: 300 requests
- Window: 60 seconds

## Timeouts

- Connection: 5 seconds
- Read: 30 seconds
- Write: 10 seconds
- Total: 45 seconds

## Circuit Breaker

- Failure threshold: 5 consecutive failures
- Success threshold: 2 consecutive successes
- Timeout: 60 seconds
- Half-open requests: 1

## Enforcement

### MCP Servers
- All MCP servers must use localhost URLs
- External URLs will be rejected
- Rate limiting enforced per server

### AI Tools
- Windsurf: Enforced via `.windsurfrules`
- Cursor: Enforced via `.cursorrules`
- OpenCode: Enforced via `opencode.json`
- Zed: Enforced via `.zed/AGENTS.md`
- Claude Code: Enforced via `.claude/CLAUDE.md`
- Pi: Enforced via `.pi/AGENTS.md`
- Codex: Enforced via `.codex.md`

### Environment Variables
```bash
export NETWORK_ISOLATION_MODE=unprovisioned
export EXTERNAL_API_ACCESS=disabled
export RATE_LIMIT_ENABLED=true
export CIRCUIT_BREAKER_ENABLED=true
```

## Monitoring

### Audit Trail
- All network attempts logged to `~/.echoes/audit.ndjson`
- Blocked attempts flagged with `status: blocked`
- Rate limit violations logged

### Alerts
- External connection attempts: Alert immediately
- Rate limit violations: Log and alert
- Circuit breaker trips: Alert immediately

## Verification

```bash
# Test localhost access (should succeed)
curl -s http://localhost:8080/health

# Test external access (should fail)
curl -s https://api.openai.com/v1/models

# Check rate limiting
for i in {1..20}; do curl -s http://localhost:8080/health; done

# Check audit trail
tail -50 ~/.echoes/audit.ndjson | grep network
```

## Exceptions

No exceptions are currently permitted. To request an exception:

1. Document the business need
2. Specify the exact endpoint
3. Provide justification
4. Get explicit approval
5. Update this manifest

---
**Status**: Active
**Mode**: UNPROVISIONED
**Last Updated**: 2026-03-30T16:15:00Z
