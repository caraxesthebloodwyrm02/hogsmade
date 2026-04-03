# Vision agents and UI/UX ownership

## 1. Purpose and scope

This document curates vision-agent tasks and defines UI/UX responsibilities and ownership for the ecosystem. It references the progress-and-vision artifact as the single source for "current state and Phase 4 vision"; it does not duplicate that content—it adds task curation and ownership.

**Artifact reference:** Current progress and Phase 4 vision are captured in the single-page visual artifact: [Progress and vision](progress-and-vision.html). Use it for onboarding, session start, and planning.

---

## 2. Vision-agent task curation

**Definition:** Vision-agent tasks are those that benefit from vision-language models (image + text in, structured or textual out): UI screenshots, mockups, design system tokens, diagrams, and charts.

### Do delegate to vision agents

- Visual-to-code from mockups or screenshots
- Extracting layout and components from Figma or design exports
- Document and chart analysis and summarization
- Consistency checks (screens vs design system)
- Localization and accessibility checks on screenshots
- Generating or refining Mermaid or other diagrams from hand-drawn or exported visuals

### Do not delegate (or use with clear handoff)

- Final architecture decisions
- Security-sensitive logic
- Deployment and hosting design
- Defining API contracts (keep as text/code-first)

### Delegation by agent type

Map tasks by capability: _generation_ (e.g. visual-to-code, diagram generation) vs _analysis_ (e.g. consistency checks, document summarization), and _precise localization_ (e.g. accessibility, layout extraction) vs _holistic understanding_ (e.g. design-system alignment). See prior research or conversation transcripts for model-specific strengths (e.g. Kimi K2.5, Pixtral-style).

### Phase 4 alignment

For the list of Phase 4 initiatives (Mycelium Dashboard, Glimpse components, real-time stream, GATE visualization), see [Progress and vision](progress-and-vision.html). Vision-agent tasks above apply to those initiatives where the work is visual or design-heavy.

---

## 3. UI/UX responsibilities and task ownership

| Area                         | Responsibility                                                      | Owner                                 | Notes                                        |
| ---------------------------- | ------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------- |
| Progress-and-vision artifact | Content, structure, Mermaid, links                                  | Human-maintained                      | Update when phases or project list change    |
| Design system and tokens     | Palette, typography, spacing, components                            | e.g. Glimpse / design lead            | Single source for Phase 4 UI                 |
| Mycelium Dashboard (4.1)     | Layout, data binding, health grid, audit stream, experiments, pulse | Dev + design                          | Connects GRID Mycelium to MCP data           |
| Glimpse components (4.2)     | Health gauges, audit timeline, experiment charts, workflow cards    | Component library owner               | Reusable across dashboard and GATE           |
| Real-time event stream (4.3) | WebSocket UX, loading/error states, fan-out model                   | Design doc first, then implementation | Design doc covers hosting, auth, coexistence |
| GATE visualization (4.4)     | Envelope flow, nonce registry, deployment history, risk scores      | Dev + design                          | Read-only visualization of pipeline          |

**Owner:** "Owner" can be a role or team name; fill per repo or project.

### Phase 4 initiative anchors

#### <a id="ownership-4-1"></a>4.1 Mycelium Dashboard

Surface the seeds health grid, echoes audit stream, lots experiments, and pulse focus timer inside GRID-main Mycelium. **Owner:** Dev + design.

#### <a id="ownership-4-2"></a>4.2 Glimpse components

Maintain reusable health gauges, audit timeline, experiment charts, and workflow status cards for both the dashboard and GATE views. **Owner:** Component library owner.

#### <a id="ownership-4-3"></a>4.3 Real-time event stream

Define the WebSocket UX, loading and error states, and event fan-out model. A design doc comes first; implementation follows only after hosting, auth, and MCP coexistence are resolved. **Owner:** Design doc first, then implementation.

#### <a id="ownership-4-4"></a>4.4 GATE visualization

Show the envelope flow, nonce registry, and deployment history with risk scores as a read-only visual surface. **Owner:** Dev + design.

### Handoff rules

- Design system and tokens before high-fidelity UI.
- Design doc for real-time (4.3) before implementation.
- Favor attention-stable, low-tech-friendly flows for artists, authors, and other creative workers who should not have to fight interface density or context drift.
- Treat the visual system as a scenario canvas for exploring how a seed situation unfolds, not as a generic operations dashboard.
- Progress-and-vision artifact updated when phases or project list change.

---

## 4. How this doc is maintained

- **When to update:** When adding a new Phase 4 surface, changing ownership, or revising the vision-agent task list.
- **Where it lives:** `docs/`; linked from the [docs index](README.md).
