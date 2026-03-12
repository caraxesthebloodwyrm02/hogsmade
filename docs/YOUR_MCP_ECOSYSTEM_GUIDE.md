# Your MCP Ecosystem — A Plain-English Guide

**What this is:** A complete walkthrough of the 7 MCP servers in your CascadeProjects workspace, what they do, when to use each one, what to watch for regarding privacy and safety, and how to get the most out of them.

---

## Part 1: What MCP Actually Is

MCP stands for **Model Context Protocol**. Think of it as a universal plug system that lets AI assistants (like Cascade, Claude, or any LLM-based tool) talk to your local programs and services.

Without MCP, an AI assistant can only see what you paste into the chat window. With MCP, it can reach out to your file system, check your project health, run experiments, track workflows, and log audit trails — all through a standard, predictable interface.

Each MCP server is a small standalone program that:
- Listens for requests over a simple text pipe (stdin/stdout)
- Exposes a set of "tools" — named operations the AI can call
- Returns structured JSON results
- Runs locally on your machine (nothing goes to the cloud unless you explicitly build that)

When you open Windsurf and Cascade says "I have access to these tools…", those tools come from your MCP servers.

---

## Part 2: Your 7 Servers at a Glance

Here's your full ecosystem, in plain language:

### 1. Echoes (mcp-tool-experiment)
**What it does:** The main safety-first productivity hub. Every tool call passes through an 8-stage pipeline: input validation, capability checking, rate limiting, network boundary enforcement, policy evaluation, execution, output filtering (scrubs PII and secrets), and audit logging.

**Tools you can use:**
- `health_check` — Is everything running correctly?
- `quick_status` — Fast overview of a workspace (projects, health scores, urgent issues)
- `productivity_pulse` — Real-time momentum check (velocity, focus, trend)
- `focus_mode` — Get recommendations based on your work mode (sprint, maintenance, exploration, optimization)
- `glimpse` — Path-scoped cognitive overview and stall detection for a specific directory (use `morning_briefing` + `quick_status` for ecosystem-level health and priorities)
- `deep_scan` — Technology stack detection, dependency analysis, security assessment
- `workflow_analysis` — CI/CD and testing maturity check
- `productivity_insights` — Development velocity and collaboration patterns
- `risk_assessment` — Security vulnerabilities, dependency risks, technical debt
- `preflight_check` — Test if a call would pass safety gates without actually running it
- `get_audit_log` — See recent pipeline decisions
- `validate_safety` / `batch_safety_check` — Legacy safety validation (deprecated, use preflight_check)
- `greet` — Simple test tool

**When to use it:** Daily. It's your primary interface for understanding workspace health, checking productivity, and getting actionable recommendations. The safety pipeline means you can trust it to not leak secrets or execute dangerous operations.

### 2. Echoes-Server (echoes-server)
**What it does:** The persistent audit and telemetry backend. While the main Echoes server processes requests in-memory, this one writes everything to disk so you have a permanent record across sessions.

**Tools you can use:**
- `health_check` — Server status and data store size
- `record_audit` — Log an event (source, tool, status, duration, metadata)
- `query_audit` — Search the audit log with filters (by tool, status, time range)
- `audit_stats` — Aggregate statistics (counts by tool, status, source; average duration)
- `save_telemetry` — Snapshot your workspace metrics for longitudinal tracking
- `list_telemetry` — View recent telemetry snapshots

**When to use it:** You rarely call this directly — the main Echoes server feeds into it. But it's useful when you want to answer questions like "how many times did the safety pipeline block something this week?" or "show me my workspace health trend over the last month."

### 3. Grid-Server (grid-server)
**What it does:** The GATE (Guarded Agent Transition Envelope) verification system. It manages deployment permissions and validates "envelopes" — cryptographically signed packages that prove code is safe to deploy.

**Tools you can use:**
- `health_check` — GATE directory status, pending envelopes, deployment targets
- `list_targets` — All deployment targets with their paths, ports, and permission sets
- `validate_envelope` — Check an envelope's required fields, trusted source, payload hash integrity, timestamp freshness, and test status — without deploying anything
- `check_permission` — Ask "can I deploy to echoes-server?" or "can I run tests on lots-server?"
- `gate_audit` — View GATE verification history
- `nonce_status` — See which nonces have been burned (replay attack prevention)

**When to use it:** Before deploying anything. The whole point is to ensure that code changes meet your safety requirements before they hit a live server. Think of it as your personal code reviewer that checks cryptographic proof rather than reading the code.

### 4. Afloat-Server (afloat-server)
**What it does:** Multi-step workflow orchestration with rollback support. You define workflows as ordered sequences of steps, then execute them (with dry-run by default).

**Tools you can use:**
- `health_check` — Workflow store status
- `workflow_create` — Define a new workflow with named steps, commands, and rollback commands
- `workflow_list` — See all your defined workflows
- `workflow_get` — Full details of a specific workflow
- `workflow_execute` — Run a workflow (dry-run by default for safety)
- `workflow_history` — See past executions and their results

