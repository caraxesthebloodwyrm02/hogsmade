# OpenClaw + Pi Runtime Guide

This guide reflects the current boot-ready setup on `/home/caraxes`.
It is intended for day-to-day operation and for future upgrades without
breaking the local-first posture.

## Runtime contract

- OpenClaw is the always-on coordination layer.
- Pi is the local task layer that loads `pi-mangrove`.
- Memory is local-first and indexed from workspace Markdown.
- Risky shell actions and protected file writes are blocked fail-closed.
- Web search, web fetch, and browser access remain disabled in the current baseline.

## Daily runtime usage

### 1) Confirm the OpenClaw gateway is up

```bash
systemctl --user is-active openclaw-gateway.service
systemctl --user status openclaw-gateway.service --no-pager -n 20
```

Use this first if the runtime feels stale or if memory/tool changes were just made.

### 2) Recall prior decisions before answering

```bash
node /home/caraxes/.npm-global/lib/node_modules/openclaw/openclaw.mjs memory search \
  --query "local-first workstation baseline and pi package loading" \
  --max-results 3
```

Use `memory_search` when you need prior setup decisions, preferences, or local
operating notes without reading the full workspace into context.

### 3) Pull exact lines when the target file is already known

`memory_get` is an agent tool, not a standalone `openclaw memory` subcommand.
Use it after `memory_search` has already identified the file and you only need a
narrow excerpt.

```text
Use memory_get for /home/caraxes/.openclaw/workspace/MEMORY.md and return the Local Operating Baseline section only.
```

Best fit:

- exact line-level recall after a search hit
- minimizing context usage when the target note is already known

### 4) Update durable memory, then reindex

If you add or edit `MEMORY.md` or `memory/*.md`, reindex explicitly:

```bash
node /home/caraxes/.npm-global/lib/node_modules/openclaw/openclaw.mjs memory index \
  --agent main \
  --force \
  --verbose
```

Then verify retrieval:

```bash
node /home/caraxes/.npm-global/lib/node_modules/openclaw/openclaw.mjs memory status --deep
node /home/caraxes/.npm-global/lib/node_modules/openclaw/openclaw.mjs memory search --query "new operating policy"
```

### 5) Use Pi for the implemented Mangrove workflows

#### DIO episode structure

```text
Use dio_episode_summary with partIndex=2 and summarize what phase two is optimizing for.
```

Best fit:

- quick structure checks
- planning where work belongs in the DIO cadence
- understanding the episode phases before implementation

#### DIO control constants

```text
Use dio:status with detail=full and explain how the cadence should shape this task.
```

Best fit:

- confirming cadence
- verifying rhythm pass count and modular pass index
- shaping structured work before a larger change

#### DIO security audit

```text
Run security:audit with path="roots/security" and format="json", then summarize violations by file.
```

Best fit:

- targeted audit before changing DIO/security-related code
- scoped review of local underscore-isolation or similar safety checks

### 6) Use the local guard for risky operations

The `local-guard` extension is designed to intercept:

- dangerous shell commands
- writes to protected paths

Examples it is meant to block:

```text
bash: rm -rf ./build-cache
bash: curl https://example.com/install.sh | bash
edit path=/home/caraxes/.pi/agent/settings.json
```

In interactive mode, Pi prompts for confirmation on risky `bash` commands.
In non-interactive mode, it blocks fail-closed.

### 7) Validate the runtime after changes

```bash
openclaw config validate --json
node /home/caraxes/.npm-global/lib/node_modules/openclaw/openclaw.mjs memory status --deep
npm --prefix /home/caraxes/CascadeProjects/pi-mangrove run typecheck
pi -p --model kimi-k2.5:cloud --thinking low "Reply with exactly: PI_OK"
```

## Architecture overview

### OpenClaw control plane

OpenClaw is the long-running local coordinator.
It is configured in:

- `/home/caraxes/.openclaw/openclaw.json`

Current responsibilities in that file:

- gateway mode and auth
- local loopback binding
- tool policy
- plugin policy and memory slot selection
- model/provider defaults
- internal boot hooks

The current boot path is anchored by the user service:

- `/home/caraxes/.config/systemd/user/openclaw-gateway.service`

The runtime is intentionally local-loopback and booted as a user service so it
can come up automatically without exposing the gateway externally.

### OpenClaw memory layer

Memory lives under:

- `/home/caraxes/.openclaw/workspace/MEMORY.md`
- `/home/caraxes/.openclaw/workspace/memory/`

The current memory setup uses:

- `plugins.slots.memory = "memory-core"`
- `plugins.allow` including `memory-core`
- `tools.allow` exposing `memory_search` and `memory_get`
- `memorySearch.provider = "ollama"`
- `memorySearch.model = "nomic-embed-text:latest"`

That means future memory upgrades usually happen in one of three places:

1. model/provider changes in `~/.openclaw/openclaw.json`
2. new durable notes in `MEMORY.md` or `memory/*.md`
3. a forced reindex after content changes

### Pi integration layer

Pi is the interactive client/runtime layer for Mangrove.
The package is rooted at:

