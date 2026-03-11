# Design Decisions — Glimpse Artifact

## Decision 1: Long-Running Release — Phased Dark Mode Delivery

**Status:** Proposed  
**Date:** 2026-03-08  
**Context:** UI/UX — Theme System

### Problem

Dark mode implementation spans multiple subsystems (design tokens, component variants, canvas rendering, chart colors). A single-release approach risks:
- Inconsistent contrast ratios across views
- Broken canvas visualization in dark contexts
- Accessibility regressions

### Decision

Dark mode will be delivered in **3 long phases** over multiple release cycles, not a single feature drop.

| Phase | Scope | Definition of Done | Timeline |
|-------|-------|-------------------|----------|
| **Phase 1: Foundation** | Design tokens, CSS variables, theme provider | All tokens have `--dark` variants; provider switches without FOUC | Release N |
| **Phase 2: Components** | UI components (cards, buttons, inputs, navigation) | All components respect theme; Dashboard + GATE views render correctly | Release N+1 |
| **Phase 3: Canvas** | Scenario canvas, SVG connectors, timeline ribbon, annotations | Canvas colors invert correctly; branch lines remain distinguishable; export works in both modes | Release N+2 |

### Rationale

- **Risk reduction:** Each phase validates the approach before committing the next
- **User safety:** Partial dark mode (Phase 1-2 complete) is usable; broken canvas is not
- **Team bandwidth:** Aligns with existing release cadence; no crunch required
- **Testing coverage:** Each phase adds focused visual regression tests

### Trade-offs

| Benefit | Cost |
|---------|------|
| Stable intermediate states | Users wait 2 releases for full dark mode |
| Time to address contrast issues | Maintaining two color systems temporarily |
| Canvas-specific challenges isolated | Engineering context switches between phases |

### Migration Path

1. **Phase 0 (now):** Lock design tokens; document `--color-*` contract
2. **Phase 1:** Add `data-theme="dark"` support; validate with Storybook
3. **Phase 2:** Component audit; update variant classes
4. **Phase 3:** Canvas shader/SVG audit; implement inversion strategy

### Related

- `src/tokens/design-tokens.css` — token contract
- `tailwind.config.js` — dark mode configuration (future)
- `src/views/ScenarioCanvasView.tsx` — highest-risk view

---

*Decisions follow ADR format: Context → Decision → Rationale → Trade-offs → Migration*