**When to use it:** Whenever you have a repeatable multi-step process — deploying docs, running a test suite then publishing results, setting up a new project. Define it once, then execute it any time. The dry-run default means you can preview what would happen before committing.

### 5. Lots-Server (lots-server)
**What it does:** "Light of the Seven" — an experiment runner. Register experiments with scripts, run them in a sandboxed directory, and compare results.

**Tools you can use:**
- `health_check` — Catalog status and experiment counts by state
- `experiment_create` — Register a new experiment (name, description, script, language, tags)
- `experiment_list` — Browse experiments with status and tag filtering
- `experiment_run` — Execute an experiment's script with timeout and output capture
- `experiment_get` — Full details including results (stdout, stderr, exit code, duration)
- `experiment_compare` — Side-by-side comparison of two experiment results

**When to use it:** When you want to test a hypothesis, benchmark something, or try out a code snippet in a controlled way. Scripts are sandboxed to the experiments directory for security. Supports Python, Node, PowerShell, and Bash.

### 6. Seeds-Server (seeds-server)
**What it does:** Cross-repository health monitor for your entire Seeds ecosystem (E:\Seeds). Scans all repos for git status, dependency health, test coverage, and activity freshness.

**Tools you can use:**
- `health_check` — Data store status and detected repos
- `ecosystem_scan` — Full scan of all repos with health scores (0-100), git status, issues, and optionally saves a snapshot
- `repo_detail` — Deep health check on a single repository
- `bookmark_add` / `bookmark_list` — Track important repos or files across the ecosystem
- `ecosystem_trend` — Compare snapshots over time to detect improving or degrading repos

**When to use it:** Weekly or whenever you feel like things might be drifting. The health scores are calculated from git presence, dependency files, test directories, commit recency, and uncommitted changes. A score below 40 means something needs attention.

### 7. Pulse-Server (pulse-server) — NEW
**What it does:** Your personal developer dashboard and session journal. Aggregates data from all other servers and helps you track your workday.

**Tools you can use:**
- `health_check` — Status and connected data sources
- `morning_briefing` — Start-of-day summary: overnight events, ecosystem health, warnings, suggested priorities
- `journal_add` — Log what you're working on, with tags and mood tracking
- `journal_list` — Review today's (or any day's) entries
- `focus_start` — Begin a deep work timer on a specific task
- `focus_interrupt` — Record a context switch or interruption
- `focus_end` — Complete a focus session with outcome recording
- `daily_digest` — End-of-day summary: journal entries, focus time, audit events, workflow runs, ecosystem score, blockers, and tomorrow suggestions

**When to use it:** Every day. Start with `morning_briefing`, use `journal_add` throughout the day, track deep work with `focus_start`/`focus_end`, and wrap up with `daily_digest`.

---

## Part 3: How They Connect

```
You (via Cascade / Windsurf)
  │
  ├─ echoes ──────────────> Safety pipeline + workspace analysis
  │    └─ feeds into ──────> echoes-server (persistent audit)
  │
  ├─ grid-server ─────────> Deployment gate verification (GATE)
  │
  ├─ afloat-server ───────> Workflow definitions + execution
  │
  ├─ lots-server ─────────> Experiment catalog + script execution
  │
  ├─ seeds-server ────────> Repository ecosystem health monitoring
  │
  └─ pulse-server (NEW) ──> Aggregates ALL of the above into
                             morning briefings, journals, focus
                             tracking, and daily digests
```

The key insight: each server is independent but they share data through files on disk. Pulse-server reads (never writes to) the other servers' data directories to build aggregated views.

---

## Part 4: Typical Daily Workflow

**Morning (health-scan chain):**
1. `Use morning_briefing` — Pulse reads from echoes audit, seeds snapshots, and afloat history to tell you what happened overnight and what needs attention.
2. `Use quick_status for <workspacePath> focus:all` — Fast ecosystem-level health check: active projects, urgent issues, immediate actions.
3. Use `glimpse <workspacePath>` only when you need a **path-scoped** cognitive overview and stall detection for a specific directory (e.g. a subfolder or non–Seeds workspace). For the same root as your ecosystem, morning_briefing + quick_status are usually enough.

**During the day:**
3. `Use journal_add with entry="Working on GRID auth module"` — Log what you're doing.
4. `Use focus_start with task="Fix auth token refresh bug" project="GRID-main"` — Start a deep work block.
5. (Work on the task)
6. `Use focus_end with outcome="Fixed token refresh, added 3 tests"` — End the block.
7. `Use experiment_create with name="auth-perf-test" script="..." language="python"` — If you want to benchmark something.
8. `Use workflow_execute with workflowId="..." dryRun=true` — Preview a deployment.

**End of day:**
9. `Use ecosystem_scan with saveSnapshot=true` — Capture the state of all repos.
10. `Use daily_digest` — Get a complete summary of your day.

**Weekly:**
11. `Use ecosystem_trend` — See which repos are improving or degrading over time.
12. `Use audit_stats` — Review pipeline activity for the week.

---

## Part 5: Privacy and Safety Review

Based on a thorough read of all 6 existing servers plus the new pulse-server, here is what you should know:

