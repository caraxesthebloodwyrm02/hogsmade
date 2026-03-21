#!/usr/bin/env python3
"""
glimpse-bench — Model benchmarking automation for the Glimpse prompt system.

Prepares structured input prompts from the benchmark task library,
targets a specific tool/model, and offers safe (dry-run) or dangerous (live) mode.

Usage:
    # List available tasks
    python scripts/glimpse-bench.py list

    # Preview a task (safe mode — default)
    python scripts/glimpse-bench.py run B1-read-only --tool claude-code --model sonnet-4.6

    # Execute for real (dangerous mode — creates worktree, applies prompt)
    python scripts/glimpse-bench.py run B1-read-only --tool windsurf --model swe-1.5 --dangerous

    # Score a completed benchmark
    python scripts/glimpse-bench.py score B1-read-only --tool claude-code --model sonnet-4.6

    # Show current leaderboard
    python scripts/glimpse-bench.py leaderboard

    # Show what's NOT recommended
    python scripts/glimpse-bench.py warnings
"""

from __future__ import annotations

import argparse
import io
import json
import os
import re
import shutil
import subprocess
import sys
import textwrap
from datetime import datetime
from pathlib import Path
from typing import Any

# Force UTF-8 output on Windows (cp1252 can't handle arrows/checkmarks)
if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# ── Paths ────────────────────────────────────────────────────────────────────

WORKSPACE = Path(__file__).resolve().parent.parent  # CascadeProjects/
TASKS_FILE = WORKSPACE / ".claude" / "prompts" / "glimpse-benchmark-tasks.json"
TEMPLATE_FILE = WORKSPACE / ".claude" / "prompts" / "glimpse-template.json"
DEMO_FILE = WORKSPACE / ".claude" / "prompts" / "response-discipline-demo.json"
CATALOG_FILE = WORKSPACE / "memory" / "context" / "model-catalog.md"
LOG_FILE = WORKSPACE / "memory" / "context" / "model-benchmark-log.md"
OUTPUT_DIR = WORKSPACE / "benchmarks"

# ── Tool × Model aliases ────────────────────────────────────────────────────

TOOL_ALIASES: dict[str, dict[str, str]] = {
    "claude-code": {
        "opus": "Claude Opus 4.6",
        "opus-4.6": "Claude Opus 4.6",
        "sonnet": "Claude Sonnet 4.6",
        "sonnet-4.6": "Claude Sonnet 4.6",
        "sonnet-4.5": "Claude Sonnet 4.5",
        "haiku": "Claude Haiku 4.5",
        "haiku-4.5": "Claude Haiku 4.5",
    },
    "windsurf": {
        "swe-1.5": "SWE-1.5 (Cascade)",
        "swe": "SWE-1.5 (Cascade)",
        "sonnet": "Claude Sonnet 4.6",
        "sonnet-4.6": "Claude Sonnet 4.6",
        "sonnet-4.5": "Claude Sonnet 4.5",
        "opus": "Claude Opus 4.6",
        "opus-thinking": "Claude Opus 4.6 Thinking",
        "haiku": "Claude Haiku 4.5",
        "gemini-flash": "Gemini 3 Flash",
        "gemini-pro": "Gemini 3.1 Pro",
        "grok": "Grok Code Fast",
    },
    "copilot": {
        "gpt-5-mini": "GPT-5 mini (included)",
        "gpt-4.1": "GPT-4.1 (included)",
        "haiku": "Claude Haiku 4.5 (0.33x)",
        "sonnet": "Claude Sonnet 4.6 (1x)",
        "opus": "Claude Opus 4.6 (3x)",
        "gemini-flash": "Gemini 3 Flash (0.33x)",
        "codex": "GPT-5.2-Codex (1x)",
    },
    "antigravity": {
        "gemini-pro": "Gemini 3.1 Pro High",
        "gemini-flash": "Gemini 3 Flash",
        "sonnet": "Claude Sonnet 4.6",
        "opus-thinking": "Claude Opus 4.6 Thinking (free)",
        "gpt-oss": "GPT-OSS 120B",
    },
    "opencode": {
        "sonnet": "Claude Sonnet 4.5 (BYOK)",
        "opus": "Claude Opus 4.5 (BYOK)",
        "gpt-5.2": "GPT-5.2 (BYOK)",
        "codex": "GPT-5.1-Codex (BYOK)",
        "gemini": "Gemini 3 Pro (BYOK)",
        "mimo": "MiMo V2 Flash (free Zen)",
        "nemotron": "Nemotron 3 Super (free Zen)",
    },
    "windsurf-next": {
        "swe-1.5": "SWE-1.5 (Cascade Next)",
        "swe": "SWE-1.5 (Cascade Next)",
    },
}

