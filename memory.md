# Persistent Memory — Home Environment

## Security Posture

- See [windows-safeguard-system.md](windows-safeguard-system.md) for the complete Windows/WSL security design
- CRITICAL: Live Stripe keys exist at `/mnt/c/Users/USER/.env` — rotation required
- SSH private key at `/mnt/c/Users/USER/.ssh/id_ed25519` is world-readable via drvfs
- Cloud creds symlinked: `~/.aws` → Windows, `~/.azure` → Windows
- WSL interop (binfmt_misc) is enabled — any .exe callable from WSL
- `appendWindowsPath` is NOT disabled — Windows PATH leaks possible

## Environment Facts

- WSL2 Ubuntu, shell=zsh, oh-my-zsh
- `.zshenv` sources `$HOME/.cargo/env` (Rust toolchain)
- `.bash_custom` contains hardcoded Windows PATH (currently orphaned/not sourced)
- `.wsl-config` is a Dell WSMAN config, NOT a WSL config — ignore it
- Claude Code trusted in `C:\Windows\System32` (should be revoked)
- Git default branch = `GARAGE`, user = Prince (prince@dhaka.bd)
- Multiple AI tools installed: Claude Code, OpenCode, Cursor agent, Codex, Copilot, Windsurf
- Projects live on `/mnt/e/Seeds/` and `/mnt/e/Emergence/`

## Shell Config Notes

- eval-based inits: starship, zoxide — binary replacement = code exec
- `extract()` function in .zshrc has unquoted $1 — injection risk
- TPM (tmux plugin manager) runs at tmux start
- npm global prefix: `~/.npm-global` — on PATH
