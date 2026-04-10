# Glimpse — Mangrove Observatory: Visual Design Reference

> **Purpose**: Feed this document (or relevant sections) to Claude Code as context
> when prompting for UI improvements. Each section is self-contained with
> copy-pasteable code.

---

## 1. Conceptual Direction

**Mangrove Observatory** sits at the threshold between data and meaning —
a tidal zone where raw context gets filtered into structured insight. The
metaphor is ecological: mangrove roots stabilize shifting sediment the way
Glimpse rules stabilize noisy data. The visual language should feel like
an **instrument panel in a living system** — precise readouts embedded in
organic texture, bioluminescent signals floating in deep water.

**Tone**: Scientific-organic. Not clinical sterile, not jungle chaos.
Think: a marine biology research station at twilight.

**Differentiation**: The thing someone remembers is the _atmosphere_ —
the feeling that this dashboard is alive, breathing, that data surfaces
are slightly translucent and layered like water.

---

## 2. Color System — "Tidal Palette"

Your current font stack (DM Sans / Fraunces / JetBrains Mono) is already
strong. The color system is where most dashboards die. Here's a
complete token set designed for dark-mode observatory UIs:

```css
:root {
  /* ── Deep substrate (backgrounds) ── */
  --mangrove-abyss: #0b1215; /* deepest bg — near-black with green undertone */
  --mangrove-deep: #111d22; /* primary surface */
  --mangrove-mid: #172a30; /* cards, panels */
  --mangrove-shallow: #1e3a40; /* elevated surfaces, hover states */

  /* ── Sediment layer (borders, dividers, muted elements) ── */
  --sediment-dark: #2a3f3a; /* subtle borders */
  --sediment-mid: #3d5c52; /* active borders, outlines */
  --sediment-light: #5a7a6e; /* muted icons, secondary text */

  /* ── Bioluminescence (accent signals) ── */
  --biolum-cyan: #4ecdc4; /* primary accent — teal-cyan */
  --biolum-cyan-muted: #3a9e97; /* hover/pressed states */
  --biolum-cyan-ghost: rgba(78, 205, 196, 0.08); /* ghost fills */
  --biolum-cyan-glow: rgba(78, 205, 196, 0.25); /* glow halos */

  --biolum-amber: #f0a830; /* warning / highlight accent */
  --biolum-amber-muted: #c88a20;
  --biolum-amber-ghost: rgba(240, 168, 48, 0.08);

  --biolum-coral: #e85d5d; /* error / critical signal */
  --biolum-coral-muted: #c44040;
  --biolum-coral-ghost: rgba(232, 93, 93, 0.08);

  --biolum-violet: #a78bfa; /* info / special lens accent */
  --biolum-violet-muted: #8b6fd4;

  /* ── Canopy (text hierarchy) ── */
  --text-primary: #e8f0ec; /* high contrast — slightly warm white */
  --text-secondary: #9bb5a8; /* body copy, descriptions */
  --text-tertiary: #6b8a7d; /* timestamps, metadata, captions */
  --text-ghost: #4a6b5e; /* disabled, placeholder */

  /* ── Surface effects ── */
  --glass-fill: rgba(22, 42, 48, 0.65);
  --glass-border: rgba(78, 205, 196, 0.12);
  --glass-blur: 12px;

  /* ── Gradients ── */
  --gradient-surface: linear-gradient(145deg, #111d22 0%, #172a30 100%);
  --gradient-accent: linear-gradient(135deg, #4ecdc4 0%, #3a9e97 50%, #2d8b8b 100%);
  --gradient-warm: linear-gradient(135deg, #f0a830 0%, #e85d5d 100%);
  --gradient-depth: radial-gradient(
    ellipse at 30% 20%,
    rgba(78, 205, 196, 0.06) 0%,
    transparent 60%
  );

  /* ── Shadows ── */
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(78, 205, 196, 0.05);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(78, 205, 196, 0.06);
  --shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(78, 205, 196, 0.08);
  --shadow-glow: 0 0 20px rgba(78, 205, 196, 0.15), 0 0 60px rgba(78, 205, 196, 0.05);
}
```

