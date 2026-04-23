# MCP Config Sync — Regeneration Reference

Canonical source: `mcp_config.example.json` in the repo root.

Live configs managed by this process:

| Tool        | Live config path                      |
| ----------- | ------------------------------------- |
| Windsurf    | `~/.codeium/windsurf/mcp_config.json` |
| Claude Code | `~/.claude.json` (key: `mcpServers`)  |
| Cursor      | `.cursor/mcp.json` in project root    |

## When to regenerate

- After a host or home-directory migration (e.g. `/home/caraxes/` → `/home/irfankabir/`).
- After adding, removing, or renaming a server in `mcp_config.example.json`.
- Whenever a live config shows spawn errors or a "failed to connect" in the tool's MCP panel.
- As a routine check at session start (see `Components/scripts/sync-mcp-configs.sh`, Session C).

Do **not** attempt surgical `jq 'del(…)'` repairs for bulk path issues. See `Documentation/docs/GOVERNANCE.md § Config Hygiene` for the rationale.

## Manual regeneration steps

```bash
ROOT="$HOME/gruff/workspace/CascadeProjects"   # adjust if layout differs
STAMP=$(date +%Y%m%d-%H%M%S)
CANONICAL="$ROOT/mcp_config.example.json"

# 1. Backup
cp ~/.codeium/windsurf/mcp_config.json \
   ~/.codeium/windsurf/mcp_config.json.pre-regen-$STAMP.bak

# 2. Generate — substitute $HOME/CascadeProjects first, then $HOME
sed \
  -e "s|\$HOME/CascadeProjects|$ROOT|g" \
  -e "s|\$HOME|$HOME|g" \
  "$CANONICAL" \
  | jq '{mcpServers: .mcpServers}' \
  > ~/.codeium/windsurf/mcp_config.json.new

# 3. Validate
diff \
  <(jq -r '.mcpServers | keys[]' "$CANONICAL" | sort) \
  <(jq -r '.mcpServers | keys[]' ~/.codeium/windsurf/mcp_config.json.new | sort) \
  && grep -q "^0$" <(grep -c caraxes ~/.codeium/windsurf/mcp_config.json.new) \
  && echo "VALID" || echo "VALIDATION FAILED — do not swap"

# 4. Atomic swap (only after VALID)
mv ~/.codeium/windsurf/mcp_config.json.new \
   ~/.codeium/windsurf/mcp_config.json
```

### Claude Code variant

Claude Code wraps `mcpServers` inside `~/.claude.json` alongside other user state. Splice, don't replace the whole file:

```bash
NEW_MCP=$(sed \
  -e "s|\$HOME/CascadeProjects|$ROOT|g" \
  -e "s|\$HOME|$HOME|g" \
  "$CANONICAL" | jq '.mcpServers')

cp ~/.claude.json ~/.claude.json.pre-regen-$STAMP.bak

jq --argjson mcp "$NEW_MCP" \
  '.mcpServers = $mcp | .mcpServersDisabled = {}' \
  ~/.claude.json > ~/.claude.json.new

# Validate, then:
mv ~/.claude.json.new ~/.claude.json
```

## Validation checklist

After swap, verify:

- `grep -c caraxes <live_config>` → `0`
- Server key count matches canonical: `jq '.mcpServers | keys | length'` → `20` (or current canonical count)
- Key sets identical: `diff <(jq -r '.mcpServers | keys[]' "$CANONICAL" | sort) <(jq -r '.mcpServers | keys[]' <live_config> | sort)` → empty
- All referenced paths exist: run the path-audit snippet below

```bash
python3 - <<'EOF'
import json, os
with open(os.path.expanduser("~/.codeium/windsurf/mcp_config.json")) as f:
    cfg = json.load(f)
fail = []
for name, entry in cfg.get("mcpServers", {}).items():
    cmd = entry.get("command", "")
    args = entry.get("args", [])
    path = args[-1] if cmd == "npx" and args else cmd
    if not os.path.exists(path):
        fail.append((name, path))
print("FAIL:", fail if fail else "none")
EOF
```

## Observing config health (panel count ≠ configured count)

The Windsurf MCP panel shows **running processes**, not configured entries. With `"Automatically start MCP servers when sending"` enabled (default), servers spawn on first tool invocation, not at IDE startup. A count of `N < canonical` is expected until tools from the remaining servers are invoked.

**Three counters converge on the running set, not the configured set:**

- Agent session tool bindings (frozen at session init to already-spawned servers)
- Windsurf spawned process count (`pgrep -af "tsx|\.venv/bin/python" | grep -iE "MCPServers|mcp-setup"` dedup'd by server name)
- Panel's tool-count badges

If all three agree on the same subset (e.g. 6/20) and MCP logs show zero errors, this is **lazy-spawn working as designed**, not a failure. Verify health by invoking a tool from a currently-non-spawned server and confirming it then appears in the panel — not by reading panel counts against canonical.

Empirically observed 2026-04-23: `agent bindings = spawned processes = panel tool-count badges = 6` with no log errors. Canonical had 20 servers configured. The 14 non-running servers were correctly absent because nothing had triggered their spawn.

## Automated sync

`Components/scripts/sync-mcp-configs.sh` automates all of the above. Dry-run first:

```bash
bash ~/gruff/workspace/CascadeProjects/Components/scripts/sync-mcp-configs.sh --dry-run
```

If the diff looks correct, run without the flag to write. See the script's `--help` output for `--cascade-root`, `--skip-windsurf`, `--skip-claude`, and per-tool config path overrides.

## CI fixture maintenance

`Components/scripts/fixtures/mcp-config-sync/fake_windsurf_config.json` is the stale-config fixture used by the `mcp-config-sync-smoke` CI job. It exists to confirm that the substitution logic in `sync-mcp-configs.sh` produces the correct structural shape regardless of whether Windsurf or Claude Code are installed on the runner.

**If the smoke job fails on a PR that doesn't touch the script or `mcp_config.example.json`**, the most likely cause is a new server was added to canonical without refreshing the fixture. The fixture intentionally has a subset of servers (stale caraxes paths) — the smoke job validates that after regeneration the key count matches canonical, so adding a server without updating the fixture will break the count check.

Fix — regenerate the fixture from canonical in the same PR that adds the new server:

```bash
# Run from the CascadeProjects root
jq '{
  "_fixture": "Stale config used by mcp-config-sync-smoke CI job. Contains legacy caraxes paths to simulate pre-regen state.",
  "mcpServers": (
    .mcpServers | to_entries | .[0:2] | map(
      .value.args[-1] |= gsub("/home/irfankabir/"; "/home/caraxes/")
    ) | from_entries
  )
}' mcp_config.example.json \
  > Components/scripts/fixtures/mcp-config-sync/fake_windsurf_config.json
```

This slices the first two servers from canonical and rewrites their paths back to the legacy hostname, preserving the fixture's purpose (a stale-path file the smoke test can regenerate from).
