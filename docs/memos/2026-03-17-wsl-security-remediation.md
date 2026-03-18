# WSL2 Security Remediation Record
**Date**: 2026-03-17  
**Environment**: WSL2 Ubuntu on Windows, user `user` (alias: prince / Irfan Kabir)  
**Scope**: `/home/user/` — credential hygiene, file permissions, secret rotation  
**Status**: 10/10 findings remediated · All 6 verification checks passed  

---

## Background

A full audit of `/home/user/` was conducted on 2026-03-17, identifying 10 security findings across credential exposure, file permission gaps, and identity leakage. The environment is a WSL2 Ubuntu instance running a polyglot development workstation with multiple AI-assisted coding tools (Claude Code, Codex, OpenClaw, Copilot, Cursor, Serena, OpenCode) alongside standard dev tooling.

---

## Findings and Remediation

### FINDING 1 — GitHub PAT Hardcoded in `.bashrc` · CRITICAL ✅

**What was exposed**: `GITHUB_PERSONAL_ACCESS_TOKEN=github_pat_11BWS3IRI0...` hardcoded at `.bashrc:131`, exported to every child process and visible in `/proc/*/environ`.

**Risk**: Full repo read/write access across all orgs; token visible in crash dumps, env-logging tools, and any process running as this user.

**Action taken**:
- Removed export line from `.bashrc` via `sed -i`
- Scrubbed token pattern from `.bash_history`
- Added `HISTIGNORE`, `HISTSIZE=5000`, `HISTCONTROL=ignoreboth:erasedups` to `.bashrc`

**Outstanding**: Manually revoke the token at https://github.com/settings/tokens (token starts with `github_pat_11BWS3IRI0...`). Until revoked, the token must be considered compromised.

---

### FINDING 2 — Directory Permissions Too Open (755) · CRITICAL ✅

**What was exposed**: Four credential-holding directories were world-listable (`755`), allowing any local user or process to enumerate their contents.

| Directory | Was | Now |
|-----------|-----|-----|
| `~/.codex/` | 755 | 700 |
| `~/.copilot/` | 755 | 700 |
| `~/.openclaw/identity/` | 755 | 700 |
| `~/.cursor-server/` | 755 | 700 |

**Action taken**: `chmod 700` applied to all four directories. Verified via `stat`.

---

### FINDING 3 — OpenAI/Codex Session Tokens · CRITICAL ✅

**What was exposed**: `.codex/auth.json` contained JWT `id_token`, `access_token`, and `refresh_token` for OpenAI account `irfankabir02@gmail.com`. The refresh token is long-lived and can mint new access tokens without re-authentication.

**Action taken**: `~/.codex/auth.json` deleted.

**Outstanding**:
- Log out all OpenAI devices: chatgpt.com → Settings → Security → Log out all devices
- Re-authenticate: `codex auth login` in WSL

---

### FINDING 4 — OpenClaw Private Key + Admin Operator Token · CRITICAL ✅

**What was exposed**: `~/.openclaw/identity/device.json` contained an Ed25519 private key (PEM). `device-auth.json` contained an operator token with `operator.admin` scope (full administrative access). Parent directory `~/.openclaw/identity/` was `755`.

**Action taken**: `shred -u` applied to both files (cryptographic overwrite before deletion). Directory permissions hardened to `700` (covered in Finding 2).

**Outstanding**: Re-register OpenClaw device on next use (will prompt automatically).

---

### FINDING 5 — AWS + Azure Credential Symlinks · HIGH ✅

**What was exposed**:
```
/home/user/.aws  →  /mnt/c/Users/USER/.aws
/home/user/.azure  →  /mnt/c/Users/USER/.azure
```
Any compromised WSL process (malicious npm package, Python dependency, AI tool) could silently read Windows-side cloud IAM credentials through these symlinks.

**Action taken**: Both symlinks removed. Confirmed `No such file or directory`.

**Note**: Windows-side credential files at `/mnt/c/Users/USER/.aws/` and `.azure/` still exist — audit those independently and migrate any long-lived IAM keys to SSO/short-lived tokens.

---