### What's Good (No Concerns)

**All data stays local.** Every server stores its data in your home directory (e.g., `~/.echoes`, `~/.afloat`, `~/.seeds-server`, `~/.pulse`). Nothing is sent to any external service, cloud API, or third party.

**The safety pipeline is real.** The main Echoes server runs an 8-stage execution pipeline that includes rate limiting, network boundary checking (SSRF protection), PII/secret filtering on outputs, and a policy decision point. This isn't theater — it actually blocks dangerous operations and sanitizes sensitive data before returning results.

**GATE envelopes use cryptographic verification.** Payload hashes are verified with SHA-256 and timing-safe comparison. Nonces prevent replay attacks. Timestamp freshness checks catch stale deployments.

**Experiment execution is sandboxed.** The lots-server resolves script paths and explicitly rejects any script outside the experiments directory. This prevents path traversal attacks.

**Workflow execution is dry-run by default.** Afloat-server won't actually run commands unless you explicitly set `dryRun=false`.

### What to Be Aware Of

**Hardcoded paths.** Several servers have Windows paths baked into the source code (e.g., `E:\Seeds`, `C:\Users\USER\CascadeProjects`). This isn't a security issue per se, but it means the servers won't work on a different machine without editing those paths. Consider moving these to environment variables.

**Audit logs are plain text.** The NDJSON audit files in `~/.echoes` and `~/.pulse` are unencrypted files on disk. Anyone with access to your user account can read them. If you log sensitive metadata, it persists. The Afloat config specifies encryption-at-rest and append-only audit, but the TypeScript implementation stores JSON files without encryption.

**Lots-server executes arbitrary scripts.** While it's sandboxed to the experiments directory, it does run `python`, `node`, `powershell`, or `bash` on whatever script content you provide. If you create an experiment with malicious script content, it will execute. This is by design — just be aware.

**No authentication between servers.** Since everything runs locally over stdin/stdout, there's no auth layer. If someone could inject messages into the pipe, they could call any tool. In practice this isn't a concern for local development, but it would matter if you ever exposed these as network services.

**The Afloat mcp_config.json references environment variables for encryption keys** (`${AFLOAT_ENCRYPTION_KEY}`) that aren't actually set anywhere in the implementation. The security configuration (SOC2, GDPR, ISO27001 compliance, RBAC) is aspirational — it's in the config schema but not yet implemented in the running TypeScript servers.

### Recommendations

1. **Move hardcoded paths to environment variables** — makes the servers portable and avoids accidental exposure of directory structure.
2. **Add `.gitignore` entries** for `~/.echoes`, `~/.afloat`, `~/.pulse`, `~/.seeds-server` if you ever sync your home directory.
3. **Be intentional about what metadata you pass to `record_audit`** — it gets written to disk permanently.
4. **Keep the dual config issue in mind** — you have `mcp_config.json` in both `windsurf-next` and `windsurf` directories. Decide which one is canonical and remove the other.
5. **The 2 repos without git** (`grid` and `scratch` under Seeds) scored 20/100 — either initialize git or remove them from the known repos list.

---

## Part 6: Adding the Pulse-Server to Your Config

To register the new pulse-server, add this entry to your `mcp_config.json`:

```json
{
  "pulse-server": {
    "command": "npx",
    "args": ["-y", "tsx", "C:\\Users\\USER\\CascadeProjects\\pulse-server\\src\\server.ts"]
  }
}
```

Then restart Windsurf.

---

## Part 7: Creating Your Own MCP Server

If you want to build another server, follow this pattern (every server in your ecosystem uses it):

1. **Create the directory:** `mkdir my-server && cd my-server`
2. **Initialize:** Copy `package.json` and `tsconfig.json` from any existing server (seeds-server is a good template)
3. **Write `src/server.ts`** with this skeleton:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod";

const server = new McpServer({ name: "my-server", version: "1.0.0" });

// Always include a health check
server.registerTool("health_check", { description: "Check server health" }, async () => {
  return { content: [{ type: "text", text: JSON.stringify({ status: "ok" }) }] };
});

// Add your tools here using server.registerTool(name, { description, inputSchema }, handler)

server.connect(new StdioServerTransport());
```

4. **Install and type-check:** `npm install && npx tsc --noEmit`
5. **Register in mcp_config.json** and restart Windsurf

The key rules from your `.windsurf/rules/mcp.md`:
- Use `snake_case` for tool names, max 64 characters
- Every tool needs a description
- All parameters need types (Zod) and descriptions
- Every server must have `health_check`
- Secrets go in `env` in mcp_config.json, never in source code
- stdout is only for JSON-RPC messages — use `console.error()` for logs

---

## Summary

You have a layered, well-architected system. The bottom layer (echoes, grid-server) handles safety and verification. The middle layer (afloat-server, lots-server, seeds-server) provides domain-specific capabilities. The new top layer (pulse-server) aggregates everything into a developer-friendly daily workflow. All data stays on your machine, the safety pipeline is genuinely protective, and the whole thing is extensible — just add another server following the same pattern.