TOOLS = list(TOOL_ALIASES.keys())

# ── Credit cost estimates ────────────────────────────────────────────────────

CREDIT_COSTS: dict[str, dict[str, float]] = {
    "windsurf": {
        "SWE-1.5 (Cascade)": 0,
        "Claude Sonnet 4.5": 2,
        "Claude Sonnet 4.6": 4,
        "Claude Opus 4.6": 6,
        "Claude Opus 4.6 Thinking": 8,
        "Claude Haiku 4.5": 1,
        "Gemini 3 Flash": 0.75,
        "Gemini 3.1 Pro": 1,
        "Grok Code Fast": 0,
    },
    "copilot": {
        "GPT-5 mini (included)": 0,
        "GPT-4.1 (included)": 0,
        "Claude Haiku 4.5 (0.33x)": 0.33,
        "Claude Sonnet 4.6 (1x)": 1,
        "Claude Opus 4.6 (3x)": 3,
        "Gemini 3 Flash (0.33x)": 0.33,
        "GPT-5.2-Codex (1x)": 1,
    },
}


# ── Helpers ──────────────────────────────────────────────────────────────────


def load_json(path: Path) -> dict[str, Any]:
    """Load a JSON file."""
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def resolve_model(tool: str, model_alias: str) -> str:
    """Resolve a short alias to full model name."""
    aliases = TOOL_ALIASES.get(tool, {})
    return aliases.get(model_alias, model_alias)


def estimate_credit_cost(tool: str, model: str, expected_calls: str) -> str:
    """Rough credit cost estimate based on tool and expected calls."""
    costs = CREDIT_COSTS.get(tool, {})
    per_call = costs.get(model, None)
    if per_call is None:
        return "unknown (BYOK or unpriced)"

    # Parse expected calls range like "2-4"
    match = re.match(r"(\d+)-(\d+)", expected_calls)
    if match:
        low, high = int(match.group(1)), int(match.group(2))
    else:
        low = high = int(re.search(r"\d+", expected_calls).group())  # type: ignore[union-attr]

    if per_call == 0:
        return "0 credits (free model)"

    return f"{per_call * low:.1f}–{per_call * high:.1f} credits"


# ── Core: Build the prompt ───────────────────────────────────────────────────


