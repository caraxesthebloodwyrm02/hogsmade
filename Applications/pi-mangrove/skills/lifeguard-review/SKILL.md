---
name: lifeguard-review
description: "Production API code review checklist with 11 validation rules covering response formats, data retention, authorization, lint hygiene, dependency declarations, JWT validation, Redis handling, Stripe webhook security, rate limiting, security logging, and OpenAI response validation. Use when reviewing backend or API code before merge or deployment. Keywords: api review, security review, production readiness, jwt, redis, stripe, openai, authorization."
---

# Lifeguard — Production API Review Rules

## When to Use

- User asks to review backend or API code for production readiness
- Work involves endpoints, auth flows, webhook handlers, Redis integrations, or third-party API calls
- The user is about to merge or deploy API-related changes
- You need a pass/fail checklist focused on integration and security failures that unit tests often miss

## Steps

1. **Identify the API surface**

   - Locate routes, handlers, middleware, auth boundaries, and external integrations
   - Confirm which public endpoints, sensitive operations, and data stores are affected

2. **Apply the 11 review rules**

   - Check response format consistency across success and error paths
   - Verify retention/deletion coverage for new or changed data stores
   - Verify ownership authorization, not just session presence
   - Require zero lint warnings before merge
   - Confirm script dependencies are declared in `package.json`
   - Validate JWT handling completely
   - Review Redis calls for fallback-safe error handling
   - Verify Stripe webhook signature validation
   - Confirm rate limiting on public endpoints
   - Check structured security event logging
   - Validate OpenAI API response/error handling where applicable

3. **Report only failures and near-misses**

   - Use concise pass/fail findings with file location, issue, and fix guidance
   - Do not clutter the review with rules that already pass

4. **Adapt by stack without weakening the rule**
   - Apply equivalent checks for Python/FastAPI or other backend stacks
   - Preserve the same security and production-readiness standard even when implementation details differ

## Review Output Format

For each failed or near-miss rule, report:

- Rule number and title
- File and location
- Specific issue
- Recommended fix

End with a concise summary count, such as: `9/11 rules pass. 2 issues found.`

## Hard Constraints

- Do not treat session existence as sufficient authorization for sensitive resources
- Do not allow partial JWT validation to count as secure
- Do not accept lint warnings, undeclared script dependencies, or missing rate limits as “later” work for production code
- Do not skip webhook signature verification for Stripe or equivalent signed callbacks
- Do not accept unhandled Redis or external API failure paths on production endpoints
- Do not log secrets, tokens, passwords, or raw sensitive data while adding audit visibility

## Example Invocation

User: "Review this API code before I merge it."
Use the lifeguard-review skill to:

1. identify the API surface and trust boundaries
2. apply the 11 production review rules
3. report only failures and near-misses
4. summarize the pass count and remaining blockers
