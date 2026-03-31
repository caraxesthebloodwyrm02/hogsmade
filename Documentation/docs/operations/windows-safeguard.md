# Windows/WSL Safeguard System Design

_Generated: 2026-03-17 | Scope: Windows filesystem protection with ongoing damage control_

---

## Core Principle: Assume Breach, Contain Blast Radius

The WSL/Windows boundary is NOT a security boundary — it is a convenience layer.
Any process in WSL has full read/write access to Windows. Any Windows process can access WSL files.
The safeguard system operates on **damage control as the default posture**.

---

## 1. IMMEDIATE THREAT MAP (Windows Scope)

### Attack Surface Summary

```
┌──────────────────────────────────────────────────────────────────┐
│                    WINDOWS HOST (C:\, E:\)                       │
│                                                                  │
│  C:\Users\USER\.env          ← LIVE STRIPE KEYS (CRITICAL)      │
│  C:\Users\USER\.ssh\         ← Private keys (world-readable)    │
│  C:\Users\USER\.git-credentials ← Plaintext git creds           │
│  C:\Users\USER\.aws\         ← AWS creds (symlinked from WSL)   │
│  C:\Users\USER\.azure\       ← Azure creds (symlinked from WSL) │
│  C:\Users\USER\AppData\      ← Browser data, app tokens, all    │
│  C:\Windows\System32\        ← Claude Code trusted (REVOKE)     │
│                                                                  │
│  ┌────────────── WSL2 (Ubuntu) ─────────────┐                   │
│  │  /mnt/c/ ──── rw 9p mount ──── C:\       │                   │
│  │  /mnt/e/ ──── rw 9p mount ──── E:\       │                   │
│  │  ~/.aws ────── symlink ──────── C:\...    │                   │
│  │  ~/.azure ──── symlink ──────── C:\...    │                   │
│  │  binfmt_misc: .exe → /init (ENABLED)     │                   │
│  │  \\wsl.localhost\ ← Windows can read all │                   │
│  └──────────────────────────────────────────┘                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. SAFEGUARD ARCHITECTURE

### Layer 1: Credential Isolation (Immediate)

**Goal:** No plaintext secrets on the Windows filesystem.

| Action  | Target                                          | Method                                                             |
| ------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| ROTATE  | Stripe API keys (`sk_live_*`, `rk_live_*`)      | Stripe Dashboard → API Keys → Roll Key                             |
| DELETE  | `C:\Users\USER\.env`                            | After rotation, securely delete                                    |
| MOVE    | SSH keys to WSL-only storage                    | `cp /mnt/c/Users/USER/.ssh/* ~/.ssh/` then `chmod 600` on WSL side |
| AUDIT   | `.git-credentials`                              | Check if tokens are still valid, revoke/regenerate                 |
| REPLACE | Plaintext creds with Windows Credential Manager | Use `cmdkey` or `wincred` for git, `aws-vault` for AWS             |

### Layer 2: WSL/Windows Boundary Hardening

**Goal:** Reduce cross-boundary attack surface to minimum needed.

**`/etc/wsl.conf` — apply these settings:**

```ini
[interop]
appendWindowsPath = false    # Stop Windows PATH from leaking into WSL
# enabled = true             # Keep interop ON only if you need .exe from WSL

[automount]
enabled = true
root = /mnt/
options = "metadata,umask=077"  # Restrict drvfs permissions (files = 700)

[boot]
systemd = true
```

**Effect of `umask=077`:** Files on Windows mounts will appear as `rwx------` instead of `rwxrwxrwx`. Only the WSL user can access them. This doesn't change Windows-side permissions but prevents OTHER WSL processes/users from reading through drvfs.

### Layer 3: Symlink Governance

**Goal:** Explicit control over what crosses the boundary.

| Current Symlink                | Decision                         | Rationale                                   |
| ------------------------------ | -------------------------------- | ------------------------------------------- |
| `~/.aws → /mnt/c/.../.aws`     | BREAK — use WSL-local `~/.aws`   | AWS creds should not transit the Windows FS |
| `~/.azure → /mnt/c/.../.azure` | BREAK — use WSL-local `~/.azure` | Same rationale                              |
| `~/.docker/contexts`           | KEEP                             | Required for Docker Desktop integration     |
| `~/.docker/features.json`      | KEEP                             | Required for Docker Desktop integration     |

**To break a symlink safely:**

```bash
# 1. Copy the real data to WSL-local storage
cp -rL ~/.aws ~/.aws.local
# 2. Remove the symlink
rm ~/.aws
# 3. Move local copy into place
mv ~/.aws.local ~/.aws
# 4. Set proper permissions
chmod 700 ~/.aws
chmod 600 ~/.aws/*
```

### Layer 4: Claude Code Trust Boundaries

**Goal:** Prevent AI agents from operating in sensitive Windows directories.

**Revoke trust for `C:\Windows\System32`:**
In `~/.claude.json`, find and remove or set `hasTrustDialogAccepted: false` for any project entry pointing to `/mnt/c/Windows/system32`.

**Establish project allowlist:** AI agents should only have trust in:

- `/mnt/e/Seeds/*` (project workspace)
- `/mnt/e/Emergence/*` (project workspace)
- `/home/user/` (WSL home — with caution)

**Never trust:**

- `/mnt/c/Windows/`
- `/mnt/c/Program Files/`
- `/mnt/c/Users/USER/AppData/`

### Layer 5: Ongoing Damage Control System

**Goal:** Continuous monitoring and automatic containment.

#### 5a. Credential Canary Script (run weekly)

```bash
#!/bin/bash
# canary-check.sh — scan for exposed secrets on Windows mounts
echo "=== Credential Canary Scan $(date) ==="

# Check for .env files with live keys
find /mnt/c/Users/USER -maxdepth 2 -name ".env" -exec grep -l "sk_live\|rk_live\|AKIA\|password" {} \; 2>/dev/null

# Check for world-readable private keys
find /mnt/c/Users/USER/.ssh -name "id_*" ! -name "*.pub" 2>/dev/null | while read f; do
    echo "EXPOSED PRIVATE KEY: $f"
done

# Check for .git-credentials
[ -f /mnt/c/Users/USER/.git-credentials ] && echo "EXPOSED: .git-credentials still exists"

# Check for new symlinks crossing the boundary
find /home/user -maxdepth 2 -type l -exec readlink -f {} \; 2>/dev/null | grep "^/mnt/"
```

#### 5b. Shell Startup Guard (add to .zshrc)

```bash
# Warn if Windows PATH entries are detected
if echo "$PATH" | grep -q "/mnt/c/"; then
    echo "[SECURITY] Windows PATH entries detected in shell. Run: export PATH=\$(echo \$PATH | tr ':' '\n' | grep -v '/mnt/c' | tr '\n' ':')"
fi
```

#### 5c. Git Pre-Commit Hook (global)

```bash
# ~/.config/git/hooks/pre-commit
#!/bin/bash
# Block commits containing secrets
if git diff --cached --diff-filter=ACM | grep -qE "(sk_live|rk_live|AKIA[A-Z0-9]{16}|-----BEGIN.*PRIVATE KEY)"; then
    echo "BLOCKED: Potential secret detected in staged changes"
    exit 1
fi
```

---

## 3. DAMAGE CONTROL OPERATIONS MATRIX

| Scenario                      | Detection                           | Response                                       | Recovery                                   |
| ----------------------------- | ----------------------------------- | ---------------------------------------------- | ------------------------------------------ |
| Leaked API key                | Canary script / git log audit       | Rotate key immediately, revoke old             | Update all services using the key          |
| Compromised SSH key           | Unauthorized git push / SSH log     | Regenerate key pair, update GitHub/servers     | Audit git history for unauthorized commits |
| Malicious binary in PATH      | `which <cmd>` shows unexpected path | Remove binary, audit what it did               | Check bash/zsh history for invocations     |
| Windows malware accessing WSL | Unexpected files in WSL home        | Kill WSL (`wsl --shutdown`), scan Windows      | Rebuild WSL if integrity uncertain         |
| AI agent writes to System32   | Claude Code audit log               | Revoke trust, review changes                   | Restore from system restore point          |
| Rogue npm/cargo package       | `npm audit` / `cargo audit`         | Remove package, check for post-install scripts | Audit package's install hooks              |

---

## 4. WINDOWS-SPECIFIC HARDENING CHECKLIST

### PowerShell (run as Administrator on Windows side):

```powershell
# 1. Restrict WSL network access if not needed
# (NAT mode is already set — good)

# 2. Set execution policy for scripts
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# 3. Enable Windows Defender real-time protection for WSL mounts
# (Defender should already scan \\wsl.localhost\ paths)

# 4. Audit who accesses \\wsl.localhost
# Enable Object Access Auditing via secpol.msc → Advanced Audit Policy

# 5. Remove .env file securely
# After rotating keys:
# [System.IO.File]::WriteAllBytes("C:\Users\USER\.env", [byte[]](0)*100)
# Remove-Item "C:\Users\USER\.env" -Force
```

### Windows Credential Manager (replace plaintext creds):

```powershell
# Store git credentials in Windows Credential Manager instead of .git-credentials
git config --global credential.helper manager
# Delete the plaintext file after confirming manager works
```

---

## 5. MONITORING CADENCE

| Check                        | Frequency                   | Tool                    |
| ---------------------------- | --------------------------- | ----------------------- |
| Credential canary scan       | Weekly (cron)               | `canary-check.sh`       |
| `npm audit` / `cargo audit`  | Before each project session | Manual or pre-commit    |
| Symlink inventory            | Monthly                     | `find ~ -type l -ls`    |
| PATH audit                   | Each shell start            | Startup guard in .zshrc |
| `.claude.json` trust review  | Monthly                     | Manual review           |
| Windows Defender scan of WSL | Weekly                      | Windows Security app    |
| Git credential rotation      | Quarterly                   | GitHub/GitLab settings  |
| SSH key rotation             | Annually                    | `ssh-keygen`            |

---

## 6. WHAT THIS SAFEGUARD DOES NOT COVER

- **Network-level attacks**: No firewall rules are set. Consider `ufw` on WSL and Windows Defender Firewall rules.
- **Encrypted-at-rest**: WSL2's ext4.vhdx is not encrypted by default. Consider BitLocker on the host.
- **Backup/recovery**: No automated backup of WSL or Windows configs. Consider `wsl --export` snapshots.
- **Multi-user isolation**: This assumes a single-user system. If other users have WSL access, additional isolation is needed.
