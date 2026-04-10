# OpenClaw + Pi Tailored Examples

## Reviewed Active Setup

### OpenClaw

- Gateway runs in local loopback mode on port `18789`
- Memory search uses `ollama` with `nomic-embed-text:latest`
- Memory plugin slot is `memory-core`
- Allowed tool surface is explicitly restricted to filesystem, runtime, sessions, memory, and image analysis
- Web search, web fetch, and browser are disabled
- Internal hooks enabled: `session-memory`, `command-logger`, `boot-md`, `bootstrap-extra-files`

### Pi

- Workspace auto-loads `pi-mangrove`
- Active local tools include `dio_episode_summary`, `dio:status`, and `security:audit`
- `local-guard` blocks dangerous shell commands and writes to protected paths

## OpenClaw Examples

### `memory_search`

- **Best fit**
  - when you need prior decisions, preferences, or setup details without loading full files into context
- **Scenario**
  - you want to confirm whether the workstation is configured local-first before making a recommendation
- **Example prompt**
  ```text
  Before answering, run memory_search for "local-first workstation baseline and pi package loading"
  ```
- **Expected use**
  - retrieve the top matching note from `MEMORY.md`
  - answer from the recalled snippet instead of guessing

### `memory_get`

- **Best fit**
  - when `memory_search` already found the relevant file and you only need exact lines
- **Scenario**
  - you already know `MEMORY.md` contains the boot baseline and want the exact wording
- **Example prompt**
  ```text
  Run memory_get for MEMORY.md and return the Local Operating Baseline section only.
  ```
- **Expected use**
  - pull a narrow snippet rather than reading a full workspace file

### Memory indexing workflow

- **Best fit**
  - when a new durable note should become searchable
- **Scenario**
  - you add a new operating policy to `MEMORY.md`
- **Example commands**
  ```bash
  node /home/caraxes/.npm-global/lib/node_modules/openclaw/openclaw.mjs memory index --agent main --force --verbose
  node /home/caraxes/.npm-global/lib/node_modules/openclaw/openclaw.mjs memory search --query "new operating policy"
  ```

### Boot hook behavior

- **Best fit**
  - when you want deterministic startup context before the first real task
- **Scenario**
  - a fresh session starts and should always see local rules first
- **Expected startup inputs**
  - `AGENTS.md`
  - `TOOLS.md`
  - `IDENTITY.md`
  - `USER.md`
  - `SOUL.md`
  - `HEARTBEAT.md`
  - `MEMORY.md`
  - `BOOT.md`

## Pi / pi-mangrove Examples

### `dio_episode_summary`

- **Best fit**
  - when you need a quick structural view of the DIO episode plan
- **Scenario**
  - you are deciding where a task belongs in the DIO flow
- **Example**
  ```text
  Use dio_episode_summary with partIndex=2 and summarize what phase two is optimizing for.
  ```

### `dio:status`

- **Best fit**
  - when you need the live DIO control constants before planning work
- **Scenario**
  - you want to confirm cadence and pass counts before a structured implementation cycle
- **Example**
  ```text
  Use dio:status with detail=full and explain how the cadence should shape this task.
  ```

### `security:audit`

- **Best fit**
  - when you want a targeted underscore-isolation or local DIO safety check
- **Scenario**
  - you changed a DIO module and want a scoped audit before continuing
- **Example**
  ```text
  Run security:audit with path="roots/security" and format="json", then summarize violations by file.
  ```

### `local-guard` dangerous bash protection

- **Best fit**
  - when a model tries to run risky shell commands
- **Scenario**
  - a task drifts toward `rm -rf`, `sudo`, `curl | sh`, `dd`, or destructive disk commands
- **Example blocked pattern**
  ```text
  bash: rm -rf ./build-cache
  ```
- **Expected behavior**
  - in interactive mode: Pi asks whether to allow or block
  - in non-interactive mode: Pi blocks the command fail-closed

### `local-guard` protected path protection

- **Best fit**
  - when a model attempts to edit secrets or sensitive control files
- **Scenario**
  - a write targets `.env`, `.ssh`, `.aws`, `.gnupg`, `.openclaw`, `.pi/agent`, `.git`, or `exec-approvals.json`
- **Example blocked write**
  ```text
  edit path=/home/caraxes/.pi/agent/settings.json
  ```
- **Expected behavior**
  - the write is blocked and surfaced as a protected-path violation

## Best-fit guidance

- **Use OpenClaw memory tools**

  - for durable workstation/project recall

- **Use `dio_episode_summary`**

  - for structure and phase orientation

- **Use `dio:status`**

  - for live cadence constants and cycle framing

- **Use `security:audit`**

  - for targeted DIO security checks

- **Rely on `local-guard`**
  - when a task edges toward destructive shell commands or sensitive file mutations
