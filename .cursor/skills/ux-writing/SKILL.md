---
name: ux-writing
description: Guides UI text across Glimpse components — labels, microcopy, tooltips, empty states, error messages. Use when writing or editing any user-facing string in a component, view, or dialog.
---

# UX writing — Glimpse

Standards for every user-facing string in the Glimpse artifact. Glimpse is a scenario-exploration tool for authors and creative workers; the copy must feel like a notebook, not a dashboard.

## Voice

| Attribute | Means | Does not mean |
|-----------|-------|---------------|
| Plain | Short sentences, common words, no jargon | Dumbed-down or patronizing |
| Calm | No urgency language, no exclamation marks | Passive or vague |
| Spatial | Uses real-world metaphors (canvas, shelf, branch, seed) | Skeuomorphic decoration |

## Rules

1. **≤ 8 words** for button labels and menu items.
2. **≤ 20 words** for tooltips and inline help.
3. **Sentence case** everywhere — never Title Case or ALL CAPS (except acronyms like GATE).
4. **Active voice, present tense.** "Fork this branch" not "This branch will be forked."
5. **No tech leakage.** Never surface IDs, status codes, or internal names. Say "Something went wrong — try again" not "Error 500."
6. **Metaphor-consistent.** Use the project's vocabulary:

   | Concept | Use | Avoid |
   |---------|-----|-------|
   | Starting point | seed | node, item, entry |
   | Variation | branch | fork (noun), version |
   | Snapshot of a branch | glimpse | snapshot, preview |
   | Work surface | canvas | board, workspace |
   | Annotation | note | comment, sticky |
   | Pipeline view | GATE | pipeline, flow |

7. **Empty states** must include: what this area is for + one action to populate it.
   - Good: "No branches yet. Fork a seed to start exploring."
   - Bad: "Nothing to display."
8. **Error messages** must include: what happened + what to do next.
   - Good: "Couldn't load health data. Check your connection and refresh."
   - Bad: "Network error."
9. **Destructive actions** require a verb that names the consequence: "Delete this note" not "Are you sure?"
10. **Accessibility.** Every icon button needs an `aria-label` that describes the action, not the icon. "Add a note" not "Sticky icon."

## Anti-patterns

- "Click here" — never. Name the destination or action.
- "Please" in UI chrome — save politeness for error recovery.
- Loading spinners without context — always say what's loading: "Loading audit timeline…"
- Confirmation dialogs that just say "OK / Cancel" — label buttons with verbs.

## Checklist (before merging any component)

- [ ] All visible strings use sentence case
- [ ] Buttons and menu items ≤ 8 words
- [ ] Tooltips ≤ 20 words
- [ ] Empty states have purpose + action
- [ ] Error messages have what + next step
- [ ] Icon buttons have descriptive `aria-label`
- [ ] Vocabulary matches the metaphor table above
