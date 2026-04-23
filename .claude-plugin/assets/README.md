# Design tokens — hogsmade-notebook

Source: `~/design/hogsmade/Hogsmade Cockpit.html` (1395 lines, the canonical design reference).

## What each token is for

| Token         | Intended use                                                     | What it is NOT for    |
| ------------- | ---------------------------------------------------------------- | --------------------- |
| `--bg`        | Page/app background                                              | Text, icons, cards    |
| `--panel`     | Card and sidebar backgrounds                                     | Hover states          |
| `--panel-2`   | Hover and selected state backgrounds                             | Borders               |
| `--line`      | Dividers, card borders                                           | Text                  |
| `--line-2`    | Focused/highlighted borders                                      | Text                  |
| `--ink`       | Primary text, headings, active labels                            | Borders               |
| `--ink-dim`   | Secondary text, metadata, counts                                 | Borders               |
| `--ink-faint` | Tertiary text, section labels, timestamps                        | Primary content       |
| `--accent`    | Interactive focus, brand mark, selected state, sidebar indicator | Body text             |
| `--accent-2`  | Secondary interactive accent (amber)                             | Body text             |
| `--ok`        | Positive status indicators, confirmation badges                  | Warning/error signals |
| `--warn`      | Warning indicators                                               | Success signals       |
| `--bad`       | Error and failure indicators                                     | Warning signals       |

## Rules for contributors

**No new root tokens in v0.1.0.** If a surface needs a color not covered here, compose with `color-mix(in oklch, var(--token) N%, var(--other))`. New tokens require a v0.2.0 CHANGELOG entry.

**No hardcoded hex or named colors** in any file that imports `tokens.css`. Every color resolves through a token.

**No alternate fonts.** Production UI uses `--sans` (Inter) and `--mono` (JetBrains Mono) only. `--sketchy` (Caveat) is for wireframe artifacts only — never import it in production HTML.

**No ornamental gradients.** The `box-shadow: 0 0 10px var(--accent)` glow on `.brand-dot` is the only sanctioned glow. Replicate it, don't extend it.

**No animation beyond `@keyframes pulse`.** The pulse on `.run-status` dots (capped at `var(--ok)`) is the only sanctioned animation.

**Tinted borders via color-mix** are preferred over hardcoded border colors: `color-mix(in oklch, var(--ok) 40%, var(--line))`.

## Text hierarchy convention

Three-tier ink for readable information density:

- **Section labels / metadata keys:** `--ink-faint`, 9–11px, uppercase, `letter-spacing: 0.10–0.12em`
- **Secondary content / counts / timestamps:** `--ink-dim`, 11–12px, normal case
- **Primary content / titles / values:** `--ink`, 12–14px, font-weight 500–600

## Consuming tokens.css

```html
<link rel="stylesheet" href="tokens.css" />
```

Then apply `data-theme="dark"` (default) or `data-theme="light"` on `<html>`. Optionally `data-density="compact"|"normal"|"roomy"`.

Do not copy token values inline. If `tokens.css` changes, all surfaces update automatically.