### Why this works

- **Green-undertone blacks** prevent the "dead screen" look of pure `#000`.
  Every dark shade has a hint of the mangrove's submerged green.
- **Bioluminescence accents** are chromatic opposites of the substrate — cyan
  on dark teal pops _hard_ without being garish.
- **Four-step depth ladder** (`abyss → deep → mid → shallow`) gives Claude Code
  explicit elevation tokens instead of guessing opacity values.
- **Ghost fills** (8% opacity accent) are the secret to making interactive
  states feel alive without being loud.

---

## 3. Typography Usage Rules

You already have excellent fonts loaded. Here's how to _deploy_ them:

```css
/* ── Font assignments ── */
body {
  font-family: "DM Sans", sans-serif;
  font-weight: 400;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary);
  letter-spacing: 0.01em;
  -webkit-font-smoothing: antialiased;
}

/* Display / hero numbers — Fraunces brings warmth and authority */
.metric-value,
.hero-stat,
h1 {
  font-family: "Fraunces", serif;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.02em; /* tighten display text */
}

/* Section headers — DM Sans medium weight */
h2,
h3,
.panel-title {
  font-family: "DM Sans", sans-serif;
  font-weight: 500;
  color: var(--text-primary);
  letter-spacing: 0.02em;
  text-transform: uppercase;
  font-size: 11px; /* small caps feel for labels */
}

/* Code, data values, IDs — JetBrains Mono */
code,
.data-cell,
.lens-id,
.rule-tag,
.confidence-score {
  font-family: "JetBrains Mono", monospace;
  font-weight: 400;
  font-size: 12px;
  letter-spacing: 0.03em;
}

/* ── The "observatory readout" trick ── */
/* Use Fraunces for BIG numbers and JetBrains Mono for small ones */
.stat-large {
  font-family: "Fraunces", serif;
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--biolum-cyan);
  line-height: 1;
}
.stat-label {
  font-family: "JetBrains Mono", monospace;
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--text-tertiary);
  margin-top: 4px;
}
```

### Key typographic techniques

- **Negative letter-spacing on display text** (`-0.02em`) makes Fraunces
  feel tighter and more intentional at large sizes.
- **Wide letter-spacing on small labels** (`0.12em`) with `text-transform: uppercase`
  creates that instrument-panel readout aesthetic.
- **Never use DM Sans at 700 for headings** — it gets bulky. Use 500 (medium)
  for headings, save 700 only for interactive emphasis (buttons, badges).

---

## 4. Glass Surfaces & Atmospheric Layers

This is the single biggest visual upgrade. Instead of flat solid cards,
use translucent layered surfaces:

```css
/* ── Base glass panel ── */
.glass-panel {
  background: var(--glass-fill);
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  box-shadow: var(--shadow-md);
  position: relative;
  overflow: hidden;
}

/* ── Inner glow — adds the "living" feel ── */
.glass-panel::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(78, 205, 196, 0.3) 30%,
    rgba(78, 205, 196, 0.5) 50%,
    rgba(78, 205, 196, 0.3) 70%,
    transparent 100%
  );
}

/* ── Atmospheric depth layer on the page body ── */
body::before {
  content: "";
  position: fixed;
  inset: 0;
  background: var(--gradient-depth), radial-gradient(
      ellipse at 70% 80%,
      rgba(240, 168, 48, 0.03) 0%,
      transparent 50%
    ), radial-gradient(circle at 50% 50%, rgba(78, 205, 196, 0.02) 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
}
```

### Noise / grain texture overlay (adds organic life)

```css
/* Apply to a full-page overlay div or body::after */
.grain-overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  opacity: 0.035;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  background-repeat: repeat;
  background-size: 256px 256px;
}
```

