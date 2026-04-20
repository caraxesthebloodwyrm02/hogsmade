# CascadeProjects Iteration Phases

**Date**: 2026-03-08
**Depends on**: [Status Report](./2026-03-08-status-report.md)

---

## Phase 1 — Housekeeping

**Goal**: Eliminate infrastructure debt so that all future work has a stable foundation.
**Effort**: Low
**Risk**: Minimal — all changes are additive or corrective
**Duration estimate**: Single session

### 1.1 Workspace Git History

**Problem**: Root `.git/` has zero commits. Everything is untracked. No way to track cross-project changes, no rollback, no blame.

**Action**:

- Create a comprehensive `.gitignore` at workspace root
- Stage all project files (excluding node_modules, build artifacts, secrets)
- Create initial commit
- Call out that `*.ndjson` stays ignored on purpose because audit logs are append-only operational data, not source-of-truth code artifacts

**Example `.gitignore`**:

```gitignore
# Dependencies
node_modules/
__pycache__/
*.pyc
.venv/
venv/

# Build artifacts
dist/
build/
*.tsbuildinfo

# Editor state
.cursor/
.windsurf/

# Secrets and local config
.env
*.local
.env.*

# OS files
Thumbs.db
Desktop.ini

# Large/generated
*.ndjson
```

**Why this matters**: Every subsequent phase involves changes across multiple projects. Without git, there's no safety net and no way to see what changed when. Keeping `*.ndjson` ignored is still the right default, but it should be documented as an intentional operational-data decision, not an accidental omission.

### 1.2 Environment Variable Migration

**Problem**: Four servers have hardcoded Windows paths:

- `grid-server`: `C:\Users\USER\CascadeProjects\GATE/`
- `lots-server`: `C:\Users\USER\CascadeProjects\experiments/`
- `seeds-server`: `E:\Seeds\`
- `maintain-server`: `C:\Users\USER\CascadeProjects` and `E:\Seeds`

**Action**: For each server:

1. Add a `config.ts` module that reads from environment variables
2. Fail loudly for machine-specific roots (`GATE_DIR`, `LOTS_EXPERIMENTS_DIR`, `SEEDS_ROOT`, `CASCADE_WORKSPACE_ROOT`) instead of silently guessing a host-specific path
3. Replace inline path strings with config references
4. Document required env vars in each server's README and in a root `.env.example`

**Example** (grid-server):

```typescript
// config.ts
function requiredPath(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  gateDir: requiredPath("GATE_DIR"),
  auditFile: "audit.ndjson",
  nonceRegistry: ".nonce_registry.json",
};
```

**Before** (grid-server/src/index.ts):

```typescript
const GATE_DIR = "C:\\Users\\USER\\CascadeProjects\\GATE";
```

**After**:

```typescript
import { config } from "./config.js";
const GATE_DIR = config.gateDir;
```

**Note**: Relative fallbacks are acceptable only when the path is truly workspace-relative and deterministic in every launch context. For machine-specific roots like `E:\Seeds`, fail-loud is the safer default.

Repeat for lots-server, seeds-server, and maintain-server.

### 1.3 MCP Server Smoke Tests

**Problem**: All 7 servers have zero tests. Any change could break tool registration or execution without notice.

**Action**: Create one test file per server, but first spike the harness on one server and standardize the pattern. Most current servers instantiate `McpServer` inline and connect directly to stdio, so the test plan should be:

1. Factor tool registration into a testable module such as `buildServer()` or `registerTools(server)`
2. In tests, either instantiate that builder directly or use an in-process MCP client against stdio
3. Verify expected tool names are registered
4. Call `health_check` and one minimal happy-path tool per server
5. Expand to broader tool coverage only after the harness works cleanly

**Preferred shape** (echoes-server):

```typescript
// tests/smoke.test.ts
import { describe, it, expect } from "vitest";
import { buildServer } from "../src/server.js";

