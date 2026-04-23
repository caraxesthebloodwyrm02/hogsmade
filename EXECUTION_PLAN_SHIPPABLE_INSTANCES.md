# Execution Plan — Shippable Instances

**Objective:** Ship 5 shippable instances; track progress with outcome metrics (Move 8), not a vanity score.

**G Constraints (from terminal output analysis):**

- GRID-main: 13 unpushed commits, modified inference_gap_ledger.jsonl
- CascadeProjects: 2 unpushed commits on feature branch, 13 commits ahead of hogsmade
- Untracked: lumos skill (6307B, 134 lines)
- Risk: Low (git ops) to Medium (new code)

---

## Scoped Execution Matrix

| #   | Instance                          | Type | Repo      | Risk   | Stack rank | Status                     |
| --- | --------------------------------- | ---- | --------- | ------ | ---------- | -------------------------- |
| 1   | Push GRID-main                    | Git  | GRID-main | Low    | 1          | Ready                      |
| 2   | Commit inference_gap_ledger.jsonl | Git  | GRID-main | Low    | 2          | Modified (4 new lines)     |
| 3   | Push CascadeProjects              | Git  | hogsmade  | Medium | 3          | Feature branch (2 commits) |
| 4   | Track lumos skill                 | Git  | hogsmade  | Low    | 4          | Untracked (6307B)          |
| 5   | Session-mute safety function      | Code | GRID-main | Medium | 5          | New file                   |

---

## Verified Git State

### GRID-main

```bash
# Current: modified artifacts/inference_gap_ledger.jsonl
# Unpushed: 13 commits on main
# Remote: git@github.com:GRID-INTELLIGENCE/GRID.git
```

**Commit Scope (sorted by recency):**

- `1d93679` feat(mcp): enhanced RAG + intelligence MCP servers
- `cc89eed` docs: dependency graph, audit artifacts, runbooks
- `28d37a8` feat(atlas): graph compiler, governance gates, personality engine
- ... (10 more commits)

### CascadeProjects

```bash
# Current: fix/glimpse-artifact-consolidated-deps
# Unpushed: 2 commits
# Ahead of hogsmade: 13 commits (merge needed)
# Remote: git@github-caraxes:caraxesthebloodwyrm02/hogsmade.git
```

**Branch Strategy:** Option A — push feature branch, then merge via PR

---

## Artifact Analysis

### inference_gap_ledger.jsonl

- **Path:** `Projects/GRID-main/artifacts/inference_gap_ledger.jsonl`
- **Total:** 112 lines
- **New today:** 4 lines (2026-04-06T16:50:45Z)
- **Pattern:** Test fixtures (case_ids: 001, 002, 003)
- **Sources:** stabilize, drift_check, roundtable_reconcile

### Lumos Skill

- **Path:** `.cursor/skills/lumos/SKILL.md`
- **Size:** 6307 bytes, 134 lines
- **Purpose:** Ecosystem state mapper with PATH scoring
- **Phases:** Fast Lane (3-call) → Full Pipeline (6 phases)
- **Dependencies:** /startup, MCP servers (overview, seeds, eligibility, echoes)

---

## Execution Sequence

### Phase 1 — Git Operations (Low Risk)

1. **Push GRID-main**

   ```bash
   cd /home/caraxes/CascadeProjects/Projects/GRID-main
   git push origin main
   ```

2. **Commit inference gap ledger**

   ```bash
   cd /home/caraxes/CascadeProjects/Projects/GRID-main
   git add artifacts/inference_gap_ledger.jsonl
   git commit -m "chore(artifacts): append inference gap ledger entries from drift/stabilize runs"
   git push origin main
   ```

3. **Push CascadeProjects branch**

   ```bash
   cd /home/caraxes/CascadeProjects
   git push origin fix/glimpse-artifact-consolidated-deps
   ```

4. **Track lumos skill** (decision pending)
   ```bash
   cd /home/caraxes/CascadeProjects
   git add .cursor/skills/lumos/
   git commit -m "feat(skills): add lumos skill for cursor workspace"
   ```

### Phase 2 — Code Creation (Medium Risk)

5. **Session-mute safety function**
   - **Target:** `src/grid/safety/session_mute.py`
   - **Purpose:** Suppress external interference during active sessions
   - **Signature:** Logs "debugging the paradoxical functions react atomically with sudden bursts"
   - **Pattern:** Decorator for session-protected operations

---

## Risk Mitigation

### Git Operations

- **GRID-main:** All commits on main, no merge conflicts expected
- **CascadeProjects:** Feature branch strategy avoids direct main manipulation
- **Backup:** Branch exists on remote, recovery possible

### Code Creation

- **Verification:** Check existing safety module structure first
- **Testing:** Add unit tests for session_mute functionality
- **Integration:** Follow existing SafetyGuardrails pattern

---

## Outcome Metrics

We track two metrics that reference reality outside the repo:

### Primary — Audit Event Rate

- **Definition:** audit events emitted per day.
- **Source:** `wc -l ~/.echoes/audit.ndjson` divided by days observed.
- **Baseline (2026-04-23):** ~42 events/day (296 events over 7 days).
- **Target direction:** increasing means more real tool invocations.

### Gate — Secrets Exposure Count

- **Definition:** count of files with secret-bearing names (`*_token*`, `*credential*`, `*secret*`, `.env`) that are tracked in git.
- **Source:** `git ls-files | grep -iE 'token|credential|secret|\.env$' | wc -l`.
- **Baseline (2026-04-23):** 3 (all in `Projects/GRID-main/`).
- **Target:** 0. Any increase blocks release.

### Operational hygiene (this plan)

| Metric               | Target | Current | Delta |
| -------------------- | ------ | ------- | ----- |
| Unpushed Commits     | 0      | 15      | -15   |
| Untracked Files      | 0      | 1       | -1    |
| New Safety Functions | 1      | 0       | +1    |

---

## Decision Points

1. **Lumos skill:** Commit to hogsmade or keep local-only?
2. **CascadeProjects merge:** Push branch as-is or merge to hogsmade first?
3. **Session-mute design:** Use proposed signature or modify?

---

## Execution Checklist

- [ ] Verify remote access for both repos
- [ ] Confirm GRID submodule pointer alignment
- [ ] Check safety module structure for session_mute.py
- [ ] Validate lumos skill content before commit
- [ ] Test session-mute function after creation

---

**Next Action:** Begin with `git push origin main` in GRID-main (lowest risk item)