---

## 5. Animations & Micro-interactions

### 5a. Staggered reveal on mount (the "surfacing" effect)

```css
@keyframes surface {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.98);
    filter: blur(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: blur(0);
  }
}

/* Apply to dashboard cards/panels */
.glass-panel {
  animation: surface 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
}

/* Stagger children */
.glass-panel:nth-child(1) {
  animation-delay: 0.05s;
}
.glass-panel:nth-child(2) {
  animation-delay: 0.12s;
}
.glass-panel:nth-child(3) {
  animation-delay: 0.19s;
}
.glass-panel:nth-child(4) {
  animation-delay: 0.26s;
}
.glass-panel:nth-child(5) {
  animation-delay: 0.33s;
}
.glass-panel:nth-child(6) {
  animation-delay: 0.4s;
}
```

In React, you can do this more cleanly:

```tsx
// Stagger utility
const stagger = (index: number, base = 50) => ({
  animationDelay: `${index * base + 50}ms`,
});

// Usage
{
  panels.map((panel, i) => (
    <div className="glass-panel surface-anim" style={stagger(i)} key={panel.id}>
      {/* ... */}
    </div>
  ));
}
```

### 5b. Pulse / breathing glow on active elements

```css
@keyframes breathe {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(78, 205, 196, 0);
  }
  50% {
    box-shadow: 0 0 16px 2px rgba(78, 205, 196, 0.2);
  }
}

.active-lens,
.live-indicator {
  animation: breathe 3s ease-in-out infinite;
}
```

### 5c. Hover lift for interactive cards

```css
.glass-panel[data-interactive] {
  transition:
    transform 0.25s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.25s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.25s ease;
  cursor: pointer;
}

.glass-panel[data-interactive]:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
  border-color: rgba(78, 205, 196, 0.25);
}

.glass-panel[data-interactive]:active {
  transform: translateY(0px) scale(0.995);
  transition-duration: 0.1s;
}
```

### 5d. Data value count-up animation (React)

```tsx
import { useState, useEffect, useRef } from "react";

function AnimatedValue({ value, duration = 800 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);

  useEffect(() => {
    const start = prevRef.current;
    const diff = value - start;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + diff * eased));
      if (progress < 1) requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
    prevRef.current = value;
  }, [value, duration]);

  return <span className="stat-large">{display}</span>;
}
```

---

## 6. Symbols & Iconographic Language

Rather than relying on a full icon library, use **unicode symbols and
small inline SVGs** for a distinctive observatory feel. Here's a curated set:

### 6a. Unicode symbols for status and category

```tsx
const SYMBOLS = {
  // ── Lens types ──
  lens: "◉", // U+25C9 — fisheye/lens
  focus: "◎", // U+25CE — bullseye
  scope: "⊙", // U+2299 — circled dot (scope/observation)

  // ── Navigation / state ──
  active: "●", // U+25CF — filled circle
  inactive: "○", // U+25CB — hollow circle
  expand: "▾", // U+25BE — small down triangle
  collapse: "▴", // U+25B4 — small up triangle
  nav: "›", // U+203A — single right angle quote

  // ── Data signals ──
  rising: "↑", // U+2191
  falling: "↓", // U+2193
  steady: "→", // U+2192
  spark: "✦", // U+2726 — four-pointed star (insight/spark)
  branch: "⑂", // U+2442 — fork (branching logic)

  // ── Confidence / strength ──
  high: "■", // U+25A0 — filled square
  medium: "◧", // U+25E7 — half-filled square
  low: "□", // U+25A1 — hollow square

  // ── Domain markers ──
  root: "⌘", // U+2318 — place of interest (root concept)
  leaf: "❧", // U+2767 — rotated floral heart (leaf/terminal)
  wave: "〰", // U+3030 — wavy dash (flow/sequence)
  gate: "⊞", // U+229E — squared plus (GATE view)

  // ── Observatory specific ──
  observe: "⊕", // U+2295 — circled plus (observation point)
  trace: "⋮", // U+22EE — vertical ellipsis (pathway)
  cluster: "⬡", // U+2B21 — hexagon (cluster/cell)
  matrix: "⊞", // U+229E — squared plus (matrix view)
  timeline: "⏤", // U+23E4 — horizontal bar (timeline)
} as const;
```