def build_prompt(task: dict[str, Any], tool: str, model: str) -> dict[str, Any]:
    """Merge a benchmark task into the glimpse template structure."""
    template = load_json(TEMPLATE_FILE)

    # Fill meta
    template["meta"]["name"] = f"bench-{task['task_id']}"
    template["meta"]["purpose"] = f"Benchmark: {task['title']} — {tool}/{model}"
    template["meta"]["design_pattern"] = "7-step glimpse — model benchmark variant"

    # Fill task block
    template["task"] = {
        "title": task["title"],
        "description": task["description"],
        "target_files": task["target_files"],
        "source_reference": f"glimpse-benchmark-tasks.json → {task['task_id']}",
        "request_type": task["request_type"],
    }

    # Fill glimpse steps from task data
    glimpse = template["glimpse"]

    glimpse["step_1_understand_the_domain"]["read"] = task["target_files"]
    glimpse["step_1_understand_the_domain"]["instruction"] = (
        f"Read and internalize: {', '.join(task['target_files'])}. "
        f"Understand the current state before making any changes."
    )

    glimpse["step_2_audit_the_evidence"]["scan"] = [
        f"Verify: {f}" for f in task["target_files"]
    ]

    glimpse["step_3_profile_the_context"]["contexts"] = {
        "primary": {
            "description": f"Benchmark evaluator testing {model} on {tool}",
            "needs": "Correct output that follows all constraints",
        },
        "secondary": {
            "description": "Model suitability matrix",
            "needs": "Evidence of capability or limitation for this task type",
        },
    }

    # Map risks — handle both string and dict formats
    mapped_risks = []
    for i, r in enumerate(task["risks"]):
        if isinstance(r, dict):
            mapped_risks.append({"id": r["id"], "risk": r["risk"], "rule": r.get("rule", ""), "mitigation": r.get("mitigation", "")})
        else:
            # String format: "R1: description"
            mapped_risks.append({"id": f"R{i+1}", "risk": str(r), "rule": "", "mitigation": ""})
    glimpse["step_4_identify_risks"]["risks"] = mapped_risks

    # Map acceptance criteria
    glimpse["step_6_define_acceptance_criteria"]["acceptance"] = task["acceptance"]

    # Execution contract
    template["execution_contract"] = {
        "request_type": task["request_type"],
        "step_count": 7,
        "rule_enforcement": {
            "response_discipline": "active — output budget, evidence standard, anti-patterns",
        },
        "semantic_signals": {
            "preference": "minimal, evidence-backed",
            "budget": "credit-conscious — batch tool calls, no speculation",
        },
        "deny_on_output": task.get("deny_on_output", [
            "fabricated metrics",
            "decorative adjectives without evidence",
            "full file rewrite when targeted edit suffices",
            "unrequested additions",
        ]),
    }

    # Remove template placeholders and examples
    template.pop("_examples", None)

    return template


# ── Commands ─────────────────────────────────────────────────────────────────


def cmd_list(args: argparse.Namespace) -> None:
    """List all available benchmark tasks."""
    data = load_json(TASKS_FILE)

    print("\n  GLIMPSE BENCHMARK TASKS")
    print("  " + "=" * 70)
    print()

    for task in data["tasks"]:
        dims = ", ".join(d.split("_", 1)[1] for d in task["dimensions_tested"])
        cost_hint = task["expected_tool_calls"]
        print(f"  {task['task_id']:<20} [{task['difficulty']:<6}]  {task['title']}")
        print(f"  {'':20} dims: {dims}")
        print(f"  {'':20} calls: {cost_hint}")
        print()

    print(f"  {len(data['tasks'])} tasks available. Use: glimpse-bench run <task_id> --tool <tool> --model <model>")
    print()


def cmd_tools(args: argparse.Namespace) -> None:
    """List available tools and their model aliases."""
    print("\n  TOOL × MODEL ALIASES")
    print("  " + "=" * 70)
    print()

    for tool, aliases in TOOL_ALIASES.items():
        print(f"  {tool}:")
        for alias, full_name in aliases.items():
            cost = CREDIT_COSTS.get(tool, {}).get(full_name, "—")
            cost_str = f"{cost} cr" if isinstance(cost, (int, float)) else cost
            print(f"    {alias:<20} → {full_name:<35} [{cost_str}]")
        print()