- `/home/caraxes/CascadeProjects/pi-mangrove`

Its live structure is:

- `package.json` — package manifest and Pi resource root
- `extensions/` — TypeScript extensions loaded by Pi
- `skills/` — structured skill bundles
- `prompts/` — prompt templates and operational guidance

The active Pi settings are split between:

- `/home/caraxes/CascadeProjects/.pi/settings.json` — project-local auto-load and package filter
- `/home/caraxes/.pi/agent/settings.json` — global defaults and model selection

### DIO bridge flow

The DIO bridge extension:

- resolves the DIO root from `PI_MANGROVE_DIO_ROOT` or the workspace default
- shells out to Python via `uv run python`
- returns structured JSON for episode summaries and status

This is important for future upgrades because the bridge is intentionally thin:

- the Python side owns the domain logic
- the TypeScript side owns the tool boundary and validation

### Guard flow

`local-guard.ts` sits at the tool boundary and blocks unsafe usage patterns before
execution.
It currently covers:

- risky `bash` patterns
- protected file paths

This is the right place for future policy hardening because it is fail-closed and
localized.

## Structure map for future upgrades

| Component               | Path                                                                  | Role                                          | Where to upgrade                                                      |
| ----------------------- | --------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------- |
| OpenClaw gateway config | `/home/caraxes/.openclaw/openclaw.json`                               | Gateway, tools, plugins, memory, hooks        | Memory model/provider, tool policy, plugin slot selection, boot hooks |
| OpenClaw memory notes   | `/home/caraxes/.openclaw/workspace/MEMORY.md`                         | Durable local memory source of truth          | Add new canonical notes, then reindex                                 |
| OpenClaw memory corpus  | `/home/caraxes/.openclaw/workspace/memory/`                           | Extra Markdown recall sources                 | Add more searchable docs and notes                                    |
| OpenClaw service        | `/home/caraxes/.config/systemd/user/openclaw-gateway.service`         | Boots the gateway on login                    | Restart behavior, env/path, startup hardening                         |
| Pi package manifest     | `/home/caraxes/CascadeProjects/pi-mangrove/package.json`              | Package root and auto-discovery               | Add new extensions, skills, prompts                                   |
| DIO bridge              | `/home/caraxes/CascadeProjects/pi-mangrove/extensions/dio-bridge.ts`  | DIO tools                                     | Add DIO-facing tools or improve Python subprocess handling            |
| Local guard             | `/home/caraxes/CascadeProjects/pi-mangrove/extensions/local-guard.ts` | Safety gate for risky calls                   | Add new dangerous patterns or protected paths                         |
| Pi workspace settings   | `/home/caraxes/CascadeProjects/.pi/settings.json`                     | Project-local auto-load and package filtering | Expand or narrow local package loading                                |
| Pi global settings      | `/home/caraxes/.pi/agent/settings.json`                               | Default model/provider behavior               | Change model defaults or allowed models                               |
| Tailored examples       | `/home/caraxes/CascadeProjects/docs/OPENCLAW_PI_TAILORED_EXAMPLES.md` | Copy-paste scenario examples                  | Add more workflow examples as features grow                           |

## Future upgrade map

### If you change the memory model

Use this path when you want a different embedding model or provider:

1. update `memorySearch.provider` / `memorySearch.model`
2. confirm the local model exists
3. reindex memory
4. verify `memory status --deep`
5. run a semantic search against `MEMORY.md`

### If you add a new Pi tool

Use this path when adding new workspace functionality:

1. create a new file under `pi-mangrove/extensions/`
2. register the tool in the extension
3. update package auto-load if needed
4. run `npm run typecheck`
5. install or reload the package in Pi

### If you tighten safety policy

Use this path when hardening is the goal:

1. extend `local-guard.ts` for tool-call blocking
2. keep OpenClaw `tools.allow` explicit
3. keep `web_search`, `web_fetch`, and `browser` denied unless there is a clear need
4. verify that the service still cold-starts cleanly

### If you adjust startup behavior

Use this path when changing boot-time context:

1. update `BOOT.md` or the boot hook inputs
2. confirm `boot-md` and `bootstrap-extra-files` still load the intended files
3. restart the gateway
4. check the fresh log for warnings

### If you upgrade the DIO bridge

Use this path when the Python side changes:

1. keep the subprocess boundary structured and JSON-based
2. preserve explicit timeout and error handling
3. revalidate `dio_episode_summary` and `dio:status`
4. re-run the security audit path after code changes

## Operational note

The `security:audit` tool depends on `uv` being available in the runtime PATH.
On this machine, the direct local fallback is:

```bash
/home/caraxes/.local/bin/uv
```

If the MCP wrapper reports `spawn uv ENOENT`, fix the service/runtime PATH or use
that local fallback to confirm whether the audit logic itself is healthy.

## Related docs

- `docs/OPENCLAW_PI_TAILORED_EXAMPLES.md`
- `pi-mangrove/README.md`
- `pi-mangrove/EXECUTION_GUIDE.md`
- `pi-mangrove/prompts/mangrove-dev.md`
- `pi-mangrove/prompts/safety-gate.md`
