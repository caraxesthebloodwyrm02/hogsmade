# MCP Server Config Snapshot

**Archival note**: This snapshot was generated before the 2026-04-04 layout recovery pass. Some path examples and references below reflect the older workspace shape and are preserved for history only.

**Generated:** 2026-03-12 (historical — Windows-era paths below are superseded)
**Current source of truth:** `mcp_config.json` (workspace root, updated 2026-03-21 with Linux paths)
**Audit status:** All required env vars satisfied ✓

---

## Server Registry

| Server            | Purpose                                              | Port | Deps           | Env vars required                     |
| ----------------- | ---------------------------------------------------- | ---- | -------------- | ------------------------------------- |
| `echoes-server`   | Persistent audit log + cross-session analytics       | 8000 | —              | —                                     |
| `grid-server`     | GATE envelope verification + workspace orchestration | 8080 | —              | `CASCADE_WORKSPACE_ROOT` `GATE_DIR`   |
| `afloat-server`   | Multi-step workflow orchestration with rollback      | 3000 | `shared-types` | —                                     |
| `lots-server`     | Experiment runner + results ledger                   | 8001 | `shared-types` | `LOTS_EXPERIMENTS_DIR`                |
| `seeds-server`    | Cross-repo health monitor + bookmark store           | —    | —              | `SEEDS_ROOT`                          |
| `pulse-server`    | Morning briefing + session journal + daily digest    | —    | —              | —                                     |
| `maintain-server` | Workspace hygiene + git health + system metrics      | —    | `shared-types` | `CASCADE_WORKSPACE_ROOT` `SEEDS_ROOT` |

**Build order:** `shared-types` must be built before `afloat-server`, `lots-server`, or `maintain-server`.

```bash
cd shared-types && npm run build
```

---

## Env Var Schema

Full schema per server — required vars throw on startup if missing; optional vars fall back to defaults.

### echoes-server

| Var                    | Required | Default                      | Notes                                    |
| ---------------------- | -------- | ---------------------------- | ---------------------------------------- |
| `ECHOES_AUDIT_PATH`    | no       | `~/.echoes/audit.ndjson`     | Override to share audit log across tools |
| `ECHOES_DATA_DIR`      | no       | `~/.echoes`                  | Root for all echoes data                 |
| `ECHOES_TELEMETRY_DIR` | no       | `$ECHOES_DATA_DIR/telemetry` |                                          |

### grid-server

| Var                              | Required | Default                 | Notes                                                |
| -------------------------------- | -------- | ----------------------- | ---------------------------------------------------- |
| `CASCADE_WORKSPACE_ROOT`         | **yes**  | —                       | Absolute path to CascadeProjects                     |
| `GATE_DIR`                       | **yes**  | —                       | Absolute path to GATE/ directory                     |
| `GRID_API_URL`                   | no       | `""`                    | GRID-main FastAPI; empty disables API calls          |
| `GATE_USER_SECRET`               | no       | `""`                    | If set, enables HMAC-SHA256 fingerprint verification |
| `GATE_TRUSTED_SOURCE_PARTITIONS` | no       | drive root of workspace | Comma-separated trusted partition list               |

### afloat-server

| Var                    | Required | Default                      | Notes                          |
| ---------------------- | -------- | ---------------------------- | ------------------------------ |
| `AFLOAT_DATA_DIR`      | no       | `~/.afloat`                  | Root for workflows and history |
| `AFLOAT_WORKFLOWS_DIR` | no       | `$AFLOAT_DATA_DIR/workflows` |                                |
| `AFLOAT_HISTORY_DIR`   | no       | `$AFLOAT_DATA_DIR/history`   |                                |

### lots-server

| Var                    | Required | Default                     | Notes                         |
| ---------------------- | -------- | --------------------------- | ----------------------------- |
| `LOTS_EXPERIMENTS_DIR` | **yes**  | —                           | Absolute path to experiments/ |
| `ECHOES_AUDIT_PATH`    | no       | `~/.echoes/audit.ndjson`    | Shared with echoes-server     |
| `SEEDS_SNAPSHOTS_DIR`  | no       | `~/.seeds-server/snapshots` |                               |
| `AFLOAT_HISTORY_DIR`   | no       | `~/.afloat/history`         |                               |

### seeds-server

