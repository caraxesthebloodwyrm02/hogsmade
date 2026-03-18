# IMMEDIATE REMEDIATION PLAN — Windows Scope

_Priority: CRITICAL | Generated: 2026-03-17 | Execute in order_

---

## Phase 1: Stop the Bleeding (Do RIGHT NOW)

### 1.1 Rotate Stripe API Keys

- Go to https://dashboard.stripe.com/apikeys
- Roll BOTH the restricted key (`rk_live_*`) and secret key (`sk_live_*`)
- Update any applications using these keys with the new values
- **Do NOT store new keys in `C:\Users\USER\.env`**

### 1.2 Secure-Delete the .env File

After rotation, on Windows (PowerShell as Admin):

```powershell
# Overwrite with zeros, then delete
$path = "C:\Users\USER\.env"
$bytes = [System.IO.File]::ReadAllBytes($path)
[Array]::Clear($bytes, 0, $bytes.Length)
[System.IO.File]::WriteAllBytes($path, $bytes)
Remove-Item $path -Force
```

Or from WSL:

```bash
shred -vfz -n 5 /mnt/c/Users/USER/.env && rm /mnt/c/Users/USER/.env
```

### 1.3 Move SSH Keys to WSL-Only Storage

```bash
mkdir -p ~/.ssh
cp /mnt/c/Users/USER/.ssh/id_ed25519 ~/.ssh/id_ed25519
cp /mnt/c/Users/USER/.ssh/id_ed25519.pub ~/.ssh/id_ed25519.pub
cp /mnt/c/Users/USER/.ssh/config ~/.ssh/config 2>/dev/null
cp /mnt/c/Users/USER/.ssh/known_hosts ~/.ssh/known_hosts 2>/dev/null
chmod 700 ~/.ssh
chmod 600 ~/.ssh/id_ed25519
chmod 644 ~/.ssh/id_ed25519.pub
chmod 600 ~/.ssh/config 2>/dev/null
```

Then decide whether to delete the Windows-side copies or keep a separate pair for Windows Git.

### 1.4 Audit and Revoke Git Credentials

```bash
cat /mnt/c/Users/USER/.git-credentials
```

For each token found:

- Go to GitHub Settings > Developer settings > Personal access tokens
- Revoke tokens that appear in the file, regenerate with minimal scopes
- Switch to credential manager:

```
# On Windows side:
git config --global credential.helper manager
# Then delete the plaintext file
```

---

## Phase 2: Harden the Boundary (Today)

### 2.1 Update /etc/wsl.conf

```bash
sudo tee /etc/wsl.conf << 'WSLCONF'
[boot]
systemd = true

[interop]
appendWindowsPath = false

[automount]
enabled = true
root = /mnt/
options = "metadata,umask=077"
WSLCONF
```

Then restart WSL from PowerShell: `wsl --shutdown`

**After restart**, create explicit aliases in `.zshrc` for any Windows tools you need:

```bash
alias code='/mnt/c/Users/USER/AppData/Local/Programs/Microsoft\ VS\ Code/bin/code'
alias clip='/mnt/c/Windows/System32/clip.exe'
alias explorer='/mnt/c/Windows/explorer.exe'
```

### 2.2 Break Cloud Credential Symlinks

```bash
# AWS
cp -rL ~/.aws ~/.aws.local && rm ~/.aws && mv ~/.aws.local ~/.aws
chmod 700 ~/.aws && chmod 600 ~/.aws/*

# Azure
cp -rL ~/.azure ~/.azure.local && rm ~/.azure && mv ~/.azure.local ~/.azure
chmod 700 ~/.azure && chmod 600 ~/.azure/*
```

### 2.3 Revoke Claude Code Trust for System32

Edit `~/.claude.json` — find entries containing `/mnt/c/Windows/system32`. Set `hasTrustDialogAccepted` to `false` or remove.

### 2.4 Delete Orphaned .bash_custom

