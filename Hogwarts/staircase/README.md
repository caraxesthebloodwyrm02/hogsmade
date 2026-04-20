# Staircase

The staircase is the school's **foundational routing primitive**. Before rules,
before calendar, before houses, before curriculum — this is how an agent moves
through the school.

It answers one question, for an agent standing somewhere:

> _Where can I go from here, right now, and why?_

## The Three Objects

### Floor

A **domain territory** that holds material of a single kind. Floors are
declared in `floors.yaml`. Each floor has:

- `id` — stable identifier (used by staircases to reference it)
- `name` — human-readable label
- `path` — disk location of the territory
- `kind` — what the floor holds (`lens`, `track`, `profile`, `governance`,
  `library`, `canon`, `surface`)
- `summary` — one line on what an agent finds there

Floors are **not** defined by depth or engagement stage. They are defined by
_subject matter_. An agent on the `patterns` floor is among the pattern lenses;
an agent on the `library` floor is among Documentation.

### Staircase

An **edge primitive** that connects one floor to a set of _possible_ landings.
Staircases are declared in `staircases.yaml`. Each staircase has:

- `id` — stable identifier
- `description` — what this connection is _for_
- `from` — the floor the staircase departs from
- `to` — the set of floors the staircase _can_ land on (the possible landings)
- `rotation_inputs` — which rotation inputs determine which landing is active
  (`engagement`, `signals`, or both)

A staircase does not commit to a single destination. It commits to a **set of
lawful destinations**. The rotation layer (next pass) selects the active one.

### Landing

The active destination of a staircase at a given moment. A landing is
**computed**, not declared — it is the output of the rotation function given
the current engagement state and workspace signals. At the foundation pass,
no rotation function exists yet, so landings are undefined and every staircase
behaves as if all its possible destinations are simultaneously reachable.

## Rotation Inputs (declared, not yet defined)

Two input kinds will drive rotation. Their enumerations live in the next pass.

- **engagement** — the agent's current engagement state with material
  (e.g. what they just consulted, what they are probing, what they are
  holding open). Not time-keyed. Not profile-keyed.
- **signals** — discrete events emitted by the contrasting workspace side
  (active construction zone, uncommitted artifact, open gate, etc.).

Rotation is explicitly **not** time-keyed at foundation. Term calendars,
weekly cycles, and dispatch cadence layer on top of this primitive later; they
do not belong inside it.

## Chaining

A traversal is a sequence of staircase hops: `floor → staircase → landing →
staircase → landing → …`. Chaining is how an agent explores a non-obvious path
across domain territories. Chained paths are logged in `traversals/` (to be
created when rotation is defined) and feed recommendations in later passes.

## What Is Intentionally Undefined At Foundation

- No houses, heads of house, prefects, or any role assignments.
- No terms, weeks, days, or cadence.
- No graduation paths into the workspace (rules of conduct now defined in school.code).
- No recommendation algorithm — only the declaration that recommendations will
  ride on chained traversals.
- No executable code — only declarative YAML artifacts. Agents read this
  directly; no engine is required to interpret the foundation.

These are the next layers. They all hang from the staircase. The staircase
hangs from nothing — it is the ground.

## Sibling Zones

- `@/home/irfankabir/workspace/CascadeProjects/Hogwarts/governors/` — a floor
  (governance material) referenced by staircases but owned separately.
- `@/home/irfankabir/workspace/CascadeProjects/Hogwarts/board/` — a UI surface
  that may later visualize this primitive; not a floor.
- `@/home/irfankabir/workspace/CascadeProjects/Hogwarts/nuke/` — a UI surface;
  not a floor.
- `@/home/irfankabir/workspace/CascadeProjects/Hogwarts/hyperspace/` — reserved
  as the transit medium in which rotation happens; role formalized when
  rotation lands.
- `@/home/irfankabir/workspace/racks/` — the practice yard; most floors live
  here. Staircases reference it by path.
- `@/home/irfankabir/workspace/CascadeProjects/Documentation/` — the library
  floor.