### 6b. Example usage in a badge/tag component

```tsx
function LensBadge({ lens }: { lens: { id: string; score: number; domain: string } }) {
  return (
    <span className="lens-badge">
      <span className="lens-badge-icon">{SYMBOLS.lens}</span>
      <span className="lens-badge-label">{lens.domain}</span>
      <span className="lens-badge-score">{(lens.score * 100).toFixed(0)}%</span>
    </span>
  );
}
```

```css
.lens-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--biolum-cyan);
  background: var(--biolum-cyan-ghost);
  border: 1px solid rgba(78, 205, 196, 0.15);
  border-radius: 6px;
  transition: all 0.2s ease;
}

.lens-badge:hover {
  background: rgba(78, 205, 196, 0.14);
  border-color: rgba(78, 205, 196, 0.3);
  box-shadow: 0 0 12px rgba(78, 205, 196, 0.1);
}

.lens-badge-icon {
  font-size: 8px;
  opacity: 0.7;
}

.lens-badge-score {
  color: var(--text-tertiary);
  font-size: 10px;
}
```

### 6c. Small inline SVG icons (when unicode isn't enough)

```tsx
// Reusable 16×16 SVG icon components
const WaveformIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path
      d="M1 8h2l1.5-4 2 8 2-6 1.5 4H14"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const NodeGraphIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="4" cy="4" r="1.5" fill="currentColor" opacity="0.6" />
    <circle cx="12" cy="6" r="1.5" fill="currentColor" opacity="0.6" />
    <circle cx="6" cy="12" r="1.5" fill="currentColor" opacity="0.6" />
    <circle cx="12" cy="13" r="1.5" fill="currentColor" opacity="0.4" />
    <line
      x1="5.2"
      y1="4.8"
      x2="10.8"
      y2="5.6"
      stroke="currentColor"
      strokeWidth="0.8"
      opacity="0.3"
    />
    <line
      x1="4.8"
      y1="5.2"
      x2="5.6"
      y2="10.8"
      stroke="currentColor"
      strokeWidth="0.8"
      opacity="0.3"
    />
    <line
      x1="7.2"
      y1="12.2"
      x2="10.8"
      y2="12.8"
      stroke="currentColor"
      strokeWidth="0.8"
      opacity="0.3"
    />
  </svg>
);

const PulseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="2" fill="currentColor" />
    <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="0.8" opacity="0.3" />
    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="0.5" opacity="0.15" />
  </svg>
);
```

---

## 7. Confidence Meter — Signature Component

This is the kind of bespoke component that breaks the "generic dashboard"
ceiling. A radial or bar-based confidence meter using the observatory metaphor:

```tsx
function ConfidenceMeter({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  const hue = value > 0.7 ? "cyan" : value > 0.4 ? "amber" : "coral";
  const accentVar = `var(--biolum-${hue})`;
  const ghostVar = `var(--biolum-${hue}-ghost)`;

  return (
    <div className="confidence-meter">
      <div className="confidence-track">
        <div
          className="confidence-fill"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${accentVar}33, ${accentVar})`,
            boxShadow: `0 0 12px ${accentVar}40`,
          }}
        />
        {/* Tick marks */}
        {[25, 50, 75].map((tick) => (
          <div key={tick} className="confidence-tick" style={{ left: `${tick}%` }} />
        ))}
      </div>
      <div className="confidence-readout">
        <span className="confidence-value" style={{ color: accentVar }}>
          {pct}
        </span>
        <span className="confidence-label">{label}</span>
      </div>
    </div>
  );
}
```

```css
.confidence-meter {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.confidence-track {
  position: relative;
  height: 4px;
  background: var(--sediment-dark);
  border-radius: 2px;
  overflow: visible;
}

.confidence-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.8s cubic-bezier(0.22, 1, 0.36, 1);
}

