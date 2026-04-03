# Glimpse — Scenario Canvas

A visualization tool for authors and creative workers to explore seed scenarios, compare branches, and see how a story plays out — without holding every path in memory.

## Quick start

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # production build → dist/
```

## Views

| View          | What it does                                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Canvas**    | Pan/zoom workspace. Add seeds, fork branches, compare up to 3 glimpses side-by-side, annotate with sticky notes. |
| **Dashboard** | Ecosystem health gauges, audit timeline, experiment comparison, focus session status.                            |
| **GATE**      | Read-only pipeline: envelope flow, nonce registry, deployment history with risk scores.                          |

## File structure (26 source files)

```
src/
├── tokens/design-tokens.css        ← palette, typography, spacing, motion
├── lib/utils.ts                    ← cn() utility
├── components/phase4/
│   ├── types.ts                    ← all data interfaces
│   ├── HealthGauge.tsx             ← SVG radial gauge
│   ├── AuditTimeline.tsx           ← vertical event timeline
│   ├── ExperimentCard.tsx          ← comparison bars
│   ├── WorkflowStatusCard.tsx      ← step list with expand/collapse
│   ├── index.ts                    ← barrel export
│   └── canvas/
│       ├── ScenarioCanvas.tsx      ← pan/zoom container
│       ├── ScenarioSeedCard.tsx    ← seed entry card
│       ├── BranchFork.tsx          ← SVG bezier connector
│       ├── GlimpseSnapshotCard.tsx ← branch snapshot
│       ├── TimelineRibbon.tsx      ← bottom progression strip
│       ├── AnnotationNote.tsx      ← editable sticky note
│       └── CanvasToolbar.tsx       ← ≤4 button toolbar
├── hooks/
│   ├── useHealthData.ts            ← seeds-server health (mock)
│   ├── useAuditStream.ts           ← echoes-server audit (mock)
│   ├── useExperiments.ts           ← lots-server experiments (mock)
│   └── useFocusSession.ts          ← pulse-server focus (mock)
├── views/
│   ├── AppShell.tsx                ← 3-tab navigation
│   ├── ScenarioCanvasView.tsx      ← canvas product view
│   ├── DashboardView.tsx           ← ecosystem dashboard
│   └── GateView.tsx                ← GATE pipeline view
├── main.tsx                        ← entry point
└── index.css                       ← imports tokens + tailwind
```

## Design constraints

1. **Anti-context-drift** — ≤3 choices visible per view, stable layout, no auto-advance, breadcrumb always present.
2. **Low-tech-friendly** — Plain language, 48px touch targets, ≥4.5:1 contrast, real-world metaphors (canvas, notebook, shelf).
3. **Scenario canvas** — Seed → Branch → Glimpse flow; side-by-side comparison (max 3); annotation layer; timeline ribbon.

## Design tokens

All styling derives from CSS custom properties in `src/tokens/design-tokens.css`. Fonts: Outfit (headings) + DM Sans (body) via Google Fonts. Palette: teal-on-neutral. Respects `prefers-reduced-motion`.

## Hooks (injection points)

The 4 hooks in `src/hooks/` return `{ data, loading, error }`. They currently use `setTimeout` + mock data. Replace the mock bodies with your data source — the component interfaces in `types.ts` are the contracts.

## Stack

React 18, TypeScript, Vite, TailwindCSS 3, Lucide icons.
