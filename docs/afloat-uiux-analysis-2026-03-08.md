# Afloat UI/UX Analysis — Structured Recommendations

**Date:** 2026-03-08  
**Scope:** E:\Seeds\afloat (Next.js 16, React 19, TailwindCSS 4)  
**Method:** Multi-agent analysis (component/design, copy & states, accessibility & consistency, subtractive analysis)

---

## Executive summary

| Dimension | Finding |
|-----------|--------|
| **Root cause of immature quality** | No design system or tokens; ad-hoc spacing/typography/colors; tech leakage; weak loading/error/empty states; no ARIA or focus management; incomplete dark mode; inconsistent copy and CTAs. |
| **What's precisely needed** | A small set of design tokens and shared primitives; one source of truth for copy and CTAs; accessibility baseline (ARIA, live regions, focus); consistent empty/error/loading patterns; removal of tech leakage; full dark-mode coverage. |
| **Priority** | Fix tech leakage and accessibility first; then copy/CTA consistency and states; then tokens, hierarchy, and polish. |

---

## 1. Root causes of immature quality (subtrahend)

### 1.1 Design system and tokens

- **No shared primitives:** Buttons, cards, and section spacing are reimplemented per component with raw Tailwind. No `Button`, `Card`, or `PageLayout` components.
- **No spacing scale:** Ad-hoc `py-3`, `py-3.5`, `py-6`, mixed `space-y-*`/`gap-*`; no defined rhythm for section vs block vs inline.
- **No type scale:** Page titles vary (home `text-4xl`, subscribe `text-3xl`, privacy/settings `text-2xl`, chat `text-base`); no rule for h1/h2/h3.
- **No semantic color tokens:** Raw Tailwind palettes only; no CSS variables for primary, success, danger, or surface.
- **Inconsistent controls:** Button heights `h-9` vs `h-10` vs `h-12`; radii `rounded-md`/`rounded-lg`/`rounded-xl`/`rounded-2xl` without a rule.

### 1.2 Typography and theme conflicts

- **Body font override:** `globals.css` sets `body { font-family: Arial, Helvetica, sans-serif }` while layout uses Geist (`--font-geist-sans`). Conflicting declarations.
- **Missing mono font:** `--font-geist-mono` is referenced in `@theme` but never defined; timer/mono elements don't get a proper mono font.
- **No single type scale:** Sizes and weights are local to components; no "title" vs "body" vs "caption" tokens.

### 1.3 Tech leakage

- **error.tsx:** Displays `Error ID: {error.digest}` to users. Should be dev-only or removed from UI.
- **Chat header:** Shows raw `tier` value (e.g. `"continuous"`) instead of a friendly label (e.g. "Extended session") or hidden.
- **API placeholder:** Memory-session fallback "This is a placeholder response. LLM not connected yet." can surface in chat; must not be user-facing.

### 1.4 Copy and CTA inconsistency

- **Pricing/CTA wording:** "Get Started — from $9/quarter" vs "Subscribe — from $9/quarter" vs "Get Started — $9/quarter" across home, SessionStatus, and subscribe.
- **Error phrasing:** "Something went wrong" vs "Something went wrong." (punctuation and context differ).
- **Sentence case:** Headings use Title Case ("Consent Preferences", "Privacy Policy", "Your Data"); UX writing standard is sentence case for consistency.

### 1.5 Empty, error, and loading states

- **Empty chat:** Purpose stated ("Describe what you're stuck on.") but no single explicit action in the empty area (e.g. "Type below to start.").
- **Error messages missing "what to do next":** Chat "Failed to start session."; settings "Failed to load settings.", "Failed to save.", "Failed to request deletion." — no next step in copy.
- **Root loading.tsx:** Spinner only; no "Loading…" or route-specific text; no `aria-live`/`role="status"`.
- **Subscribe success loading:** Generic "Loading..." instead of "Loading subscription…".
- **Settings error:** No dedicated error layout or retry CTA when load fails.
- **Subscribe success error:** Text + "Try again" link only; no primary button style consistent with error/not-found.

### 1.6 Accessibility gaps

- **No ARIA:** No `aria-label`, `aria-live`, `aria-describedby`, `aria-invalid`, or `role` in components or pages.
- **Chat input / Send / Done:** No accessible names beyond visible text; no `aria-label` where helpful.
- **Loading:** Spinner has no `role="status"` or `aria-live="polite"`; loading dots not marked as busy/live.
- **Session status/timer:** Status messages and timer not in a live region; screen readers may miss updates.
- **Focus:** Only chat input has visible focus ring; buttons/links use browser default (often low contrast).
- **Headings:** Not-found and error use `<h2>` for main title; chat uses `<h1>` with `text-base`. No consistent outline.
- **No skip link:** Keyboard users must tab through header/footer to reach main content.