| Var              | Required | Default           | Notes                                         |
| ---------------- | -------- | ----------------- | --------------------------------------------- |
| `SEEDS_ROOT`     | **yes**  | —                 | Absolute path to Seeds root (e.g. `E:\Seeds`) |
| `SEEDS_DATA_DIR` | no       | `~/.seeds-server` | Server-local data (bookmarks, snapshots)      |

### pulse-server

All vars optional — reads other servers' data from their default dirs.

| Var                      | Required | Default                     |
| ------------------------ | -------- | --------------------------- |
| `PULSE_DATA_DIR`         | no       | `~/.pulse`                  |
| `ECHOES_AUDIT_PATH`      | no       | `~/.echoes/audit.ndjson`    |
| `ECHOES_TELEMETRY_DIR`   | no       | `~/.echoes/telemetry`       |
| `AFLOAT_WORKFLOWS_DIR`   | no       | `~/.afloat/workflows`       |
| `AFLOAT_HISTORY_DIR`     | no       | `~/.afloat/history`         |
| `SEEDS_SNAPSHOTS_DIR`    | no       | `~/.seeds-server/snapshots` |
| `PULSE_PREFERENCES_PATH` | no       | `~/.pulse/preferences.json` |

### maintain-server

| Var                      | Required | Default                             | Notes                                   |
| ------------------------ | -------- | ----------------------------------- | --------------------------------------- |
| `CASCADE_WORKSPACE_ROOT` | **yes**  | —                                   |                                         |
| `SEEDS_ROOT`             | **yes**  | —                                   |                                         |
| `MAINTAIN_DATA_DIR`      | no       | `~/.maintain-server`                |                                         |
| `MAINTAIN_SCAN_ROOTS`    | no       | `CASCADE_WORKSPACE_ROOT,SEEDS_ROOT` | Comma-separated; defaults to both roots |

---

## Tool Config Blocks

All blocks use the same absolute paths. Replace `C:\Users\USER` and `E:\Seeds` for a different machine.

### Claude Code

**Install to:** `~/.claude.json` under the `"mcpServers"` key.
Supports `cwd` — Python servers use module-relative paths + cwd.

```json
{
  "mcpServers": {
    "echoes-server": {
      "command": "npx",
      "args": ["-y", "tsx", "C:\\Users\\USER\\CascadeProjects\\echoes-server\\src\\server.ts"],
      "env": { "ECHOES_AUDIT_PATH": "C:\\Users\\USER\\.echoes\\audit.ndjson" }
    },
    "grid-server": {
      "command": "npx",
      "args": ["-y", "tsx", "C:\\Users\\USER\\CascadeProjects\\grid-server\\src\\server.ts"],
      "env": {
        "CASCADE_WORKSPACE_ROOT": "C:\\Users\\USER\\CascadeProjects",
        "GATE_DIR": "C:\\Users\\USER\\CascadeProjects\\GATE",
        "GRID_API_URL": "http://localhost:8080"
      }
    },
    "afloat-server": {
      "command": "npx",
      "args": ["-y", "tsx", "C:\\Users\\USER\\CascadeProjects\\afloat-server\\src\\server.ts"],
      "env": {}
    },
    "lots-server": {
      "command": "npx",
      "args": ["-y", "tsx", "C:\\Users\\USER\\CascadeProjects\\lots-server\\src\\server.ts"],
      "env": {
        "LOTS_EXPERIMENTS_DIR": "C:\\Users\\USER\\CascadeProjects\\experiments",
        "ECHOES_AUDIT_PATH": "C:\\Users\\USER\\.echoes\\audit.ndjson"
      }
    },
    "seeds-server": {
      "command": "npx",
      "args": ["-y", "tsx", "C:\\Users\\USER\\CascadeProjects\\seeds-server\\src\\server.ts"],
      "env": { "SEEDS_ROOT": "E:\\Seeds" }
    },
    "pulse-server": {
      "command": "npx",
      "args": ["-y", "tsx", "C:\\Users\\USER\\CascadeProjects\\pulse-server\\src\\server.ts"],
      "env": {}
    },
    "maintain-server": {
      "command": "npx",
      "args": ["-y", "tsx", "C:\\Users\\USER\\CascadeProjects\\maintain-server\\src\\server.ts"],
      "env": {
        "CASCADE_WORKSPACE_ROOT": "C:\\Users\\USER\\CascadeProjects",
        "SEEDS_ROOT": "E:\\Seeds",
        "ECHOES_AUDIT_PATH": "C:\\Users\\USER\\.echoes\\audit.ndjson"
      }
    }
  }
}
```

---

### Cursor

