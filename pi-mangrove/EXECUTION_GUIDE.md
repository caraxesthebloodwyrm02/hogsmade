# Pi-Mangrove Full Phase Completion Guide

## Phase 3: Skills Migration (P3.1-P3.5)

### Pattern: Claude Command → Pi Skill

**Source:** `.claude/commands/*.md`
**Target:** `skills/{name}/SKILL.md`

#### Example: iterate.skill Migration

**Step 1: Read source**
```bash
read ~/.claude/commands/iterate.md
```

**Step 2: Create target structure**
```bash
mkdir -p /home/caraxes/CascadeProjects/pi-mangrove/skills/iterate
```

**Step 3: Write SKILL.md with validated frontmatter**
```markdown
---
name: iterate
description: Freelance project delivery framework. Use when the user asks to start a project, plan delivery milestones, or manage contractor workflows. Keywords: freelance, project, delivery, milestone, contract, scope.
---

# Iterate Framework

## When to Use
- User says "start a project," "create a milestone," or "plan delivery"
- Context involves contractor agreements, milestone tracking, or delivery gates

## Steps
1. **Understand** — Clarify objective, constraints, and success criteria
2. **Plan** — Break into milestones with defined outputs and deadlines
3. **Implement** — Execute with checkpoint commits
4. **Verify** — Validate against initial criteria before mark complete

## Hard Constraints
- Do not expand scope beyond user-defined milestones
- Each milestone must have explicit deliverable and validation criteria
- Gate pass required before marking milestone complete

## Example Invocation
User: "I need to build a Python API for data processing"
→ Load iterate skill, establish milestones, proceed through cadence
```

**Step 4: Verify YAML validity**
```bash
python3 -c "import yaml; yaml.safe_load(open('/home/caraxes/CascadeProjects/pi-mangrove/skills/iterate/SKILL.md').read().split('---')[1])"
```

### Migration Queue

| Skill | Source | Priority | Complexity |
|-------|--------|----------|------------|
| iterate | `~/.claude/commands/iterate.md` | P1 | Low |
| glimpse | `~/.claude/commands/glimpse.md` | P1 | Medium |
| lifeguard-review | `~/.claude/commands/lifeguard-review.md` | P1 | Low |
| trust-layer-review | `~/.claude/commands/trust-layer-review.md` | P2 | Low |
| screen-budget | `~/.claude/commands/screen-budget.md` | P2 | Low |

### Quick Migration Template

For each skill:

```bash
# 1. Create directory
SKILL_NAME=iterate
mkdir -p /home/caraxes/CascadeProjects/pi-mangrove/skills/$SKILL_NAME

# 2. Extract frontmatter from Claude command
# (Manual: copy name/description, ensure quoted if colons present)

# 3. Write SKILL.md
cat > /home/caraxes/CascadeProjects/pi-mangrove/skills/$SKILL_NAME/SKILL.md << 'EOF'
---
name: $SKILL_NAME
description: "[Quoted description from source]"
---

# [Title]

## When to Use
[From source Usage]

## Steps
[Numbered steps from source]

## Hard Constraints
[Never-rules or constraints]

## Example Invocation
[Usage example]
EOF

# 4. Validate
python3 -c "import yaml; print('OK:', yaml.safe_load(open('/home/caraxes/CascadeProjects/pi-mangrove/skills/$SKILL_NAME/SKILL.md').read().split('---')[1]))"
```

---

## Phase 4: Prompt Templates (P4.1-P4.3)

### Pattern: Static Reference → Expandable Template

**Location:** `prompts/`
**Usage:** `/templatename` in pi editor

#### Example: tuv-review.md

```markdown
---
name: tuv-review
description: Review code, architecture, or AI output against TUV-001 clauses (The Unbreakable Vow). Use for trust-contract audits.
---

# TUV-001 Contract Review

## Condition I: Fidelity to Objective
- [ ] Output aligns with stated user goal
- [ ] No scope expansion without explicit request
- [ ] Re-anchoring triggered if objective drift detected

## Condition II: Integrity of Output
- [ ] No hallucinated APIs, paths, or dependencies
- [ ] File edits verified against actual content
- [ ] `/shield-break` invoked if context corruption suspected

## Condition III: Accountability for Actions
- [ ] All file operations logged in audit trail
- [ ] Never-rules respected (no hardcoded secrets, no sudo without explicit block)
- [ ] `/breach-state` invoked for never-rule violations

## Verification
State "TUV-001 reviewed" and list any clauses requiring recovery actions.
```

### Prompt Template Queue

