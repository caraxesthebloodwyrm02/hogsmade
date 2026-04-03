# Upwork Portfolio Polish — Chrome Agent Handoff Schema

**Target:** https://www.upwork.com/freelancers/~019b56c816dfaf0038
**Profile:** Maksuda M. (Maksuda Mamun)
**Date:** March 16, 2026

---

## Session Scope

This document covers **Chunk 1 of 4** in the Upwork launch process. Chrome agent (Sonnet 4.6) owns this quarter — isolated, specific, autonomous profile edits only.

| Chunk                       | Owner                     | Scope                                                                   | Governed By                            |
| --------------------------- | ------------------------- | ----------------------------------------------------------------------- | -------------------------------------- |
| 1 — Profile field edits     | Chrome Agent (Sonnet 4.6) | 6 tasks below + verification                                            | This document                          |
| 2 — Manual profile actions  | Irfan                     | ID verification, video recording, portfolio images, certs, testimonials | This document (Manual Actions section) |
| 3 — Outreach & proposals    | Irfan                     | Job search, scoring, proposal writing, connect spending                 | CONNECTS_PLAYBOOK.md                   |
| 4 — First contract delivery | Irfan                     | Scoping, building, testing, docs, review acquisition                    | STRATEGY_COMPLETE.md                   |

**Chrome agent boundary:** Execute pre-written text into known Upwork fields. No strategy decisions. No content requiring human judgment. No rate changes (governed by STRATEGY_COMPLETE.md).

---

## Voice & Tone Rules

7 rules. Each has a pass condition and a failure signal. Apply to ALL text entered into Upwork fields. No exceptions.

| #   | Rule                           | PASS Condition                                                       | FAIL Signal                                                                                                     |
| --- | ------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | Let the work speak             | Text contains only what was built, stack used, measurable outcomes   | Any quality-evaluating adjective: "exceptional," "cutting-edge," "expert-level," "world-class"                  |
| 2   | Factual over impressive        | Every claim backed by a number, name, or verifiable artifact         | Any sentence containing a feeling, promise, or unverifiable superlative                                         |
| 3   | No jargon escalation           | Terms use the simplest accurate phrasing                             | A simpler term exists for the same concept (e.g., "fault-tolerant resilience orchestration" → "error handling") |
| 4   | Honest scope                   | Work explicitly attributed to solo effort where applicable           | Any implication of team, company, or client deployments that didn't happen                                      |
| 5   | Short sentences                | Max one idea per sentence. No semicolons joining independent clauses | Sentence contains semicolon or 2+ independent ideas                                                             |
| 6   | No filler CTAs                 | Profile's existence is the call to action                            | Any variant of "Let's build something great," "I'd love to hear about your project," "Let's talk"               |
| 7   | Professional, not performative | Reads as engineer-to-engineer technical description                  | Reads as sales copy, motivational writing, or LinkedIn post                                                     |

**Validation method:** After entering any text, re-read against all 7 rules. If any rule fails → rewrite before saving.

---

## Task Sequence (Execute in order)

### TASK 1 — Fix Professional Headline

**Where:** Profile → Edit → Title/Headline field
**Current (broken):** `API Integration & Automation Developer | Python - REST APIs - System D`
**Problem:** "System D" is truncated. Broken display.

**Replace with:**

```
Python API Developer | Integration · Resilience · System Design
```

**Why:** 63 chars (under 70 limit). Leads with "Python" (highest-volume keyword). Three capability words. No truncation risk.

**Verification:** Navigate away from edit → view as public → confirm full headline renders.

---

### TASK 2 — Add Employment History

**Where:** Profile → Employment History → Add Employment
**Blocker:** Required for base 50% profile completeness. Currently empty.

| Field                  | Value                       |
| ---------------------- | --------------------------- |
| Company                | Independent / Self-employed |
| Title                  | Software Engineer           |
| Location               | Dhaka, Bangladesh           |
| Currently working here | Yes                         |
| Start date             | January 2024                |
| Description            | (below)                     |

**Description:**

```
Building backend systems and developer tooling in Python and TypeScript. Primary work includes API integration libraries, protocol implementations (MCP), and application frameworks with structured safety layers. Published one library on PyPI (apiguard). All projects are solo-built, tested, and documented.
```

**Rule validation:** R4 pass ("solo-built"). R2 pass (PyPI, MCP, framework by name). R1 pass (no quality adjectives).

---

### TASK 3 — Fill APIGuard Portfolio "Client Challenge" Field

**Where:** Profile → Portfolio → APIGuard item → Edit → "Client Challenge" / "Problem"
**Current:** Blank.

**Fill with:**

