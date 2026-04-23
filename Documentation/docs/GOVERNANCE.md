# Governance Documents — Extracted from Hogwarts

Extracted verbatim from `Hogwarts/` on 2026-04-23 prior to archival.
Canonical enforcement patterns live in `seed/templates/development-contract.md` (TUV-001).

---

## TOOL-GOV-001 — Tool Interface Governance Contract

Source: `Hogwarts/governors/tool-interface-contract.yaml`

```yaml
contract:
  id: TOOL-GOV-001
  version: "1.0.0"
  title: "Tool Interface Governance Contract"
  principle: "No write without read"
  created: "2026-03-31"

  rules:
    - id: GOV-01
      rule: "Every tool must have a description ≤ 120 chars"
      enforcement: "Board rejects tools without description"
      severity: block

    - id: GOV-02
      rule: "Every parameter must have a type, description, and default when applicable"
      enforcement: "Board marks incomplete params with warning indicator"
      severity: warn

    - id: GOV-03
      rule: "Every server must expose health_check"
      enforcement: "Board shows server as 'unknown' health without it"
      severity: warn

    - id: GOV-04
      rule: "Tool names use snake_case, max 40 chars"
      enforcement: "Board normalizes display but flags violations"
      severity: warn

    - id: GOV-05
      rule: "No tool may write without a corresponding read tool in the same server"
      enforcement: "Board pairs read/write tools; orphan writes flagged"
      severity: warn

    - id: GOV-06
      rule: "Every tool invocation should be auditable via echoes"
      enforcement: "Board checks audit trail; gaps shown on screen"
      severity: info

    - id: GOV-07
      rule: "Presets must be versioned and diffable"
      enforcement: "Board stores presets as JSON with content hash"
      severity: block

  houses:
    observation:
      motto: "See clearly"
      color: "#3B82F6"
      servers:
        - glimpse-server
        - pulse-server
        - overview-server
        - seeds-server
        - grid-rag
        - grid-rag-enhanced

    enforcement:
      motto: "Hold the line"
      color: "#EF4444"
      servers:
        - echoes-server
        - grid-server
        - eligibility-server
        - code-analysis

    experimentation:
      motto: "Try, measure, learn"
      color: "#10B981"
      servers:
        - lots-server
        - grid-enhanced-tools
        - test-runner

    orchestration:
      motto: "Coordinate and flow"
      color: "#F59E0B"
      servers:
        - afloat-server
        - maintain-server
        - mangrove-server
```

---

## TUV-001 Reference — The Unbreakable Vow (from school.code)

Source: `Hogwarts/school.code`