| Template | Purpose | Trigger |
|----------|---------|---------|
| tuv-review | Trust contract audit | `/tuv-review` |
| safety-gate | Never-rule violation check | `/safety-gate` |
| trust-contract | Breach recovery protocol | `/trust-contract` |

---

## Phase 5: Integration & Distribution (P5.1-P5.4)

### P5.1: Package README

```markdown
# @mangrove/pi-mangrove

Mangrove ecosystem integration for pi — DIO bridge, security automation, and canonical skills.

## Install

```bash
pi install /home/caraxes/CascadeProjects/pi-mangrove
# or for workspace auto-load:
# packages: ["../pi-mangrove"] in .pi/settings.json
```

## Tools

| Tool | Description |
|------|-------------|
| `dio_episode_summary` | Read DIO episode structure |
| `dio:status` | Query DIO constants (CADENCE, RHYTHM_PASS_COUNT) |
| `security:audit` | Run cross-module isolation scan |

## Skills

| Skill | Use When |
|-------|----------|
| `iterate` | Freelance project delivery |
| `glimpse` | Glimpse cognitive engine maintenance |
| `lifeguard-review` | Production API review |

## Prompts

- `/tuv-review` — Trust contract audit
- `/safety-gate` — Never-rule check
- `/mangrove-dev` — Development guide

## Development

```bash
cd /home/caraxes/CascadeProjects/pi-mangrove
npm install
npm run typecheck
```
```

### P5.2: Workspace AGENTS.md Integration

Create `/home/caraxes/CascadeProjects/.pi/AGENTS.md`:

```markdown
# Mangrove Pi Workspace

## Auto-Loaded Package
This workspace includes `pi-mangrove` via `.pi/settings.json`.

## Active Tools
- `dio_episode_summary` — Episode structure from DIO
- `dio:status` — Constants query
- `security:audit` — Isolation scan

## Active Skills
- `iterate` — Project delivery framework
- `glimpse` — Cognitive engine reference
- `lifeguard-review` — API safety review

## Quick Commands
| Need | Action |
|------|--------|
| DIO phase info | `dio:status` |
| Security scan | `security:audit` |
| Skill help | `/skill:iterate` |
```

### P5.3: Full Install Cycle Test

```bash
# 1. Ensure clean state
pi remove /home/caraxes/CascadeProjects/pi-mangrove 2>/dev/null || true

# 2. Install
pi install /home/caraxes/CascadeProjects/pi-mangrove

# 3. Verify tools appear
/hotkeys | grep -E "(dio_|security:)"

# 4. Test DIO bridge
dio:status

# 5. Test security
security:audit

# 6. Test episode summary
dio_episode_summary {"partIndex": 1}

# 7. Verify skills
/skill:iterate  # or other migrated skills

# 8. Check prompts
/tuv-review  # should expand
```

### P5.4: GitHub Push

```bash
cd /home/caraxes/CascadeProjects/pi-mangrove

# 1. Ensure gitignore excludes node_modules but not source
cat > .gitignore << 'EOF'
node_modules/
dist/
*.log
.DS_Store
EOF

# 2. Initialize if needed (or use existing CascadeProjects repo logic)
git init 2>/dev/null || true
git add .
git commit -m "feat: pi-mangrove v0.1.0 — DIO bridge, security audit, skills"

# 3. Add remote and push
# (Use your github-caraxes alias per CLAUDE.md)
gh repo create pi-mangrove --public --source=. --push
# or manual:
# git remote add origin git@github-caraxes:caraxesthebloodwyrm02/pi-mangrove.git
# git push -u origin main
```

---

## Validation Checklist

- [ ] All skills migrated with valid YAML frontmatter
- [ ] `npm run typecheck` passes
- [ ] `pi install` succeeds
- [ ] All three tools (`dio_episode_summary`, `dio:status`, `security:audit`) execute
- [ ] Skills load via `/skill:name`
- [ ] Prompts expand via `/templatename`
- [ ] README.md documents all capabilities
- [ ] Pushed to GitHub with correct remote (`github-caraxes`)

---

## Execution Priority

1. **P3.1** — Migrate `iterate` (easiest, validates pattern)
2. **P3.2** — Migrate `glimpse` (already have glimpse.md content)
3. **P3.4** — Migrate `lifeguard-review` (production safety)
4. **P4.1** — Write `tuv-review.md`
5. **P5.1** — Write `README.md`
6. **P5.3** — Full install test
7. **P3.3, P3.5** — Archive skills (ZIP extraction deferred)
8. **P4.2-4.3** — Additional prompts
9. **P5.4** — GitHub push
