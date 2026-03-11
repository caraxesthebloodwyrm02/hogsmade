#!/usr/bin/env python3
"""
Boundary Invariant Review
=========================
Reads a git diff of safety/, security/, and boundaries/ module changes,
applies structured invariant checks, and produces a GitHub PR review body
(review_output.json) for the boundary-gate workflow.

Output schema:
  {
    "event":    "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
    "body":     "<markdown review body>",
    "blocking": true | false,
    "summary":  { "critical": int, "high": int, "medium": int, "low": int }
  }

Exit 0 → gate passed (caller posts review and continues).
Exit 1 → blocking findings (caller posts review and fails the CI check).
"""

from __future__ import annotations

import json
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from textwrap import dedent


# ──────────────────────────────────────────────────────────────────────────────
# Severity & dimensions
# ──────────────────────────────────────────────────────────────────────────────

class Sev:
    CRITICAL = "CRITICAL"
    HIGH     = "HIGH"
    MEDIUM   = "MEDIUM"
    LOW      = "LOW"
    INFO     = "INFO"

SEV_EMOJI = {
    Sev.CRITICAL: "🔴",
    Sev.HIGH:     "🟠",
    Sev.MEDIUM:   "🟡",
    Sev.LOW:      "🟢",
    Sev.INFO:     "ℹ️",
}

BLOCKING_SEVERITIES = {Sev.CRITICAL, Sev.HIGH}


@dataclass
class Finding:
    severity:       str
    dimension:      str   # Security | Correctness | Audit Integrity | Maintainability
    file:           str
    line_context:   str   # the offending diff line, truncated
    message:        str
    rationale:      str
    recommendation: str


@dataclass
class ReviewResult:
    findings:           list[Finding] = field(default_factory=list)
    positives:          list[str]     = field(default_factory=list)
    files_changed:      list[str]     = field(default_factory=list)
    test_files_changed: list[str]     = field(default_factory=list)
    rules_files_changed: list[str]    = field(default_factory=list)
    test_results_note:  str           = ""


# ──────────────────────────────────────────────────────────────────────────────
# Pattern registry
# (pattern, message, severity, dimension, rationale, recommendation)
# ──────────────────────────────────────────────────────────────────────────────

# Lines removed from boundary modules (lines starting with -)
REMOVED_VALIDATION: list[tuple] = [
    (
        r'^-\s*(assert\s+|raise\s+\w+Error)',
        "Assertion or explicit raise removed",
        Sev.HIGH, "Correctness",
        "Removed assertions eliminate pre/post-condition guarantees that the safety module "
        "relies on. Safety.md golden rule: 'Never remove or weaken existing validation logic.'",
        "Restore the assertion. If the invariant no longer holds, document why in `docs/decisions/DECISIONS.md` "
        "and add a replacement check that covers the same contract.",
    ),
    (
        r'^-.*\b(validate|verify|enforce|check_|require_)\w*\s*\(',
        "Validation/verification call removed",
        Sev.HIGH, "Security",
        "A named validation call was deleted. These calls are the primary enforcement points "
        "for boundary contracts and security invariants.",
        "Keep the call unless the entire validation path is being replaced. "
        "If replacing, ensure the replacement covers all conditions tested in the removed call.",
    ),
    (
        r'^-\s*if\s+not\s+\w*(valid|allowed|authorized|permitted|trusted)',
        "Guard condition removed",
        Sev.HIGH, "Security",
        "A negative guard condition was deleted. These are the system's refusal points — "
        "removing one opens a path that was explicitly blocked.",
        "Restore the guard or document the new path that replaces it. "
        "A removed guard must have a corresponding new check; otherwise it is a bypass.",
    ),
    (
        r'^-.*fail_closed\s*[=:]\s*True',
        "'fail_closed=True' removed",
        Sev.CRITICAL, "Security",
        "'fail_closed=True' in the GATE pipeline means a gate failure blocks the operation. "
        "Removing it converts a blocking gate into a pass-through. "
        "This directly contradicts the GATE contract's trust model: 'Zero trust. Fail closed.'",
        "Do not remove 'fail_closed=True'. If you need graceful degradation at this gate, "
        "change the 'block' action to 'log_and_allow' with an explicit audit entry, "
        "and document the risk tier change.",
    ),
    (
        r'^-.*\bmax_age_seconds\b',
        "Timestamp freshness bound removed",
        Sev.HIGH, "Security",
        "The 'max_age_seconds' parameter enforces envelope expiry (GATE SP-04: timestamp_freshness). "
        "Removing it allows arbitrarily old envelopes to pass — enabling replay attacks.",
        "Keep the freshness bound. If the window needs to change, update the value and "
        "update 'max_age_seconds' in both the gate config and the contract.",
    ),
    (
        r'^-.*\bhmac\.compare_digest\b',
        "Timing-safe comparison (hmac.compare_digest) removed",
        Sev.CRITICAL, "Security",
        "'hmac.compare_digest' prevents timing-based side-channel attacks on HMAC verification (GATE SP-01). "
        "Replacing it with '==' makes fingerprint verification vulnerable to timing oracle attacks.",
        "Always use 'hmac.compare_digest' for secret comparisons. Never use '==' or 'bytes.__eq__'.",
    ),
]

