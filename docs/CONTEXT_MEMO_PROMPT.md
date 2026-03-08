# Context memo — CascadeProjects Phase 4

> **Purpose:** Hardened structured input for Claude Code. Read this once at session start.
> Feed unchanged — do not paraphrase, summarize, or reinterpret before acting.

---

## 1. Project identity

| Field | Value |
|-------|-------|
| Workspace | `CascadeProjects` (root repo, `init.defaultBranch=main`) |
| Remote | `origin` → `github.com/caraxesthebloodwyrm02/like-a-leaf` (private) |
| OS / shell | Windows 10/11, PowerShell |
| Python | 3.13, managed via `uv` — always `uv run <cmd>`, never bare `python` or `pip` |
| Node | TypeScript MCP servers, `vitest` for tests |
| Frontend | React 19, TypeScript strict, Vite 7, Electron 40, TailwindCSS 4 |
| Safety rule | Never `eval()`, `exec()`, `pickle` in production. Never bypass auth. |

---

## 2. Current state

**Phases 1–3 are closed. Phase 4 is next and not started.**

| Phase | Status | Delivered |
|-------|--------|-----------|
| 1 — Housekeeping | **Closed** | Git history, env vars, smoke tests, Afloat cleanup |
| 2 — Integration | **Closed** | Shared types, audit contract, cross-referencing, GATE + GRID optional, seeds snapshot contract |
| 3 — Intelligence | **Closed** | Scheduled diagnostics E2E, threshold + scan_workspaces, pattern-driven experiments, adaptive briefings, rules-based "what should I work on?" |
| 4 — Visual | **Next** | Not started |

Source: `docs/plans/2026-03-08-iteration-phases.md`, `docs/plans/2026-03-08-phase3-next-steps.md`

---

## 3. Workspace map

```
CascadeProjects/                      ← root repo
├── docs/                             ← plans, contracts, progress artifact
│   ├── plans/                        ← iteration-phases, phase3-next-steps, status-report
│   ├── schemas/                      ← phase4-quality-gates.schema.json, memo.schema.json
│   ├── DATA_CONTRACTS.md             ← Echoes audit NDJSON, Seeds snapshots (contract-backed today)
│   ├── PHASE4_QUALITY_CONTRACT.md    ← Phase 4 acceptance criteria and quality gates
│   ├── VISION_AGENTS_AND_UI_UX_OWNERSHIP.md ← ownership anchors, handoff rules, audience-fit
│   ├── PROGRESS_SUMMARY.md           ← gist, contract pointers, key doc index
│   └── progress-and-vision.html      ← single-page visual artifact (browser-open, not served)
├── shared-types/                     ← @cascade/shared-types, Zod schemas
├── afloat-server/                    ← workflow orchestration MCP server
├── echoes-server/                    ← audit logging MCP server
├── grid-server/                      ← GATE envelope validation MCP server
├── lots-server/                      ← experiment runner MCP server
├── maintain-server/                  ← diagnostics + cleanup MCP server
├── pulse-server/                     ← briefing, focus, journal, alerts MCP server
├── seeds-server/                     ← ecosystem health scanning MCP server
├── GRID-main/                        ← nested repo — core platform (Mycelium frontend, safety, cognition)
├── mcp-tool-experiment/              ← nested repo — safety-first workspace analysis server
├── glimpse-artifact/                 ← React component library (6 primitives today)
└── scripts/                          ← dev utilities
```

### Contract-backed data flows (today)

| Contract | Location | Producers | Consumers |
|----------|----------|-----------|-----------|
| Echoes audit NDJSON | `~/.echoes/audit.ndjson` | lots-server, maintain-server, echoes-server | echoes-server (`query_audit`, `audit_stats`), pulse-server (briefing, correlation) |
| Seeds ecosystem snapshots | `~/.seeds-server/snapshots/` | seeds-server `ecosystem_scan` | pulse-server (`check_alerts`, briefing, `what_should_i_work_on`) |

Source: `docs/DATA_CONTRACTS.md`

---

## 4. Phase 4 initiatives

**Goal:** Give the ecosystem a visual interface that makes it tangible and shareable.
**Effort:** High. **Risk:** Low (purely additive). **Depends on:** Phase 2 complete (Phase 3 optional).

### Experience lens (design constraints)

