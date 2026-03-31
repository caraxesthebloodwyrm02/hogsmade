# Glimpse Sealed Access Model

## Purpose

This document defines the implementable access model for Glimpse's
exclusive quiet-steward path.

It is intentionally not a public-facing feature.

It exists to let a very small number of invited people work with Glimpse
from their own systems, through their own agents, without turning access
into a signup flow, marketplace surface, or general collaboration portal.

This model translates the doctrine from:

- `docs/glimpse-charter.md`
- `docs/glimpse-enforcement-ethic.md`
- `docs/glimpse-access-opening.md`

into a concrete private access shape.

## Non-Public Stance

The sealed access model must obey these rules:

- no public signup
- no discoverable invitation page
- no open registration
- no self-service account creation
- no public role directory
- no public API key issuance
- no marketing surface presenting this as a feature

If a stranger can casually find and request this path, the model has
already drifted.

## Design Goal

The goal is not to maximize participation.

The goal is to admit a very small number of mission-aligned quiet
stewards through a controlled path that preserves:

- privacy
- attribution
- proportional trust
- revocability
- local-first collaboration
- backstage legitimacy

## Core Entities

### Human steward

The real invited person.

Minimum fields:

- `steward_id`
- `display_handle`
- `visibility_mode`
- `contact_channel_type`
- `contact_channel_value`
- `opened_by`
- `opened_at`
- `status`

### Steward agent

The agent, client, or machine-side operator acting for that human.

Minimum fields:

- `agent_id`
- `steward_id`
- `agent_origin`
- `agent_fingerprint`
- `bound_at`
- `last_verified_at`
- `status`

### Scope grant

A named permission bundle granted to a bound steward agent.

Minimum fields:

- `grant_id`
- `steward_id`
- `agent_id`
- `scope_name`
- `mode`
- `issued_by`
- `issued_at`
- `expires_at`
- `status`

### Access event

A durable record of important access-state changes and privileged actions.

Minimum fields:

- `event_id`
- `steward_id`
- `agent_id`
- `event_type`
- `run_mode`
- `scope_name`
- `timestamp`
- `result`
- `reason`

## Canonical States

A sealed steward should move through these states:

1. `sealed_invited`
2. `sealed_anchored`
3. `sealed_agent_bound`
4. `sealed_read_only`
5. `sealed_bounded_write`
6. `sealed_active`
7. `sealed_restricted`
8. `sealed_revoked`

These names are intentionally explicit so they are not confused with any
future public or broader collaborator model.

## Opening Packet

A new steward should be created from a private opening packet.

Recommended packet fields:

```json
{
  "steward_id": "qs_<opaque_id>",
  "display_handle": "quiet-steward",
  "visibility_mode": "backstage",
  "contact_channel": {
    "type": "email",
    "value": "<private>"
  },
  "opened_by": "<human_steward_id>",
  "opening_class": "sealed",
  "default_state": "sealed_invited",
  "default_mode": "read",
  "notes": "exclusive quiet steward opening"
}
```

This packet should live in a private store, not in a public repository
surface.

## Binding Model

Trust is two-layered.

### Layer 1: human anchor

The invited person is anchored through a private contact channel.

Acceptable anchors include:

- email
- private operator-issued credential
- other non-public identifier with equivalent verification value

GitHub is optional and must not be required.

### Layer 2: agent binding

The human anchor is not enough by itself.

A specific agent must be bound to that human through stable identifying
material such as:

- agent fingerprint
- trusted origin
- signed invitation artifact
- rotating steward secret
- equivalent private proof

The system should be able to revoke the agent without erasing the human
record, and close the human opening without trusting future agents by
default.

## Scope Model

A sealed steward should not receive generic collaborator access.

Scopes should be named narrowly and granted one at a time.

Initial allowed scopes:

- `sealed:read:doctrine`
- `sealed:read:bounded-artifacts`
- `sealed:read:assigned-audit`
- `sealed:write:private-notes`
- `sealed:write:steward-feedback`
- `sealed:write:bounded-analysis`