### 1.7 Dark mode

- **Partial support:** Layout and chat use `dark:`; home, subscribe, consent, settings, privacy, not-found, error do not. In dark mode those pages keep light-theme text (e.g. `text-zinc-900`), causing contrast and consistency issues.

### 1.8 Hierarchy and semantics

- **Page titles:** No single rule (4xl vs 3xl vs 2xl vs base).
- **Error/not-found:** Use `<h2>` instead of `<h1>` for the main heading.
- **Cards:** Two ad-hoc patterns ("marketing" rounded-xl p-6 vs "form" rounded-lg p-4) without shared component or tokens.

### 1.9 Redundancy and interaction patterns

- **"Turns remaining":** Shown in both ChatWindow and ChatInput when messages exist — duplicate, visual noise.
- **Delete account:** Uses `window.confirm()`; not styled or aligned with app; no destructive modal or inline confirmation.

### 1.10 Ad-hoc styling

- **chat-window.tsx:** Inline `style={{ animationDelay: "0ms" }}` (and 150ms, 300ms) instead of Tailwind/CSS vars.
- **Settings success/error:** "Saved." and "Failed to save." both use `text-xs text-zinc-500` — success and error look the same.

---

## 2. What's precisely needed (remainder)

| Area | Target state |
|------|----------------|
| **Components** | Same four core components, plus shared primitives (e.g. Button, Card, PageLayout) and optional Empty/Error/Loading patterns. |
| **Design tokens** | A small set: spacing scale, type scale, semantic colors (primary, success, danger, surface), radius scale, shared button/input heights. |
| **Copy** | One canonical CTA and pricing line; one canonical error phrase; no raw tier or technical placeholders in UI; API fallback never user-facing or replaced with a short user-facing message. |
| **States** | Empty states with purpose + one clear action; error messages with "what happened" + "what to do next"; loading with context ("Loading…", route-specific, or "Loading subscription…"); settings error with retry CTA. |
| **Accessibility** | `aria-label` on main inputs and key buttons; `aria-live` (or role) for message list and timer; loading announced; consistent focus styles; h1 for main heading on every page; skip link optional but recommended. |
| **Styling** | Body font from theme (no Arial override); animation delays via Tailwind/CSS vars; dark variants on all relevant pages. |
| **Hierarchy** | Consistent h1/h2 scale; error and not-found use h1; section structure consistent. |
| **Consistency** | Shared error/empty/loading patterns; delete flow uses in-app confirmation; primary/secondary/destructive styles from tokens or shared components. |

---

## 3. Structured recommendations

### 3.1 High priority — Tech leakage and accessibility

| # | Action | Location / notes |
|---|--------|-------------------|
| 1 | Remove or dev-only `Error ID: {error.digest}` in global error UI | `src/app/error.tsx` |
| 2 | Ensure memory-session placeholder brief never appears in chat; use short user-facing fallback if needed | `src/app/api/v1/memory-session/[id]/message/route.ts` + chat UI |
| 3 | Map API error codes to short, user-safe messages before showing in SessionStatus or elsewhere | API → UI boundary |
| 4 | Add `aria-label` to chat input, Send, Done, and key buttons (subscribe, settings, consent, error, not-found) | Components and pages |
| 5 | Add `aria-live="polite"` (or equivalent) for message list and session timer | `chat-window.tsx`, `session-timer.tsx` |
| 6 | Mark loading indicator (root and dots) with `role="status"` or `aria-live` and visible "Loading…" text | `loading.tsx`, chat loading state |

### 3.2 High priority — Copy and CTA consistency

| # | Action | Location / notes |
|---|--------|-------------------|
| 7 | Pick one primary CTA and one pricing formulation; use everywhere (home, subscribe, SessionStatus) | Copy constants or i18n |
| 8 | Standardize error phrasing (e.g. "Something went wrong.") and punctuation | All error surfaces |
| 9 | Replace raw `tier` in chat header with friendly label ("Trial" / "Extended session") or hide | `src/app/chat/page.tsx` |

### 3.3 Medium priority — Loading and empty/error states