describe("echoes-server smoke tests", () => {
  it("registers all expected tools", () => {
    const server = buildServer();
    const tools = server.getRegisteredTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("health_check");
    expect(names).toContain("record_audit");
    expect(names).toContain("query_audit");
    expect(names).toContain("audit_stats");
    expect(names).toContain("save_telemetry");
    expect(names).toContain("list_telemetry");
  });

  it("health_check returns valid response", async () => {
    const server = buildServer();
    const result = await server.callTool("health_check", {});
    expect(result.content).toBeDefined();
    expect(result.isError).not.toBe(true);
  });
});
```

**Test stack**: Add `vitest` as devDependency to each server. Each server gets a single `tests/smoke.test.ts` after the first harness spike succeeds. Add `"test": "vitest run"` to each `package.json`.

### 1.4 Afloat Consolidation

**Problem**: `Afloat/` is an empty spec directory. `afloat-server/` is a working MCP server. Two directories for one concept.

**Action**:

- Move `Afloat/agents.md` into `afloat-server/docs/` (preserve the planning notes)
- Remove the empty `Afloat/` directory
- Update `CLAUDE.md` to reflect that `afloat-server/` is the canonical Afloat project

**Before** (CLAUDE.md):

```
| `Afloat/` | MCP server spec | Python, MCP SDK | Planning/nascent |
```

**After**:

```
| `afloat-server/` | Workflow orchestration MCP server | TypeScript, MCP SDK | Working |
```

### 1.5 Document Aspirational vs. Implemented

**Problem**: `mcp_config.json` references encryption keys (`${AFLOAT_ENCRYPTION_KEY}`), SOC2 compliance, GDPR, ISO27001, and RBAC. None of these are implemented. This creates false confidence.

**Action**: Add a `SECURITY_STATUS.md` at workspace root:

```markdown
# Security Implementation Status

## Implemented

- GATE envelope verification (SHA-256, nonce, timestamp freshness)
- 8-stage execution pipeline (mcp-tool-experiment)
- Dry-run defaults (afloat-server, maintain-server)
- Audit logging (echoes-server, grid-server, maintain-server)
- Path traversal protection (lots-server)

## Referenced but NOT Implemented

- Encryption at rest for audit logs
- SOC2 / GDPR / ISO27001 compliance
- RBAC for MCP servers (GRID-main has RBAC, servers do not)
- Inter-server authentication
- ${AFLOAT_ENCRYPTION_KEY} environment variable
```

---

## Phase 2 — Deepen Integration

**Goal**: Connect existing servers to each other and to GRID-main's intelligence, so the ecosystem is more than the sum of its parts.
**Effort**: Medium
**Risk**: Low-medium — new connections, but no destructive changes
**Depends on**: Phase 1 complete

### 2.1 Shared Types Package

**Problem**: All 7 servers independently define similar Zod schemas for health checks, audit events, and telemetry. This means:

- Schema drift (echoes records an audit event with fields that grid-server doesn't expect)
- Duplicated validation logic
- No compile-time guarantees when servers communicate

**Action**: Create `shared-types/` at workspace root as a local npm package.

**Scope guard**: Only extract types that are already identical across 3 or more servers. If a pattern exists in only 2 servers, leave it duplicated until it proves stable.

**Structure**:

```
shared-types/
  package.json
  src/
    audit.ts       # AuditEvent, AuditQuery, AuditStats schemas
    health.ts      # HealthCheckResponse schema
    telemetry.ts   # TelemetrySnapshot schema
    workflow.ts    # WorkflowStep, WorkflowResult schemas
    experiment.ts  # ExperimentResult, ExperimentComparison schemas
  index.ts
  tsconfig.json
```

**Example** (audit.ts):

```typescript
import { z } from "zod";