- **Attention-safe** — One clear path per surface; labels, state, and next steps easy to re-enter after interruption.
- **Low-tech friendly** — Plain language, stable layout, gentle hierarchy over tool-heavy control panels.
- **Scenario canvas** — Help an author play out a seed situation across health, audit, experiments, and flow views without holding every branch in memory.

Source: `docs/VISION_AGENTS_AND_UI_UX_OWNERSHIP.md` (handoff rules, lines 72–78)

---

### 4.1 Mycelium Dashboard

| | |
|---|---|
| **What** | Surface seeds health grid, echoes audit stream, lots experiments, and pulse focus timer inside GRID-main Mycelium. |
| **Owner** | Dev + design |
| **Ownership anchor** | `docs/VISION_AGENTS_AND_UI_UX_OWNERSHIP.md#ownership-4-1` |
| **Host** | `GRID-main/` Mycelium frontend |
| **Data sources** | seeds-server → health grid; echoes-server → audit stream; lots-server → experiments; pulse-server → focus timer |

**Acceptance criteria:**

| Criterion | Description |
|-----------|-------------|
| Health grid | Ecosystem health grid visible from seeds-server data |
| Audit stream | Audit event stream visible from echoes-server |
| Experiments | Active experiments visible from lots-server |
| Focus timer | Focus session timer visible from pulse-server |
| Layout and binding | Layout and data binding documented and functional |

**Done when:** All four data sources connected and displayed in Mycelium; no regressions to existing GRID Mycelium behavior.

---

### 4.2 Glimpse components

| | |
|---|---|
| **What** | Build reusable health gauges, audit timeline, experiment charts, and workflow status cards for both dashboard and GATE views. |
| **Owner** | Component library owner |
| **Ownership anchor** | `docs/VISION_AGENTS_AND_UI_UX_OWNERSHIP.md#ownership-4-2` |
| **Host** | `glimpse-artifact/` |
| **Constraint** | Design tokens (palette, typography) are the single source for Phase 4 UI |

**Acceptance criteria:**

| Criterion | Description |
|-----------|-------------|
| Health gauges | Health score gauges per repo available and used |
| Audit timeline | Audit event timeline component available and used |
| Experiment charts | Experiment comparison charts available and used |
| Workflow cards | Workflow execution status cards available and used |
| Reuse | Components reusable across dashboard and GATE viz |

**Done when:** All four component types exist in glimpse-artifact and are integrated where specified; design system is the single source for Phase 4 UI.

**Current gap:** glimpse-artifact has 6 generic UI primitives (alert, badge, button, card, input, tabs). None of the Phase 4 components exist yet.

---

### 4.3 Real-time event stream

| | |
|---|---|
| **What** | Add live updates for audit events, experiment completion, and health-score changes. |
| **Owner** | Design doc first, then implementation |
| **Ownership anchor** | `docs/VISION_AGENTS_AND_UI_UX_OWNERSHIP.md#ownership-4-3` |
| **Blocker** | Design doc must exist and be approved before implementation begins |

**Acceptance criteria:**

| Criterion | Description |
|-----------|-------------|
| Design doc | Covers hosting model, auth assumptions, event fan-out, coexistence with stdio MCP |
| WebSocket | WebSocket support in pulse-server (or designated service) for live updates |
| UX | Loading and error states defined and implemented |

**Done when:** Design doc approved; frontend updates live for audit events, experiment completion, and health score changes.

**Key constraint:** This is a deployment-model change, not just a transport tweak. pulse-server would move from stdio-only MCP execution toward a long-lived service.

---

### 4.4 GATE visualization

| | |
|---|---|
| **What** | Show the envelope flow, nonce registry, and deployment history with risk scores as a calm, read-only view. |
| **Owner** | Dev + design |
| **Ownership anchor** | `docs/VISION_AGENTS_AND_UI_UX_OWNERSHIP.md#ownership-4-4` |
| **Data source** | grid-server (GATE envelope validation, nonce registry, audit) |

**Acceptance criteria:**

| Criterion | Description |
|-----------|-------------|
| Envelope flow | Submitted → validated → approved/rejected shown visually |
| Nonce registry | Registry status visible |
| Deployment history | Recent history with risk scores visible |

**Done when:** Read-only visualization of the deployment pipeline is available and accurate.

---

## 5. Handoff rules

