# Glimpse Bench — Model Benchmarking Routine

> A structured exercise for evaluating AI coding models. Works across all tools (Claude Code, Windsurf, Cursor, Copilot, Antigravity, OpenCode). Good for warmups, experimentation, onboarding, and building a data-driven model suitability map.

## What Is This?

A **7-step structured prompt system** (the "glimpse" pattern) that:

1. Forces any AI model to **read before writing**
2. **Audits evidence** before making claims
3. Identifies **risks and constraints** before executing
4. Defines **acceptance criteria** before starting work
5. Scores the result on **5 dimensions** (correctness, rule compliance, credit efficiency, evidence quality, scope discipline)

The result: a growing matrix of which model works best for which task — and which combinations to avoid.

## Quick Start

```bash
# From the workspace root (CascadeProjects/)
python scripts/glimpse-bench.py list                    # See all 7 benchmark tasks
python scripts/glimpse-bench.py tools                   # See all tools + model aliases

# Safe mode (dry-run) — generates prompt + result template, no code changes
python scripts/glimpse-bench.py run B1-read-only --tool claude-code --model sonnet

# Dangerous mode — same + creates isolated git worktree sandbox
python scripts/glimpse-bench.py run B5-architecture --tool antigravity --model opus-thinking --dangerous

# After running the prompt in your tool, score the result
python scripts/glimpse-bench.py score B1-read-only --tool claude-code --model sonnet

# View accumulated results
python scripts/glimpse-bench.py leaderboard
python scripts/glimpse-bench.py warnings
```

## The Routine (5 Steps)

```
1. PREPARE    →  glimpse-bench run <task> --tool <tool> --model <model>
2. EXECUTE    →  Paste the generated JSON prompt into the target tool
3. OBSERVE    →  Watch execution, note tool calls, rule violations, filler
4. SCORE      →  glimpse-bench score <task> --tool <tool> --model <model>
5. LEARN      →  glimpse-bench leaderboard / warnings → update your model picks
```

## Safe vs Dangerous Mode

|                 | Safe (default)                     | Dangerous (`--dangerous`)      |
| --------------- | ---------------------------------- | ------------------------------ |
| Prompt JSON     | ✓ Generated                        | ✓ Generated                    |
| Result template | ✓ Pre-filled                       | ✓ Pre-filled                   |
| Code isolation  | Git stash anchor                   | Git worktree (separate branch) |
| Main branch     | Untouched                          | Untouched                      |
| Use for         | Warmups, read-only tasks, practice | Tasks that modify code         |

## Benchmark Tasks (7)

| ID               | Difficulty | What It Tests                              |
| ---------------- | ---------- | ------------------------------------------ |
| B1-read-only     | Easy       | Read comprehension, rule compliance        |
| B2-targeted-edit | Easy       | Surgical edits, metric verification        |
| B3-multi-file    | Medium     | Cross-file coordination                    |
| B4-debugging     | Medium     | Enumerate-first debugging discipline       |
| B5-architecture  | Hard       | Architecture reasoning, trade-off analysis |
| B6-test-gen      | Hard       | Test writing, pattern matching             |
| B7-docs-evidence | Medium     | Evidence-backed documentation              |

## Scoring (0-3 per dimension, max 15)

| Score | Meaning                                                           |
| ----- | ----------------------------------------------------------------- |
| 0     | Failed — wrong output, hallucination, rule violation              |
| 1     | Partial — right direction, missed constraints or added filler     |
| 2     | Good — correct, followed rules, minor inefficiencies              |
| 3     | Excellent — correct, concise, evidence-backed, minimal tool calls |

**Dimensions**: Correctness · Rule Compliance · Credit Efficiency · Evidence Quality · Scope Discipline

**Verdict thresholds**: 12+ = RECOMMENDED, 8-11 = ACCEPTABLE, <8 = NOT_RECOMMENDED

## When To Use This

- **Warmup**: Start a session with B1 (read-only, easy) to calibrate the model
- **New model evaluation**: Run B1 + B4 + B5 (easy/medium/hard) to profile a new model
- **Budget planning**: Compare credit costs across tools for the same task
- **Onboarding**: New team member runs all 7 tasks to learn the codebase structure
- **Skill building**: Repeat the same task with different constraints to deepen understanding
- **Tool selection**: When deciding between Windsurf/Cursor/Claude Code for a project

## File Map

| File                                            | Location       | Purpose                                                     |
| ----------------------------------------------- | -------------- | ----------------------------------------------------------- |
| `scripts/glimpse-bench.py`                      | Workspace root | Automation script (list, run, score, leaderboard, warnings) |
| `.claude/prompts/glimpse-template.json`         | Workspace root | Reusable 7-step template with `{{VARIABLE}}` placeholders   |
| `.claude/prompts/glimpse-benchmark-tasks.json`  | Workspace root | 7 pre-defined tasks with acceptance criteria                |
| `.claude/prompts/response-discipline-demo.json` | Workspace root | Original working example (GRID README update)               |
| `memory/context/model-catalog.md`               | Workspace root | Full model inventory across 6 tools                         |
| `memory/context/model-benchmark-log.md`         | Workspace root | Living results log + suitability matrix                     |
| `benchmarks/`                                   | Workspace root | Generated prompts + result files per run                    |

## Origin

This system emerged organically from diagnosing two alignment failures:

1. **Decorative recommendation inflation** — AI fabricated metrics and mapped user vocabulary to marketing keywords
2. **Reactive fix loops** — AI fixed issues one-by-one instead of scanning comprehensively first

The 7-step glimpse pattern was the user's innovation — a structured prompt where each step narrows the assistant's lens before execution begins. The benchmarking system preserves and practices this discovery.

## Adding New Tasks

Edit `.claude/prompts/glimpse-benchmark-tasks.json` and add to the `tasks` array:

```json
{
  "task_id": "B8-your-task",
  "title": "Short description",
  "description": "Full task description",
  "dimensions_tested": ["D1_read_comprehension", "D2_targeted_edit"],
  "target_project": "GRID-main",
  "target_files": ["path/to/file.py"],
  "request_type": "debugging",
  "difficulty": "medium",
  "expected_tool_calls": "3-5",
  "risks": ["R1: Risk description", "R2: Another risk"],
  "acceptance": [{ "id": "A1", "criterion": "What must be true", "verify": "How to check it" }],
  "deny_on_output": ["things the model must NOT produce"]
}
```

## Adding New Tools/Models

Edit the `TOOL_ALIASES` and `CREDIT_COSTS` dicts in `scripts/glimpse-bench.py`.
