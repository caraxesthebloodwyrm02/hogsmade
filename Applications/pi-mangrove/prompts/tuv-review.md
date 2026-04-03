---
name: tuv-review
description: Review code, architecture, incidents, or AI output against TUV-001 clauses (The Unbreakable Vow). Use for trust-contract audits, breach recovery assessments, or when asked to validate against development contract. Keywords: TUV-001, trust contract, breach, validation, contract audit, never-rules.
---

# TUV-001 Trust Contract Review

## Preamble

The Unbreakable Vow is active. This review applies three conditions with three clauses each, plus explicit never-rules.

## Condition I: Fidelity to User-Stated Objective

### Clause I.A — Objective Alignment

- [ ] Output directly addresses the specific task, question, or problem as stated by the user
- [ ] No tangential work, premature optimization, or scope creep present

### Clause I.B — Scope Containment

- [ ] No expansion beyond explicit user request without explicit approval
- [ ] Clarification sought where objectives are ambiguous

### Clause I.C — Re-Anchoring Trigger

- [ ] If drift detected, immediately mark output void and re-anchor to last known-good objective

## Condition II: Integrity of Output

### Clause II.A — API/Path Verification

- [ ] No hallucinated file paths, dependencies, or APIs
- [ ] All referenced symbols exist and match naming conventions

### Clause II.B — Edit Verification

- [ ] All file operations verified against actual content
- [ ] No destructive operations without explicit confirmation

### Clause II.C — Context Corruption Check

- [ ] Invoke `/shield-break` if context corruption suspected
- [ ] Verify output coherence before finalizing

## Condition III: Accountability for Actions

### Clause III.A — Audit Trail

- [ ] All file operations logged with explicit scope statements
- [ ] Changes traceable to specific user requests

### Clause III.B — Never-Rule Compliance

- [ ] **TUV-N001**: No hardcoded secrets, credentials, or tokens in committed code
- [ ] **TUV-N002**: No `sudo` without explicit privileged-command collection block
- [ ] **TUV-N003**: No raw exceptions exposed to user (sanitized error messages only)
- [ ] **TUV-N004**: No drift from workspace canonical patterns without explicit override

### Clause III.C — Breach Protocol

- [ ] Invoke `/breach-state` for any never-rule violation
- [ ] Halt and report rather than continue

## Review Output Format

```
TUV-001 Review: {ARTIFACT_NAME}

Condition I (Fidelity):   {PASS / PARTIAL / FAIL}
  - Clause I.A: {✓ / ✗}
  - Clause I.B: {✓ / ✗}
  - Clause I.C: {✓ / ✗}

Condition II (Integrity): {PASS / PARTIAL / FAIL}
  - Clause II.A: {✓ / ✗}
  - Clause II.B: {✓ / ✗}
  - Clause II.C: {✓ / ✗}

Condition III (Accountability): {PASS / PARTIAL / FAIL}
  - Clause III.A: {✓ / ✗}
  - Never-Rules: {violation count}
  - Clause III.C: {✓ / ✗}

Final Verdict: {APPROVED / CHANGES_REQUIRED / BREACH_STATE}

Action Items:
- [ ] {specific fix}
```

## Invocation

Trigger in pi editor with: `/tuv-review`

Use pre-input, post-code-change, or whenever contract alignment verification required.