| # | Action | Location / notes |
|---|--------|-------------------|
| 10 | In `loading.tsx`, add visible "Loading…" (and optionally route-specific) text | `src/app/loading.tsx` |
| 11 | Add "what to do next" to chat "Failed to start session." (e.g. "Check your connection and try again.") | `src/app/chat/page.tsx` |
| 12 | Add next step to settings errors ("Try again" or "Refresh the page.") | `src/app/settings/page.tsx` |
| 13 | Settings: clear error state with retry CTA when load fails | `src/app/settings/page.tsx` |
| 14 | Subscribe success error: use same primary button style as error/not-found | `src/app/subscribe/success/page.tsx` |
| 15 | Chat empty state: add one explicit action in empty area (e.g. "Type below to start.") | `src/components/chat-window.tsx` |
| 16 | Subscribe success: replace generic "Loading..." with "Loading subscription…" | `src/app/subscribe/success/page.tsx` |

### 3.4 Medium priority — Styling and theme

| # | Action | Location / notes |
|---|--------|-------------------|
| 17 | In `globals.css`, make body use theme font (e.g. `var(--font-sans)`) or remove Arial override | `src/app/globals.css` |
| 18 | Define `--font-geist-mono` or remove reference from `@theme` | `src/app/globals.css`, `layout.tsx` |
| 19 | Replace inline `animationDelay` in chat-window with Tailwind classes or CSS custom properties | `src/components/chat-window.tsx` |
| 20 | Add `dark:` variants for text/background on home, subscribe, settings, privacy, not-found, error | All listed pages |

### 3.5 Medium priority — Hierarchy and semantics

| # | Action | Location / notes |
|---|--------|-------------------|
| 21 | Use `<h1>` for main heading on error and not-found; align heading levels | `src/app/error.tsx`, `src/app/not-found.tsx` |
| 22 | Define a simple type scale (e.g. page title, section title, body, caption) and apply consistently | `globals.css` or tokens, then pages |

### 3.6 Lower priority — Reduce redundancy and confirmations

| # | Action | Location / notes |
|---|--------|-------------------|
| 23 | Show "turns remaining" in one place only (e.g. ChatInput or ChatWindow, not both) | `chat-window.tsx`, `chat-input.tsx`, `chat/page.tsx` |
| 24 | Replace `window.confirm` for account delete with in-app confirmation (modal or inline) using app design language | `src/app/settings/page.tsx` |

### 3.7 Lower priority — Design system (follow-up pass)

| # | Action | Notes |
|---|--------|--------|
| 25 | Introduce a minimal token set: primary button, secondary link, error panel, loading pattern; refactor existing classes to use them | New tokens file or Tailwind theme extension |
| 26 | Add shared primitives: `Button` (primary/secondary/destructive), `Card`, optional `PageLayout` | `src/components/ui/` or similar |
| 27 | Define spacing scale (e.g. section vs block vs inline) and apply in globals or theme | `globals.css` or `tailwind.config` |
| 28 | Differentiate settings success vs error (e.g. success green, error red) instead of same `text-zinc-500` | `src/app/settings/page.tsx` |

---

## 4. Sentence case and UX writing

| # | Action | Location |
|---|--------|----------|
| 29 | Use sentence case for headings where style allows (e.g. "Consent preferences", "Your data") | Consent, privacy, settings pages |
| 30 | Keep button labels ≤ 8 words; tooltips ≤ 20 words if added | All components |

---

## 5. Verification and next steps

- **After high-priority fixes:** Run `npm run test && npm run lint`; manually test error, not-found, and chat flows; test with screen reader and keyboard.
- **After state and copy fixes:** Audit all empty/error/loading copy against "what happened + what to do next" and "purpose + one action."
- **After theme/hierarchy:** Verify dark mode on all pages; check heading outline in browser devtools.
- **Residual scope for a second pass:** Single source of truth for CTAs and error strings; full design-token set and shared components; API user-facing message contract.

---

## 6. Summary table

| Category | High | Medium | Low |
|----------|------|--------|-----|
| Tech leakage & a11y | 6 | — | — |
| Copy & CTA | 3 | — | — |
| States (empty/error/loading) | — | 7 | — |
| Styling & theme | — | 4 | — |
| Hierarchy & semantics | — | 2 | — |
| Redundancy & confirmations | — | — | 2 |
| Design system | — | — | 4 |
| UX writing (sentence case, etc.) | — | — | 2 |

**Total:** 6 high, 13 medium, 8 lower-priority / follow-up actions.
