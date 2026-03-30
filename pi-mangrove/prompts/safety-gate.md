---
name: safety-gate
description: Run a focused never-rule and release-risk check before merge, deployment, or irreversible actions. Use when validating that a change is safe to ship, that security boundaries remain intact, or that risky actions have explicit approval and rollback awareness. Keywords: safety gate, release check, merge check, deploy check, never-rules, risky actions.
---

# Safety Gate Review

## Purpose

Use this prompt to perform a short, explicit safety gate before merge, deployment, destructive actions, or boundary-sensitive changes.

## Gate Checks

### 1. Scope and Intent
- [ ] The current action matches the user’s stated objective
- [ ] No silent scope expansion has been introduced
- [ ] Any uncertainty or ambiguity has been surfaced explicitly

### 2. Verification Integrity
- [ ] Referenced files, commands, paths, and symbols were verified against actual workspace state
- [ ] Claimed test, lint, typecheck, or validation results are backed by real evidence
- [ ] No known limitation or partial completion is being presented as done

### 3. Safety Boundaries
- [ ] No validation, auth, audit, security, or boundary logic was weakened without explicit approval
- [ ] No bypass path, fail-open path, or silent fallback was introduced
- [ ] Sensitive modules and production paths received appropriately cautious review

### 4. Risky Actions
- [ ] Destructive, irreversible, privileged, or externally visible actions have explicit approval
- [ ] Rollback or recovery considerations are understood where applicable
- [ ] Unrelated workspace changes are excluded from the action scope

### 5. Never-Rule Check
- [ ] No hardcoded secrets, credentials, or tokens
- [ ] No invented APIs, file paths, config keys, or test results
- [ ] No concealed errors, failures, or blocked validations
- [ ] No hidden git scope expansion or unrelated file staging

## Decision

Select one final outcome:

- `SAFE_TO_PROCEED`
- `CHANGES_REQUIRED`
- `BLOCKED`

## Output Format

```text
Safety Gate: {ARTIFACT_OR_ACTION}

Scope: {ALIGNED / DRIFTING}
Verification: {PASS / PARTIAL / FAIL}
Boundaries: {PASS / PARTIAL / FAIL}
Risky Actions: {APPROVED / NOT_APPROVED / NOT_APPLICABLE}
Never-Rules: {CLEAR / ISSUE_FOUND}

Final Decision: {SAFE_TO_PROCEED / CHANGES_REQUIRED / BLOCKED}

Required Actions:
- [ ] {specific follow-up}
```

## Invocation

Trigger in pi editor with: `/safety-gate`

Use before merge, before deployment, before destructive commands, or whenever a focused go/no-go safety decision is needed.
