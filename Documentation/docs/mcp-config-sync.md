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

## Automated sync (Session C)

`Components/scripts/sync-mcp-configs.sh` will automate all of the above with `--dry-run` support and non-zero exit on validation failure. Until that script is available, use this document as the runbook.
