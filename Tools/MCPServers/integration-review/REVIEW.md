# Integration Review — ori-server

> This directory is the minimal shared scope for a second-opinion review
> of ori-server before shipping. It is written for both humans and agents.

---

## Who is this for?

- **Human reviewer**: You are looking at a TypeScript MCP server that monitors
  test suites, classifies console output by risk, and generates research reports.
  You are here to evaluate quality, security posture, design taste, and readiness.

- **Agent reviewer**: You are evaluating an MCP server with 22 registered tools.
  Parse SURFACE.md for the mechanical tool contract. Parse SECURITY.md for the
  threat surface and flagging criteria. Use the e2e trace in TRACE.md to verify
  output correctness. Report findings as structured flags.

---

## What is ori-server?

A test-suite research and reporting system. It:

1. Runs test suites for registered projects (vitest, pytest, node --test)
2. Captures stdout/stderr and classifies each line against risk patterns
3. Produces read-reason-actionable recommendations
4. Maps findings to a threat model
5. Generates markdown research reports
6. Maintains a persistent notebook for cross-run observations

It does NOT execute arbitrary code — it runs pre-registered test commands
inside a sandboxed execution policy that restricts paths to the workspace.

---

## Source Location

All source lives in one directory:

```
Tools/MCPServers/ori-server/
├── src/
│   ├── server.ts          — entry point, registers 22 tools (1531 lines)
│   ├── config.ts           — env-driven path configuration (33 lines)
│   ├── registry-data.ts    — static project seed data (369 lines)
│   ├── registry.ts         — registry persistence + updates (162 lines)
│   ├── executor.ts         — test runner sandbox (307 lines)
│   ├── runner-adapters.ts  — pytest/vitest/node output parsers (189 lines)
│   ├── patterns.ts         — risk pattern regex definitions (108 lines)
│   ├── storage.ts          — log persistence layer (87 lines)
│   ├── filter.ts           — log query engine (61 lines)
│   ├── probe.ts            — time-aware risk scanning (59 lines)
│   ├── recommend.ts        — recommendation generator (174 lines)
│   ├── reporter.ts         — markdown report renderer (423 lines)
│   ├── threat-model.ts     — threat model parser + coverage mapper (265 lines)
│   ├── notebook.ts         — append-only NDJSON notebook (175 lines)
│   ├── interop.ts          — cross-server reads (echoes, seeds) (179 lines)
│   └── types.ts            — shared type definitions (102 lines)
├── tests/                  — 7 test files, 100 tests (all passing)
├── package.json            — deps: @cascade/shared-types, @modelcontextprotocol/sdk, zod
├── .env.example            — documents all accepted env vars
└── README.md               — tool catalog and risk pattern reference
```

Build dependency: `Components/shared-types/` must be built first.
Runtime: Node 22+, npm. No Python required.

---

## What to Review

### For quality

- Read `src/server.ts` — is the tool registration clean? Are schemas precise?
- Read `tests/` — do tests cover the critical paths? Any gaps?
- Run `npm test` — do all 100 tests pass on your machine?

### For security

- Read SECURITY.md in this directory — it maps every attack surface
- Read `src/executor.ts` — is the sandbox tight enough?
- Read `src/server.ts` lines 55-60 — merit guard + rate limiter setup

### For design

- Read SURFACE.md in this directory — is the tool naming coherent?
- Look at the e2e trace in TRACE.md — is the output useful and readable?
- Read `src/reporter.ts` — is the report format well-structured?

### For shipping readiness

- Check: are there any hardcoded paths? (there should be zero)
- Check: does `.env.example` document all required configuration?
- Check: does the README accurately describe the tool catalog?

---

## How to Flag Findings

Use this format so both humans and agents can parse it:

```
FLAG: [quality|security|design|shipping]
SEVERITY: [critical|warning|suggestion]
FILE: <relative path>:<line range>
DESCRIPTION: <what you found>
RECOMMENDATION: <what to do about it>
```

Example:

```
FLAG: security
SEVERITY: warning
FILE: src/executor.ts:26-29
DESCRIPTION: Execution policy allows parent of CASCADE_WORKSPACE_ROOT
RECOMMENDATION: Evaluate if sibling directories should be in scope
```
