# 4.3 Real-time event stream — design doc

**Date**: 2026-03-08
**Status**: Draft
**Depends on**: Phase 2 complete, 4.2 components built
**Blocks**: 4.3 implementation (no work until this doc is approved)

---

## 1. Problem

The dashboard and GATE views currently fetch data once on mount and never update. An author working a long session sees stale health scores, missed audit events, and experiment completions that happened minutes ago. The hooks (`useHealthData`, `useAuditStream`, `useExperiments`, `useFocusSession`) use `setTimeout` with mock data — there is no refresh mechanism.

The goal is live updates without turning the calm canvas into a noisy real-time dashboard.

---

## 2. Scope

**In scope:**

- Audit events arriving in the dashboard AuditTimeline
- Health score changes reflected in HealthGauge components
- Experiment status transitions (queued → running → completed)
- Focus session step progression in WorkflowStatusCard
- GATE verification events in GateView audit trail

**Out of scope (for now):**

- Canvas view (fully local state, no server data)
- Push notifications or alerts outside the UI
- Multi-user sync or collaboration

---

## 3. Hosting model

### Current state

All 7 MCP servers are stdio-only processes. They start when a client (Claude, Cursor) invokes them and exit when the session ends. There is no long-lived service to push events.

### Options

| Option                           | Description                                                                   | Pros                                         | Cons                                      |
| -------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------- |
| **A. Polling**                   | Hooks poll file system or API on an interval                                  | No hosting change, works with stdio model    | Not truly real-time, file I/O overhead    |
| **B. File watcher + SSE**        | A lightweight sidecar watches NDJSON/JSON files and serves Server-Sent Events | Low complexity, one-directional, HTTP-native | New process to manage                     |
| **C. WebSocket in pulse-server** | Upgrade pulse-server to a long-lived HTTP+WS service                          | True bidirectional, single server            | Breaks stdio MCP model, deployment change |

### Recommendation: Option A (polling) first, Option B when needed

**Rationale**: The target audience values simplicity and stability. Polling with a 5–10 second interval gives "close enough to live" updates without introducing a new service or breaking the existing MCP transport. The hooks already have the right shape (`{ data, loading, error }`) — adding a polling interval is a minimal change.

Option B (file watcher + SSE) is the upgrade path when polling proves insufficient. It can be built as a standalone sidecar that reads the same files the hooks currently read, serving events over `GET /events` with `text/event-stream`. This coexists with stdio MCP because it is a separate process.

Option C (WebSocket in pulse-server) is deferred. It requires pulse-server to become a long-lived HTTP service, which changes deployment assumptions and adds complexity for auth, port management, and process lifecycle. Not justified until multi-user or cross-machine use cases arise.

---

## 4. Polling specification (Option A)

### 4.1 Hook changes

Each hook gains an optional `pollInterval` parameter (milliseconds). Default: `null` (no polling, current behavior). Recommended interval: `10000` (10 seconds) for dashboard, `null` for canvas.

```typescript
// Before
export function useHealthData(): { data: HealthScore[]; loading: boolean; error: string | null };

// After
export function useHealthData(options?: {
  pollInterval?: number | null; // ms, null = no polling
}): { data: HealthScore[]; loading: boolean; error: string | null };
```

Implementation: `useEffect` with `setInterval` that re-fetches and merges. The `loading` flag is only `true` on the initial fetch, not on subsequent polls (avoids skeleton flicker).

### 4.2 Data sources

| Hook              | Source file                                                           | Read method                                      |
| ----------------- | --------------------------------------------------------------------- | ------------------------------------------------ |
| `useHealthData`   | `~/.seeds-server/snapshots/snapshot-*.json` (latest by filename sort) | Read JSON, extract `repos[].healthScore`         |
| `useAuditStream`  | `~/.echoes/audit.ndjson` (last N lines)                               | Read file, split lines, parse JSON, take last 20 |
| `useExperiments`  | `~/.lots-server/.catalog.json`                                        | Read JSON, extract experiment entries            |
| `useFocusSession` | `~/.pulse/focus.json` or pulse-server state                           | Read JSON                                        |
| `useGateData`     | `{GATE_DIR}/audit.ndjson`, `{GATE_DIR}/.nonce_registry.json`          | Read both files                                  |

### 4.3 File access from browser

The hooks currently run in the browser (Vite dev server). Browser JavaScript cannot read local files directly. Two approaches:

**A. Vite dev proxy** — Add API routes to `vite.config.ts` that read files and return JSON. Simple for development; not production-ready.

**B. Lightweight API endpoint** — A small Express/Fastify server (or GRID-main API routes for 4.1) that reads the files and serves them as JSON over HTTP. This is the path for 4.1 (Mycelium Dashboard) anyway.

Recommendation: Use approach B. The same API that serves 4.1 Mycelium Dashboard data also serves the polling hooks. This avoids building throwaway dev-only infrastructure.

---

## 5. Auth assumptions

### Current state