**Install to:** `.cursor/mcp.json` in the project root (or `~/.cursor/mcp.json` globally).
Format identical to Claude Code.

```json
{
  "mcpServers": {
    "echoes-server": {
      "command": "npx",
      "args": ["-y", "tsx", "C:\\Users\\USER\\CascadeProjects\\echoes-server\\src\\server.ts"],
      "env": { "ECHOES_AUDIT_PATH": "C:\\Users\\USER\\.echoes\\audit.ndjson" }
    },
    "grid-server": {
      "command": "npx",
      "args": ["-y", "tsx", "C:\\Users\\USER\\CascadeProjects\\grid-server\\src\\server.ts"],
      "env": {
        "CASCADE_WORKSPACE_ROOT": "C:\\Users\\USER\\CascadeProjects",
        "GATE_DIR": "C:\\Users\\USER\\CascadeProjects\\GATE",
        "GRID_API_URL": "http://localhost:8080"
      }
    },
    "afloat-server": {
      "command": "npx",
      "args": ["-y", "tsx", "C:\\Users\\USER\\CascadeProjects\\afloat-server\\src\\server.ts"],
      "env": {}
    },
    "lots-server": {
      "command": "npx",
      "args": ["-y", "tsx", "C:\\Users\\USER\\CascadeProjects\\lots-server\\src\\server.ts"],
      "env": {
        "LOTS_EXPERIMENTS_DIR": "C:\\Users\\USER\\CascadeProjects\\experiments",
        "ECHOES_AUDIT_PATH": "C:\\Users\\USER\\.echoes\\audit.ndjson"
      }
    },
    "seeds-server": {
      "command": "npx",
      "args": ["-y", "tsx", "C:\\Users\\USER\\CascadeProjects\\seeds-server\\src\\server.ts"],
      "env": { "SEEDS_ROOT": "E:\\Seeds" }
    },
    "pulse-server": {
      "command": "npx",
      "args": ["-y", "tsx", "C:\\Users\\USER\\CascadeProjects\\pulse-server\\src\\server.ts"],
      "env": {}
    },
    "maintain-server": {
      "command": "npx",
      "args": ["-y", "tsx", "C:\\Users\\USER\\CascadeProjects\\maintain-server\\src\\server.ts"],
      "env": {
        "CASCADE_WORKSPACE_ROOT": "C:\\Users\\USER\\CascadeProjects",
        "SEEDS_ROOT": "E:\\Seeds",
        "ECHOES_AUDIT_PATH": "C:\\Users\\USER\\.echoes\\audit.ndjson"
      }
    }
  }
}
```

---

### Windsurf (windsurf-next)

**Install to:** `C:\Users\USER\.codeium\windsurf-next\mcp_config.json`
Format: flat `mcpServers` object, same as Cursor/Claude Code.

_(Identical to Cursor block above — copy the same JSON.)_

---

### VS Code (Copilot)

**Install to:** `.vscode/mcp.json` in the workspace root.
`cwd` is supported; format otherwise matches Cursor.

_(Identical to Cursor block above — copy the same JSON.)_

---

### Zed

**Install to:** `~/.config/zed/settings.json` (`%APPDATA%\Zed\settings.json` on Windows).
Format differs: `context_servers` with nested `command: { path, args, env }`.
**No `cwd` support** — all paths must be absolute.