```bash
rm ~/.bash_custom
```

This file contains hardcoded Windows System32 PATH entries and is not sourced by any active config.

---

## Phase 3: Install Ongoing Safeguards (This Week)

### 3.1 PATH Guard in .zshrc

Add near the top of `~/.zshrc`:

```bash
# Security: strip Windows PATH contamination
if echo "$PATH" | tr ':' '\n' | grep -q "^/mnt/c"; then
    echo "\033[31m[SECURITY]\033[0m Windows PATH entries detected. Stripping..."
    export PATH=$(echo "$PATH" | tr ':' '\n' | grep -v "^/mnt/c" | paste -sd:)
fi
```

### 3.2 Global Git Pre-Commit Hook (secret scanner)

```bash
mkdir -p ~/.config/git/hooks

cat > ~/.config/git/hooks/pre-commit << 'HOOK'
#!/bin/bash
if git diff --cached --diff-filter=ACM -z | xargs -0 grep -lE "(sk_live|rk_live|AKIA[A-Z0-9]{16}|-----BEGIN.*(RSA|EC|DSA|OPENSSH) PRIVATE KEY)" 2>/dev/null; then
    echo "BLOCKED: Potential secret detected in staged changes"
    exit 1
fi
HOOK
chmod +x ~/.config/git/hooks/pre-commit
git config --global core.hooksPath ~/.config/git/hooks
```

### 3.3 Weekly Canary Scan (cron)

```bash
mkdir -p ~/bin ~/.local/share

cat > ~/bin/canary-check.sh << 'CANARY'
#!/bin/bash
LOG="$HOME/.local/share/canary-$(date +%Y%m%d).log"
echo "=== Credential Canary $(date) ===" > "$LOG"
find /mnt/c/Users/USER -maxdepth 2 -name ".env" -exec grep -l "sk_live\|rk_live\|AKIA\|password" {} \; 2>/dev/null >> "$LOG"
[ -f /mnt/c/Users/USER/.git-credentials ] && echo "WARN: .git-credentials exists" >> "$LOG"
find /home/user -maxdepth 2 -type l -exec sh -c 'readlink -f "$1" | grep -q "^/mnt/" && echo "SYMLINK: $1 -> $(readlink -f "$1")"' _ {} \; 2>/dev/null >> "$LOG"
echo "=== Done ===" >> "$LOG"
cat "$LOG"
CANARY
chmod +x ~/bin/canary-check.sh

# Weekly cron (Sunday 10am)
(crontab -l 2>/dev/null; echo "0 10 * * 0 /home/user/bin/canary-check.sh") | crontab -
```

### 3.4 Fix extract() Quoting in .zshrc

Quote all `$1` references in the `extract()` function to prevent injection.

---

## Phase 4: Verification Checklist

- [ ] Stripe Dashboard confirms old keys are revoked
- [ ] `cat /mnt/c/Users/USER/.env` → "No such file"
- [ ] `ls -la ~/.ssh/id_ed25519` → `-rw-------`
- [ ] `cat /mnt/c/Users/USER/.git-credentials` → "No such file"
- [ ] `echo $PATH | tr ':' '\n' | grep mnt/c` → empty
- [ ] `readlink ~/.aws` → fails (not a symlink)
- [ ] `readlink ~/.azure` → fails (not a symlink)
- [ ] `grep -c system32 ~/.claude.json` → 0
- [ ] `ls ~/.bash_custom` → "No such file"
- [ ] `~/bin/canary-check.sh` → runs clean

---

## Decisions Needed

1. **WSL Interop**: Disable `.exe` execution from WSL entirely? (breaks `code`, `explorer.exe`, `clip.exe`)
2. **Windows SSH keys**: Delete after copying to WSL, or keep separate pair?
3. **AWS/Azure**: Used from Windows apps, or only WSL?
4. **Git for Windows**: Actively used, or all git through WSL?