All MCP servers run locally, accessed via stdio. There is no network auth. GATE envelopes use cryptographic verification (SHA-256, HMAC, nonce) for deployment authorization, but this is server-to-server trust, not user auth.

### For polling (Option A)

- No auth needed. The API runs on `localhost`, same machine, same user.
- If the API is exposed beyond localhost in the future, add a simple bearer token from an env var.

### For SSE sidecar (Option B, future)

- Same localhost assumption.
- The SSE endpoint should bind to `127.0.0.1` only, not `0.0.0.0`.

### For WebSocket (Option C, deferred)

- Requires token-based auth if exposed beyond localhost.
- Deferred — not needed until multi-user or remote access.

---

## 6. Event fan-out

### What events update what

| Event source               | Triggers update to          | Component affected              |
| -------------------------- | --------------------------- | ------------------------------- |
| Seeds snapshot written     | Health scores               | HealthGauge (Dashboard)         |
| Echoes audit line appended | Audit timeline              | AuditTimeline (Dashboard, GATE) |
| Lots catalog updated       | Experiment status           | ExperimentCard (Dashboard)      |
| Pulse focus state changed  | Focus session               | WorkflowStatusCard (Dashboard)  |
| GATE envelope verified     | Envelope flow, nonce, audit | GateView                        |

### Fan-out model (polling)

Each hook independently polls its source on its own interval. No centralized event bus. This is intentional — keeps hooks independent and avoids coupling.

### Fan-out model (SSE, future)

A single SSE endpoint emits typed events:

```
event: health
data: {"repoName":"GRID-main","score":92,"trend":"up"}

event: audit
data: {"id":"...","tool":"ecosystem_scan","status":"success"}

event: experiment
data: {"id":"...","name":"Adaptive briefing tone","status":"completed"}
```

Clients subscribe to the event types they need. The sidecar watches all source files and emits events when they change.

---

## 7. Coexistence with stdio MCP

### Constraint

MCP servers communicate via stdin/stdout JSON-RPC. Adding HTTP/WS to a server would require it to run as a daemon, not a stdio tool. This breaks the current deployment model where Claude/Cursor start and stop servers on demand.

### Resolution

- **Polling hooks** do not touch MCP servers at all. They read files that MCP servers write. No coexistence issue.
- **SSE sidecar** is a separate process from MCP servers. It reads files, not server state. No interference.
- **WebSocket upgrade** (Option C) would require pulse-server to become a dual-transport service (stdio for MCP, HTTP+WS for UI). This is a significant change and is why it is deferred.

The key principle: **read files, don't talk to servers**. The data contracts (Echoes NDJSON, Seeds snapshots) define the interface. The UI reads contract-defined files; MCP servers write them. They never need to communicate directly.

---

## 8. UX considerations

### Attention-safe updates

- No flashing, no toast notifications, no sound.
- New audit events prepend to the timeline with a subtle fade-in animation (CSS `@keyframes`, respects `prefers-reduced-motion`).
- Health gauge changes animate smoothly (SVG arc transition, 0.5s ease).
- Stale data indicator: if a poll fails 3 consecutive times, show a muted "Last updated X minutes ago" label. No error banner.

### Cognitive load

- Dashboard polls at 10s. Canvas does not poll (local state). GATE polls at 15s (less frequent, read-only audit view).
- No auto-scroll. New events appear at the top; the user controls scroll position.
- Comparison tray (canvas) is unaffected — it is local state, not server data.

---

## 9. Implementation plan

| Step | Work                                                               | Depends on           |
| ---- | ------------------------------------------------------------------ | -------------------- |
| 1    | API endpoint for dashboard data (part of 4.1)                      | GRID-main API routes |
| 2    | Add `pollInterval` option to all 4 hooks + new `useGateData`       | Step 1               |
| 3    | Connect hooks to real API endpoints (replace mock data)            | Step 1               |
| 4    | Add subtle update animations (fade-in, arc transition)             | Step 2               |
| 5    | Test with real file writes (create audit event, verify it appears) | Steps 1–4            |
| 6    | (Future) SSE sidecar if polling latency is insufficient            | User feedback        |

### Acceptance criteria (from quality contract)

- [ ] This design doc exists and is approved
- [ ] WebSocket or polling support in hooks for live updates
- [ ] Loading and error states defined and implemented

---

## 10. Decision log

| Decision                     | Rationale                                                                               | Date       |
| ---------------------------- | --------------------------------------------------------------------------------------- | ---------- |
| Polling first, not WebSocket | Simplicity; no hosting change; target audience values stability over real-time speed    | 2026-03-08 |
| Read files, not servers      | Preserves stdio MCP model; uses existing data contracts as the interface                | 2026-03-08 |
| No auth for localhost        | Single-user local system; add bearer token only if exposed beyond localhost             | 2026-03-08 |
| 10s poll interval            | Balances freshness vs. file I/O; fast enough for "close to live" without being wasteful | 2026-03-08 |
