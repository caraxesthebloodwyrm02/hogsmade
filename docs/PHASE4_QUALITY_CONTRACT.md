# Phase 4 quality contract

Structured contract for the intended quality of Phase 4 (Visual Operating System). Use this to align delivery, validate quality-gate payloads via the [phase4-quality-gates schema](schemas/phase4-quality-gates.schema.json), and stabilize probabilities and statistics for “Phase 4 fully delivered.”

---

## 1. Goal and scope

- **Goal**: Give the ecosystem a visual interface that makes it tangible and shareable.
- **Scope**: Initiatives 4.1 (Mycelium Dashboard), 4.2 (Glimpse components), 4.3 (Real-time event stream), 4.4 (GATE visualization). See [progress-and-vision.html](progress-and-vision.html) and [iteration-phases](plans/2026-03-08-iteration-phases.md).
- **Quality bar**: Phase 4 is considered **fully delivered at intended quality** only when all acceptance criteria below are satisfied and any quality-gate report validates against the JSON schema.

---

## 2. Acceptance criteria by initiative

### 4.1 Mycelium Dashboard Integration

| Criterion | Description | Owner (from [VISION_AGENTS_AND_UI_UX_OWNERSHIP.md](VISION_AGENTS_AND_UI_UX_OWNERSHIP.md)) |
|----------|-------------|-------------------------------------------------------------------------------------------|
| Health grid | Ecosystem health grid visible from seeds-server data. | Dev + design |
| Audit stream | Audit event stream visible from echoes-server. | Dev + design |
| Experiments | Active experiments visible from lots-server. | Dev + design |
| Focus timer | Focus session timer visible from pulse-server. | Dev + design |
| Layout and binding | Layout and data binding documented and functional. | Dev + design |

**Done when**: All four data sources are connected and displayed in the Mycelium frontend; no regressions to existing GRID Mycelium behavior.

### 4.2 Glimpse Components for Data Viz

| Criterion | Description | Owner |
|----------|-------------|--------|
| Health gauges | Health score gauges per repo available and used. | Component library owner |
| Audit timeline | Audit event timeline component available and used. | Component library owner |
| Experiment charts | Experiment comparison charts available and used. | Component library owner |
| Workflow cards | Workflow execution status cards available and used. | Component library owner |
| Reuse | Components reusable across dashboard and GATE viz. | Component library owner |

**Done when**: All four component types exist in glimpse-artifact and are integrated where specified; design system (palette, typography) is the single source for Phase 4 UI.

### 4.3 Real-Time Event Stream

| Criterion | Description | Owner |
|----------|-------------|--------|
| Design doc | Design doc exists covering hosting, auth, event fan-out, coexistence with stdio MCP. | Design doc first |
| WebSocket | WebSocket support in pulse-server (or designated service) for live updates. | Implementation |
| UX | Loading and error states defined and implemented. | Dev + design |

**Done when**: Design doc is approved; frontend updates live for audit events, experiment completion, and health score changes as specified.

### 4.4 GATE Visualization

| Criterion | Description | Owner |
|----------|-------------|--------|
| Envelope flow | Envelope submitted → validated → approved/rejected shown visually. | Dev + design |
| Nonce registry | Nonce registry status visible. | Dev + design |
| Deployment history | Recent deployment history with risk scores visible. | Dev + design |

**Done when**: Read-only visualization of the deployment pipeline is available and accurate.

---

## 3. Probabilities and statistics (stabilization)

- **Purpose**: Use a small set of metrics and probabilities to assess likelihood that Phase 4 will deliver (or has delivered) at the intended quality, and to avoid drift.
- **Stabilization**: Quality-gate reports (see schema) should be produced at checkpoints (e.g. per initiative completion, pre-release). Validation against the schema ensures structure and required fields; thresholds below help interpret the numbers.
- **Recommended metrics**:
  - **Completion per initiative**: 0–1 or 0–100% for 4.1, 4.2, 4.3, 4.4. Phase 4 overall = minimum of the four or weighted average, depending on policy.
  - **Probability of full delivery**: Single number in [0, 1] expressing confidence that all acceptance criteria will be (or have been) met. Derived from checklist completion and manual assessment.
  - **Checklist coverage**: Fraction of acceptance criteria above that are marked done (e.g. 14/14 or 100%).
- **Thresholds (policy)**:
  - **Phase 4 “fully delivered”**: All initiatives at 100% completion, checklist coverage 100%, and probability of full delivery ≥ agreed threshold (e.g. 0.95). Optionally require design doc signed off for 4.3.
  - **Stable / on track**: No initiative below 0.8 (80%); probability of full delivery ≥ 0.8.

---

## 4. Quality-gate report (payload)

A **quality-gate report** is a JSON object that conforms to [schemas/phase4-quality-gates.schema.json](schemas/phase4-quality-gates.schema.json). It typically includes:

- `version`: Contract/schema version.
- `timestamp`: When the report was generated.
- `initiatives`: Completion and optional notes per initiative (4.1–4.4).
- `checklist`: List of acceptance criterion IDs and their status (e.g. done, not_done, partial).
- `probabilityOfFullDelivery`: Number in [0, 1].
- `overallStatus`: e.g. `on_track`, `at_risk`, `fully_delivered`.

Validating this payload against the schema stabilizes structure and ensures required fields are present before using probabilities and statistics in decisions.

---

## 5. Ownership and handoff (reference)

Handoff rules from [VISION_AGENTS_AND_UI_UX_OWNERSHIP.md](VISION_AGENTS_AND_UI_UX_OWNERSHIP.md):

1. Design system and tokens before high-fidelity UI.
2. Design doc for real-time (4.3) before implementation.
3. Progress-and-vision artifact updated when phases or project list change.

Ownership table: see [VISION_AGENTS_AND_UI_UX_OWNERSHIP.md](VISION_AGENTS_AND_UI_UX_OWNERSHIP.md#3-uiux-responsibilities-and-task-ownership).

---

## 6. Contract version and updates

- **Version**: 1.0.0 (aligned with initial schema).
- **When to update**: When adding or changing Phase 4 initiatives, acceptance criteria, or quality-gate fields. Bump contract version and schema version together; keep PROGRESS_SUMMARY and docs index in sync.
