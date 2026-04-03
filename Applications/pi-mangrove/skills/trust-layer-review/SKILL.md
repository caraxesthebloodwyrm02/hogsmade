---
name: trust-layer-review
description: "Senior code review with Trust Layer and safety-first audit. Checks for perpetrator voice, PII leakage, prompt injection, triadic safeguarding, citation honesty, regional sensitivity (Bangladesh Digital Safety Act), and grammar-centric safety standards. Use for safety-critical systems, AI/LLM integration, content moderation, user-facing safety features, GRID framework code, or when requested security review, safety audit, trust review, or production readiness review. Keywords: safety audit, trust layer, code review, security, PII, prompt injection, perpetrator voice, regional compliance."
---

# Trust Layer Review — Safety-First Code Audit

## When to Use

- Code involves safety-critical systems, AI/LLM integration, or content moderation
- User-facing safety features or safety boundary enforcement
- GRID framework code or production readiness review requested
- Reviewing code handling user content, AI outputs, or sensitive data
- Explicit request for "security review", "safety audit", or "trust review"

## Review Order

Safety and integrity take priority over feature correctness. A working feature that leaks PII or enables injection is worse than a non-working feature.

## Priority 1: Safety & Integrity

### Perpetrator Voice Check

- Safety messages, error logs, and moderation outputs must avoid 1st/2nd person pronouns assigning agency to harmful actions
- **Bad:** "You violated the policy"
- **Good:** "A policy violation was detected"

### Pronominal Targeting

- Eliminate "who" vectors — language assigning human agency to harmful system actions
- Use passive voice or abstract nouns for safety communications

### Nominalization

- Convert harmful actions to abstract nouns: "The system blocked the attack" → "Attack mitigation was applied"

### Content Provenance

- AI-generated outputs and moderation decisions must include watermarks, metadata, or provenance markers
- Users must be able to verify origin of AI-generated content

### Active Refusal

- Refusal mechanisms must halt processing, not just log warnings
- Verify malicious requests trigger actual blocks, not soft failures

### Regional Sensitivity

- Bangladesh deployments: verify Digital Safety Act compliance
- Other regions: respect local legal frameworks for content moderation

## Priority 2: Technical Security

### Prompt Injection

- Sanitize or constrain user input passed to LLMs
- Check for: direct user text in system prompts, user-controlled template variables, unescaped user content in prompt construction

### PII Handling

- Verify no plaintext logging of emails, phone numbers, IDs, or personal identifiers
- Check retention policies match declared data lifecycle

### Authentication Boundaries

- Verify session validation on all protected endpoints
- Check authorization matches ownership, not just authentication

## Output Format

Report findings by priority level:

```
Priority 1 (Safety): {count} issues
- [File:line] Issue description → Recommended fix

Priority 2 (Technical): {count} issues
- [File:line] Issue description → Recommended fix

Trust Layer Verdict: {PASS / CONDITIONAL / FAIL}
```

## Hard Constraints

- Never approve code with active perpetrator voice in safety paths
- Never treat session presence as authorization for sensitive resources
- Never accept partially implemented refusal mechanisms
- Never skip regional compliance checks for deployed code
- Do not prioritize feature completeness over safety boundary integrity

## Example Invocation

User: "Review this content moderation service for production"
Use trust-layer-review skill to:

1. scan safety message text for perpetrator voice
2. verify refusal mechanisms actively halt processing
3. check prompt injection vectors in LLM integration
4. validate Bangladesh Digital Safety Act compliance markers
5. report priority-ordered findings with concrete fixes