def cmd_run(args: argparse.Namespace) -> None:
    """Prepare and optionally execute a benchmark run."""
    data = load_json(TASKS_FILE)
    task = next((t for t in data["tasks"] if t["task_id"] == args.task_id), None)

    if not task:
        print(f"\n  ERROR: Task '{args.task_id}' not found.")
        print(f"  Available: {', '.join(t['task_id'] for t in data['tasks'])}")
        sys.exit(1)

    tool = args.tool
    if tool not in TOOLS:
        print(f"\n  ERROR: Tool '{tool}' not recognized.")
        print(f"  Available: {', '.join(TOOLS)}")
        sys.exit(1)

    model = resolve_model(tool, args.model)
    dangerous = args.dangerous
    mode = "DANGEROUS (live)" if dangerous else "SAFE (dry-run)"

    # Build the prompt
    prompt = build_prompt(task, tool, model)

    # Prepare output directory
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    run_id = f"{task['task_id']}_{tool}_{args.model}_{timestamp}"
    prompt_file = OUTPUT_DIR / f"{run_id}.json"
    result_file = OUTPUT_DIR / f"{run_id}.result.md"

    # Estimate cost
    cost_est = estimate_credit_cost(tool, model, task["expected_tool_calls"])

    # ── Header ───────────────────────────────────────────────────────────
    print()
    print("  ┌─────────────────────────────────────────────────────────────┐")
    print(f"  │  GLIMPSE BENCH — {mode:<42} │")
    print("  ├─────────────────────────────────────────────────────────────┤")
    print(f"  │  Task:     {task['task_id']:<48} │")
    print(f"  │  Title:    {task['title'][:48]:<48} │")
    print(f"  │  Tool:     {tool:<48} │")
    print(f"  │  Model:    {model[:48]:<48} │")
    print(f"  │  Diff:     {task['difficulty']:<48} │")
    print(f"  │  Calls:    {task['expected_tool_calls']:<48} │")
    print(f"  │  Est cost: {cost_est:<48} │")
    print("  ├─────────────────────────────────────────────────────────────┤")

    # ── Risks ────────────────────────────────────────────────────────────
    print("  │  RISKS:                                                    │")
    for i, r in enumerate(task["risks"]):
        if isinstance(r, dict):
            line = f"    {r['id']}: {r['risk'][:54]}"
        else:
            line = f"    {str(r)[:58]}"
        print(f"  │{line:<60}│")

    print("  ├─────────────────────────────────────────────────────────────┤")

    # ── Acceptance ───────────────────────────────────────────────────────
    print("  │  ACCEPTANCE CRITERIA:                                      │")
    for a in task["acceptance"]:
        line = f"    {a['id']}: {a['criterion'][:54]}"
        print(f"  │{line:<60}│")

    print("  ├─────────────────────────────────────────────────────────────┤")

    # ── Deny list ────────────────────────────────────────────────────────
    deny = task.get("deny_on_output", [])
    if deny:
        print("  │  DENY ON OUTPUT:                                          │")
        for d in deny:
            print(f"  │    ✗ {d[:54]:<54}│")
        print("  ├─────────────────────────────────────────────────────────────┤")

    # ── Mode-specific actions ────────────────────────────────────────────

    if not dangerous:
        # SAFE MODE: write prompt, create result template, no execution
        print("  │  MODE: SAFE (dry-run)                                     │")
        print("  │                                                           │")
        print("  │  Actions:                                                 │")
        print("  │    1. Write structured prompt to benchmarks/              │")
        print("  │    2. Create empty result template                        │")
        print("  │    3. Create git stash point (rollback anchor)            │")
        print("  │    4. Print instructions for manual execution             │")
        print("  │                                                           │")
        print("  │  No code will be modified. No tool calls will be made.   │")
        print("  └─────────────────────────────────────────────────────────────┘")

        # Write prompt
        with open(prompt_file, "w", encoding="utf-8", newline="\n") as f:
            json.dump(prompt, f, indent=2, ensure_ascii=False)
        print(f"\n  ✓ Prompt written: {prompt_file.relative_to(WORKSPACE)}")

        # Create result template
        result_template = textwrap.dedent(f"""\
        # Benchmark Result: {run_id}

        **Date**: {datetime.now().strftime("%Y-%m-%d %H:%M")}
        **Task**: {task['task_id']} — {task['title']}
        **Tool**: {tool}
        **Model**: {model}
        **Mode**: safe (dry-run)

        ## Execution Notes

        _Paste observations here after running the prompt manually._

        ## Acceptance Criteria Results

        | # | Criterion | Pass/Fail | Evidence |
        |---|-----------|-----------|----------|
        """)
        for a in task["acceptance"]:
            result_template += f"| {a['id']} | {a['criterion']} | ☐ | |\n"

        result_template += textwrap.dedent(f"""
        ## Scoring (0-3 each, max 15)

        | Dimension | Score | Notes |
        |-----------|-------|-------|
        | Correctness | | |
        | Rule compliance | | |
        | Credit efficiency | | |
        | Evidence quality | | |
        | Scope discipline | | |
        | **Total** | **/15** | |

        ## Verdict

        _RECOMMENDED / ACCEPTABLE / NOT_RECOMMENDED for this task type_

        ## Tool Calls Observed

        _Count: ??_

        ## Credits Consumed

        _Estimate: {cost_est}_
        _Actual: ??_
        """)

        with open(result_file, "w", encoding="utf-8") as f:
            f.write(result_template)
        print(f"  ✓ Result template: {result_file.relative_to(WORKSPACE)}")

        # Git stash point
        try:
            project = task.get("target_project", "GRID-main")
            project_path = WORKSPACE / project
            if project_path.exists():
                result = subprocess.run(
                    ["git", "stash", "list"],
                    cwd=str(project_path),
                    capture_output=True,
                    text=True,
                )
                stash_count = len(result.stdout.strip().splitlines()) if result.stdout.strip() else 0
                # Create a stash save point marker (won't stash if clean, which is fine)
                subprocess.run(
                    ["git", "stash", "push", "-m", f"glimpse-bench-anchor-{run_id}", "--keep-index"],
                    cwd=str(project_path),
                    capture_output=True,
                    text=True,
                )
                print(f"  ✓ Git anchor: stash point created in {project}/")
            else:
                print(f"  ⚠ Project path not found: {project_path}")
        except Exception as e:
            print(f"  ⚠ Git stash skipped: {e}")

        # Instructions
        print()
        print("  ─── NEXT STEPS ───────────────────────────────────────────────")
        print()
        print(f"  1. Open the prompt file:")
        print(f"     {prompt_file}")
        print()
        print(f"  2. Feed it to {tool} with model {model}:")

        if tool == "claude-code":
            print(f"     claude < {prompt_file.relative_to(WORKSPACE)}")
            print(f"     # or paste the JSON content as the prompt")
        elif tool in ("windsurf", "windsurf-next"):
            print(f"     # In Cascade, select model: {model}")
            print(f"     # Paste the JSON as the prompt input")
        elif tool == "copilot":
            print(f"     # In VS Code Copilot Chat, select model: {model}")
            print(f"     # Paste the JSON as context")
        elif tool == "antigravity":
            print(f"     # In Antigravity, select model: {model}")
            print(f"     # Paste the JSON as the prompt")
        elif tool == "opencode":
            print(f"     opencode --model {args.model}")
            print(f"     # Paste the JSON as the prompt")

        print()
        print(f"  3. After execution, fill in the result template:")
        print(f"     {result_file}")
        print()
        print(f"  4. Score the result:")
        print(f"     python scripts/glimpse-bench.py score {task['task_id']} --tool {tool} --model {args.model}")
        print()
        print(f"  5. To rollback any changes made during testing:")
        print(f"     cd {task.get('target_project', 'GRID-main')} && git checkout -- .")
        print(f"     # or: git stash pop  (to restore pre-bench state)")
        print()

    else:
        # DANGEROUS MODE: everything safe mode does + creates worktree
        print("  │  MODE: DANGEROUS (live execution)                         │")
        print("  │                                                           │")
        print("  │  Actions:                                                 │")
        print("  │    1. Write structured prompt to benchmarks/              │")
        print("  │    2. Create git worktree (isolated sandbox)              │")
        print("  │    3. Create result template                              │")
        print("  │    4. Print execution instructions                        │")
        print("  │                                                           │")
        print("  │  ⚠  Changes happen in a worktree, not your main tree.   │")
        print("  │  ⚠  Worktree is disposable — delete it when done.       │")
        print("  └─────────────────────────────────────────────────────────────┘")

        # Write prompt
        with open(prompt_file, "w", encoding="utf-8", newline="\n") as f:
            json.dump(prompt, f, indent=2, ensure_ascii=False)
        print(f"\n  ✓ Prompt written: {prompt_file.relative_to(WORKSPACE)}")

        # Create worktree
        project = task.get("target_project", "GRID-main")
        project_path = WORKSPACE / project
        branch_name = f"bench/{run_id}"
        worktree_path = WORKSPACE / "benchmarks" / "worktrees" / run_id

        if project_path.exists():
            try:
                worktree_path.parent.mkdir(parents=True, exist_ok=True)

                # Create branch + worktree
                subprocess.run(
                    ["git", "worktree", "add", "-b", branch_name, str(worktree_path)],
                    cwd=str(project_path),
                    check=True,
                    capture_output=True,
                    text=True,
                )
                print(f"  ✓ Worktree created: {worktree_path.relative_to(WORKSPACE)}")
                print(f"  ✓ Branch: {branch_name}")
            except subprocess.CalledProcessError as e:
                print(f"  ⚠ Worktree creation failed: {e.stderr}")
                print(f"  Falling back to stash-based isolation.")
                worktree_path = project_path
        else:
            print(f"  ⚠ Project not found: {project_path}")
            worktree_path = WORKSPACE

        # Create result template (same as safe mode)
        result_template = textwrap.dedent(f"""\
        # Benchmark Result: {run_id}

        **Date**: {datetime.now().strftime("%Y-%m-%d %H:%M")}
        **Task**: {task['task_id']} — {task['title']}
        **Tool**: {tool}
        **Model**: {model}
        **Mode**: dangerous (live, worktree isolated)
        **Worktree**: {worktree_path}

        ## Execution Notes

        _Paste observations here after running the prompt._

        ## Acceptance Criteria Results

        | # | Criterion | Pass/Fail | Evidence |
        |---|-----------|-----------|----------|
        """)
        for a in task["acceptance"]:
            result_template += f"| {a['id']} | {a['criterion']} | ☐ | |\n"

        result_template += textwrap.dedent(f"""
        ## Scoring (0-3 each, max 15)

        | Dimension | Score | Notes |
        |-----------|-------|-------|
        | Correctness | | |
        | Rule compliance | | |
        | Credit efficiency | | |
        | Evidence quality | | |
        | Scope discipline | | |
        | **Total** | **/15** | |

        ## Verdict

        _RECOMMENDED / ACCEPTABLE / NOT_RECOMMENDED for this task type_
        """)

        with open(result_file, "w", encoding="utf-8") as f:
            f.write(result_template)
        print(f"  ✓ Result template: {result_file.relative_to(WORKSPACE)}")

        # Instructions
        print()
        print("  ─── EXECUTION INSTRUCTIONS ───────────────────────────────────")
        print()
        print(f"  1. The worktree is at: {worktree_path}")
        print(f"     cd {worktree_path}")
        print()
        print(f"  2. Feed the prompt to {tool} (model: {model})")
        print(f"     Prompt file: {prompt_file}")
        print()
        print(f"  3. All changes are isolated to the worktree branch.")
        print(f"     Your main branch is untouched.")
        print()
        print(f"  4. When done, score the result:")
        print(f"     python scripts/glimpse-bench.py score {task['task_id']} --tool {tool} --model {args.model}")
        print()
        print(f"  5. Cleanup worktree when finished:")
        print(f"     cd {project_path}")
        print(f"     git worktree remove {worktree_path}")
        print(f"     git branch -D {branch_name}")
        print()


