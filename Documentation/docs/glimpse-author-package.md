# Glimpse — Author Draft Production Package

> For authors who need to actively work on their drafts, play out instances,
> and generate production-ready text. The engine serves the writer's process,
> not the other way around.

---

## The single idea

An author drops a seed (a situation, a premise, a tension). The tool
helps them see what that seed *contains* — which narrative angles are
present, which structural patterns emerge, which directions the draft
can grow. Then the author forks, revises, compares, and promotes
the strongest branch to production.

The glimpse engine runs underneath, not on top. It doesn't tell the
author what to write. It shows them what's already in what they wrote.

---

## The five items, packaged as one experience

### Voice — preset as authorial stance

The 9 presets in `glimpse.master.yaml` are not data-analysis modes.
They are **voices** — ways of reading the same draft from different
angles.

| Voice | What it amplifies | When an author uses it |
|-------|-------------------|----------------------|
| Storyteller | narrative, arts, geography | Default for fiction drafts |
| Historian | history, innovation, narrative | Period pieces, research-heavy chapters |
| Educator | education, social, narrative | Explainer sections, dialogue-heavy scenes |
| Economist | economics, analytics, geography | World-building with systems |
| Scientist | biology, innovation, analytics | Hard sci-fi, technical accuracy passes |
| Technologist | technology, innovation, communication | Near-future, speculative fiction |
| Signature | botany, sound, structured_data | The tool's own interpretive lens — for when you want the engine's instinct |
| Analyst | analytics, geography, communication | Structural editing — neutral, no amplification |
| Researcher | innovation, analytics, history | Fact-checking pass, source alignment |

**In the UI:** A small voice selector in the nav. Not a dropdown with 9
items — a compact row showing the current voice name + a popover on click
with one-line descriptions. When you switch voice, the same draft seed
gets re-scored. Different angles surface. The author sees what the
Historian sees vs what the Storyteller sees, in the same content.

**Impression:** "I wrote one scene. The tool showed me three stories inside it."

---

### Grain — what the engine detects in the draft

The 16 taxonomy domains are **grain** — the texture the engine finds
in the author's words. Not analytics labels. Texture.

When an author writes "the telegram arrived at the house on the hill,
and the frequency of her visits changed after that" — the engine sees:

- **communication** (telegram)
- **geography** (house, hill)
- **sound** (frequency)
- **narrative** (arrived, changed)

This is not shown as a heatmap of 16 tiles. It's shown as **a few
colored marks in the margin of the snapshot card** — quiet, present,
not demanding attention. Like pencil marks a thoughtful reader would
leave.

When the author hovers a mark: "communication — telegram, messaging
terms detected." When they click: the full list of matched keywords,
and which voice amplifies this grain.

**Impression:** "The tool reads like a careful first reader."

---

### Direction — where the draft can go

The 7 view types are not visualization modes. They are **directions**
the draft can grow:

| View | Draft direction |
|------|----------------|
| **Flow** | The draft has a chain — cause leads to effect leads to consequence. Follow the thread. |
| **Constellation** | The draft has a web — characters, places, ideas connected in multiple directions. Map the connections. |
| **Clusters** | The draft has groupings — scenes that rhyme, characters that mirror, themes that recur. See the patterns. |
| **Timeline** | The draft has time — events in sequence, flashbacks, parallel timelines. Order the story. |
| **Explorer** | The draft has density — lots of detail, many facts. Lay it out flat and scan. |
| **Matrix** | The draft has comparisons — characters against each other, versions against versions. Compare side by side. |
| **Map** | The draft has place — locations matter, geography shapes the story. See the landscape. |

After an author forks a seed, the engine scores each direction.
The top 2-3 directions appear as **subtle suggestions below the
snapshot card** — not a ranked ribbon, not 7 options. Just:

> *This branch has strong flow. It also clusters well.*

The author decides. The engine observed.

**Impression:** "The tool doesn't tell me where to go. It tells me
where the path is already heading."

---

### Evidence — why the engine sees what it sees

The 30+ rules each have a `because` field. This is the engine
explaining its reasoning in plain language:

> "Parent-child and root-leaf patterns map naturally to tree-flow
> and cluster views."

> "Directed influence chains read best as flow."

> "Small datasets with explicit relationships are best shown as
> graphs or flows rather than dense tables."

This text was written for authors, not engineers. It's already there
in the YAML. It just needs to surface.

**When:** Only on demand. The author clicks a grain mark or a direction
suggestion and sees the `because` underneath. Never unprompted. The
evidence is there when curiosity strikes, invisible otherwise.

**Impression:** "The tool can explain itself without being asked twice."

---

### Production — from seed to draft

The Canvas is the workspace. Seeds are starting situations. Branches
are "what if" explorations. Snapshots are draft fragments.

The production flow:

```
Seed
 ├── Fork → Snapshot A  (voice: Storyteller, grain: narrative + geography)
 │                        direction: flow → "follow the thread"
 ├── Fork → Snapshot B  (voice: Historian, grain: history + innovation)
 │                        direction: timeline → "order the story"
 └── Fork → Snapshot C  (voice: Educator, grain: education + social)
                          direction: clusters → "see the patterns"
```

The author compares 2-3 snapshots (already built — the comparison tray
at the bottom). But now each snapshot carries its grain and direction
quietly. The author picks the strongest branch, revises it, forks again.

Over time, the revision scheduler (from `transport_floor`) runs in the
background. It notices patterns: "You've forked 12 times from the same
seed. Flow direction has won 9 times. The narrative grain dominates.
Your Storyteller voice is consistent."

This is the **structural outline** from the floor revision — branches
per floor, direction, appearance — but phrased as:

> *Your draft is growing as a flow. Narrative and geography are your
> strongest grains. Three branches are dormant — consider pruning or
> revisiting.*

**Impression:** "The tool remembers what I've been doing, even when
I've lost the thread."

---

## What stays, what changes

| Current | Stays | Changes |
|---------|-------|---------|
| Canvas (seeds, branches, snapshots, compare) | Yes — this is the workspace | Snapshots gain quiet grain marks + direction hints |
| Dashboard (health, timeline, experiments, focus) | Yes — operational layer | Add voice selector; health section reflects draft state not repo state |
| GATE (envelope verification, audit, nonces) | Yes — integrity layer | Rule evidence panel added (same component pattern, expand-on-demand) |
| AppShell nav (Canvas / Dashboard / GATE) | Yes — 3 tabs | Voice selector added to nav bar (compact, not a new tab) |

---

## What this is not

- Not a grammar checker
- Not an AI writer
- Not a plotting tool that prescribes structure
- Not a dashboard for engineers

It is a **reading instrument**. The author writes. The tool reads.
The author decides what that reading means.

---

## Implementation order (if proceeding)

1. **Voice selector** — preset switcher renamed and styled for authors
2. **Grain marks** — snapshot cards show domain hits as subtle margin dots
3. **Direction hints** — top 2-3 view suggestions below snapshot content
4. **Evidence on demand** — `because` text surfaces on click/hover
5. **Revision summary** — periodic structural outline in author-friendly language

Each step is additive. No step requires the previous one to be
complete. No step breaks the current Canvas experience.
