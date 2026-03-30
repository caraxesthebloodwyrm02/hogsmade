# Mangrove Pi Workspace

## Auto-Loaded Package

This workspace includes `pi-mangrove` via `.pi/settings.json`.

## Active Tools

- `dio_episode_summary` — Episode structure from DIO
- `dio:status` — Constants query
- `security:audit` — Isolation scan

## Active Skills

- `iterate` — Project delivery framework
- `glimpse` — Cognitive engine reference
- `lifeguard-review` — API safety review
- `trust-layer-review` — Trust-layer and production safety review

## Active Prompts

- `/mangrove-dev` — Development guide
- `/tuv-review` — TUV-001 trust contract audit
- `/safety-gate` — Go/no-go safety review

## Quick Commands

| Need | Action |
|------|--------|
| DIO phase info | `dio:status` |
| Security scan | `security:audit` |
| Episode summary | `dio_episode_summary {"partIndex": 1}` |
| Skill help | `/skill:iterate` |
| Prompt audit | `/tuv-review` |

## Network Isolation (UNPROVISIONED MODE)

**Status**: UNPROVISIONED — All external network access blocked until further notice.

**Allowed**: localhost only (127.0.0.1, ::1, localhost)
**Blocked**: All external APIs, LAN traffic, cloud services

**Rate Limits**: 10 req/sec per endpoint, 30s timeout
**Circuit Breaker**: 5 failures = 60s cooldown

**Never**:
- Make external API calls without explicit approval
- Bypass localhost-only enforcement
- Disable rate limiting or circuit breakers