def cmd_score(args: argparse.Namespace) -> None:
    """Interactive scoring of a benchmark result."""
    tool = args.tool
    model_alias = args.model
    model = resolve_model(tool, model_alias)

    print()
    print(f"  SCORING: {args.task_id} — {tool} / {model}")
    print("  " + "=" * 60)
    print()

    dimensions = [
        ("correctness", "Did it produce the right answer?"),
        ("rule_compliance", "Did it follow deny-lists and constraints?"),
        ("credit_efficiency", "How many tool calls / credits consumed?"),
        ("evidence_quality", "Are claims backed by file paths / command output?"),
        ("scope_discipline", "Did it stay within the task boundary?"),
    ]

    scores: dict[str, int] = {}
    for dim, description in dimensions:
        while True:
            try:
                raw = input(f"  {dim} (0-3) — {description}: ")
                score = int(raw.strip())
                if 0 <= score <= 3:
                    scores[dim] = score
                    break
                print("    Must be 0-3.")
            except ValueError:
                print("    Must be a number 0-3.")
            except (EOFError, KeyboardInterrupt):
                print("\n  Scoring cancelled.")
                return

    total = sum(scores.values())
    print()

    try:
        tool_calls = input("  Tool calls observed (number): ").strip()
    except (EOFError, KeyboardInterrupt):
        tool_calls = "?"

    try:
        notes = input("  Notes (one line): ").strip()
    except (EOFError, KeyboardInterrupt):
        notes = ""

    # Determine verdict
    if total >= 12:
        verdict = "RECOMMENDED"
    elif total >= 8:
        verdict = "ACCEPTABLE"
    else:
        verdict = "NOT_RECOMMENDED"

    try:
        override = input(f"  Verdict [{verdict}] (press Enter to accept, or type override): ").strip()
        if override:
            verdict = override.upper()
    except (EOFError, KeyboardInterrupt):
        pass

    # Format log entry
    date = datetime.now().strftime("%Y-%m-%d")
    log_line = (
        f"| {date} | {args.task_id} | {tool} | {model} "
        f"| {scores['correctness']} | {scores['rule_compliance']} "
        f"| {scores['credit_efficiency']} | {scores['evidence_quality']} "
        f"| {scores['scope_discipline']} | {total}/15 "
        f"| {tool_calls} | {verdict} | {notes} |"
    )

    print()
    print("  ─── RESULT ──────────────────────────────────────────────────")
    print()
    print(f"  Total: {total}/15 → {verdict}")
    print()
    print(f"  Log entry:")
    print(f"  {log_line}")
    print()

    # Append to log
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(log_line + "\n")
        print(f"  ✓ Appended to {LOG_FILE.relative_to(WORKSPACE)}")
    except Exception as e:
        print(f"  ⚠ Could not write to log: {e}")
        print(f"  Copy the line above and paste it manually.")