export const AuditEventSchema = z.object({
  timestamp: z.string().datetime(),
  source: z.string(), // which server emitted this
  tool: z.string(), // tool name invoked
  status: z.enum(["success", "failure", "blocked", "dry_run"]),
  durationMs: z.number().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const AuditQuerySchema = z.object({
  tool: z.string().optional(),
  status: z.enum(["success", "failure", "blocked", "dry_run"]).optional(),
  since: z.string().datetime().optional(),
  limit: z.number().default(50),
});

export type AuditQuery = z.infer<typeof AuditQuerySchema>;
```

**Integration**: Each server adds `"@cascade/shared-types": "file:../shared-types"` to its `package.json` and imports schemas from the shared package instead of defining them inline.

### 2.2 Automatic Audit Forwarding

**Problem**: lots-server runs experiments but doesn't log to echoes-server. maintain-server runs diagnostics but doesn't log to echoes. Only mcp-tool-experiment feeds echoes consistently. This means the audit trail has blind spots.

**Action**: Create a lightweight audit client that each server can import:

```typescript
// shared-types/src/audit-client.ts
import { appendFileSync } from "fs";
import { resolve } from "path";
import type { AuditEvent } from "./audit.js";

const ECHOES_AUDIT_PATH =
  process.env.ECHOES_AUDIT_PATH || resolve(process.env.HOME || "~", ".echoes", "audit.ndjson");

export function emitAudit(event: Omit<AuditEvent, "timestamp">): void {
  const record: AuditEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };
  appendFileSync(ECHOES_AUDIT_PATH, JSON.stringify(record) + "\n");
}
```

**Usage in lots-server**:

```typescript
import { emitAudit } from "@cascade/shared-types/audit-client";

// After experiment execution:
emitAudit({
  source: "lots-server",
  tool: "experiment_run",
  status: exitCode === 0 ? "success" : "failure",
  durationMs: elapsed,
  metadata: { experimentId, language, exitCode },
});
```

Now echoes-server's `query_audit` and `audit_stats` tools see activity from every server, not just mcp-tool-experiment.

**Known shortcut**: This Phase 2 version writes directly to echoes' NDJSON file, so echoes-server itself does not mediate validation or indexing. That is acceptable for a local-first single-user system, but the plan should treat it as a pragmatic shortcut and leave a later upgrade path for protocol-level forwarding through echoes-server.

### 2.3 Pulse-Server Cross-Referencing

**Problem**: pulse-server reads raw files from echoes, seeds, and afloat. It presents data but doesn't correlate it. The morning briefing lists events without connecting them.

**Action**: Enhance `morning_briefing` to cross-reference data sources:

**Current behavior**: Lists last N audit events, last ecosystem scan score, last workflow run.

**Enhanced behavior**:

1. Read echoes audit for failures in the last 24 hours
2. Read seeds snapshot for repos with health score < 70
3. Cross-reference: if a failing audit event mentions a repo that also has low health, surface it as a priority
4. Read afloat workflow history for incomplete/failed workflows
5. Generate prioritized action items, not just data dumps

**Example output** (morning briefing):

```
Priority: lots-server experiment "perf-test-rag" failed 3 times yesterday.
  - seeds-server shows GRID-main health dropped to 65 (uncommitted changes, stale branch)
  - Suggestion: check GRID-main status, then re-run experiment

Routine: 4 successful workflow executions, 12 audit events, ecosystem average health 82.

Focus: maintain-server flagged 340MB temp files. Consider running cleanup.
```

### 2.4 GATE Integration with GRID-main Safety

**Problem**: grid-server validates GATE envelopes using its own SHA-256 + nonce logic. GRID-main has a sophisticated safety module (detectors, escalation, guardian rules, behavioral shield). These don't talk to each other.

**Action**: Create a GRID-main API endpoint that grid-server can call for enhanced validation:

**GRID-main side** (new endpoint):

```python
# src/application/mothership/routers/gate_validation.py
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/gate", tags=["gate"])

class EnvelopeValidationRequest(BaseModel):
    source_agent: str
    target: str
    action: str
    payload_hash: str
    test_status: str | None = None

class EnvelopeValidationResponse(BaseModel):
    approved: bool
    risk_score: float  # 0.0 to 1.0
    flags: list[str]
    reasoning: str

@router.post("/validate")
async def validate_envelope(request: EnvelopeValidationRequest) -> EnvelopeValidationResponse:
    """
    Enhanced envelope validation using GRID's safety modules.
    Checks behavioral patterns, source reputation, action risk level.
    """
    flags = []
    risk_score = 0.0

    # Check if action is high-risk
    high_risk_actions = {"deploy", "delete", "write_results"}
    if request.action in high_risk_actions:
        risk_score += 0.3
        flags.append(f"high_risk_action:{request.action}")

    # Check test status
    if request.test_status != "passing":
        risk_score += 0.4
        flags.append("tests_not_passing")

    return EnvelopeValidationResponse(
        approved=risk_score < 0.7,
        risk_score=risk_score,
        flags=flags,
        reasoning=f"Risk score {risk_score:.1f} based on {len(flags)} flags",
    )
```

**grid-server side** (optional enhanced check):

```typescript
// After basic envelope validation passes, optionally consult GRID-main:
async function enhancedValidation(envelope: Envelope): Promise<ValidationResult> {
  const gridUrl = process.env.GRID_API_URL || "http://localhost:8080";
  try {
    const response = await fetch(`${gridUrl}/gate/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_agent: envelope.source,
        target: envelope.target,
        action: envelope.action,
        payload_hash: envelope.payloadHash,
        test_status: envelope.testStatus,
      }),
    });
    return await response.json();
  } catch {
    // GRID-main unavailable — fall back to basic validation only
    return {
      approved: true,
      risk_score: 0,
      flags: ["grid_unavailable"],
      reasoning: "Fallback to basic validation",
    };
  }
}
```

This is additive - grid-server's existing validation still works independently. GRID-main enriches it when available. Enhanced validation must remain optional so local MCP development is not blocked when GRID-main is offline.

### 2.5 Seeds Health Alerting via Pulse

**Problem**: seeds-server calculates health scores but you have to manually call `ecosystem_scan` to see them. Degradation goes unnoticed until you check.

**Prerequisite**: This only works after Phase 1.2 fixes seeds-server configuration and after the actual Seeds root exists and is populated.

**Action**: Add a `check_alerts` tool to pulse-server that compares the latest seeds snapshot against thresholds:

```typescript
// In pulse-server, new tool:
server.tool(
  "check_alerts",
  "Check for ecosystem alerts based on thresholds",
  {
    healthThreshold: z.number().default(70).describe("Repos below this score trigger an alert"),
  },
  async ({ healthThreshold }) => {
    const alerts: string[] = [];

    // Read latest seeds snapshot
    const snapshotsDir = resolve(homedir(), ".seeds-server", "snapshots");
    const files = readdirSync(snapshotsDir).sort().reverse();
    if (files.length === 0) return { content: [{ type: "text", text: "No snapshots available." }] };

    const latest = JSON.parse(readFileSync(resolve(snapshotsDir, files[0]), "utf-8"));

    for (const repo of latest.repos || []) {
      if (repo.healthScore < healthThreshold) {
        alerts.push(
          `[ALERT] ${repo.name}: health ${repo.healthScore}/100 — ${repo.issues.join(", ")}`,
        );
      }
    }

    // Read echoes for recent failures
    const auditPath = resolve(homedir(), ".echoes", "audit.ndjson");
    if (existsSync(auditPath)) {
      const lines = readFileSync(auditPath, "utf-8").split("\n").filter(Boolean).slice(-100);
      const recentFailures = lines
        .map((l) => JSON.parse(l))
        .filter(
          (e) => e.status === "failure" && Date.now() - new Date(e.timestamp).getTime() < 86400000,
        );

      if (recentFailures.length > 3) {
        alerts.push(
          `[ALERT] ${recentFailures.length} failures in last 24h across ${[
            ...new Set(recentFailures.map((f) => f.source)),
          ].join(", ")}`,
        );
      }
    }

    const text =
      alerts.length > 0
        ? `${alerts.length} alert(s):\n\n${alerts.join("\n")}`
        : "All clear. No alerts.";

    return { content: [{ type: "text", text }] };
  },
);
```

### 2.6 Lots-Server to Seeds-Server Feedback Loop

**Problem**: You run experiments in lots-server. The results sit in `.catalog.json`. Seeds-server monitors repo health but doesn't know about experiment outcomes. There's no connection between "I tested something" and "the ecosystem health changed."

**Action**: After lots-server completes an experiment, emit a telemetry event that seeds-server can pick up:

```typescript
// lots-server: after experiment_run completes
emitAudit({
  source: "lots-server",
  tool: "experiment_run",
  status: result.exitCode === 0 ? "success" : "failure",
  durationMs: result.durationMs,
  metadata: {
    experimentId: experiment.id,
    name: experiment.name,
    language: experiment.language,
    tags: experiment.tags,
    relatedRepo: experiment.tags?.find((t) => t.startsWith("repo:"))?.slice(5),
  },
});
```

Now when pulse-server builds its morning briefing or check_alerts, it can correlate: "experiment 'rag-perf-test' (tagged repo:GRID-main) failed + GRID-main health is 65 = priority item."

---

## Phase 3 — Proactive Intelligence

**Goal**: The ecosystem starts making suggestions and taking autonomous actions based on patterns.
**Effort**: High
**Risk**: Medium — autonomous actions require careful safety boundaries
**Depends on**: Phase 2 complete

### 3.1 Scheduled Diagnostics via Afloat Workflows

Create predefined workflows in afloat-server that run maintain-server diagnostics on a schedule. Use an external scheduler first (Windows Task Scheduler on this machine; cron if moved into WSL/Linux) rather than adding a background loop to afloat-server. The workflow:

1. Runs `full_diagnostic` on maintain-server
2. Reads the health score from the result
3. If below threshold, runs `scan_workspaces` for cleanup opportunities
4. Logs everything to echoes-server
5. Surfaces results in next pulse morning briefing

**Reasoning**: MCP servers are currently stdio tools, not daemon schedulers. OS-level scheduling preserves the current deployment model and avoids inventing a long-lived background service too early.

### 3.2 Pattern-Driven Experiment Suggestions

Connect GRID-main's pattern recognition to lots-server. When GRID detects a deviation pattern in your workflow (e.g., repeated failures in a specific area), it generates an experiment proposal:

- Hypothesis (from pattern analysis)
- Script template (from GRID's skill library)
- Expected outcome
- Auto-registers in lots-server for execution

**Design spike required before implementation**:

- Define which GRID-main API exposes pattern detections
- Define the proposal schema that lots-server accepts
- Decide whether proposals are suggestions, drafts, or auto-registered experiments
- Keep this behind explicit confirmation until the proposal quality is proven

### 3.3 Adaptive Morning Briefings

Pulse-server learns from journal entries and focus sessions. If you consistently skip certain briefing sections, it de-prioritizes them. If you always act on experiment failures, it promotes them. Adaptation stored in `~/.pulse/preferences.json`.

### 3.4 "What Should I Work On?" Tool

A new pulse-server tool that synthesizes:

- Seeds health (which repos need attention?)
- Echoes audit (what's been failing?)
- Afloat workflows (what's pending?)
- Journal history (what were you focused on?)
- GRID patterns (what's the dominant pattern right now?)

Returns a prioritized list with reasoning.

**Delivery note**: Prototype this in a naive rules-based form as soon as Phase 2 cross-referencing exists. It is useful enough to justify an early thin version before the full Phase 3 intelligence stack lands.

---

## Phase 4 — Visual Operating System

**Goal**: Give the ecosystem a visual interface that makes it tangible and shareable.
**Effort**: High
**Risk**: Low — purely additive
**Depends on**: Phase 2 complete (Phase 3 optional)

### 4.1 Mycelium Dashboard Integration

Connect GRID-main's Mycelium frontend (shipped v2.6.0) to MCP server data via API routes. Display:

- Ecosystem health grid (from seeds-server)
- Audit event stream (from echoes-server)
- Active experiments (from lots-server)
- Focus session timer (from pulse-server)

### 4.2 Glimpse Components for Data Viz

Use glimpse-artifact's React component library for:

- Health score gauges per repo
- Audit event timeline
- Experiment comparison charts
- Workflow execution status cards

### 4.3 Real-Time Event Stream

Add WebSocket support to pulse-server so the frontend updates live as audit events arrive, experiments complete, or health scores change.

**Design note**: This is a deployment-model change, not just a transport tweak. Pulse-server would move from stdio-only MCP execution toward a long-lived service. Write a separate design doc before implementation covering hosting model, auth assumptions, event fan-out, and coexistence with the current MCP transport.

### 4.4 GATE Visualization

Show the deployment pipeline visually:

- Envelope submitted → validated → approved/rejected
- Nonce registry status
- Recent deployment history with risk scores

---

## Phase Summary

| Phase | Goal         | Effort | Key Deliverables                                                    |
| ----- | ------------ | ------ | ------------------------------------------------------------------- |
| 1     | Housekeeping | Low    | Git history, env vars, smoke tests, Afloat cleanup                  |
| 2     | Integration  | Medium | Shared types, audit forwarding, cross-referencing, GATE + GRID      |
| 3     | Intelligence | High   | Scheduled workflows, pattern-driven suggestions, adaptive briefings |
| 4     | Visual       | High   | Dashboard, data viz, real-time events, GATE visualization           |

Each phase builds on the previous. Phase 1 is prerequisite for everything. Phase 2 creates the connected tissue that Phase 3 makes intelligent and Phase 4 makes visible.

---

## Cross-Cutting Track

These items do not fit neatly into a single phase and should be tracked alongside the phase work:

### A. GRID-main Branch Hygiene

**Problem**: GRID-main is active on `custom-tools` with many cascade branches. Divergence risk grows every session.

**Action**:

1. Inventory active branches and their purpose
2. Decide which branches are still live, mergeable, or disposable
3. Establish a regular rebase or merge cadence so the MCP integration work does not drift away from the mainline

### B. Backup and Disaster Recovery

**Problem**: Operational state lives in `~/.echoes/`, `~/.pulse/`, `~/.seeds-server/`, `~/.afloat/`, and `GATE/`, but none of it is versioned by git.

**Action**:

1. Define which directories are backup-worthy operational history
2. Add a simple scheduled backup job to local secondary storage
3. Document restore steps so ignored `.ndjson` and JSON state are recoverable after disk loss

### C. Dependency Currency

**Problem**: MCP servers pin `@modelcontextprotocol/sdk@1.27.1`, and GRID-main relies on a local-path `grid-safety` override. No update cadence is documented.

**Action**:

1. Add a monthly dependency review task
2. Record pinned versions and why they are pinned
3. Test SDK and local-package upgrades in one server first before rolling them across the workspace

### D. Role of `mcp-tool-experiment`

**Problem**: The docs currently imply both "primary entry point" and "peer server," which can sound like it proxies all other servers even though it does not.

**Action**:

1. Clarify that `mcp-tool-experiment` is the main safety-first workspace analysis server, not a mandatory proxy
2. Clarify that the other MCP servers remain independently callable peers
3. Document which integrations are file-based shortcuts versus actual server-to-server protocol calls

---

## Future Considerations (Beyond 4.4)

Not in current Phase 4 scope. Track as candidates for a future phase once 4.1–4.4 are delivered and validated.

### Generative Glimpses

Use text-to-image models to visualize scenario descriptions. An author inputs a seed situation; the tool generates visual variations (mood, lighting, perspective). Requires API integration (e.g. Hugging Face, Replicate) or a lightweight local model for offline use. Evaluate whether this belongs in glimpse-artifact or as a separate service behind the canvas.

### Offline-First Design

The target audience (authors, artists, creative workers) may not have reliable connectivity. Core canvas, annotation, and scenario branching should work without a network connection. Data syncs when online. Evaluate service worker + IndexedDB for local persistence.

### Touch and Gesture Support

Pinch-to-zoom, swipe to navigate, tap to annotate. The canvas currently supports pan/zoom via mouse; extend to touch events for tablet-aspected devices. Consider Pointer Events API for unified mouse/touch/pen input.

### Progressive Disclosure

Show advanced features (experiment charts, audit timeline, GATE viz) only when the user explicitly opens them. Keep the default canvas surface minimal — seed card, branch, glimpse, and annotation only. Advanced panels behind a collapsible sidebar or explicit "show more" interaction.