.confidence-tick {
  position: absolute;
  top: -2px;
  width: 1px;
  height: 8px;
  background: var(--sediment-mid);
  transform: translateX(-50%);
}

.confidence-readout {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.confidence-value {
  font-family: "Fraunces", serif;
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1;
}

.confidence-label {
  font-family: "JetBrains Mono", monospace;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-tertiary);
}
```

---

## 8. Layout Patterns

### 8a. Sidebar + Content with breathing room

```css
.observatory-layout {
  display: grid;
  grid-template-columns: 260px 1fr;
  grid-template-rows: 56px 1fr;
  gap: 0;
  height: 100vh;
  background: var(--mangrove-abyss);
}

.observatory-header {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  padding: 0 24px;
  background: var(--mangrove-deep);
  border-bottom: 1px solid var(--sediment-dark);
}

.observatory-sidebar {
  padding: 16px;
  background: var(--mangrove-deep);
  border-right: 1px solid var(--sediment-dark);
  overflow-y: auto;
}

.observatory-main {
  padding: 24px;
  overflow-y: auto;
  background: var(--mangrove-abyss);
}
```

### 8b. Dashboard grid with asymmetric emphasis

```css
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  grid-auto-rows: minmax(160px, auto);
  gap: 16px;
}

/* Hero metric card — spans 4 cols, feels dominant */
.card-hero {
  grid-column: span 4;
}
/* Standard card */
.card-standard {
  grid-column: span 3;
}
/* Wide panel (evidence table, timeline) */
.card-wide {
  grid-column: span 8;
}
/* Sidebar panel (lens list, rule summary) */
.card-aside {
  grid-column: span 4;
}
/* Full bleed (constellation view, flow diagram) */
.card-full {
  grid-column: 1 / -1;
}
```

---

## 9. Dynamic Techniques for "Aliveness"

### 9a. Animated gradient border (subtle, continuous)

```css
@property --border-angle {
  syntax: "<angle>";
  initial-value: 0deg;
  inherits: false;
}

@keyframes rotate-border {
  to {
    --border-angle: 360deg;
  }
}

.active-panel {
  border: 1px solid transparent;
  background:
    var(--glass-fill) padding-box,
    conic-gradient(
        from var(--border-angle),
        rgba(78, 205, 196, 0.3),
        rgba(78, 205, 196, 0.05) 40%,
        rgba(240, 168, 48, 0.15) 50%,
        rgba(78, 205, 196, 0.05) 60%,
        rgba(78, 205, 196, 0.3)
      ) border-box;
  animation: rotate-border 8s linear infinite;
  border-radius: 12px;
}
```

### 9b. Shimmer loading state

```css
@keyframes shimmer {
  from {
    background-position: -200% center;
  }
  to {
    background-position: 200% center;
  }
}

.skeleton {
  background: linear-gradient(
    90deg,
    var(--sediment-dark) 30%,
    var(--sediment-mid) 50%,
    var(--sediment-dark) 70%
  );
  background-size: 200% 100%;
  animation: shimmer 1.8s ease-in-out infinite;
  border-radius: 6px;
}
```

### 9c. Data point ripple (on new data arrival)

```css
@keyframes ripple {
  0% {
    box-shadow: 0 0 0 0 rgba(78, 205, 196, 0.3);
  }
  100% {
    box-shadow: 0 0 0 12px rgba(78, 205, 196, 0);
  }
}