Forbidden by default:

- any penalty or admission authority
- any destructive workflow execution
- any credential issuance
- any trust-admin action
- any broad shell access
- any unrestricted repository write
- any secret-store read

## Run Modes

Every sealed access action should declare its run mode:

- `read`
- `bounded_write`
- `review`
- `restricted`

A sealed steward should never begin in unrestricted write.

If a request does not declare a valid run mode, the system should fail
closed.

## Access Checks

Before honoring a sealed steward action, the system should verify:

1. the steward exists and is not revoked
2. the agent is bound and not revoked
3. the requested scope is active
4. the run mode is permitted for that scope
5. the request is fresh enough to trust
6. replay protection is intact
7. the action target is inside the allowed boundary

Any failed check should resolve to `deny`, not degrade into best effort.

## Request Envelope

When his agent accesses the system, each privileged request should carry
an envelope shape equivalent to:

```json
{
  "steward_id": "qs_<opaque_id>",
  "agent_id": "agent_<opaque_id>",
  "opening_class": "sealed",
  "requested_scope": "sealed:read:bounded-artifacts",
  "run_mode": "read",
  "target_surface": "glimpse-docs",
  "reason": "review assigned doctrine",
  "nonce": "<unique>",
  "timestamp": "<iso8601>",
  "proof": "<signature_or_equivalent>"
}
```

This keeps the path compatible with GATE-style validation without
pretending the steward is a public user.

## Storage Boundaries

Sealed access records should not live in public-facing application state.

Recommended storage boundaries:

- private steward registry
- private agent binding registry
- private scope grant registry
- private access event log

These stores should be:

- revocable
- auditable
- separated from public docs and public UI state
- readable only by the trust surface that needs them

## UX Boundary

There should be no normal product UI for this path.

Allowed surfaces:

- private invite artifact
- private steward dashboard or local config
- agent-readable docs and bounded control records
- trust-review surfaces for human stewards

Disallowed surfaces:

- public onboarding screens
- “request access” forms
- public profile cards
- visible collaborator counts
- broad in-app discoverability

If this path feels like a feature launch, it is the wrong shape.

## Promotion Logic

Promotion from `sealed_read_only` to `sealed_bounded_write` requires
observable evidence of:

- restraint
- mission alignment
- proportion
- careful evidence handling
- stable agent behavior
- low-ego operation
- no manipulation drift

Promotion should require an explicit human steward action.

No auto-promotion.

## Restriction Logic

The system should move a sealed steward to `sealed_restricted` when:

- the agent exceeds granted scope
- the proof material stops validating
- behavior drifts from mission alignment
- evidence handling becomes sloppy
- the opening is used by another person
- manipulation or extraction signals appear

Restriction should preserve the history needed for review.

## Revocation Logic

Revocation should be possible at both layers:

- revoke the bound agent
- revoke the steward opening entirely

Revocation effects:

- invalidate active scope grants
- deny future privileged requests
- preserve access history
- require explicit re-opening, not silent reinstatement

## Audit Requirements

Every sealed access action of consequence should record:

- steward id
- agent id
- opening class
- requested scope
- granted or denied result
- run mode
- target surface
- mutation summary, if any
- timestamp
- reviewing steward, if applicable

This is not for surveillance theater. It is for truth, proportion, and
clean recovery when something goes wrong.

## Implementation Consequences

If this model is implemented in code, the first safe iteration should be
small:

1. private steward registry
2. agent-binding registry
3. read-only envelope validation
4. bounded-write grants for notes or doctrine only
5. audit logging for sealed access events
6. explicit restriction and revocation paths

Do not start by building a general multi-user system.

## Success Test

The model succeeds when one invited quiet steward can work through his
own agent from his own environment in a way that is:

- private
- attributable
- revocable
- non-performative
- useful
- tightly scoped

The model fails when it becomes:

- publicly discoverable
- socially gamified
- easy to copy
- easy to abuse
- vague about who acted
- vague about what was allowed