# Lines added that introduce bypass paths (lines starting with +)
BYPASS_ADDED: list[tuple] = [
    (
        r'^\+.*\b(skip_check|bypass_\w+|disable_\w+|allow_all)\s*[=:]\s*True',
        "Bypass/disable flag introduced",
        Sev.CRITICAL, "Security",
        "A named bypass flag was added. Safety.md golden rule: 'Never add bypass paths or "
        "'dev mode' shortcuts.' These are the most dangerous single-line security regressions.",
        "Remove the bypass. If there is a legitimate operational need (e.g., emergency maintenance), "
        "model it as a named approval gate (preparedness tier ≥ 2) with an audit log entry, "
        "not as a silent skip.",
    ),
    (
        r'^\+.*\bif\s+(debug|test_mode|dev_mode|is_test|TEST_ENV)\b.*:\s*return',
        "Early-return in test/debug branch added",
        Sev.HIGH, "Security",
        "An early return gated on a debug/test flag bypasses the downstream validation path. "
        "If this reaches production config, the entire gate is skipped silently.",
        "Remove the early return. Use dependency injection or mock objects in tests — "
        "never add runtime environment branches in validation paths.",
    ),
    (
        r'^\+.*return\s+True\s*(#.*(?:bypass|skip|temp|todo|fixme|hack))?$',
        "Unconditional 'return True' added (possible hardcoded approval)",
        Sev.HIGH, "Correctness",
        "A bare 'return True' in a validation function means it always approves. "
        "Even if temporary, this is a latent bypass that may outlive its intent.",
        "Replace with a proper implementation. If stubbing for development, raise NotImplementedError "
        "instead so CI will fail rather than silently pass.",
    ),
    (
        r'^\+.*\bno_verify\s*=\s*True',
        "'no_verify=True' added",
        Sev.CRITICAL, "Security",
        "Verification is being disabled at the call site. Equivalent to removing the check entirely.",
        "Remove 'no_verify=True'. Identify which specific check is failing and fix it properly.",
    ),
    (
        r'^\+.*\bnonce_check\s*=\s*False',
        "Nonce check disabled",
        Sev.CRITICAL, "Security",
        "Nonces are the GATE contract's anti-replay mechanism (SP-02). Disabling the nonce check "
        "allows previously-seen envelopes to be replayed. GATE KPI-03 threshold is 0 for replay attempts.",
        "Never disable nonce checking. If the nonce registry is broken, fix the registry.",
    ),
]

