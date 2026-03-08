# Security Safeguards System

Date: 2026-03-08
Source reports: [CascadeProjects-threat-model.md](./CascadeProjects-threat-model.md), [security_best_practices_report.md](./security_best_practices_report.md), [security_ownership_map_report.md](./security_ownership_map_report.md)

---

## Subtractive Analysis

### Step 1: Identify the Minuend (Full Attack Surface)

The minuend is the complete set of attack surfaces, vulnerabilities, and governance risks identified across the three security reports.

| ID | Attack Surface | Source Report | Severity |
|---|---|---|---|
| TM-001 | Browser token theft via `localStorage` → API replay | Threat Model | High |
| TM-002 | Unauthenticated WebSocket + arena_api middleware drift | Threat Model | High |
| TM-003 | Local MCP tool abuse: script execution, cleanup, file mutation | Threat Model | High |
| TM-004 | Shared audit/snapshot poisoning → control-plane integrity | Threat Model | High |
| TM-005 | GATE envelope forgery / fail-open fallback | Threat Model | High |
| TM-006 | MCP read-tool reconnaissance → confidentiality loss | Threat Model | Medium |
| SBP-001 | Hard-coded transition-gate secrets in helper scripts | Best Practices | Critical |
| SBP-002 | Credentialed CORS with wildcard origins in arena_api | Best Practices | High |
| SBP-003 | Browser tokens in `localStorage` (XSS blast radius) | Best Practices | High |
| SBP-004 | Production API docs enabled on arena gateway | Best Practices | Medium |
| OWN-001 | Single-maintainer bus-factor for auth/secrets/crypto paths | Ownership Map | Governance |
| OWN-002 | Identity fragmentation understating true concentration | Ownership Map | Governance |

**Minuend**: 12 discrete attack surfaces spanning network API, WebSocket, local MCP execution, filesystem control-plane, secret management, CORS policy, and governance gaps.

### Step 2: Identify the Subtrahend (Security Controls)

The subtrahend is the set of safeguard measures designed to eliminate or reduce each attack surface.

| Subtrahend Control | Eliminates Surface(s) | Implementation |
|---|---|---|
| SG-01: Token storage migration + CSP enforcement | TM-001, SBP-003 | `safeguard_hooks.py` → `TokenStorageGuard` |
| SG-02: WebSocket auth gate + connection quotas | TM-002 | `safeguard_hooks.py` → `WebSocketAuthHook` |
| SG-03: CORS policy lockdown (deny-by-default) | SBP-002 | `safeguard_hooks.py` → `CORSPolicyGuard` |
| SG-04: MCP execution policy engine (allowlists, approval) | TM-003 | `security-policy.ts` → `ExecutionPolicyEngine` |
| SG-05: Audit integrity (hash-chain, provenance) | TM-004 | `security-policy.ts` → `AuditIntegrityGuard` |
| SG-06: GATE hardening (fail-closed, nonce enforcement) | TM-005 | `security-policy.ts` → `GateSecurityPolicy` |
| SG-07: MCP read-tool scoping + redaction | TM-006 | `security-policy.ts` → `ReadScopePolicy` |
| SG-08: Secret rotation + test-secret rejection | SBP-001 | `safeguard_hooks.py` → `SecretHygieneGuard` |
| SG-09: API docs conditional exposure | SBP-004 | `safeguard_hooks.py` → `DocsExposureGuard` |
| SG-10: Ownership governance triggers | OWN-001, OWN-002 | `security_triggers.json` → review hooks |

### Step 3: Validate Subtrahend ⊆ Minuend

Every subtrahend control maps to one or more identified attack surfaces. No control targets a surface outside the minuend. ✓

| Validation | Result |
|---|---|
| SG-01 through SG-10 each reference valid minuend IDs | ✓ |
| No orphaned controls (every SG has a target) | ✓ |
| No over-subtraction (controls are scoped to identified surfaces) | ✓ |

### Step 4: Compute the Remainder

**Remainder = Minuend − Subtrahend**

After applying all SG-01 through SG-10 controls:

| Residual Risk | Why It Remains | Severity |
|---|---|---|
| Zero-day in FastAPI/Starlette framework | Outside application-layer control | Accepted |
| Kernel/OS-level host compromise | Out-of-scope per threat model | Accepted |
| Social engineering of operator credentials | Requires procedural, not technical, mitigation | Low |
| Dependency supply-chain attacks (npm/pip) | Requires separate SCA tooling | Medium |
| MCP host-level compromise before tool dispatch | MCP SDK transport trust boundary | Low |

### Step 5: Verify Remainder Integrity

- No broken references: all SG controls have implementation targets in `safeguard_hooks.py`, `security-policy.ts`, or `security_triggers.json`
- No orphaned dependencies: each control integrates with existing middleware/MCP patterns
- Residual risks are all external or environmental — no application-layer gap remains unaddressed

```
Minuend:    12 attack surfaces (TM-001..TM-006, SBP-001..SBP-004, OWN-001..OWN-002)
Subtrahend: 10 safeguard controls (SG-01..SG-10)
Remainder:  5 residual risks (framework zero-day, OS compromise, social engineering, supply-chain, MCP transport)

Steps completed: 1 ✓ 2 ✓ 3 ✓ 4 ✓ 5 ✓
```

---

## Safeguard System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Security Triggers Config                      │
│                  (security_triggers.json)                        │
│  Binds threat IDs → hook functions → conditional policies        │
└──────────────┬──────────────────────────────┬───────────────────┘
               │                              │
    ┌──────────▼──────────┐       ┌───────────▼──────────────┐
    │  GRID-main Hooks    │       │  MCP Security Policy     │
    │ (safeguard_hooks.py)│       │ (security-policy.ts)     │
    │                     │       │                          │
    │ • TokenStorageGuard │       │ • ExecutionPolicyEngine  │
    │ • WebSocketAuthHook │       │ • AuditIntegrityGuard    │
    │ • CORSPolicyGuard   │       │ • GateSecurityPolicy     │
    │ • SecretHygieneGuard│       │ • ReadScopePolicy        │
    │ • DocsExposureGuard │       │ • OwnershipGovernance    │
    └──────────┬──────────┘       └───────────┬──────────────┘
               │                              │
    ┌──────────▼──────────┐       ┌───────────▼──────────────┐
    │  Existing Middleware │       │  MCP Server Tool Layer   │
    │ • SecurityEnforcer   │       │ • grid-server            │
    │ • RateLimit          │       │ • lots-server            │
    │ • SecurityHeaders    │       │ • maintain-server        │
    │ • CircuitBreaker     │       │ • echoes-server          │
    └─────────────────────┘       └──────────────────────────┘