.data-point-new {
  animation: ripple 0.8s ease-out;
}
```

---

## 10. Specific Component Recipes

### 10a. Rule tag with domain color coding

```tsx
const DOMAIN_COLORS: Record<string, string> = {
  botany: "#4ecdc4",
  sound: "#a78bfa",
  emotion: "#f0a830",
  narrative: "#e85d5d",
  structure: "#6bba7d",
  default: "#5a7a6e",
};

function RuleTag({ rule }: { rule: { id: string; domain: string } }) {
  const color = DOMAIN_COLORS[rule.domain] ?? DOMAIN_COLORS.default;

  return (
    <span
      className="rule-tag"
      style={
        {
          "--tag-color": color,
          "--tag-ghost": `${color}14`,
          "--tag-border": `${color}28`,
        } as React.CSSProperties
      }
    >
      <span className="rule-tag-dot" />
      {rule.id}
    </span>
  );
}
```

```css
.rule-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  color: var(--tag-color);
  background: var(--tag-ghost);
  border: 1px solid var(--tag-border);
  border-radius: 4px;
  white-space: nowrap;
}

.rule-tag-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--tag-color);
  box-shadow: 0 0 6px var(--tag-color);
}
```

### 10b. Section divider with label

```tsx
function SectionDivider({ label, symbol = "◉" }: { label: string; symbol?: string }) {
  return (
    <div className="section-divider">
      <div className="section-divider-line" />
      <span className="section-divider-label">
        <span className="section-divider-symbol">{symbol}</span>
        {label}
      </span>
      <div className="section-divider-line" />
    </div>
  );
}
```

```css
.section-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 24px 0 16px;
}

.section-divider-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    var(--sediment-dark) 20%,
    var(--sediment-dark) 80%,
    transparent
  );
}

.section-divider-label {
  font-family: "JetBrains Mono", monospace;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--text-tertiary);
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 6px;
}

.section-divider-symbol {
  color: var(--biolum-cyan);
  font-size: 8px;
}
```

---

## 11. Quick Wins Checklist

If Claude Code is stuck, feed it these one at a time:

1. **Replace all solid backgrounds** with `var(--glass-fill)` + `backdrop-filter: blur(12px)`
2. **Add the grain overlay** (Section 4) — instant organic texture
3. **Add `::before` top-edge highlights** on every card (Section 4)
4. **Switch metric numbers to Fraunces** with negative letter-spacing
5. **Add staggered entrance animations** (Section 5a)
6. **Replace generic borders** with `var(--glass-border)` (semi-transparent accent)
7. **Add hover lift** to any clickable card (Section 5c)
8. **Use the breathing glow** on the currently active view tab (Section 5b)
9. **Add the atmospheric depth gradient** on `body::before` (Section 4)
10. **Make status dots glow** — `box-shadow: 0 0 6px currentColor`

---

## 12. Prompt Templates for Claude Code

### For applying the color system:

```
Replace all hardcoded color values in the CSS/Tailwind with the CSS
custom properties from the Mangrove Observatory palette (attached).
Use the four-step depth ladder for backgrounds:
--mangrove-abyss (page bg), --mangrove-deep (sidebar/header),
--mangrove-mid (cards), --mangrove-shallow (hover/elevated).
Use --biolum-cyan as the primary accent and its ghost/glow variants
for interactive states.
```

### For component styling:

```
Restyle this component using the glass-panel pattern:
background: rgba(22,42,48,0.65), backdrop-filter: blur(12px),
border: 1px solid rgba(78,205,196,0.12), border-radius: 12px.
Add a ::before pseudo-element for the top-edge cyan highlight gradient.
Add hover: translateY(-2px) with shadow-lg transition.
Use JetBrains Mono at 11px for data values, Fraunces at 2.5rem
for hero metrics, DM Sans 500 for section labels.
```

### For animations:

```
Add entrance animations to the dashboard cards using the "surface"
keyframe: translateY(12px) → 0, opacity 0 → 1, filter blur(4px) → 0,
with cubic-bezier(0.22, 1, 0.36, 1) easing. Stagger each card by 70ms
using animation-delay.
```
