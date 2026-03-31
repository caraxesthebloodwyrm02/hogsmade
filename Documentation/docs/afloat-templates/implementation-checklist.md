# Afloat UI/UX — Implementation Checklist

Quick-reference for executing the 30 items when `E:\Seeds\afloat` is open.
Templates in this folder: `copy-constants.ts`, `design-tokens.css`.

---

## Phase 1 — High priority (items 1–9)

### Tech leakage

- [ ] **#1** `src/app/error.tsx` — Wrap `Error ID: {error.digest}` in `process.env.NODE_ENV === "development"` guard or remove entirely.
- [ ] **#2** `src/app/api/v1/memory-session/[id]/message/route.ts` — Replace placeholder `"This is a placeholder response. LLM not connected yet."` with a user-safe fallback from `copy-constants.ts → ERRORS.generic`.
- [ ] **#3** API → UI boundary — Import `ERRORS` map; never pass raw API error strings to components.

### Accessibility

- [ ] **#4** Add `aria-label` using `A11Y` constants:
  - `src/components/chat-input.tsx` → input gets `aria-label={A11Y.chatInput}`
  - Send button → `aria-label={A11Y.sendButton}`
  - Done button → `aria-label={A11Y.doneButton}`
  - Subscribe, settings, consent, error, not-found pages → key buttons get labels
- [ ] **#5** `src/components/chat-window.tsx` → message list container: `aria-live="polite"` + `aria-label={A11Y.messageList}`
  - `src/components/session-timer.tsx` → timer wrapper: `aria-live="polite"` + `aria-label={A11Y.sessionTimer}`
- [ ] **#6** `src/app/loading.tsx` → Add `role="status"` + `aria-live="polite"` + visible text `LOADING.default`

### Copy & CTA

- [ ] **#7** Replace all CTA variants with `CTA.primary` / `CTA.primaryWithPrice` from `copy-constants.ts`:
  - `src/app/page.tsx` (home)
  - `src/app/subscribe/page.tsx`
  - `src/components/session-status.tsx`
- [ ] **#8** Replace all ad-hoc error strings with `ERRORS.*` constants
- [ ] **#9** `src/app/chat/page.tsx` — Replace raw `tier` display with `tierLabel(tier)` from `copy-constants.ts`

---

## Phase 2 — Medium priority (items 10–22)

### States

- [ ] **#10** `src/app/loading.tsx` — Add `<p>{LOADING.default}</p>` alongside spinner
- [ ] **#11** `src/app/chat/page.tsx` — Change "Failed to start session." → `ERRORS.sessionStart`
- [ ] **#12** `src/app/settings/page.tsx` — Change error messages → `ERRORS.settingsLoad` / `ERRORS.settingsSave` / `ERRORS.settingsDelete`
- [ ] **#13** `src/app/settings/page.tsx` — Add retry button when settings load fails
- [ ] **#14** `src/app/subscribe/success/page.tsx` — Style "Try again" as primary button (match error/not-found)
- [ ] **#15** `src/components/chat-window.tsx` — Add `EMPTY.chat.action` text in empty state
- [ ] **#16** `src/app/subscribe/success/page.tsx` — Change "Loading..." → `LOADING.subscription`

### Styling & theme

- [ ] **#17** `src/app/globals.css` — Remove `body { font-family: Arial, Helvetica, sans-serif }` or replace with `var(--font-geist-sans)`
- [ ] **#18** `src/app/globals.css` + `layout.tsx` — Define `--font-geist-mono` or remove reference
- [ ] **#19** `src/components/chat-window.tsx` — Replace inline `style={{ animationDelay }}` with CSS custom properties or Tailwind `delay-*`
- [ ] **#20** Add `dark:` text/bg variants to: home, subscribe, settings, privacy, not-found, error pages

### Hierarchy & semantics

- [ ] **#21** `src/app/error.tsx` + `src/app/not-found.tsx` — Change `<h2>` → `<h1>` for main heading
- [ ] **#22** Define type scale using `design-tokens.css` variables; apply to all page headings

---

## Phase 3 — Lower priority (items 23–30)

### Redundancy

- [ ] **#23** Remove duplicate "turns remaining" — keep in `ChatInput` only
- [ ] **#24** `src/app/settings/page.tsx` — Replace `window.confirm()` with in-app destructive confirmation dialog

### Design system

- [ ] **#25** Import `design-tokens.css`; refactor raw Tailwind to token vars
- [ ] **#26** Create `src/components/ui/Button.tsx`, `Card.tsx`, `PageLayout.tsx` with token-based styling
- [ ] **#27** Apply spacing scale from tokens to section/block/inline gaps
- [ ] **#28** `src/app/settings/page.tsx` — Differentiate success (`--color-success`) vs error (`--color-danger`)

### UX writing

- [ ] **#29** Convert Title Case headings to sentence case on consent, privacy, settings pages
- [ ] **#30** Audit button labels ≤ 8 words; tooltips ≤ 20 words

---

## Verification

```bash
# After each phase:
npm run build && npm run lint
# Manual: test error, not-found, chat, settings flows
# Manual: keyboard navigation + screen reader spot-check
# Manual: dark mode on all pages
```
