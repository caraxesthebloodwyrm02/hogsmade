Activate the GRID workstream (software-engineering domain).

Usage: /grid [task description]

Read the CHAIN entry for /grid from ~/.claude/CHAIN.md before proceeding.
Apply gated-execution (6-stage protocol) for any code change.
Apply trust-layer-review for any auth/RAG/API-key change.

Constraints (from CHAIN):

- canonical path is src/ — never development/src/
- security gate mandatory before any auth/RAG/API-key change
- nine cognition patterns are architectural primitives, not labels
- GRID debt fix sequence is strictly ordered (see CHAIN activeDebt)

Output contract: Stage 6 report using the fence convention:

<!-- STAGE-6-REPORT-BEGIN -->

## Row N — <title>

**What changed:** ...
**Context used:** ...
**Gates:** ...
**Verification:** ...
**Remaining:** ...

<!-- STAGE-6-REPORT-END -->

Domain: software-engineering
