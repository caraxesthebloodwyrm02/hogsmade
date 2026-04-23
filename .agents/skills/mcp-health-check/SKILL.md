# Skill: MCP Health Check

**Trigger:** Run at session start, or whenever a tool's MCP panel shows no servers / connection errors.

**Purpose:** Detect live MCP config drift before attempting any tool invocations. Catches stale absolute paths, legacy hostname refs, and archived servers that prevent spawning.

---

## When to invoke

- At the start of any session where MCP tools will be used.
- After any host or home-directory migration.
- After merging changes to `mcp_config.example.json`.
- When Windsurf or Claude Code shows zero connected servers.
- When a tool invocation fails with "server not connected" or "spawn ENOENT".

---

## Checks

Run each in sequence. Stop and report on first failure group.

### Check 1 — Legacy hostname refs in mcpServers

```bash
# Windsurf
jq '[.mcpServers | to_entries[]
  | select((.value | tostring) | contains("caraxes"))] | length' \
  ~/.codeium/windsurf/mcp_config.json

# Claude Code
jq '[.mcpServers | to_entries[]
  | select((.value | tostring) | contains("caraxes"))] | length' \
  ~/.claude.json
```

**Expected:** `0` for both. Any non-zero value means stale `/home/caraxes/` paths remain.

### Check 2 — Server count matches canonical

```bash
CANONICAL=~/gruff/workspace/CascadeProjects/mcp_config.example.json
EXPECTED=$(jq '.mcpServers | keys | length' "$CANONICAL")

WINDSURF=$(jq '.mcpServers | keys | length' ~/.codeium/windsurf/mcp_config.json)
CLAUDE=$(jq '.mcpServers | keys | length' ~/.claude.json)

echo "Canonical: $EXPECTED  Windsurf: $WINDSURF  Claude: $CLAUDE"
```

**Expected:** All three match. A lower count in a live config means archived servers were surgically removed but the file was never fully regenerated — other paths may also be stale.

### Check 3 — Archived servers absent from live configs

```bash
for server in craft-server glimpse-server mangrove-server; do
  echo -n "$server in Windsurf: "
  jq --arg s "$server" 'if .mcpServers[$s] then "PRESENT (remove)" else "absent OK" end' \
    ~/.codeium/windsurf/mcp_config.json
  echo -n "$server in Claude:   "
  jq --arg s "$server" 'if .mcpServers[$s] then "PRESENT (remove)" else "absent OK" end' \
    ~/.claude.json
done
```

**Expected:** `absent OK` for all three in both configs.

### Check 4 — Referenced paths exist on disk

```bash
python3 - <<'EOF'
import json, os
configs = {
    "Windsurf": os.path.expanduser("~/.codeium/windsurf/mcp_config.json"),
    "Claude":   os.path.expanduser("~/.claude.json"),
}
for label, path in configs.items():
    if not os.path.exists(path):
        print(f"SKIP {label}: config not found")
        continue
    with open(path) as f:
        cfg = json.load(f)
    fail = []
    for name, entry in cfg.get("mcpServers", {}).items():
        cmd = entry.get("command", "")
        args = entry.get("args", [])
        p = args[-1] if cmd == "npx" and args else cmd
        if not os.path.exists(p):
            fail.append(f"  {name}: {p}")
    status = "OK" if not fail else f"FAIL ({len(fail)} missing)"
    print(f"{label}: {status}")
    for line in fail:
        print(line)
EOF
```

**Expected:** `OK` for both. Any `FAIL` line names the specific server whose binary or script path is missing.

### Check 5 — No disabled bucket in Claude Code

```bash
jq '.mcpServersDisabled // {} | keys | length' ~/.claude.json
```

**Expected:** `0`. A non-zero count means servers were disabled rather than removed from the canonical set; run regeneration to restore them.

---

## If any check fails

1. **Run the sync script (dry-run first):**

   ```bash
   bash ~/gruff/workspace/CascadeProjects/Components/scripts/sync-mcp-configs.sh --dry-run
   ```

   Review the diff output. If the diff looks correct (paths updated to current host, no legacy refs):

   ```bash
   bash ~/gruff/workspace/CascadeProjects/Components/scripts/sync-mcp-configs.sh
   ```

2. **Restart the affected tool** (Windsurf: Reload Window; Claude Code: quit and reopen).

3. **Re-run checks 1–5** to confirm clean state.

4. If paths are still missing after regeneration, the underlying binaries may not be built. Check:

   ```bash
   # TypeScript servers — build
   cd ~/gruff/workspace/CascadeProjects/Tools/MCPServers/<server-name>
   npm install && npm run build

   # Python servers — venv
   cd ~/gruff/workspace/CascadeProjects/Projects/GRID-main
   python3 -m venv .venv && .venv/bin/pip install -e ".[server]"
   ```

---

## Reference

- Runbook: `Documentation/docs/mcp-config-sync.md`
- Sync script: `Components/scripts/sync-mcp-configs.sh`
- Governance lesson: `Documentation/docs/GOVERNANCE.md § Config Hygiene`
- Canonical config: `mcp_config.example.json` (20 servers as of 2026-04-23)