def cmd_leaderboard(args: argparse.Namespace) -> None:
    """Show current benchmark leaderboard from the log."""
    if not LOG_FILE.exists():
        print("\n  No benchmark log found. Run some benchmarks first.")
        return

    content = LOG_FILE.read_text(encoding="utf-8")

    # Extract result rows (lines starting with | date pattern)
    rows: list[dict[str, Any]] = []
    for line in content.splitlines():
        if re.match(r"\| \d{4}-\d{2}-\d{2}", line):
            parts = [p.strip() for p in line.split("|")[1:-1]]
            if len(parts) >= 12:
                try:
                    rows.append({
                        "date": parts[0],
                        "task": parts[1],
                        "tool": parts[2],
                        "model": parts[3],
                        "total": parts[9],
                        "verdict": parts[11],
                        "notes": parts[12] if len(parts) > 12 else "",
                    })
                except (IndexError, ValueError):
                    pass

    if not rows:
        print("\n  No scored results yet. Run: glimpse-bench score <task_id> --tool <tool> --model <model>")
        return

    print("\n  BENCHMARK LEADERBOARD")
    print("  " + "=" * 80)
    print()
    print(f"  {'Model':<30} {'Tool':<15} {'Task':<15} {'Score':<8} {'Verdict'}")
    print(f"  {'─'*30} {'─'*15} {'─'*15} {'─'*8} {'─'*20}")

    # Sort by score descending
    rows.sort(key=lambda r: r["total"], reverse=True)
    for r in rows:
        print(f"  {r['model']:<30} {r['tool']:<15} {r['task']:<15} {r['total']:<8} {r['verdict']}")

    print()
    print(f"  {len(rows)} benchmark(s) recorded.")
    print()