# Audit trail integrity
AUDIT_REMOVED: list[tuple] = [
    (
        r'^-.*\b(emit_audit|emitAudit|log_event|audit_log|append_audit)\s*\(',
        "Audit emission call removed",
        Sev.HIGH, "Audit Integrity",
        "An audit event emission was removed. The GATE contract requires every gate decision "
        "to be logged to 'gate/audit.ndjson'. Removing an emission creates an unlogged decision path. "
        "GATE never-rule: 'never delete or truncate gate/audit.ndjson'.",
        "Restore the audit emission. If the tool name or event type changed, update the call arguments — "
        "do not remove the call.",
    ),
    (
        r'^-.*\b(gate_id|verdict_code|reason)\b.*[=:]',
        "Audit field (gate_id / verdict_code / reason) removed",
        Sev.MEDIUM, "Audit Integrity",
        "A named audit field was removed from an audit record. GATE axiom AX-03: 'difference has a name — "
        "no unnamed rejections. Every decision is logged with gate_id and reason.'",
        "Restore the field. If the field is being renamed, update all consumers of the audit log.",
    ),
    (
        r'^-.*fail_closed\s*[=:]\s*True.*audit',
        "fail_closed audit-coupled logic removed",
        Sev.HIGH, "Audit Integrity",
        "A fail-closed gate that also triggered an audit log was removed together. "
        "This silently eliminates both the block and the record of the block.",
        "Separate the concerns: restore the audit call even if the gate action changes.",
    ),
]

# Backward compatibility (interface breaks)
INTERFACE_BREAKS: list[tuple] = [
    (
        r'^-\s*def\s+(check_\w+|verify_\w+|enforce_\w+|refuse_\w+)\s*\(',
        "Public validation method removed",
        Sev.HIGH, "Maintainability",
        "A public method of the boundary/safety API was removed. "
        "Safety.md golden rule: 'Always maintain backward compatibility — these are deployed safety contracts.'",
        "Mark it as deprecated and keep the old signature pointing to the new implementation. "
        "Remove only after all call sites have migrated.",
    ),
    (
        r'^-.*\bRefusalScope\.\w+\b',
        "RefusalScope member removed",
        Sev.MEDIUM, "Maintainability",
        "A member of the RefusalScope enum was removed. Any code referencing this member at "
        "runtime will raise AttributeError.",
        "Keep the enum member and mark it as deprecated. "
        "Add a deprecation warning in the docstring.",
    ),
]

ALL_PATTERNS: list[tuple] = (
    REMOVED_VALIDATION + BYPASS_ADDED + AUDIT_REMOVED + INTERFACE_BREAKS
)


# ──────────────────────────────────────────────────────────────────────────────
# Diff parser
# ──────────────────────────────────────────────────────────────────────────────

def parse_diff(diff_text: str) -> dict[str, list[str]]:
    """
    Returns {filepath: [diff_lines]} for each file in the diff.
    Only includes lines from safety/, security/, boundaries/ paths.
    """
    files: dict[str, list[str]] = {}
    current_file: str | None = None

    for line in diff_text.splitlines():
        if line.startswith("diff --git"):
            # "diff --git a/GRID-main/boundaries/refusal.py b/GRID-main/boundaries/refusal.py"
            parts = line.split(" b/")
            if len(parts) >= 2:
                path = parts[-1].strip()
                if any(seg in path for seg in ("safety", "security", "boundaries")):
                    current_file = path
                    files[current_file] = []
                else:
                    current_file = None
        elif current_file is not None:
            files[current_file].append(line)

    return files


def is_test_file(path: str) -> bool:
    return "test" in path.lower() or "spec" in path.lower()


def is_rules_file(path: str) -> bool:
    return path.endswith(".md") and (".claude/rules" in path or ".cursor/rules" in path)


# ──────────────────────────────────────────────────────────────────────────────
# Analysis
# ──────────────────────────────────────────────────────────────────────────────

