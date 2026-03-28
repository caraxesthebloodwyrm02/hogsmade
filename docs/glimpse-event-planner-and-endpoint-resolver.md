# Glimpse Event Planner and Endpoint Resolver

## Purpose

This document defines the next technical build for Glimpse in an
event-driven codebase.

The goal is to combine two needs into one coherent system:

1. a visual planner for next-step reasoning over streams, threads,
   clusters, nodes, and entities
2. a rigorous endpoint resolver that can identify where recognition,
   rewards, restrictions, or penalties should land based on evidence

This is not a generic analytics dashboard.
It is a read-heavy, evidence-first planning and resolution system.

## The Model

Treat the codebase as a living event system.

- `streams` are incoming event flows, audit flows, session flows,
  workflow flows, and runtime records
- `threads` are causality chains, lineage chains, handoffs, and traces
- `nodes` are entities, files, tools, routes, endpoints, actors, and
  evidence artifacts
- `clusters` are subsystem families, repo surfaces, or repeated zones of
  relevance
- `endpoints` are the concrete places where consequence or recognition
  can be applied

The planner answers:
`what is happening, where is it concentrating, and what should happen next`

The resolver answers:
`who or what is the right endpoint for recognition, restriction, or review`

## What Already Exists

The workspace already has most of the substrate.

### Visualization surfaces

- `glimpse-artifact/src/views/TopologyView.tsx`
  Existing MCP graph and ecosystem health surface.
- `glimpse-artifact/src/views/ContextSearchView.tsx`
  Existing graph, cluster, heatmap, artifact, and interview surface.
- `glimpse-artifact/src/views/EvolutionCycleView.tsx`
  Existing operational control room with beats, momentum, gate state,
  endpoint matrix, handoffs, and timeline.
- `glimpse-engine/view-specs.js`
  Existing constellation, clusters, matrix, flow, timeline, and map
  renderers.

### Analysis and questioning surfaces

- `glimpse-artifact/server/context-search.ts`
  Already implements deterministic keywording, vocabulary validation,
  evidence search, node transfer, cluster visibility, heatmap synthesis,
  artifacts, and an interview transcript.
- `glimpse-server/src/server.ts`
  Already exposes `glimpse_session`, `glimpse_track`, and `glimpse_paths`
  for event/session analysis and weighted path scoring.

### Graph and trace primitives

- `GRID-main/src/grid/mcp/intelligence_server.py`
  Already exposes `query_knowledge`, `get_entity_neighborhood`,
  `query_traces`, `get_trace_lineage`, and `record_trace`.
- `GRID-main/src/grid/knowledge/graph_store.py`
  Already supports graph storage, semantic search, and path-finding.

### Consequence and validation primitives

- `GRID-main/src/application/mothership/middleware/admission_gate.py`
  Already contains entity attribution, violation recording, budgets,
  and bannering logic.
- `GRID-main/src/grid/resilience/data_corruption_penalty.py`
  Already contains endpoint penalty scoring and endpoint health.
- `GRID-main/src/grid/resilience/accountability/`
  Already contains request/response validation, scoring, and contract
  enforcement.
- `eligibility-server/`
  Already contains weighted evaluation, condition notes, observation
  notes, reusable forms, and collection tables.

## Core Design Decision

Do not build two separate tools.

Build one integrated system with two linked modes:

1. `Planner mode`
   Visualizes streams, threads, entities, clusters, handoffs, and likely
   next moves.

2. `Resolver mode`
   Starts with a basic prompt-level pass, identifies ambiguity, asks the
   user focused or random sharpening questions, and converges toward a
   ranked endpoint list.

The planner and resolver should share the same evidence graph.

## Product Shape

### Primary UI home

The best primary surface is `EvolutionCycleView`.

Reason:
it already understands next-step thinking, endpoint readiness, handoffs,
timeline, and operational progression.

### Secondary UI home

The best secondary surface is `ContextSearchView`.

Reason:
it already has the staged interview model, graph panel, heatmap, cluster
visibility, and artifact packaging that your resolver needs.

### Engine posture

The Glimpse engine remains the analysis and rendering substrate.
It should not become the only planner UX.

### Trust posture

The GRID intelligence server is the best place for read-heavy endpoint
resolution tools because it already composes knowledge graph search,
neighborhood expansion, trace querying, and lineage lookup.

## Proposed System

Name the combined capability:

`Glimpse Resolution Workbench`

It has four layers.

### Layer 1: Event ingestion

Input sources:

- audit events
- workflow runs
- handoffs
- knowledge graph entities and relations
- traces and lineage chains
- corruption or admission signals
- user prompt and optional context

This layer normalizes all input into one analysis bundle.

### Layer 2: Evidence graph synthesis

This layer builds a runtime graph of:

- actors
- events
- endpoints
- traces
- route/tool surfaces
- clusters
- confidence gaps

This is where stream slices and thread lineages become visible as one
graph.

### Layer 3: Endpoint candidate scoring

This layer produces ranked candidate endpoints for:

- recognition delivery
- reward routing
- review routing
- restriction routing
- penalty recommendation

Important:
the first version should recommend, not directly execute, consequence.

This layer must combine:

- graph centrality or proximity
- trace lineage support
- repeated pattern evidence
- cluster concentration
- endpoint health or contract status
- eligibility-style weighted evaluation
- confidence and gap reporting

### Layer 4: Question-driven sharpening

This layer runs only when ambiguity is still material.

It should generate:

- focused questions when the uncertainty is narrow
- random but bounded questions when the system needs displacement to
  expose a hidden angle
- tailored follow-ups based on missing evidence, weak asymmetry, or
  competing candidate endpoints

After each answer, the resolver reruns scoring and updates the graph,
heatmap, and ranked endpoints.

## Why This Fits the Current Codebase

The existing `context-search.ts` runtime is already a strong template.

It already does:

- deterministic grounding
- keyword bundle creation
- node transfer
- cluster visibility
- heatmap generation
- interview speakers
- artifact packaging

What it does not yet do is operate over runtime events, traces,
knowledge-graph entities, and endpoint contracts.

So the clean move is:

- keep the staged workflow shape
- change the indexed corpus from repo files only to runtime evidence plus
  repo/runtime mixed evidence
- replace simple “top file/cluster” output with ranked endpoint
  candidates and rationale

## New Capability Boundaries

### New read-heavy MCP tool

Add a new tool to:

- `GRID-main/src/grid/mcp/intelligence_server.py`

Recommended tool name:
`resolve_endpoints`

It should:

- accept prompt, context, and mode (`recognition`, `reward`, `review`,
  `restriction`, `penalty`)
- query knowledge graph entities
- expand entity neighborhood
- query traces in a bounded window
- optionally resolve lineage
- return ranked endpoint candidates, confidence, gaps, and recommended
  questions

This tool should not mutate penalty or reward state in v1.

### New planner adapter

Add a runtime adapter that:

- calls `glimpse_session` or `glimpse_track` on normalized event records
- calls `glimpse_paths` to rank likely path outcomes
- merges the result with graph and endpoint candidates

This adapter can live in `glimpse-artifact/server/` first so the UI can
iterate fast.

### New UI view

Add a new view to `glimpse-artifact/src/views/`:

Recommended name:
`ResolutionWorkbenchView.tsx`

It should include:

- stream/thread overview
- constellation or flow graph
- cluster visibility panel
- ranked endpoint candidates
- confidence and gap panel
- focused question queue
- evidence transcript
- recommended next steps

## Suggested UI Layout

### Left column

- active query or case
- question queue
- current ambiguity summary
- mode selector:
  `recognition | reward | review | restriction | penalty`

### Center column

- graph view
- switchable renderers:
  `constellation | flow | clusters | timeline`

### Right column

- ranked endpoints
- confidence summary
- evidence checklist
- recommended next actions

### Bottom strip

- transcript of user answers
- recalculation history
- shift in candidate ranking over time

## Endpoint Types

The resolver should be able to rank at least these endpoint types:

- MCP tool
- HTTP route
- workflow step
- actor entity
- repo surface
- file/module surface
- contract-managed endpoint
- corruption-monitored endpoint
- admission-tracked entity

The output should identify both:

- the endpoint object
- the justification path that led there

## Recognition and Penalty Must Share One Standard

Do not build one sloppy standard for recognition and another for
punishment.

Use the same resolution standard for both:

- evidence
- pattern
- asymmetry
- confidence
- traceability
- proportion

The difference should be in response policy, not in evidence quality.

That matters because the system is meant to recognize people who are easy
to miss, not only actors who are easy to blame.

## Safety Boundary

This system should not become a revenge engine.

Its job is to expose extraction, route recognition, recommend
proportionate consequence, and preserve traceability.

It should not:

- auto-punish from intuition alone
- allow direct retaliatory action from weak evidence
- confuse emotional certainty with a resolved endpoint
- grant unrestricted enforcement powers to the first resolver pass

V1 should stay advisory with durable evidence.

## Smallest Coherent V1

Build the smallest version that is still real:

1. new read-heavy MCP tool in `intelligence_server.py`
2. mixed evidence bundle:
   graph entities + traces + optional repo evidence
3. ranked endpoint candidates with confidence and gaps
4. question queue generator for ambiguity reduction
5. new `ResolutionWorkbenchView` in `glimpse-artifact`
6. no direct reward or penalty execution

This is enough to prove the shape without overcommitting to automation.

## Validation Strategy

This system must be both data-driven and test-driven.

### Unit tests

- endpoint ranking given fixed traces and graph
- question generation given known gaps
- confidence degradation when evidence weakens
- mode separation across recognition/reward/review/restriction/penalty

### Fixture tests

Use synthetic cases for:

- hidden contributor recognition
- attribution drift
- structured extraction
- route corruption
- false-positive penalty pressure
- ambiguous actor identity
- missing trace lineage

### Replay tests

Feed recorded audit and trace data back through the resolver and verify:

- stable endpoint ranking
- explainable changes after new answers
- no consequence recommendation when evidence falls below threshold

### UI tests

Verify:

- graph and ranking update after answer submission
- question queue changes with confidence gaps
- mode switch does not leak forbidden actions
- evidence references remain visible

## Recommended Build Order

1. define resolver result schema
2. add `resolve_endpoints` tool in GRID intelligence server
3. build synthetic fixtures and ranking tests
4. adapt `context-search.ts` staged workflow to runtime evidence
5. build `ResolutionWorkbenchView`
6. connect to `EvolutionCycleView` as a planning entrypoint
7. only after stability, consider bounded consequence handoff

## Result

If built this way, you get one system that can:

- visualize event-driven reality as streams, threads, nodes, and clusters
- plan next moves in an operationally meaningful way
- iteratively question the user to sharpen endpoint resolution
- recognize hidden contributors with the same rigor used for penalties
- stay evidence-first instead of becoming theater

That is the right next step for this codebase.