### FINDING 6 — Two GitHub Accounts with Active Tokens · HIGH ✅

**What was found**:
- `irfankabir02` — Copilot OAuth token in `~/.copilot/config.json`
- `caraxesthebloodwyrm02` — `gh` CLI OAuth token in `~/.config/gh/hosts.yml`

**Decision**: Both accounts confirmed **intentional** — different tools, different purposes. No action taken beyond documenting and hardening directory permissions (Finding 2).

**Note**: Verify minimum required scopes at github.com/settings/applications for both accounts.

---

### FINDING 7 — Real Email in `.gitconfig` · LOW-MED ✅

**What was exposed**: `.gitconfig` had `email = prince@dhaka.bd` — this email appears in every public git commit, enabling PII harvesting and targeted phishing.

**Action taken**: Git global email switched to:
```
caraxesthebloodwyrm02+noreply@users.noreply.github.com
```

---

### FINDING 8 — Bash History with Potential Secrets · LOW ✅

**What was found**: `.bash_history` at 95KB — potentially containing inline secrets, tokens, or passwords from past sessions.

**Action taken**:
- Scrubbed patterns: `github_pat_`, `gho_`, `API_KEY`, `SECRET`
- Added `HISTSIZE=5000`, `HISTFILESIZE=5000`, `HISTCONTROL=ignoreboth:erasedups` to `.bashrc`

---

### FINDING 9 — No Secrets Baseline · RECOMMENDED ✅

**What was missing**: No automated detection in place for future credential leaks.

**Action taken**:
- Installed `detect-secrets 1.5.0` via `pipx`
- Created `/home/user/.secrets.baseline` (1.9KB)
- Binary at `~/.local/bin/detect-secrets` (add to PATH in `.bashrc` if needed)

**Usage going forward**:
```bash
export PATH=/home/user/.local/bin:$PATH
detect-secrets scan --update ~/.secrets.baseline /home/user
detect-secrets audit ~/.secrets.baseline
```

---

### FINDING 10 — PII Correlation Risk · LOW (accepted)

**What was found**: Real name "Irfan Kabir", emails `irfankabir02@gmail.com` + `prince@dhaka.bd`, and GitHub usernames `irfankabir02` + `caraxesthebloodwyrm02` scattered across multiple `~/*.md` documentation files.

**Action taken**: Git email changed (Finding 7). No further automated action — user accepted residual risk on local doc files.

**Recommendation**: Avoid including these files in any repo sync or AI context-window ingestion.

---

## Verification Results (Post-Remediation)

All checks run immediately after remediation:

| Check | Command | Result |
|-------|---------|--------|
| 1 | No secrets in `.bashrc` | ✅ CLEAN |
| 2 | Directory permissions | ✅ All `700` |
| 3 | No secrets in live env | ✅ CLEAN |
| 4 | No secrets in bash history | ✅ 0 matches |
| 5 | AWS/Azure symlinks | ✅ Removed |
| 6 | Secrets baseline exists | ✅ 1.9KB at `~/.secrets.baseline` |

---

## Outstanding Manual Actions

| Priority | Action | Where |
|----------|--------|-------|
| **CRITICAL** | Revoke GitHub PAT `github_pat_11BWS3IRI0...` | https://github.com/settings/tokens |
| **HIGH** | Log out all OpenAI devices | chatgpt.com → Settings → Security |
| **HIGH** | Re-authenticate Codex | `codex auth login` in WSL |
| **MEDIUM** | Re-register OpenClaw device | Automatic on next use |
| **MEDIUM** | Audit Windows-side `.aws/credentials` for long-lived IAM keys | `/mnt/c/Users/USER/.aws/` |

---

## Reference Sources

- [GitHub: Managing Personal Access Tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [GitHub: Caching GitHub Credentials](https://docs.github.com/en/get-started/getting-started-with-git/caching-your-github-credentials-in-git)
- [OWASP: Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [Microsoft: Working across WSL file systems](https://learn.microsoft.com/en-us/windows/wsl/filesystems)

---

*Remediation executed by Cascade (Windsurf) on 2026-03-17. Audit originated from a separate security scan session.*