```jsonc
{
  "context_servers": {
    "echoes-server": {
      "command": {
        "path": "npx",
        "args": ["-y", "tsx", "C:\\Users\\USER\\CascadeProjects\\echoes-server\\src\\server.ts"],
        "env": { "ECHOES_AUDIT_PATH": "C:\\Users\\USER\\.echoes\\audit.ndjson" }
      }
    },
    "grid-server": {
      "command": {
        "path": "npx",
        "args": ["-y", "tsx", "C:\\Users\\USER\\CascadeProjects\\grid-server\\src\\server.ts"],
        "env": {
          "CASCADE_WORKSPACE_ROOT": "C:\\Users\\USER\\CascadeProjects",
          "GATE_DIR": "C:\\Users\\USER\\CascadeProjects\\GATE",
          "GRID_API_URL": "http://localhost:8080"
        }
      }
    },
    "afloat-server": {
      "command": {
        "path": "npx",
        "args": ["-y", "tsx", "C:\\Users\\USER\\CascadeProjects\\afloat-server\\src\\server.ts"],
        "env": {}
      }
    },
    "lots-server": {
      "command": {
        "path": "npx",
        "args": ["-y", "tsx", "C:\\Users\\USER\\CascadeProjects\\lots-server\\src\\server.ts"],
        "env": {
          "LOTS_EXPERIMENTS_DIR": "C:\\Users\\USER\\CascadeProjects\\experiments",
          "ECHOES_AUDIT_PATH": "C:\\Users\\USER\\.echoes\\audit.ndjson"
        }
      }
    },
    "seeds-server": {
      "command": {
        "path": "npx",
        "args": ["-y", "tsx", "C:\\Users\\USER\\CascadeProjects\\seeds-server\\src\\server.ts"],
        "env": { "SEEDS_ROOT": "E:\\Seeds" }
      }
    },
    "pulse-server": {
      "command": {
        "path": "npx",
        "args": ["-y", "tsx", "C:\\Users\\USER\\CascadeProjects\\pulse-server\\src\\server.ts"],
        "env": {}
      }
    },
    "maintain-server": {
      "command": {
        "path": "npx",
        "args": ["-y", "tsx", "C:\\Users\\USER\\CascadeProjects\\maintain-server\\src\\server.ts"],
        "env": {
          "CASCADE_WORKSPACE_ROOT": "C:\\Users\\USER\\CascadeProjects",
          "SEEDS_ROOT": "E:\\Seeds",
          "ECHOES_AUDIT_PATH": "C:\\Users\\USER\\.echoes\\audit.ndjson"
        }
      }
    }
  }
}
```

---

## Format Diff Matrix

| Tool        | Config key        | Command key             | Env nesting      | `cwd` support |
| ----------- | ----------------- | ----------------------- | ---------------- | ------------- |
| Claude Code | `mcpServers`      | `command` (flat)        | `env: {}`        | ✓             |
| Cursor      | `mcpServers`      | `command` (flat)        | `env: {}`        | ✓             |
| Windsurf    | `mcpServers`      | `command` (flat)        | `env: {}`        | ✗             |
| VS Code     | `mcpServers`      | `command` (flat)        | `env: {}`        | ✓             |
| Zed         | `context_servers` | `command.path` (nested) | inside `command` | ✗             |

**Rule of thumb:** Claude Code / Cursor / Windsurf / VS Code share identical JSON.
Zed requires the `context_servers` wrapper with one extra nesting level around each command.

---

## Python Servers (GRID-main)

These live under `e:\grid\` and require the GRID-main venv + Ollama running locally.

| Server                  | Entry point                                               | Extra PYTHONPATH |
| ----------------------- | --------------------------------------------------------- | ---------------- |
| `grid-rag`              | `e:\grid\mcp-setup\server\grid_rag_mcp_server.py`         | —                |
| `grid-rag-enhanced`     | `-m grid.mcp.enhanced_rag_server`                         | —                |
| `grid-enhanced-tools`   | `e:\grid\mcp-setup\server\enhanced_tools_mcp_server.py`   | —                |
| `portfolio-safety-lens` | `e:\grid\mcp-setup\server\portfolio_safety_mcp_server.py` | `e:\Coinbase`    |
| `code-analysis`         | `e:\grid\mcp-setup\server\code_analysis_mcp_server.py`    | —                |
| `test-runner`           | `e:\grid\mcp-setup\server\test_runner_mcp_server.py`      | —                |

All Python servers share:

```
python: e:\grid\.venv\Scripts\python.exe
PYTHONPATH: e:\grid\src;e:\grid
RAG_EMBEDDING_MODEL: nomic-embed-text-v2-moe:latest
RAG_LLM_MODEL_OLLAMA: ministral:latest
OLLAMA_BASE_URL: http://localhost:11434
RAG_VECTOR_STORE_PATH: .rag_db
```

Full blocks for Python servers: see `mcp_config.json` → `mcpServers` section, or `zed_config.jsonc` for Zed format.

---

## Notes

- **`mcp_config.json`** is the canonical source. `CONFIG_SNAPSHOT.md` and `zed_config.jsonc` are derived from it.
- **`shared-types`** (`@cascade/shared-types`) is a local workspace dependency for `afloat-server`, `lots-server`, and `maintain-server`. If you pull a fresh clone, run `cd shared-types && npm run build` before starting those servers.
- **`pulse-server`** passes zero env vars intentionally — it reads cross-server data from the default `~/.*` directories that the other servers write to.
- **`GATE_USER_SECRET`** is intentionally omitted from the canonical config — set it via the OS credential manager or a local `.env` file that is gitignored.