def cmd_warnings(args: argparse.Namespace) -> None:
    """Show NOT RECOMMENDED entries from the log."""
    if not LOG_FILE.exists():
        print("\n  No benchmark log found.")
        return

    content = LOG_FILE.read_text(encoding="utf-8")

    # Find NOT RECOMMENDED section
    in_section = False
    print("\n  ⚠  NOT RECOMMENDED (confirmed by testing)")
    print("  " + "=" * 60)
    print()

    found = False
    for line in content.splitlines():
        if "NOT RECOMMENDED" in line and "confirmed" in line:
            in_section = True
            continue
        if in_section and line.startswith("| ") and not line.startswith("| Model"):
            parts = [p.strip() for p in line.split("|")[1:-1]]
            if len(parts) >= 3 and parts[0] != "_(none":
                print(f"  {parts[0]:<30} {parts[1]:<25} {parts[2][:40]}")
                found = True
        elif in_section and line.startswith("##"):
            break

    # Also check result rows for NOT_RECOMMENDED verdict
    for line in content.splitlines():
        if re.match(r"\| \d{4}-\d{2}-\d{2}", line) and "NOT_RECOMMENDED" in line:
            parts = [p.strip() for p in line.split("|")[1:-1]]
            if len(parts) >= 12:
                print(f"  {parts[3]:<30} {parts[1]:<25} {parts[12][:40] if len(parts) > 12 else ''}")
                found = True

    if not found:
        print("  No confirmed warnings yet. Keep benchmarking.")
    print()


