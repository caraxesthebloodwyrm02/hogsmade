#!/usr/bin/env python3
"""Security-migration stale inventory audit.

Scan-only. Inventories filesystem remnants and line-level stale references,
classifies each finding, and outputs a Markdown report + JSON manifest.

Never mutates any file.
"""

from __future__ import annotations

import argparse
import datetime
import fnmatch
import json
import uuid
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Domain enums
# ---------------------------------------------------------------------------

class FindingType(str, Enum):
    LIVE_CUTOVER_BLOCKER = "live_cutover_blocker"
    ACTIVE_STALE_REFERENCE = "active_stale_reference"
    SAFE_DUPLICATE = "safe_duplicate"
    ORPHAN_REFERENCE = "orphan_reference"
    HISTORICAL_REFERENCE = "historical_reference"
    CANONICAL_SELF_INCONSISTENCY = "canonical_self_inconsistency"


class Status(str, Enum):
    PRESENT = "present"
    MISSING = "missing"
    REFERENCED = "referenced"
    HISTORICAL_ONLY = "historical_only"
    RESOLVED = "resolved"


class Severity(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class RecommendedAction(str, Enum):
    UPDATE_LIVE_REFERENCE = "update_live_reference"
    UPDATE_ACTIVE_DOC_OR_SKILL = "update_active_doc_or_skill"
    RETAIN_HISTORICAL = "retain_historical"
    DELETE_LEGACY_PATH_AFTER_CUTOVER = "delete_legacy_path_after_cutover"
    NO_ACTION = "no_action"


# ---------------------------------------------------------------------------
# Finding data model
# ---------------------------------------------------------------------------

@dataclass
class Finding:
    id: str
    finding_type: FindingType
    severity: Severity
    subject_path: str
    canonical_path: str
    referrer_path: str
    referrer_line: int | None
    status: Status
    historical: bool
    recommended_action: RecommendedAction
    notes: str = ""


# ---------------------------------------------------------------------------
# Ruleset loader
# ---------------------------------------------------------------------------

__all__ = [
    "Finding",
    "FindingType",
    "Severity",
    "Status",
    "RecommendedAction",
    "DEFAULT_SUBJECT_ROOT",
    "resolve_subject_root",
    "classify",
    "build_summary_counts",
    "generate_json_manifest",
    "generate_markdown_report",
    "run_audit",
    "main",
]

_RULESET_PATH = Path(__file__).parent / "migration_ruleset.json"
DEFAULT_SUBJECT_ROOT = Path("/home/caraxes")


def _load_ruleset(path: Path | None = None) -> dict[str, Any]:
    p = path or _RULESET_PATH
    return json.loads(p.read_text())


# ---------------------------------------------------------------------------
# Resolve helpers
# ---------------------------------------------------------------------------

def _legacy_to_canonical(legacy: str, ruleset: dict[str, Any]) -> str | None:
    """Map a legacy path to its canonical replacement by filename match."""
    legacy_name = Path(legacy).name
    for c in ruleset["canonical_paths"]:
        if Path(c).name == legacy_name:
            return c
    return None


def _is_historical_source(path: str, ruleset: dict[str, Any]) -> bool:
    """True if *path* matches a historical source or pattern."""
    for h in ruleset.get("historical_sources", []):
        if _path_matches(path, h):
            return True
    for pat in ruleset.get("historical_patterns", []):
        if fnmatch.fnmatch(path, pat):
            return True
    return False


def _path_matches(path: str, pattern: str) -> bool:
    """Loose path match: exact, endswith, or glob."""
    if path == pattern:
        return True
    if path.endswith(pattern) or pattern.endswith(path):
        return True
    return fnmatch.fnmatch(path, pattern)


def _resolve_subject_path(path_spec: str, subject_root: Path) -> Path:
    """Resolve a ruleset path against the audited subject root."""
    p = Path(path_spec)
    return p if p.is_absolute() else subject_root / p


def _resolve_active_globs(sources: list[str], subject_root: Path) -> list[Path]:
    """Expand glob patterns rooted at *subject_root*; absolute paths kept as-is."""
    out: list[Path] = []
    for src in sources:
        if src.startswith("/"):
            p = Path(src)
            if p.is_file():
                out.append(p)
            elif p.is_dir():
                out.extend(p.rglob("*"))
        else:
            out.extend(subject_root.glob(src))

    unique: list[Path] = []
    seen: set[Path] = set()
    for path in out:
        resolved = path.resolve()
        if resolved in seen or not path.is_file():
            continue
        seen.add(resolved)
        unique.append(path)
    return unique


def resolve_subject_root(subject_root: Path | None = None) -> Path:
    """Return the audited installation root."""
    return subject_root.resolve() if subject_root else DEFAULT_SUBJECT_ROOT


# ---------------------------------------------------------------------------
# Scanner
# ---------------------------------------------------------------------------

@dataclass
class _ScanContext:
    subject_root: Path
    ruleset: dict[str, Any]
    findings: list[Finding] = field(default_factory=list)
    legacy_exists: dict[str, bool] = field(default_factory=dict)
    canonical_exists: dict[str, bool] = field(default_factory=dict)
    active_consumers: set[str] = field(default_factory=set)
    _seq: int = field(default=0, repr=False)
    _seen: set[tuple[str, str, str, int | None]] = field(default_factory=set, repr=False)

    def _next_id(self) -> str:
        self._seq += 1
        return f"SMI-{self._seq:04d}"

    def add(self, **kwargs: Any) -> Finding:
        key = (
            str(kwargs["finding_type"]),
            kwargs["subject_path"],
            kwargs.get("referrer_path", ""),
            kwargs.get("referrer_line"),
        )
        if key in self._seen:
            for existing in self.findings:
                if (
                    str(existing.finding_type),
                    existing.subject_path,
                    existing.referrer_path,
                    existing.referrer_line,
                ) == key:
                    return existing
        self._seen.add(key)
        f = Finding(id=self._next_id(), **kwargs)
        self.findings.append(f)
        return f


def _scan_filesystem(ctx: _ScanContext) -> None:
    """Check presence of canonical and legacy paths on disk."""
    rs = ctx.ruleset

    for cp in rs["canonical_paths"]:
        full = _resolve_subject_path(cp, ctx.subject_root)
        exists = full.exists()
        ctx.canonical_exists[cp] = exists
        if not exists:
            ctx.add(
                finding_type=FindingType.ACTIVE_STALE_REFERENCE,
                severity=Severity.MEDIUM,
                subject_path=cp,
                canonical_path=cp,
                referrer_path="",
                referrer_line=None,
                status=Status.MISSING,
                historical=False,
                recommended_action=RecommendedAction.NO_ACTION,
                notes=f"Canonical file not yet deployed: {cp}",
            )

    for lp in rs["legacy_paths"]:
        ctx.legacy_exists[lp] = Path(lp).exists()


def _scan_live_system_bindings(ctx: _ScanContext) -> None:
    """Scan /etc system files for references to legacy paths."""
    rs = ctx.ruleset
    bindings: dict[str, str] = rs.get("live_system_bindings", {})

    for sys_path, expected_legacy in bindings.items():
        p = Path(sys_path)
        if not p.exists():
            continue
        try:
            content = p.read_text(errors="replace")
        except PermissionError:
            ctx.add(
                finding_type=FindingType.LIVE_CUTOVER_BLOCKER,
                severity=Severity.HIGH,
                subject_path=expected_legacy,
                canonical_path=_legacy_to_canonical(expected_legacy, rs) or "",
                referrer_path=sys_path,
                referrer_line=None,
                status=Status.REFERENCED,
                historical=False,
                recommended_action=RecommendedAction.UPDATE_LIVE_REFERENCE,
                notes=f"Permission denied reading {sys_path}; assumed stale binding.",
            )
            continue

        for lineno, line in enumerate(content.splitlines(), 1):
            if expected_legacy in line:
                ctx.active_consumers.add(expected_legacy)
                ctx.add(
                    finding_type=FindingType.LIVE_CUTOVER_BLOCKER,
                    severity=Severity.HIGH,
                    subject_path=expected_legacy,
                    canonical_path=_legacy_to_canonical(expected_legacy, rs) or "",
                    referrer_path=sys_path,
                    referrer_line=lineno,
                    status=Status.REFERENCED,
                    historical=False,
                    recommended_action=RecommendedAction.UPDATE_LIVE_REFERENCE,
                    notes=f"Live system config still points to legacy path.",
                )
                break  # one finding per binding


def _scan_text_references(ctx: _ScanContext) -> None:
    """Grep active and historical sources for legacy-path references."""
    rs = ctx.ruleset
    legacy_paths: list[str] = rs["legacy_paths"]
    active_files = _resolve_active_globs(rs.get("active_scan_sources", []), ctx.subject_root)
    historical_files = _resolve_active_globs(rs.get("historical_sources", []), ctx.subject_root)
    historical_resolved = {path.resolve() for path in historical_files}
    live_binding_files = {
        Path(path).resolve() for path in rs.get("live_system_bindings", {}) if Path(path).exists()
    }

    active_files = [
        path
        for path in active_files
        if path.resolve() not in historical_resolved and path.resolve() not in live_binding_files
    ]

    all_files = [(f, False) for f in active_files] + [(f, True) for f in historical_files]

    for filepath, is_historical in all_files:
        if not filepath.is_file():
            continue
        try:
            content = filepath.read_text(errors="replace")
        except (PermissionError, OSError):
            continue

        rel = _try_relpath(filepath, ctx.subject_root)
        # Explicitly override historical flag when path matches historical patterns
        if _is_historical_source(rel, rs):
            is_historical = True

        for lineno, line in enumerate(content.splitlines(), 1):
            for lp in legacy_paths:
                if lp not in line:
                    continue
                canonical = _legacy_to_canonical(lp, rs)

                if is_historical:
                    ctx.add(
                        finding_type=FindingType.HISTORICAL_REFERENCE,
                        severity=Severity.INFO,
                        subject_path=lp,
                        canonical_path=canonical or "",
                        referrer_path=rel,
                        referrer_line=lineno,
                        status=Status.HISTORICAL_ONLY,
                        historical=True,
                        recommended_action=RecommendedAction.RETAIN_HISTORICAL,
                        notes="Reference in historical/session artifact.",
                    )
                else:
                    # Check for canonical self-inconsistency
                    is_canonical_file = any(
                        _path_matches(rel, cp) for cp in rs["canonical_paths"]
                    )
                    if is_canonical_file:
                        ctx.active_consumers.add(lp)
                        ctx.add(
                            finding_type=FindingType.CANONICAL_SELF_INCONSISTENCY,
                            severity=Severity.MEDIUM,
                            subject_path=lp,
                            canonical_path=canonical or "",
                            referrer_path=rel,
                            referrer_line=lineno,
                            status=Status.REFERENCED,
                            historical=False,
                            recommended_action=RecommendedAction.UPDATE_ACTIVE_DOC_OR_SKILL,
                            notes="Canonical file still mentions a legacy path.",
                        )
                    else:
                        legacy_exists = ctx.legacy_exists.get(lp, Path(lp).exists())
                        if not legacy_exists:
                            ctx.active_consumers.add(lp)
                            ctx.add(
                                finding_type=FindingType.ORPHAN_REFERENCE,
                                severity=Severity.HIGH,
                                subject_path=lp,
                                canonical_path=canonical or "",
                                referrer_path=rel,
                                referrer_line=lineno,
                                status=Status.MISSING,
                                historical=False,
                                recommended_action=RecommendedAction.UPDATE_ACTIVE_DOC_OR_SKILL,
                                notes="Active source references a legacy path that no longer exists.",
                            )
                        else:
                            ctx.active_consumers.add(lp)
                            ctx.add(
                                finding_type=FindingType.ACTIVE_STALE_REFERENCE,
                                severity=Severity.MEDIUM,
                                subject_path=lp,
                                canonical_path=canonical or "",
                                referrer_path=rel,
                                referrer_line=lineno,
                                status=Status.REFERENCED,
                                historical=False,
                                recommended_action=RecommendedAction.UPDATE_ACTIVE_DOC_OR_SKILL,
                                notes="Active skill/doc/script references a legacy path.",
                            )


def _emit_safe_duplicate_findings(ctx: _ScanContext) -> None:
    """Emit final safe_duplicate findings after all active consumers are known."""
    rs = ctx.ruleset
    for legacy_path in rs["legacy_paths"]:
        legacy_exists = ctx.legacy_exists.get(legacy_path, Path(legacy_path).exists())
        canonical_path = _legacy_to_canonical(legacy_path, rs)
        canonical_exists = (
            ctx.canonical_exists.get(canonical_path, False)
            if canonical_path
            else False
        )
        if legacy_exists and canonical_exists and legacy_path not in ctx.active_consumers:
            ctx.add(
                finding_type=FindingType.SAFE_DUPLICATE,
                severity=Severity.LOW,
                subject_path=legacy_path,
                canonical_path=canonical_path or "",
                referrer_path="",
                referrer_line=None,
                status=Status.PRESENT,
                historical=False,
                recommended_action=RecommendedAction.DELETE_LEGACY_PATH_AFTER_CUTOVER,
                notes="Legacy file present with canonical replacement; no active consumers.",
            )


def _try_relpath(p: Path, root: Path) -> str:
    try:
        return str(p.relative_to(root))
    except ValueError:
        return str(p)


# ---------------------------------------------------------------------------
# Classifier (standalone, for testability)
# ---------------------------------------------------------------------------

def classify(
    *,
    legacy_path: str,
    legacy_exists: bool,
    canonical_path: str | None,
    canonical_exists: bool,
    referrer_path: str | None,
    referrer_line: int | None,
    is_live_system_config: bool,
    is_historical_source: bool,
    is_canonical_file: bool,
    has_active_consumers: bool,
) -> Finding:
    """Pure classification function — no I/O. Deterministic mapping of inputs to Finding."""

    # Rule 1: live system config pointing to legacy + legacy exists
    if is_live_system_config and legacy_exists:
        return Finding(
            id="",
            finding_type=FindingType.LIVE_CUTOVER_BLOCKER,
            severity=Severity.HIGH,
            subject_path=legacy_path,
            canonical_path=canonical_path or "",
            referrer_path=referrer_path or "",
            referrer_line=referrer_line,
            status=Status.REFERENCED,
            historical=False,
            recommended_action=RecommendedAction.UPDATE_LIVE_REFERENCE,
            notes="Live system config still points to legacy path.",
        )

    # Rule 2: historical/session artifact
    if is_historical_source:
        return Finding(
            id="",
            finding_type=FindingType.HISTORICAL_REFERENCE,
            severity=Severity.INFO,
            subject_path=legacy_path,
            canonical_path=canonical_path or "",
            referrer_path=referrer_path or "",
            referrer_line=referrer_line,
            status=Status.HISTORICAL_ONLY,
            historical=True,
            recommended_action=RecommendedAction.RETAIN_HISTORICAL,
            notes="Reference in historical/session artifact.",
        )

    # Rule 3: canonical file self-references legacy path
    if is_canonical_file:
        return Finding(
            id="",
            finding_type=FindingType.CANONICAL_SELF_INCONSISTENCY,
            severity=Severity.MEDIUM,
            subject_path=legacy_path,
            canonical_path=canonical_path or "",
            referrer_path=referrer_path or "",
            referrer_line=referrer_line,
            status=Status.REFERENCED,
            historical=False,
            recommended_action=RecommendedAction.UPDATE_ACTIVE_DOC_OR_SKILL,
            notes="Canonical file still mentions a legacy path.",
        )

    # Rule 4: orphan — legacy path referenced but file is gone
    if not legacy_exists and referrer_path:
        return Finding(
            id="",
            finding_type=FindingType.ORPHAN_REFERENCE,
            severity=Severity.HIGH,
            subject_path=legacy_path,
            canonical_path=canonical_path or "",
            referrer_path=referrer_path or "",
            referrer_line=referrer_line,
            status=Status.MISSING,
            historical=False,
            recommended_action=RecommendedAction.UPDATE_ACTIVE_DOC_OR_SKILL,
            notes="Active source references a legacy path that no longer exists.",
        )

    # Rule 5: active stale reference — active doc/skill points to legacy
    if legacy_exists and has_active_consumers:
        return Finding(
            id="",
            finding_type=FindingType.ACTIVE_STALE_REFERENCE,
            severity=Severity.MEDIUM,
            subject_path=legacy_path,
            canonical_path=canonical_path or "",
            referrer_path=referrer_path or "",
            referrer_line=referrer_line,
            status=Status.REFERENCED,
            historical=False,
            recommended_action=RecommendedAction.UPDATE_ACTIVE_DOC_OR_SKILL,
            notes="Active skill/doc/script references a legacy path.",
        )

    # Rule 6: safe duplicate — exists, canonical exists, no consumers
    if legacy_exists and canonical_exists and not has_active_consumers:
        return Finding(
            id="",
            finding_type=FindingType.SAFE_DUPLICATE,
            severity=Severity.LOW,
            subject_path=legacy_path,
            canonical_path=canonical_path or "",
            referrer_path=referrer_path or "",
            referrer_line=referrer_line,
            status=Status.PRESENT,
            historical=False,
            recommended_action=RecommendedAction.DELETE_LEGACY_PATH_AFTER_CUTOVER,
            notes="Legacy file present with canonical replacement; no active consumers.",
        )

    # Fallback
    return Finding(
        id="",
        finding_type=FindingType.SAFE_DUPLICATE,
        severity=Severity.LOW,
        subject_path=legacy_path,
        canonical_path=canonical_path or "",
        referrer_path=referrer_path or "",
        referrer_line=referrer_line,
        status=Status.PRESENT if legacy_exists else Status.MISSING,
        historical=False,
        recommended_action=RecommendedAction.NO_ACTION,
        notes="No actionable classification.",
    )


# ---------------------------------------------------------------------------
# Report generators
# ---------------------------------------------------------------------------

def build_summary_counts(findings: list[Finding]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for ft in FindingType:
        counts[ft.value] = sum(1 for f in findings if f.finding_type == ft)
    counts["total"] = len(findings)
    return counts


def generate_json_manifest(
    findings: list[Finding],
    scope: str = "security-migration",
) -> dict[str, Any]:
    scan_id = str(uuid.uuid4())
    return {
        "scan_id": scan_id,
        "generated_at": datetime.datetime.now(datetime.UTC).isoformat(),
        "scope": scope,
        "summary_counts": build_summary_counts(findings),
        "findings": [_finding_to_dict(f) for f in findings],
    }


def _finding_to_dict(f: Finding) -> dict[str, Any]:
    return {
        "id": f.id,
        "finding_type": f.finding_type.value,
        "severity": f.severity.value,
        "subject_path": f.subject_path,
        "canonical_path": f.canonical_path,
        "referrer_path": f.referrer_path,
        "referrer_line": f.referrer_line,
        "status": f.status.value,
        "historical": f.historical,
        "recommended_action": f.recommended_action.value,
        "notes": f.notes,
    }


def generate_markdown_report(findings: list[Finding], scope: str = "security-migration") -> str:
    counts = build_summary_counts(findings)
    lines: list[str] = []
    lines.append("# Security-Migration Stale Inventory Audit Report")
    lines.append("")
    lines.append(f"**Scope:** {scope}")
    lines.append(f"**Generated:** {datetime.datetime.now(datetime.UTC).isoformat()}")
    lines.append(f"**Total findings:** {counts['total']}")
    lines.append("")

    # Summary table
    lines.append("## Summary")
    lines.append("")
    lines.append("| Category | Count |")
    lines.append("|---|---|")
    for ft in FindingType:
        lines.append(f"| {ft.value} | {counts[ft.value]} |")
    lines.append("")

    # Group by severity
    for sev in Severity:
        group = [f for f in findings if f.severity == sev]
        if not group:
            continue
        lines.append(f"## {sev.value.upper()} severity ({len(group)})")
        lines.append("")
        for f in group:
            ref = f.referrer_path
            if f.referrer_line:
                ref += f":{f.referrer_line}"
            lines.append(f"- **{f.id}** [{f.finding_type.value}] `{f.subject_path}`")
            if ref:
                lines.append(f"  - Referrer: `{ref}`")
            if f.canonical_path:
                lines.append(f"  - Canonical: `{f.canonical_path}`")
            lines.append(f"  - Status: {f.status.value} | Action: {f.recommended_action.value}")
            if f.notes:
                lines.append(f"  - {f.notes}")
            lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

def run_audit(
    subject_root: Path,
    ruleset_path: Path | None = None,
) -> tuple[list[Finding], dict[str, Any], str]:
    """Execute the full scan pipeline; returns (findings, json_manifest, md_report)."""
    rs = _load_ruleset(ruleset_path)
    ctx = _ScanContext(subject_root=subject_root, ruleset=rs)

    _scan_filesystem(ctx)
    _scan_live_system_bindings(ctx)
    _scan_text_references(ctx)
    _emit_safe_duplicate_findings(ctx)

    manifest = generate_json_manifest(ctx.findings, scope=rs.get("scope", "security-migration"))
    report = generate_markdown_report(ctx.findings, scope=rs.get("scope", "security-migration"))
    return ctx.findings, manifest, report


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _severity_threshold(value: str) -> Severity | None:
    if value == "none":
        return None
    return Severity(value)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Security-migration stale inventory audit (scan-only).",
    )
    parser.add_argument(
        "--json-out",
        type=Path,
        default=None,
        help="Override JSON manifest output path.",
    )
    parser.add_argument(
        "--md-out",
        type=Path,
        default=None,
        help="Override Markdown report output path.",
    )
    parser.add_argument(
        "--fail-on",
        choices=["high", "medium", "none"],
        default="none",
        help="Exit non-zero if any finding meets this severity threshold.",
    )
    parser.add_argument(
        "--ruleset",
        type=Path,
        default=None,
        help="Path to migration ruleset JSON (default: bundled migration_ruleset.json).",
    )
    parser.add_argument(
        "--subject-root",
        type=Path,
        default=None,
        help="Audited installation root (default: /home/caraxes).",
    )

    args = parser.parse_args(argv)

    subject_root = resolve_subject_root(args.subject_root)

    # Default output paths under the audited subject tree.
    audit_dir = subject_root / "roots" / "security" / "audit"
    json_out: Path = args.json_out or audit_dir / "stale_inventory_manifest.json"
    md_out: Path = args.md_out or audit_dir / "stale_inventory_report.md"

    findings, manifest, report = run_audit(subject_root, args.ruleset)

    # Write outputs
    json_out.parent.mkdir(parents=True, exist_ok=True)
    md_out.parent.mkdir(parents=True, exist_ok=True)
    json_out.write_text(json.dumps(manifest, indent=2) + "\n")
    md_out.write_text(report + "\n")

    print(f"Wrote {len(findings)} findings")
    print(f"  JSON: {json_out}")
    print(f"    MD: {md_out}")

    # Exit code based on --fail-on
    threshold = _severity_threshold(args.fail_on)
    if threshold is not None:
        severity_order = [Severity.HIGH, Severity.MEDIUM, Severity.LOW, Severity.INFO]
        cutoff = severity_order.index(threshold)
        failing = [s for s in severity_order[: cutoff + 1]]
        if any(f.severity in failing for f in findings):
            print(f"FAIL: findings at or above {threshold.value} severity detected.")
            return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
