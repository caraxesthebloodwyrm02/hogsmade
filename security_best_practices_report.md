# Security Best Practices Report

Date: 2026-03-08

## Executive Summary

I reviewed the workspace with the `security-best-practices` skill, focusing on the active Python/FastAPI and TypeScript/React surfaces called out in the workspace metadata. The most important findings are: three FastAPI services are configured with `allow_origins=["*"]` together with `allow_credentials=True`, the React frontend persists bearer tokens in `localStorage`, and two gate helper scripts contain hard-coded shared secrets that could let anyone with repo access forge or validate transition envelopes if those values are still accepted anywhere outside a throwaway test path.

## Critical

### SBP-001: Hard-coded transition-gate secrets in helper scripts

- Rule ID: FASTAPI / General secure-secret handling baseline
- Severity: Critical
- Location: `scripts/gate/create_test_envelope.py:12`, `scripts/gate/debug_fingerprint.py:29-35`
- Evidence:

```python
# scripts/gate/create_test_envelope.py
secret = 'test-secret-for-grid-main-2026'
```

```python
# scripts/gate/debug_fingerprint.py
secrets_to_try = [
    'test-secret-for-grid-main-2026',
    'grid-main-secret',
    'TransitionGate',
    'test-secret',
    'secret',
    'GRID-main-2026',
]
```

- Impact: If any deployed or operator-used transition-gate flow still accepts one of these values, an attacker with repo access can forge or brute-check envelope fingerprints and bypass the trust boundary around gate approval.
- Fix: Remove embedded secrets from source, load test-only values from ignored local env/test fixtures, and rotate any real secret that overlaps with these literals.
- Mitigation: Scope these scripts to an isolated test credential namespace and add startup checks that reject known test secrets in non-test environments.
- False positive notes: If these scripts are purely disposable local fixtures and none of these strings are accepted anywhere real, the impact is reduced, but the literals should still be removed because they normalize insecure secret handling and can be copied into real workflows.

## High

### SBP-002: Credentialed CORS combined with wildcard origins in FastAPI services

- Rule ID: FASTAPI-CORS baseline
- Severity: High
- Location: `GRID-main/arena_api/services/discussion_service/main.py:253-258`, `GRID-main/arena_api/services/arena_service/main.py:160-165`, `GRID-main/arena_api/services/ai_service/main.py:92-97`
- Evidence:

```python
self.app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

- Impact: This is an unsafe browser trust posture. Even where browsers reject literal `*` with credentials, the configuration signals "credentialed cross-origin access everywhere" and is one code change away from becoming exploitable; it also hides the real origin policy and weakens review confidence around cookie or auth-header use.
- Fix: Replace `["*"]` with an explicit allowlist from environment/config, keep it least-privilege, and separate local-dev origins from production origins.
- Mitigation: If these services are localhost-only today, bind them to loopback and document that assumption explicitly until origin policy is hardened.
- False positive notes: Some Starlette/FastAPI combinations will refuse this exact response shape for browser credential requests, which limits exploitability, but the configuration is still against baseline guidance and should not ship.

### SBP-003: Browser tokens are stored in `localStorage`

- Rule ID: REACT-CONFIG-001 / frontend token storage guidance
- Severity: High
- Location: `GRID-main/frontend/src/api/client.ts:168-185`
- Evidence:

```ts
private getAccessToken(): string | null {
  return localStorage.getItem("access_token");
}

private setTokens(tokens: AuthTokens) {
  localStorage.setItem("access_token", tokens.access_token);
  localStorage.setItem("token_type", tokens.token_type);
}
```

- Impact: Any XSS in the frontend, third-party script compromise, or malicious browser extension can read and exfiltrate bearer tokens, turning a client-side rendering bug into account compromise.
- Fix: Move auth to `HttpOnly` secure cookies or a backend-for-frontend/session model; if bearer tokens must stay client-side temporarily, keep them in memory only and shorten lifetime aggressively.
- Mitigation: Add a strict CSP, remove dangerous DOM sinks, and rotate tokens frequently to reduce blast radius while the storage model is being changed.
- False positive notes: This is a best-practice finding, not proof of active token theft. Risk depends on whether any XSS-capable path exists in the shipped frontend.

## Medium

### SBP-004: Production API docs are explicitly enabled on the arena gateway

- Rule ID: FASTAPI-OPENAPI-001
- Severity: Medium
- Location: `GRID-main/arena_api/api_gateway/__init__.py:58-64`
- Evidence:

```python
self.app: FastAPI = FastAPI(
    title="Arena API Gateway",
    description="Dynamic API infrastructure for Arena architecture",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=self.lifespan,
)
```

- Impact: Public interactive docs and schema endpoints increase attack surface discovery by exposing routes, models, and auth shapes to anyone who can reach the gateway.
- Fix: Disable docs in production (`docs_url=None`, `redoc_url=None`, `openapi_url=None`) or protect them with auth/network allowlists.
- Mitigation: Keep docs enabled only in dev/test profiles and expose them on a separate internal hostname if operators need them.
- False positive notes: If the gateway is strictly internal and unreachable by untrusted users, this is mainly an information exposure concern rather than a direct exploit.

## Notes On Scope

- I prioritized high-signal application-code issues over dependency-version analysis, runtime header verification, or infrastructure controls because those are not fully visible in this repo snapshot.
- I did not treat localhost-only development defaults as vulnerabilities unless the code looked likely to be reused in broader environments.