def analyze(diff_files: dict[str, list[str]], test_results_raw: str) -> ReviewResult:
    result = ReviewResult()

    for filepath, lines in diff_files.items():
        result.files_changed.append(filepath)
        if is_test_file(filepath):
            result.test_files_changed.append(filepath)
        if is_rules_file(filepath):
            result.rules_files_changed.append(filepath)

        for line in lines:
            stripped = line.rstrip()
            for pattern, message, severity, dimension, rationale, recommendation in ALL_PATTERNS:
                if re.search(pattern, stripped):
                    # Truncate very long lines for readability
                    display_line = stripped[:120] + ("…" if len(stripped) > 120 else "")
                    result.findings.append(Finding(
                        severity=severity,
                        dimension=dimension,
                        file=filepath,
                        line_context=display_line,
                        message=message,
                        rationale=rationale,
                        recommendation=recommendation,
                    ))

    # ── Positive signals ───────────────────────────────────────────────────
    if result.test_files_changed:
        result.positives.append(
            f"Test files modified alongside production changes "
            f"({', '.join(Path(f).name for f in result.test_files_changed)}). "
            "This is required by safety.md."
        )
    if result.rules_files_changed:
        result.positives.append(
            f"Rules/governance files updated "
            f"({', '.join(Path(f).name for f in result.rules_files_changed)}). "
            "Keeping rules current with code changes is good practice."
        )

    non_test_src = [f for f in result.files_changed if not is_test_file(f) and not is_rules_file(f)]
    if non_test_src and not result.test_files_changed:
        result.findings.append(Finding(
            severity=Sev.MEDIUM,
            dimension="Maintainability",
            file="(multiple files)",
            line_context="",
            message="No test files modified alongside safety/boundary source changes",
            rationale=(
                "Safety.md golden rule: 'Always add tests for any changes.' "
                "Source files changed: " + ", ".join(Path(f).name for f in non_test_src[:5])
            ),
            recommendation=(
                "Add or update test files under `safety/tests/` or `boundaries/` "
                "that exercise the changed behavior. Run: "
                "`uv run pytest safety/tests/ boundaries/ -q --tb=short`"
            ),
        ))

    # ── Test result note ───────────────────────────────────────────────────
    if "passed" in test_results_raw.lower() or "failed" in test_results_raw.lower():
        lines = [l for l in test_results_raw.splitlines() if l.strip()]
        summary_line = next(
            (l for l in reversed(lines) if re.search(r"\d+\s+(passed|failed|error)", l)),
            ""
        )
        if "failed" in summary_line or "error" in summary_line:
            result.test_results_note = f"⚠️ Test suite status: `{summary_line.strip()}`"
            result.findings.append(Finding(
                severity=Sev.HIGH,
                dimension="Correctness",
                file="(test suite)",
                line_context=summary_line.strip(),
                message="Existing tests failing after this change",
                rationale=(
                    "Safety.md golden rule: 'Always add tests for any changes' — by extension, "
                    "existing tests must continue to pass. 'The wall must hold.' (discipline.md)"
                ),
                recommendation="Fix all test failures before merging. Run: `uv run pytest safety/tests/ boundaries/ -q --tb=short`",
            ))
        elif summary_line:
            result.test_results_note = f"✅ Test suite status: `{summary_line.strip()}`"
            result.positives.append(f"All existing safety/boundary tests passing: `{summary_line.strip()}`")

    return result


# ──────────────────────────────────────────────────────────────────────────────
# Review body rendering
# ──────────────────────────────────────────────────────────────────────────────

SEV_ORDER = [Sev.CRITICAL, Sev.HIGH, Sev.MEDIUM, Sev.LOW, Sev.INFO]

def count_by_sev(findings: list[Finding]) -> dict[str, int]:
    return {s: sum(1 for f in findings if f.severity == s) for s in SEV_ORDER}


