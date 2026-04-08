# Review Methodology — How to Evaluate ori-server

> For both human reviewers and agent evaluators.
> This document defines what to look for, how to flag it,
> and what constitutes a pass vs a concern.

---

## Evaluation Areas

### 1. Functional Correctness

**Question**: Does ori-server do what it claims?

**How to test**:
- Run the self-test (`run_tests` with ori-server's own projectId)
- Verify 100 tests pass with 0 failures
- Feed known-bad log lines to `collect_logs` and verify correct classification
- Call `probe_test_suite` and confirm severity counts match expectations
- Generate a report and check that sections correspond to available data

**Pass criteria**:
- All 100 built-in tests pass
- Risk patterns correctly identify known signals (e.g., "FAIL" → critical)
- Reports contain only sections with supporting data
- Recommendations reference specific patterns, not generic advice

### 2. Security Posture

**Question**: Can ori-server be used to cause harm or leak data?

**What to evaluate**:

- **Execution boundary**: Test commands run in a sandbox that restricts
  execution to the configured workspace and its parent directory. Evaluate
  whether this scope is appropriate for your deployment.

- **Data sensitivity**: Test stdout/stderr is persisted verbatim to disk.
  If a test prints secrets or credentials, they will be stored. Evaluate
  whether the data directory should be treated as sensitive.

- **Input validation**: All tool inputs are validated via schema before
  execution. Attempt to call tools with malformed inputs and verify
  they are rejected with clear error messages.

- **Rate limiting**: Every tool is rate-limited per session. Attempt
  rapid repeated calls and verify throttling engages.

- **Gate validation**: Execution and reporting tools require admission
  gate validation. Verify that these tools fail closed when the gate
  is unreachable.

- **Cross-server reads**: Integration with sibling data stores is read-only.
  Verify that ori-server never writes to external data directories.

**Pass criteria**:
- No tool accepts unvalidated input
- Sandbox rejects paths outside allowed roots
- Guarded tools fail closed when gate is unavailable
- Rate limiter engages under load
- No write operations to external data stores

### 3. Design Quality

**Question**: Is the API well-designed, consistent, and ergonomic?

**What to evaluate**:

- **Naming**: Are tool names predictable? Can you guess what a tool does
  from its name alone? Are there naming inconsistencies?

- **Schema precision**: Are input schemas tight (rejecting bad input)
  or loose (accepting anything)? Tight schemas are better.

- **Output clarity**: Is tool output immediately useful or does it
  require transformation? Look at JSON structure — is it flat and
  scannable or deeply nested?

- **Error messages**: When a tool fails, does the error message tell
  you what went wrong and what to do about it?

- **Conditional rendering**: Reports omit sections with no data.
  Is this behavior correct? Are thresholds reasonable?

- **Tool count**: 22 tools is a large surface. Are any tools redundant?
  Could any be merged? Are any missing?

**Pass criteria**:
- Tool names follow a consistent pattern
- Schemas reject invalid input with clear errors
- Output is structured and scannable
- Error messages are actionable
- No obviously redundant tools

### 4. Reliability

**Question**: Does ori-server handle edge cases and failures gracefully?

**What to test**:
- Call tools with empty inputs where data is expected
- Call analysis tools when no logs have been collected
- Call `run_tests` for a nonexistent projectId
- Disconnect the gate API mid-session
- Fill the notebook with many entries and verify query performance

**Pass criteria**:
- Empty/missing data returns structured empty responses, not errors
- Invalid inputs return validation errors, not crashes
- Gate disconnection triggers circuit breaker, not hang
- Performance remains acceptable at scale

---

## Flagging Protocol

Use this structured format so both humans and agents can parse findings:

```
FLAG: [correctness|security|design|reliability]
SEVERITY: [critical|warning|suggestion]
TOOL: <tool name that exhibited the issue>
DESCRIPTION: <what you observed>
EXPECTED: <what should have happened>
RECOMMENDATION: <what to change>
```

### Severity Guide

- **Critical**: Blocks shipping. Security boundary violated, data corruption,
  crashes, incorrect classification of known-bad input.

- **Warning**: Should be addressed before shipping. Design inconsistency,
  unclear error message, missing edge case handling, documentation gap.

- **Suggestion**: Nice to have. Naming preference, output formatting opinion,
  potential optimization, additional test coverage idea.

---

## What NOT to Evaluate

This review is scoped to the **public interface and behavior** of ori-server.
The following are out of scope for this review package:

- Internal implementation details (module structure, code style)
- Build system and CI configuration
- Dependencies of dependencies
- Performance benchmarking (beyond "does it feel responsive")
- Compatibility with specific editors or MCP clients

If you need to evaluate these areas, request access to the internal
review package which includes source-level detail.