```
# SCHOOL CHARTER: THE HOGWARTS CODE
# Version: 1.0.0
# Status: FOUNDATIONAL POUR

## 1. MISSION STATEMENT
The School exists as a "Campus" side to the Workspace. While the Workspace is for action and execution, the School is for **study**, **reflection**, and **pattern-discovery**. It transforms Input into Output via the Lambda Function (Output = λ × Input).

## 2. GOVERNING BODY: THE BOARD OF GOVERNORS
The School is overseen by the Board of Governors, who enforce the Tool Interface Governance Contract (TOOL-GOV-001).

### The Four Houses
- **Observation:** "See clearly." Focus on monitoring, context, and vision.
    - **GRID Role:** Advisor (Pattern Analysis, Risk Assessment)
    - **Agent:** `caraxes` (Scouting & Research)
    - **Systems:** Glimpse, Pulse, GRID-RAG
- **Enforcement:** "Hold the line." Focus on safety, security, and rule compliance.
    - **GRID Role:** Learning (Validation, Success Factors)
    - **Agent:** `prince-runtime-intel` (Auditor Mode)
    - **Systems:** Echoes, GRID, API-Guard
- **Experimentation:** "Try, measure, learn." Focus on new tools, testing, and labs.
    - **GRID Role:** Executor (Plan, Execute, Task Performance)
    - **Agent:** `prince-runtime-intel` (Primary Dev)
    - **Systems:** LOTS, Test-Runner
- **Orchestration:** "Coordinate and flow." Focus on infrastructure, finance, and pipeline management.
    - **GRID Role:** Receptionist (Intake, Classification, Priority)
    - **Agent:** `hermes` (Coordination & Mediation)
    - **Systems:** Afloat, Mangrove, Dispatcher


## 3. RULES OF CONDUCT (THE CODE)
Every Agent entering the School grounds must adhere to the following rules:

### RULE 0: THE UNBREAKABLE VOW (TUV-001)
Fidelity to the workspace architecture and safety of the source is paramount. No write without read. No action without context.

### RULE 1: THE BORROW METHODOLOGY (KNOWLEDGE SAFETY)
Agents do not own knowledge; they **borrow** it.
- **Immutable Borrow:** Agents may borrow knowledge for consultation. Multiple borrows are allowed.
- **Mutable Borrow:** Only one agent may borrow a domain for modification at a time.
- **Lifetimes:** A borrow is valid only for the duration of the current task. Return all "books" to the library upon task completion.
- **Delivery:** Managed via the **Attention Delivery Chain** (Drone-based allocation from Fulfillment Centers to Workspace).

### RULE 2: LAWFUL TRAVERSAL
Agents must move through the school via the **Staircase Primitive**.
- Movement is driven by **Engagement State** and **Workspace Signals**.
- Bypassing the staircase (e.g., hard-coding paths) is a violation of school conduct.

### RULE 3: GRADUATION
Findings discovered during study (in Racks/Patterns or Racks/Routines) must be synthesized and "graduated" back into the Workspace Library or Design Canon via the appropriate staircase.

## 4. THE STAIRCASE PRIMITIVE
The staircase connects **Floors** (domain territories) to **Landings** (computed destinations).
- **Rotation:** The staircase rotates automatically based on the Lambda (λ) function: `active_landing = λ(engagement, signals)`.

## 5. FORM FACTORS: THE DUALITY OF ACTION
The School and Workspace operate in distinct "Form Factors" to ensure the integrity of the transformation loop.

### A. SCHOOL (Learning / Study / Read)
**Mode:** READ-ONLY
**Territories:** `Documentation/`, `racks/`, `Hogwarts/`
**Objective:** Context gathering, pattern discovery, and mental modeling.
**Constraint:** No modification of source artifacts is permitted while in School mode. Agents must "Read twice, Model once."

### B. WORKSPACE (Practice / Application / Exercise / Write)
**Mode:** READ/WRITE
**Territories:** `CascadeProjects/`, `planes/`
**Objective:** Execution, implementation, and rigorous practice.
**Requirement:** Every write operation must be justified by a "Borrow" from the School side. No "blind writes."

## 6. HYPERSPACE TRANSIT
Transit through the rotation layer happens in **Hyperspace**. This medium ensures that the transition between context-gathering (School) and execution (Workspace) is seamless, rule-bound, and gated.

---
*Signed,*
*The Board of Governors*
```

---

## Config Hygiene — MCP Live Config Regeneration

**Lesson (2026-04-23):** Surgical `jq` key-removal edits to live MCP configs are not durable. When a host migrates or a config drifts, removing individual keys leaves stale absolute paths and archived server entries in place. The correct pattern is full regeneration from the canonical source with backup, diff, and atomic swap:

1. **Backup first:** `cp <live_config> <live_config>.pre-regen-$(date +%Y%m%d).bak`
2. **Regenerate from canonical:** substitute `$HOME/CascadeProjects` → actual absolute path, then `$HOME` → actual home dir. Extract only the `mcpServers` block for tools that expect a bare `{ "mcpServers": ... }` format.
3. **Diff before swapping:** review the generated `.new` file against the backup before the `mv`.
4. **Atomic swap:** `mv <config>.new <live_config>`
5. **Validate post-write:** `grep -c caraxes <live_config>` returns 0; server key sets match canonical.

Applying surgical edits (e.g. `jq 'del(.mcpServers["old-server"])'`) is only safe for single-key removals where the rest of the file is known-clean. After a host migration or any bulk path change, always prefer full regeneration.

See `Documentation/docs/mcp-config-sync.md` for the reusable regeneration reference and `Components/scripts/sync-mcp-configs.sh` (Session C) for the automated version.
