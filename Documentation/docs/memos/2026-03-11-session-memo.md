# Session Memo: 2026-03-11

## Summary

Documentation updates across workspace and creation of LLM pipeline tracking documents for ai-web-demo project.

---

## Completed Work

### 1. Workspace Documentation Updates

Updated four files to reflect current project structure:

| File                | Change                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/STRUCTURE.md` | Added `glimpse-engine/` to first-party apps table; added `projects/web/ai-web-demo/` to nested repos                                           |
| `scripts/README.md` | Added `sync-default-master.mjs` and `bootstrap_glimpse_logic.mjs` to script index                                                              |
| `AGENTS.md`         | Added `glimpse-engine/` to workspace table; added glimpse-engine per-project section with config/views/docs references; added nested repos row |
| `README.md`         | Added `glimpse-engine/` to projects table                                                                                                      |

**Why**: These projects existed but weren't documented. The `projects/web/ai-web-demo/` submodule was added recently (visible in `.gitmodules`) and `glimpse-engine/` has been at root but missing from tables.

### 2. LLM Pipeline Tracking Documents

Created two tracking documents for ai-web-demo custom model training:

| File                  | Location                    | Purpose                                                    |
| --------------------- | --------------------------- | ---------------------------------------------------------- |
| `TODO.md`             | `projects/web/ai-web-demo/` | Quick checklist with 42 tasks across 6 phases              |
| `PIPELINE-TRACKER.md` | `projects/web/ai-web-demo/` | Full spec: phases, tasks, models, costs, presets, progress |

**Source**: Extracted from `pipeline-explorer.html` which contains:

- 6 phases: Data Prep → Training → Export → Ollama Import → App Integration → Production
- 4 cloud models: MiniMax M2.5, Qwen 3.5, Kimi K2.5, GLM-5
- 5 presets: Quick Start, Balanced, Production, Budget, Max Quality
- Cost estimation based on model size, quantization, request volume
- 14 checklist items (expanded to 42 detailed tasks in TODO.md)

---

## Current State

### Git Status

```
Branch: hogsmade (9 commits ahead of origin/hogsmade)

Modified (not staged):
  M AGENTS.md
  M README.md
  M docs/STRUCTURE.md
  M glimpse.master.yaml
  M scripts/README.md
  m projects/web/ai-web-demo (submodule with changes)

Untracked:
  docs/memos/2026-03-11-session-memo.md (this file)
```

### Submodule Status

`projects/web/ai-web-demo` — Git submodule with local modifications:

- `TODO.md` — Created (new file)
- `PIPELINE-TRACKER.md` — Created and modified (added reference to `data/DATA-SCOPE.md`)

---

## Pending Items

### Immediate

| Item                                 | Details                                                                          |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| Commit documentation updates         | `AGENTS.md`, `README.md`, `docs/STRUCTURE.md`, `scripts/README.md`               |
| Review `glimpse.master.yaml` changes | Has uncommitted modifications from before this session                           |
| Submodule handling                   | `ai-web-demo` has new files; decide whether to commit in submodule or update ref |

### LLM Pipeline Project

| Phase           | Status  | Next Steps                                              |
| --------------- | ------- | ------------------------------------------------------- |
| Data Prep       | Current | Define dataset scope per `data/DATA-SCOPE.md` reference |
| Training        | Pending | Select base model, configure training infrastructure    |
| Export          | Pending | Set up GGUF conversion pipeline                         |
| Ollama Import   | Pending | Create Modelfile template                               |
| App Integration | Pending | Update modelRouter.ts                                   |
| Production      | Pending | Configure canary deployment                             |

---

## Context Notes

### Workspace Architecture

This is a multi-project workspace with independent toolchains:

**First-party (root repo):**

- MCP servers: `afloat-server`, `echoes-server`, `grid-server`, `lots-server`, `maintain-server`, `pulse-server`, `seeds-server`
- Shared: `shared-types` (build first for dependent servers)
- UI: `glimpse-artifact` (React/Vite)
- Viz: `glimpse-engine` (browser-based, no package.json)

**Nested repos (submodules):**

- `GRID-main/` — Python/FastAPI AI framework (own git root)
- `mcp-tool-experiment/` — MCP TypeScript SDK (own git root)
- `projects/web/ai-web-demo/` — AI web demo (local submodule)

### Build Order

```
shared-types → afloat-server, maintain-server, pulse-server, seeds-server
```

### Key Files Referenced

| File                  | Purpose                                              |
| --------------------- | ---------------------------------------------------- |
| `CLAUDE.md`           | Claude Code instructions (user edits with Opus only) |
| `AGENTS.md`           | Codex instructions                                   |
| `docs/STRUCTURE.md`   | Workspace directory map and ownership                |
| `GLIMPSE-GUIDE.md`    | Plain-language guide to Glimpse rule authoring       |
| `glimpse.master.yaml` | Glimpse config (domains, rules, presets)             |

---

## Session Files Created

| Path                                           | Type          |
| ---------------------------------------------- | ------------- |
| `projects/web/ai-web-demo/TODO.md`             | Checklist     |
| `projects/web/ai-web-demo/PIPELINE-TRACKER.md` | Spec document |
| `docs/memos/2026-03-11-session-memo.md`        | This memo     |

---

## References

- Pipeline source: `projects/web/ai-web-demo/pipeline-explorer.html`
- Data scope: `projects/web/ai-web-demo/data/DATA-SCOPE.md` (referenced, may need creation)
- Glimpse skill: `.claude/skills/glimpse/SKILL.md`
- MCP integration skill: `plugin-dev:mcp-integration` (loaded during session)
