# Glimpse Access Opening

## Purpose

This document defines the first disciplined access path for a quiet
steward whose agent will access Glimpse on his behalf.

It is not a public onboarding flow. It is a private, invitation-based
opening for someone whose value is real, whose visibility is intentionally
low, and whose participation should be attributable without being forced
into a spotlight.

This opening is designed to fit the Glimpse Charter and the Glimpse
Enforcement Ethic. It assumes:

- no mandatory GitHub identity
- a valid email or equivalent private contact channel
- agent-mediated access from the steward's own system
- local-first or private-system interoperability
- least-privilege by default
- traceable actions without public exposure

## Opening Principles

### Invitation, not discoverability

This path should not be searchable, public, or mass-available.

Access begins because an existing human steward opens it.

### Identity without spectacle

A quiet steward should be able to exist in the system without building
a public profile, chasing visible contribution metrics, or attaching his
worth to platform theater.

### Agent first, human anchored

His agent may do the operating, but the trust anchor is still a human
steward identity.

The system should always be able to answer:

- which human was invited
- which private contact channel anchors that identity
- which agent is acting on that human's behalf
- what scope that agent currently holds

### Read before write

The opening starts in read mode.

Write access is earned only after the system has enough evidence that
the steward and his agent act with restraint, care, rigor, and mission
alignment.

### Backstage is valid

The system should treat behind-the-curtain contribution as first-class.

Someone does not need public visibility to be real, trusted, or central.

## Who This Opening Is For

This path is for a quiet steward who:

- prefers subtle systems over public attention
- may not use GitHub or public developer platforms
- is trusted by invitation, not by follower count
- is likely to contribute from his own machine through an agent surface
- should be able to help shape the system without being dragged into
  unnecessary exposure

## Opening Record

The system should create a private opening record with fields equivalent
to these:

```json
{
  "steward_id": "qs_<opaque_id>",
  "status": "invited",
  "visibility": "backstage",
  "contact_channel": {
    "type": "email",
    "value": "<private>"
  },
  "human_anchor": true,
  "agent_id": null,
  "default_mode": "read",
  "scope": [],
  "opened_by": "<human_steward_id>",
  "opened_at": "<timestamp>",
  "notes": "quiet steward access opening"
}
```

The important part is not the exact shape. The important part is that
the opening remains private, attributable, revocable, and scoped.

## Access States

The opening should move through these states:

1. `invited`
   The steward exists in the system, but no agent is trusted yet.

2. `anchored`
   The private contact channel has been verified and attached to the
   steward identity.

3. `agent-bound`
   A specific agent identity is attached to the steward.

4. `read-probation`
   The agent can read allowed surfaces and produce traceable observations,
   but cannot mutate trust-critical state.

5. `bounded-write`
   The agent may write only within explicitly granted scopes.

6. `steward-active`
   The steward has proven stable enough for ongoing backstage work.

7. `restricted`
   Access remains valid in principle, but scope is reduced because of
   drift, uncertainty, or risk.

8. `revoked`
   Trust is broken or the opening is intentionally closed.

## Agent Binding

Because his agent will likely be the operator, the system should bind
trust at two layers:

- `human layer`: the quiet steward identity anchored by private contact
- `agent layer`: the concrete agent or client acting in the system

One without the other is not enough.

The system should store, or be able to derive, these minimum facts:

- `steward_id`
- `agent_id`
- `agent_origin`
- `last_verified_at`
- `current_scope`
- `run_mode`
- `revocation_status`

## Default Scope

A new quiet steward opening should begin with the smallest useful scope.

Recommended default scope:

- read Glimpse doctrine and reference docs
- read non-sensitive Glimpse outputs
- query bounded audit or provenance relevant to assigned work
- propose notes, drafts, or observations
- no trust-critical writes
- no admission or penalty actions
- no destructive workflow execution
- no secret material by default

This makes the opening real without making it dangerous.

## Promotion Path

Promotion should be behavioral, not ceremonial.

A quiet steward moves from `read-probation` to `bounded-write` only when
there is enough evidence of:

- mission alignment
- proportional reasoning
- respect for evidence
- low-ego operation
- careful handling of ambiguity
- no appetite for covert manipulation
- no drift toward profit-first extraction

Promotion evidence should come from actual system behavior, not from
self-description alone.

## Bounded Write

If write access is granted, it should be narrow and named.

Examples:

- `write:glimpse-docs`
- `write:private-notes`
- `write:bounded-analysis`
- `write:steward-feedback`

Write scopes should be:

- explicit
- time-bounded when appropriate
- revocable
- auditable
- separated from penalty or trust-administration powers

## GATE and Trust Integration

When this opening is implemented, agent-mediated access should fit the
existing trust vocabulary instead of bypassing it.

That means future requests should be able to carry equivalents of:

- `steward_id`
- `agent_id`
- `source_partition` or trusted origin
- `requested_scope`
- `run_mode`
- `reason`
- `nonce` or replay protection
- `timestamp`

The system should be able to tell the difference between:

- a trusted quiet steward agent acting within scope
- an unknown agent using a copied credential
- a known steward agent acting outside its granted scope

## Local-First Posture

Because the steward may work from his own system, the access opening
should assume local-first collaboration.

That means:

- his agent should not need broad shell access to your machine by default
- private exchange should happen through scoped artifacts, envelopes, or
  equivalent bounded channels
- trust should survive across machines without becoming public
- the opening should work even if public platforms are absent

## Audit and Dignity

Every action taken through this opening should be attributable, but not
performative.

The system should preserve:

- who acted
- through which agent
- with what scope
- against which artifact or surface
- under which run mode
- with what resulting mutation, if any

Attribution should serve truth and recovery, not social spectacle.

## Restriction and Revocation

Restriction should happen when:

- the agent drifts outside granted scope
- trust signals degrade
- evidence handling becomes sloppy
- the opening is being used as a proxy for someone else
- manipulation, extraction, or coercive behavior appears

Revocation should be durable, auditable, and not dependent on public
platform bans or account theatrics.

## Human Steward Responsibility

The person who opens this access path carries responsibility too.

Opening an access path means:

- vouching carefully, not casually
- reviewing promotion evidence before expanding scope
- keeping the opening aligned with mission rather than sentiment
- closing it cleanly if trust is broken

Invitation is not decoration. It is an act of stewardship.

## Success Test

This opening is successful when a quiet steward can work meaningfully on
the system from his own environment, through his own agent, without
needing public platform theater, while the system still preserves
attribution, proportion, and revocable trust.

If the only way in is public visibility, the opening has failed.

If the opening becomes a loophole around trust, the opening has failed.
