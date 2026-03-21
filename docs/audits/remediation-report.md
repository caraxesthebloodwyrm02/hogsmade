# Remediation Report

I used the saved auth hardening baseline memory to structure this report.

## Executive Summary

| Metric                 | Status                                                      |
| ---------------------- | ----------------------------------------------------------- |
| **Scoped remediation** | 100% complete                                               |
| **Overall status**     | Auth and adjacent trust-boundary hardening is ~95% complete |
| **Severity change**    | Risk moved from High to Low/Moderate residual               |
| **Verification**       | Focused auth and guardrail suites are passing               |

---

## Report by Issue

### 1. Role-to-scope policy drift

| Attribute                   | Details                                                                                                                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Issue**                   | Role mapping and scope derivation were split across login, JWT minting, JWT refresh, and JWT verification.                                                                                         |
| **Impact**                  | This could cause inconsistent authorization decisions. In the worst case, one path could grant or preserve privileges differently from another.                                                    |
| **Severity before**         | High                                                                                                                                                                                               |
| **Fix**                     | Centralized policy into shared helpers: `canonicalize_role()`, `scopes_for_role()`. Wired those helpers through: login, access token creation, refresh token flow, JWT verification, API key auth. |
| **Verification**            | `tests/api/test_auth_jwt.py` passed; targeted auth behavior for role/scopes was validated.                                                                                                         |
| **Residual risk**           | Low                                                                                                                                                                                                |
| **Recommended next action** | Keep all future role changes confined to the canonical helper only.                                                                                                                                |

### 2. Client-influenced scope escalation at login

| Attribute                   | Details                                                                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Issue**                   | Requested scopes from the login request were part of the privilege-shaping flow.                                                         |
| **Impact**                  | A client could try to request stronger scopes than the server should grant.                                                              |
| **Severity before**         | High                                                                                                                                     |
| **Fix**                     | Effective scopes are now server-derived from canonical role policy. Requested scopes are retained only as metadata for visibility/audit. |
| **Verification**            | Added coverage for: invalid requested scopes, requested admin scope not escalating privileges.                                           |
| **Residual risk**           | Low                                                                                                                                      |
| **Recommended next action** | Keep any future "requested scopes" behavior strictly non-authoritative.                                                                  |

### 3. Dev-test token over-privilege

| Attribute                   | Details                                                                                                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Issue**                   | `dev-test-token` granted more power than necessary for test/dev convenience.                                                                                                      |
| **Impact**                  | If enabled carelessly, it could provide a meaningful shortcut into protected flows.                                                                                               |
| **Severity before**         | High                                                                                                                                                                              |
| **Fix**                     | Reduced privilege from `admin` to `writer`. Kept rejection in production. Kept explicit `ENABLE_DEV_TOKEN` gating. Aligned returned auth context with canonical role/scope shape. |
| **Verification**            | Guardrail tests covering token rejection behavior passed; broader auth-adjacent sweep passed.                                                                                     |
| **Residual risk**           | Medium                                                                                                                                                                            |
| **Recommended next action** | Replace the fixed literal token with an ephemeral per-test token if you want to push risk lower.                                                                                  |

### 4. Triple-gated development bypass too strong

| Attribute                   | Details                                                                                                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Issue**                   | The fully gated development bypass still returned `super_admin`.                                                                                                                                                                                 |
| **Impact**                  | If deliberately enabled, it provided the highest privilege tier without real authentication.                                                                                                                                                     |
| **Severity before**         | High                                                                                                                                                                                                                                             |
| **Fix**                     | Reduced privilege from `super_admin` to `admin`. Kept all gates: explicit allow flag, development-only restriction, confirmation phrase, machine ID requirement. Kept audit visibility. Normalized returned role/scopes/token payload structure. |
| **Verification**            | Broader auth-adjacent verification passed after the downgrade.                                                                                                                                                                                   |
| **Residual risk**           | Medium                                                                                                                                                                                                                                           |
| **Recommended next action** | Restrict this path to localhost-only or make it time-limited if you want near-maximum tightening.                                                                                                                                                |

### 5. Hidden auth router failure causing `/api/v1/auth/*` 404

| Attribute                   | Details                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------- |
| **Issue**                   | The auth router failed to import because `Any` was referenced but not imported.         |
| **Impact**                  | Auth endpoints disappeared behind 404, which masked true auth failures and broke tests. |
| **Severity before**         | Medium                                                                                  |
| **Fix**                     | Restored the missing `Any` import in `routers/auth.py`.                                 |
| **Verification**            | Auth endpoint tests passed after the fix.                                               |
| **Residual risk**           | Low                                                                                     |
| **Recommended next action** | Keep route import paths covered by targeted endpoint smoke tests.                       |

### 6. Auth tests blocked by SQLite skills inventory bootstrap

|