1. Design system and tokens **before** high-fidelity UI.
2. Design doc for 4.3 **before** implementation.
3. Favor attention-stable, low-tech-friendly flows — creative workers should not fight interface density or context drift.
4. Treat the visual system as a **scenario canvas**, not a generic operations dashboard.
5. Progress-and-vision artifact (`docs/progress-and-vision.html`) updated when phases or project list change.

Source: `docs/VISION_AGENTS_AND_UI_UX_OWNERSHIP.md` (lines 72–78)

---

## 6. Quality gates

Phase 4 is **fully delivered** only when:

- All four initiatives at 100% completion
- Checklist coverage 100% (all acceptance criteria above marked done)
- Probability of full delivery ≥ 0.95
- Design doc signed off for 4.3

**On track threshold:** No initiative below 80%; probability ≥ 0.8.

Quality-gate reports must validate against `docs/schemas/phase4-quality-gates.schema.json`.

Source: `docs/PHASE4_QUALITY_CONTRACT.md`

---

## 7. Artifact contract

`docs/progress-and-vision.html` is a static, human-maintained artifact. Its design constraints are frozen:

| Constraint | Value |
|------------|-------|
| Fonts | Outfit (headings), DM Sans (body) via Google Fonts |
| Palette | 14 CSS variables: `--base` through `--radius` (teal-on-neutral) |
| Sections | Exactly 4: Current progress, Project map, Vision (Phase 4), Key docs and next steps |
| Animation | Staggered `sectionIn` at 0s / 0.05s / 0.1s / 0.15s per `nth-child` |
| Toolbar | 2 buttons: Grid layout toggle, Reset zoom |
| Diagrams | 2 Mermaid diagrams: phase timeline (LR), project map (TB) |
| Zoom | Click or Enter/Space on `.diagram-wrap.zoomable` toggles `.zoomed` (scale 1.4) |
| Layout | `body.layout-grid` → 2-column CSS grid; mobile breakpoint 640px falls back to 1-col |
| Print | `@media print` hides toolbar, removes shadows, forces `opacity: 1` |
| Links | Stable fragment identifiers (`#ownership-4-x`), not text fragments or permalinks |

**Do not:** Add new controls, expand the color system, embed illustrations/backgrounds, or change section count without extending the animation selectors.

---

## 8. Key doc index

| Doc | Path | Purpose |
|-----|------|---------|
| Iteration phases | `docs/plans/2026-03-08-iteration-phases.md` | Full phase spec (Phases 1–4) |
| Phase 3 next steps | `docs/plans/2026-03-08-phase3-next-steps.md` | Phase 3 closure, Phase 4 pointer |
| Data contracts | `docs/DATA_CONTRACTS.md` | Echoes audit NDJSON, Seeds snapshots |
| Quality contract | `docs/PHASE4_QUALITY_CONTRACT.md` | Acceptance criteria, quality gates |
| Quality schema | `docs/schemas/phase4-quality-gates.schema.json` | JSON schema for gate reports |
| Ownership | `docs/VISION_AGENTS_AND_UI_UX_OWNERSHIP.md` | Ownership anchors, handoff rules |
| Progress summary | `docs/PROGRESS_SUMMARY.md` | Gist, contract pointers |
| Visual artifact | `docs/progress-and-vision.html` | Browser-open progress and vision view |
| Root README | `README.md` | Workspace overview and project table |
| Contributing | `CONTRIBUTING.md` | Contribution guidelines |
| Git conventions | `docs/GIT_REPO.md` | Staging, push, remotes, nested repos |
| Submodules | `docs/SUBMODULES.md` | Dirty submodule remediation |

---

## 9. Session protocol

1. **Before writing any code**, verify the state:
   ```
   uv run pytest -q --tb=short && uv run ruff check src/ safety/ security/ boundaries/
   ```
2. **Before committing**, verify tests still pass.
3. **Commit convention:** `fix(scope):`, `feat(scope):`, `refactor(scope):`, `test(scope):`, `docs(scope):`
4. **One commit, one concern.**
5. **Never suppress errors or modify test assertions to make tests pass.**

---

## 10. Out of scope

- `/claude-api` and `/batch` integrations
- Broader Phase 4 doc rewrite beyond the files listed above
- New tooling, CI pipelines, or deployment infrastructure
- Background AI API calls (local-first, privacy-first)