def render_review_body(result: ReviewResult) -> str:
    counts = count_by_sev(result.findings)
    blocking = any(f.severity in BLOCKING_SEVERITIES for f in result.findings)
    total = len(result.findings)

    lines: list[str] = []

    # ── Header ──────────────────────────────────────────────────────────────
    if blocking:
        lines.append("## 🔴 Boundary Gate: CHANGES REQUIRED")
        lines.append("")
        lines.append(
            "This PR modifies **safety, security, or boundaries modules** and contains "
            "one or more blocking findings. The invariants these modules enforce are "
            "deployed safety contracts — changes require all findings below to be resolved."
        )
    elif total > 0:
        lines.append("## 🟡 Boundary Gate: Review Notes")
        lines.append("")
        lines.append(
            "This PR modifies **safety, security, or boundaries modules**. "
            "No blocking findings, but there are notes worth addressing before merge."
        )
    else:
        lines.append("## ✅ Boundary Gate: PASSED")
        lines.append("")
        lines.append(
            "This PR modifies **safety, security, or boundaries modules** and passed "
            "all invariant checks. No weakened validation, no bypass paths, "
            "no audit trail gaps detected."
        )

    # ── Scope ──────────────────────────────────────────────────────────────
    lines.append("")
    lines.append("### Scope")
    lines.append(f"**Files reviewed:** {len(result.files_changed)}")
    for f in result.files_changed:
        tag = ""
        if is_test_file(f):
            tag = " _(test)_"
        elif is_rules_file(f):
            tag = " _(rules)_"
        lines.append(f"- `{f}`{tag}")

    if result.test_results_note:
        lines.append("")
        lines.append(f"**CI test run:** {result.test_results_note}")

    # ── Summary table ───────────────────────────────────────────────────────
    if total > 0:
        lines.append("")
        lines.append("### Finding Summary")
        lines.append("")
        lines.append("| Severity | Count |")
        lines.append("|---|---|")
        for sev in SEV_ORDER:
            c = counts[sev]
            if c > 0:
                lines.append(f"| {SEV_EMOJI[sev]} {sev} | {c} |")
        lines.append(f"| **Total** | **{total}** |")

    # ── Findings by severity ────────────────────────────────────────────────
    if result.findings:
        lines.append("")
        lines.append("### Findings")

        for sev in SEV_ORDER:
            sev_findings = [f for f in result.findings if f.severity == sev]
            if not sev_findings:
                continue

            lines.append("")
            lines.append(f"#### {SEV_EMOJI[sev]} {sev}")

            for i, f in enumerate(sev_findings, 1):
                lines.append("")
                lines.append(f"**{i}. {f.message}**  ")
                lines.append(f"_Dimension: {f.dimension}_  ")
                lines.append(f"_File: `{f.file}`_")
                if f.line_context:
                    lines.append("")
                    lines.append("```diff")
                    lines.append(f.line_context)
                    lines.append("```")
                lines.append("")
                lines.append(f"**Why this matters:**  ")
                lines.append(f"{f.rationale}")
                lines.append("")
                lines.append(f"**Recommendation:**  ")
                lines.append(f"{f.recommendation}")

    # ── Positives ───────────────────────────────────────────────────────────
    if result.positives:
        lines.append("")
        lines.append("### ✅ What's Good")
        for p in result.positives:
            lines.append(f"- {p}")

    # ── Reference ───────────────────────────────────────────────────────────
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append(
        "_Governed by `GRID-main/.claude/rules/safety.md` · "
        "GATE contract axioms AX-01–AX-04 · "
        "Boundary engine `boundaries/refusal.py`, `boundaries/boundary.py`_"
    )

    return "\n".join(lines)


# ──────────────────────────────────────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────────────────────────────────────

def main() -> int:
    diff_path         = os.environ.get("DIFF_PATH", "boundary_diff.txt")
    test_results_path = os.environ.get("TEST_RESULTS_PATH", "test_results.txt")

    # Read diff
    try:
        diff_text = Path(diff_path).read_text(encoding="utf-8")
    except FileNotFoundError:
        diff_text = ""
        print(f"[boundary_review] WARNING: diff file not found: {diff_path}", file=sys.stderr)

    # Read test results
    try:
        test_results_raw = Path(test_results_path).read_text(encoding="utf-8")
    except FileNotFoundError:
        test_results_raw = ""

    # Parse & analyze
    diff_files = parse_diff(diff_text)
    result     = analyze(diff_files, test_results_raw)

    # Determine blocking
    blocking = any(f.severity in BLOCKING_SEVERITIES for f in result.findings)
    counts   = count_by_sev(result.findings)

    # Determine GitHub review event
    if blocking:
        event = "REQUEST_CHANGES"
    elif result.findings:
        event = "COMMENT"
    else:
        event = "APPROVE"

    # Render body
    body = render_review_body(result)

    # Write output for the workflow step
    output = {
        "event":    event,
        "body":     body,
        "blocking": blocking,
        "summary":  counts,
    }
    Path("review_output.json").write_text(json.dumps(output, indent=2), encoding="utf-8")

    print(f"[boundary_review] {len(diff_files)} files analyzed, "
          f"{len(result.findings)} findings, "
          f"blocking={blocking}, event={event}")

    return 1 if blocking else 0


if __name__ == "__main__":
    sys.exit(main())
