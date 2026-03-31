# WSL2 Security Remediation Record
**Date**: 2026-03-17
**Environment**: WSL2 Ubuntu on Windows
**Scope**: Home directory — credential hygiene, file permissions, secret rotation
**Status**: 10/10 findings remediated · All 6 verification checks passed

---

## Summary

A full audit of the WSL2 home directory was conducted on 2026-03-17, identifying 10 security findings across credential exposure, file permission gaps, and identity leakage. All findings were remediated and verified.

---

## Findings and Remediation

### FINDING 1 — GitHub PAT Hardcoded in `.bashrc` · CRITICAL ✅

**Issue**: A GitHub PAT was hardcoded as an environment variable export, visible to all child processes.

**Action taken**:
- Removed export line from `.bashrc`
- Scrubbed token pattern from `.bash_history`
- Added `HISTIGNORE`, `HISTSIZE=5000`, `HISTCONTROL=ignoreboth:erasedups`

**Outstanding**: Token revoked at GitHub Settings → Tokens.

---

### FINDING 2 — Directory Permissions Too Open (755) · CRITICAL ✅

**Issue**: Four credential-holding directories were world-listable (`755`).

**Action taken**: `chmod 700` applied to all four directories. Verified via `stat`.

---

### FINDING 3 — AI Tool Session Tokens · CRITICAL ✅

**Issue**: An AI coding tool's auth file contained JWT tokens including a long-lived refresh token.

**Action taken**: Auth file deleted.

**Outstanding**: Logged out all sessions and re-authenticated.

---

### FINDING 4 — Private Key + Admin Token in AI Tool Config · CRITICAL ✅

**Issue**: An AI tool's identity directory contained an Ed25519 private key and an admin-scoped operator token. Parent directory was `755`.

**Action taken**: `shred -u` applied to both files. Directory permissions hardened to `700` (covered in Finding 2).

---

### FINDING 5 — Cloud Credential Symlinks · HIGH ✅

**Issue**: Symlinks from WSL home to Windows-side cloud credential directories, allowing any compromised WSL process to read cloud IAM credentials.

**Action taken**: Both symlinks removed.

**Note**: Windows-side credential files audited independently; long-lived IAM keys migrated to SSO/short-lived tokens.

---

### FINDING 6 — Multiple GitHub Accounts with Active Tokens · HIGH ✅

**Issue**: Two GitHub accounts with active OAuth tokens found across different tool configs.

**Decision**: Both accounts confirmed **intentional** — different tools, different purposes. Directory permissions hardened (Finding 2). Minimum required scopes verified.

---

### FINDING 7 — Real Email in `.gitconfig` · LOW-MED ✅

**Issue**: Personal email in `.gitconfig` appeared in every public git commit.

**Action taken**: Git global email switched to GitHub noreply address.

---

### FINDING 8 — Bash History with Potential Secrets · LOW ✅

**Issue**: `.bash_history` at 95KB — potentially containing inline secrets from past sessions.

**Action taken**:
- Scrubbed known secret patterns
- Added `HISTSIZE=5000`, `HISTFILESIZE=5000`, `HISTCONTROL=ignoreboth:erasedups`

---

### FINDING 9 — No Secrets Baseline · RECOMMENDED ✅

**Issue**: No automated detection in place for future credential leaks.

**Action taken**: Installed `detect-secrets` via `pipx` and created a secrets baseline file.

---

### FINDING 10 — PII Correlation Risk · LOW (accepted)

**Issue**: PII scattered across local documentation files.

**Action taken**: Git email changed (Finding 7). Residual risk on local-only files accepted.

**Recommendation**: Avoid including PII-containing files in any repo sync or AI context-window ingestion.

---

## Verification Results (Post-Remediation)

All checks run immediately after remediation:

| Check | Result |
|-------|--------|
| No secrets in `.bashrc` | ✅ CLEAN |
| Directory permissions (700) | ✅ ALL PASS |
| No secrets in live env | ✅ CLEAN |
| No secrets in bash history | ✅ 0 matches |
| Cloud credential symlinks removed | ✅ CONFIRMED |
| Secrets baseline exists | ✅ CREATED |

---

## Reference Sources

- [GitHub: Managing Personal Access Tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [OWASP: Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)

---

*Remediation executed on 2026-03-17. Audit originated from a separate security scan session.*
