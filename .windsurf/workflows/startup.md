---
description: Session startup — check and start runtime prerequisites (GRID API, Ollama, Python venv, env vars, repo health)
---

Run this at the start of every session via `/startup`. It covers all areas in dependency order. Each step is read-only unless marked with a fix command.

---

## Area 1 — Port and service status (read-only)

Check what is and isn't listening before touching anything.

// turbo
1. Run the live service snapshot:

```bash
echo "=== GRID API ===" && curl -s --max-time 3 http://localhost:8080/health 2>&1 || echo "DOWN"
echo "=== Ollama ===" && curl -s --max-time 3 http://localhost:11434/api/tags 2>&1 | python3 -c "import sys,json; d=json.load(sys.stdin); print('UP — models:', [m['name'] for m in d.get('models',[])])" 2>/dev/null || echo "DOWN"
echo "=== Ports ===" && ss -tlnp | grep -E '8080|11434|3000|8000|8001' || echo "none of the expected ports are bound"
```

---

## Area 2 — Environment variables (read-only)

// turbo
2. Print the values that MCP servers read at spawn time:

```bash
echo "GRID_API_URL        = ${GRID_API_URL:-<NOT SET>}"
echo "CASCADE_WORKSPACE_ROOT = ${CASCADE_WORKSPACE_ROOT:-<NOT SET>}"
echo "GATE_DIR            = ${GATE_DIR:-<NOT SET>}"
echo "ECHOES_AUDIT_PATH   = ${ECHOES_AUDIT_PATH:-<NOT SET>}"
echo "SEEDS_ROOT          = ${SEEDS_ROOT:-<NOT SET>}"
echo "OLLAMA_BASE_URL     = ${OLLAMA_BASE_URL:-<NOT SET>}"
```

If any are `<NOT SET>`, check `mcp_config.json` — they are injected per-server, not shell-global. Only the GRID mothership needs `GRID_API_URL` in the shell that starts it.

---

## Area 3 — Python venv / GRID-main sync (read-only first)

// turbo
3. Verify the GRID venv and sync state:

```bash
python_bin="/home/caraxes/CascadeProjects/Projects/GRID-main/.venv/bin/python"
if [ -x "$python_bin" ]; then
  echo "venv OK: $($python_bin --version)"
else
  echo "MISSING — run: cd Projects/GRID-main && uv sync --group dev --group test"
fi
```

**Fix if missing** (requires approval):
```bash
cd /home/caraxes/CascadeProjects/Projects/GRID-main && uv sync --group dev --group test
```

---

## Area 4 — Start GRID API (localhost:8080)

Required by: `grid-server` (`admission_*` tools, `check_permission`, `health_check`, `gate_*`) and `pulse-server`.

4. If Area 1 shows GRID API as DOWN, start the mothership (non-blocking, background):

```bash
cd /home/caraxes/CascadeProjects/Projects/GRID-main
GRID_API_URL=http://localhost:8080 nohup uv run python -m application.mothership.main > /tmp/grid-mothership.log 2>&1 &
echo "Started PID $! — tailing log for 5s..."
sleep 5 && tail -20 /tmp/grid-mothership.log
```

Confirm it bound:
```bash
curl -s --max-time 5 http://localhost:8080/health
```

---

## Area 5 — Ollama health (localhost:11434)

Required by: `grid-rag`, `grid-rag-enhanced` (embedding model `nomic-embed-text-v2-moe:latest`, LLM `ministral-3:latest`).

5. If Area 1 shows Ollama as DOWN, start it:

```bash
systemctl --user start ollama 2>/dev/null || ollama serve &
sleep 3 && curl -s http://localhost:11434/api/tags | python3 -c "import sys,json; print([m['name'] for m in json.load(sys.stdin).get('models',[])])"
```

Verify required models are pulled:
```bash
ollama list | grep -E "nomic-embed-text|ministral"
```

If missing:
```bash
ollama pull nomic-embed-text-v2-moe:latest
ollama pull ministral-3:latest
```

---

## Area 6 — Repo health flags (read-only)

// turbo
6. Spot-check repos that the seeds-server has flagged as "no git repository found":

```bash
for dir in apiguard Vision assistive-agreement-contracts; do
  path=$(find /home/caraxes/CascadeProjects /home/caraxes/canopy /home/caraxes/grove -maxdepth 3 -type d -name "$dir" 2>/dev/null | head -1)
  if [ -n "$path" ]; then
    git -C "$path" rev-parse --git-dir &>/dev/null && echo "$dir: git OK" || echo "$dir: NO GIT REPO at $path"
  else
    echo "$dir: directory not found under scan roots"
  fi
done
```

These repos score 50/100 in ecosystem scans and skew health averages. Remediation options:
- `git init` + connect remote if intentional standalone
- Remove from `SEEDS_ROOTS` scan paths if they are not source-controlled projects

---

## Area 7 — Final status summary

// turbo
7. Re-run the compact status check after any fixes:

```bash
echo "--- GRID API ---" && curl -s --max-time 3 http://localhost:8080/health | python3 -m json.tool 2>/dev/null || echo "still DOWN"
echo "--- Ollama ---" && curl -s --max-time 3 http://localhost:11434/api/tags | python3 -c "import sys,json; print('OK, models:', len(json.load(sys.stdin).get('models',[])))" 2>/dev/null || echo "still DOWN"
echo "--- Ports ---" && ss -tlnp | grep -E '8080|11434' || echo "none bound"
```