```
Python projects commonly handle API failures with bare try/except blocks or no protection at all. Under real traffic, this leads to cascading failures, silent data loss, and services that go down without explanation. There was no lightweight, decorator-based Python library that gave you circuit breaking, rate limiting, and retry with backoff in a few lines — without pulling in a heavy framework.
```

**Rule validation:** R2 pass (describes real gap). R3 pass (standard terms). R6 pass (no CTA).

---

### TASK 4 — Enable Availability Badge

**Where:** Profile → Settings → Availability → Toggle ON
**Action:** Set to ON.

---

### TASK 5 — Set Contract-to-Hire Preference

**Where:** Profile → Settings → Availability → Contract-to-Hire
**Action:** Set to "Open to contract-to-hire."

---

### TASK 6 — Set Up Project Catalog (1 Listing)

**Where:** Find Work → Project Catalog → Create a Project
**Constraint:** Exactly 1 listing. Zero reviews = one focused service.

| Field    | Value                                                             |
| -------- | ----------------------------------------------------------------- |
| Title    | Python API Integration — Connect Your App to Third-Party Services |
| Category | Web, Mobile & Software Dev → Backend Development (or closest)     |
| Tags     | Python, API Integration, REST API, FastAPI, Error Handling        |

**Description:**

```
I'll integrate your Python application with third-party APIs — payment processors, CRMs, notification services, data providers, or any REST/JSON endpoint.

What's included:
- Clean, typed Python integration code using httpx or requests
- Error handling with retry logic and meaningful error messages
- Rate limiting where the target API requires it
- Documentation covering setup, authentication, and edge cases
- Basic test coverage for the integration layer

What I need from you:
- API documentation or endpoint details for the target service
- Access credentials (API keys, OAuth details)
- A brief description of what data or actions you need from the integration

Delivery includes working code, tests, and a short README. No frameworks imposed — the integration fits into your existing codebase.
```

**Tiers:**

| Tier     | Name                     | Price | Delivery | Scope                                                         |
| -------- | ------------------------ | ----- | -------- | ------------------------------------------------------------- |
| Starter  | Single API Integration   | $150  | 3 days   | 1 API, up to 5 endpoints, basic error handling, tests         |
| Standard | Integration + Resilience | $350  | 5 days   | 1-2 APIs, retry/rate limiting, full test coverage, docs       |
| Advanced | Multi-API System         | $700  | 10 days  | 3+ APIs, circuit breaking, monitoring hooks, architecture doc |

**Rule validation:** R1 pass (deliverables, not promises). R5 pass (one idea per bullet). R7 pass (scope document, not sales pitch).

---

## DO NOT TOUCH (Preserve as-is)

| Section                        | Reason                                                        |
| ------------------------------ | ------------------------------------------------------------- |
| Bio / Overview                 | Matches tone rules. Specific and professional.                |
| Skills list (15)               | Well-targeted. No additions or removals.                      |
| Hourly Rate                    | Governed by STRATEGY_COMPLETE.md — not this document's scope. |
| Portfolio descriptions (all 3) | Credible. Only Task 3 fills a blank field.                    |
| Education                      | Factual. Complete.                                            |
| Profile photo                  | Set.                                                          |
| Linked accounts                | GitHub and StackOverflow linked.                              |

---

## Manual Actions (Chunk 2 — Irfan only, NOT Chrome agent)

| Item               | Why manual                                     | Impact                                 | Effort   | Priority             |
| ------------------ | ---------------------------------------------- | -------------------------------------- | -------- | -------------------- |
| ID Verification    | Government ID + selfie through Upwork flow     | HIGH — trust signal                    | ~10 min  | 1st                  |
| Video Introduction | 30-60 sec recording (webcam/phone)             | HIGH — 35% engagement lift             | ~30 min  | 2nd                  |
| Portfolio Images   | Architecture diagrams/screenshots needed first | MEDIUM — visual engagement             | ~1-2 hrs | After first contract |
| Certifications     | Identify which certs to add                    | MEDIUM — +5% completeness per cert     | Varies   | After first contract |
| Testimonials       | Off-platform contacts willing to vouch         | HIGH — substitutes for missing reviews | Days     | After first contract |

---

## Post-Execution Verification

After all 6 tasks, verify:

- [ ] Headline displays fully without truncation (public view)
- [ ] Employment History shows 1 entry with "Currently working here" active
- [ ] APIGuard portfolio item has filled "Client Challenge" section
- [ ] Availability badge active on public profile
- [ ] Contract-to-hire preference set
- [ ] Project Catalog has 1 published listing ("Under Review" status = expected)
- [ ] No other sections modified
- [ ] Full public profile read top-to-bottom — tone consistent with 7 rules above