```

---

## Conditional If-Then Policy Model

Each policy rule follows: **IF** (condition derived from threat research) **THEN** (enforce safeguard action).

### Network Surface Policies (GRID-main)

| Policy ID | IF Condition | THEN Action | Threat Basis |
|---|---|---|---|
| P-NET-001 | Request targets `/ws/` AND no valid auth token present | Reject connection with 401 | TM-002: unauthenticated WebSocket |
| P-NET-002 | `CORS_ORIGINS` is `["*"]` AND `allow_credentials=True` | Block startup, log critical | SBP-002: credentialed wildcard CORS |
| P-NET-003 | Environment is production AND `docs_url` is not None | Override `docs_url=None` | SBP-004: exposed API docs |
| P-NET-004 | Frontend ships `localStorage.setItem("access_token")` | Emit deprecation warning + CSP enforce | TM-001, SBP-003: token storage |
| P-NET-005 | Auth token age > `MAX_TOKEN_AGE_SECONDS` | Force re-authentication | TM-001: token replay window |
| P-NET-006 | WebSocket connections from single IP > `WS_MAX_PER_IP` | Throttle + alert | TM-002: connection abuse |
| P-NET-007 | Request body size > configured max | Reject with 413 | TM-002: resource exhaustion |

### MCP Execution Policies

| Policy ID | IF Condition | THEN Action | Threat Basis |
|---|---|---|---|
| P-MCP-001 | Tool is `experiment_run` AND script path outside allowlist | Block execution, emit audit | TM-003: script path traversal |
| P-MCP-002 | Tool is `cleanup_execute` AND `dryRun=false` AND no valid preview token | Block, require dry-run first | TM-003: destructive cleanup |
| P-MCP-003 | Tool is `workflow_execute` AND `dryRun=false` AND commands contain shell operators | Block, require command allowlist | TM-003: command injection |
| P-MCP-004 | Bulk read operations (>N scan calls in window) from single session | Throttle + emit warning audit | TM-006: reconnaissance |
| P-MCP-005 | Tool invocation targets path outside configured workspace roots | Block with path violation | TM-003: path traversal |

### Control-Plane Integrity Policies

| Policy ID | IF Condition | THEN Action | Threat Basis |
|---|---|---|---|
| P-INT-001 | Audit entry timestamp is in the future OR >24h stale | Reject entry, emit integrity alert | TM-004: timestamp manipulation |
| P-INT-002 | Audit entry `source` not in known server list | Reject entry, emit provenance alert | TM-004: source spoofing |
| P-INT-003 | Snapshot health score delta > 40 points between consecutive snapshots | Flag as anomalous, require confirmation | TM-004: score manipulation |
| P-INT-004 | GATE envelope nonce not in registry OR already burned | Reject envelope | TM-005: replay attack |
| P-INT-005 | GATE remote validation unavailable AND target is production | Fail closed (approved=false) | TM-005: fail-open bypass |
| P-INT-006 | `GATE_USER_SECRET` matches known test secrets | Block in non-test environment | SBP-001: hardcoded secrets |

### Governance Policies

| Policy ID | IF Condition | THEN Action | Threat Basis |
|---|---|---|---|
| P-GOV-001 | PR modifies `src/grid/auth/*` OR `safety/auth/*` | Require 2 reviewers | OWN-001: bus-factor 1 |
| P-GOV-002 | PR modifies sensitive path AND author is sole owner | Emit review-escalation alert | OWN-001, OWN-002 |
| P-GOV-003 | Commit touches `security/` AND no test file changed | Block merge, require test coverage | OWN-001: untested security |

---

## Trigger-Hook Binding Model

Triggers detect security-relevant events. Hooks are the bound function calls that execute in response.

### Trigger Types

| Trigger | Fires When | Bound Hook(s) |
|---|---|---|
| `on_request_received` | Any HTTP request enters GRID-main | `CORSPolicyGuard.validate()`, `DocsExposureGuard.check()` |
| `on_auth_attempt` | Login, token refresh, or API-key validation | `SecretHygieneGuard.check_secrets()`, `TokenStorageGuard.enforce()` |
| `on_websocket_connect` | WebSocket upgrade request | `WebSocketAuthHook.validate_connection()` |
| `on_mcp_tool_call` | Any MCP tool invocation | `ExecutionPolicyEngine.evaluate()`, `ReadScopePolicy.check()` |
| `on_audit_write` | Audit entry appended to NDJSON | `AuditIntegrityGuard.validate_entry()` |
| `on_snapshot_write` | Seeds snapshot saved to disk | `AuditIntegrityGuard.validate_snapshot()` |
| `on_gate_validate` | GATE envelope submitted for validation | `GateSecurityPolicy.enforce()` |
| `on_cleanup_execute` | Destructive cleanup initiated | `ExecutionPolicyEngine.require_approval()` |
| `on_sensitive_pr` | PR touches sensitive paths | `OwnershipGovernance.enforce_review()` |

---

## Implementation Files

| File | Purpose | Language |
|---|---|---|
| `GRID-main/src/application/mothership/security/safeguard_hooks.py` | Network surface guards, auth hooks, CORS/docs/secret enforcement | Python |
| `shared-types/src/security-policy.ts` | MCP execution policy engine, audit integrity, GATE hardening, read scope | TypeScript |
| `scripts/security/security_triggers.json` | Declarative trigger→hook bindings and policy configuration | JSON |