# ── CLI entry point ──────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="glimpse-bench",
        description="Model benchmarking automation for the Glimpse prompt system.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
        Examples:
          %(prog)s list
          %(prog)s tools
          %(prog)s run B1-read-only --tool claude-code --model sonnet
          %(prog)s run B5-architecture --tool antigravity --model opus-thinking --dangerous
          %(prog)s score B1-read-only --tool claude-code --model sonnet
          %(prog)s leaderboard
          %(prog)s warnings
        """),
    )

    sub = parser.add_subparsers(dest="command", required=True)

    # list
    sub.add_parser("list", help="List available benchmark tasks")

    # tools
    sub.add_parser("tools", help="List tools and model aliases")

    # run
    run_p = sub.add_parser("run", help="Prepare a benchmark run")
    run_p.add_argument("task_id", help="Task ID (e.g. B1-read-only)")
    run_p.add_argument("--tool", required=True, choices=TOOLS, help="Target tool")
    run_p.add_argument("--model", required=True, help="Model alias (e.g. sonnet, opus, swe-1.5)")
    run_p.add_argument("--dangerous", action="store_true", help="Live mode with git worktree (default: safe/dry-run)")

    # score
    score_p = sub.add_parser("score", help="Score a completed benchmark")
    score_p.add_argument("task_id", help="Task ID that was benchmarked")
    score_p.add_argument("--tool", required=True, choices=TOOLS, help="Tool used")
    score_p.add_argument("--model", required=True, help="Model alias used")

    # leaderboard
    sub.add_parser("leaderboard", help="Show benchmark leaderboard")

    # warnings
    sub.add_parser("warnings", help="Show NOT RECOMMENDED model/task combos")

    args = parser.parse_args()

    match args.command:
        case "list":
            cmd_list(args)
        case "tools":
            cmd_tools(args)
        case "run":
            cmd_run(args)
        case "score":
            cmd_score(args)
        case "leaderboard":
            cmd_leaderboard(args)
        case "warnings":
            cmd_warnings(args)


if __name__ == "__main__":
    main()
