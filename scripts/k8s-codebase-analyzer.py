#!/usr/bin/env python3
"""
k8s-codebase-analyzer — Kubernetes-style codebase clustering and dependency analysis.

Scans the CascadeProjects workspace and generates a K8s-inspired manifest
with real metrics: file counts, LOC estimates, dependency graphs, health scores,
and eval verdicts for each project "pod."

Output: projects/cluster-manifest.js (loadable by cluster-field.html)

Eval dimensions (from glimpse-bench scoring system):
  - structure (0-3): directory organization, separation of concerns
  - evidence (0-3): documentation quality (README, docs/)
  - resilience (0-3): test coverage, error handling patterns
  - activity (0-3): recency of changes, commit frequency
  - dependency_health (0-3): declared deps, no orphans

Usage:
    python scripts/k8s-codebase-analyzer.py
    python scripts/k8s-codebase-analyzer.py --json   # raw JSON only
"""

from __future__ import annotations

import io
import json
import os
import subprocess
import sys
import time as time_mod
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

WORKSPACE = Path(__file__).resolve().parent.parent

# Primary output location (alongside the HTML files)
OUTPUT_JS = WORKSPACE / "projects" / "cluster-manifest.js"
OUTPUT_JSON = WORKSPACE / "projects" / "cluster-manifest.json"

# Fallback: temp directory (Windows Controlled Folder Access may block projects/)
import tempfile
_TEMP_JS = Path(tempfile.gettempdir()) / "cluster-manifest.js"
_TEMP_JSON = Path(tempfile.gettempdir()) / "cluster-manifest.json"

# ── Project Registry ─────────────────────────────────────────────────────────
# Each entry maps a directory name to its K8s-style metadata.
# The analyzer enriches these with real filesystem metrics.

PROJECTS: dict[str, dict[str, Any]] = {
    "GRID-main": {
        "ns": "system-engineering",
        "name": "GRID",
        "initials": "GR",
        "tier": "T1 Flagship",
        "src_dirs": ["src"],
        "test_dirs": ["tests"],
        "src_exts": {".py"},
        "desc": "Full-stack AI framework. Python 3.13, FastAPI, ChromaDB, Ollama.",
        "labels": ["DDD", "Event-Driven", "Local-First", "Privacy-First"],
        "dep_file": "pyproject.toml",
    },
    "glimpse-engine": {
        "ns": "visual-identity",
        "name": "Glimpse Engine",
        "initials": "GE",
        "tier": "T2 Core",
        "src_dirs": ["."],
        "test_dirs": ["tests"],
        "src_exts": {".js", ".mjs"},
        "desc": "Cognitive analysis engine. Multi-pass pipeline, rules, lenses, presets.",
        "labels": ["Zero-Deps", "8-Phase Pipeline", "Browser-Native"],
        "dep_file": "package.json",
    },
    "glimpse-artifact": {
        "ns": "visual-identity",
        "name": "Glimpse Artifact",
        "initials": "GA",
        "tier": "T3 Supporting",
        "src_dirs": ["src"],
        "test_dirs": [],
        "src_exts": {".tsx", ".ts", ".jsx"},
        "desc": "React component library. CVA, TailwindCSS, shadcn-style.",
        "labels": ["React", "Vite", "TailwindCSS"],
        "dep_file": "package.json",
    },
    "afloat-server": {
        "ns": "visual-identity",
        "name": "Afloat",
        "initials": "AF",
        "tier": "MCP Server",
        "src_dirs": ["src"],
        "test_dirs": [],
        "src_exts": {".ts"},
        "desc": "Workflow orchestration MCP server. Depends on shared-types.",
        "labels": ["MCP", "Workflows"],
        "dep_file": "package.json",
    },
    "echoes-server": {
        "ns": "system-engineering",
        "name": "Echoes",
        "initials": "EC",
        "tier": "MCP Server",
        "src_dirs": ["src"],
        "test_dirs": [],
        "src_exts": {".ts"},
        "desc": "Audit logging and telemetry MCP server.",
        "labels": ["Telemetry", "Audit"],
        "dep_file": "package.json",
    },
    "pulse-server": {
        "ns": "system-engineering",
        "name": "Pulse",
        "initials": "PL",
        "tier": "MCP Server",
        "src_dirs": ["src"],
        "test_dirs": [],
        "src_exts": {".ts"},
        "desc": "Health monitoring, daily briefing, focus sessions.",
        "labels": ["Health", "Briefing", "Focus"],
        "dep_file": "package.json",
    },
    "lots-server": {
        "ns": "system-engineering",
        "name": "Lots",
        "initials": "LT",
        "tier": "MCP Server",
        "src_dirs": ["src"],
        "test_dirs": [],
        "src_exts": {".ts"},
        "desc": "Experiment lab and comparison engine.",
        "labels": ["Experiments", "A/B Testing"],
        "dep_file": "package.json",
    },
    "seeds-server": {
        "ns": "system-engineering",
        "name": "Seeds",
        "initials": "SD",
        "tier": "MCP Server",
        "src_dirs": ["src"],
        "test_dirs": [],
        "src_exts": {".ts"},
        "desc": "Ecosystem scanning and repo health tracking.",
        "labels": ["Ecosystem", "Health"],
        "dep_file": "package.json",
    },
    "maintain-server": {
        "ns": "system-engineering",
        "name": "Maintain",
        "initials": "MT",
        "tier": "MCP Server",
        "src_dirs": ["src"],
        "test_dirs": [],
        "src_exts": {".ts"},
        "desc": "System hygiene, cleanup, diagnostics.",
        "labels": ["Cleanup", "Diagnostics"],
        "dep_file": "package.json",
    },
    "grid-server": {
        "ns": "audience-bridge",
        "name": "GRID Server",
        "initials": "GS",
        "tier": "MCP Server",
        "src_dirs": ["src"],
        "test_dirs": [],
        "src_exts": {".ts"},
        "desc": "GATE governance and envelope verification.",
        "labels": ["GATE", "Governance"],
        "dep_file": "package.json",
    },
    "shared-types": {
        "ns": "audience-bridge",
        "name": "Shared Types",
        "initials": "ST",
        "tier": "Build Dep",
        "src_dirs": ["src"],
        "test_dirs": [],
        "src_exts": {".ts"},
        "desc": "Shared TypeScript types and audit client.",
        "labels": ["Types", "Shared"],
        "dep_file": "package.json",
    },
    "mcp-tool-experiment": {
        "ns": "audience-bridge",
        "name": "MCP Experiment",
        "initials": "MX",
        "tier": "T3 Supporting",
        "src_dirs": ["src", "typescript-sdk/src"],
        "test_dirs": ["typescript-sdk/src"],
        "src_exts": {".ts", ".js"},
        "desc": "MCP TypeScript SDK v2. pnpm monorepo, Vitest, Zod v4.",
        "labels": ["SDK", "pnpm", "Vitest"],
        "dep_file": "package.json",
    },
    "shared-resilience": {
        "ns": "system-engineering",
        "name": "Shared Resilience",
        "initials": "SR",
        "tier": "Build Dep",
        "src_dirs": ["src"],
        "test_dirs": ["tests"],
        "src_exts": {".ts"},
        "desc": "Shared resilience patterns — circuit breakers, retries, rate limiting.",
        "labels": ["Resilience", "Shared", "Patterns"],
        "dep_file": "package.json",
    },
    "glimpse-server": {
        "ns": "visual-identity",
        "name": "Glimpse Server",
        "initials": "GV",
        "tier": "MCP Server",
        "src_dirs": ["src"],
        "test_dirs": [],
        "src_exts": {".ts"},
        "desc": "MCP server exposing Glimpse cognitive engine pipelines.",
        "labels": ["MCP", "Glimpse", "Cognitive"],
        "dep_file": "package.json",
    },
    "symphony-execution-performance": {
        "ns": "system-engineering",
        "name": "Symphony",
        "initials": "SY",
        "tier": "T3 Supporting",
        "path": "projects/symphony-execution-performance/symphony-execution-performance",
        "src_dirs": ["src"],
        "test_dirs": [],
        "src_exts": {".ts"},
        "desc": "Real-time performance dashboard. Express, WebSocket, chokidar.",
        "labels": ["Dashboard", "WebSocket", "Real-Time"],
        "dep_file": "package.json",
    },
}

# Known dependency edges (static + dynamically discovered)
KNOWN_DEPS: list[dict[str, str]] = [
    {"from": "GRID-main", "to": "glimpse-engine", "label": "Event Integration"},
    {"from": "afloat-server", "to": "shared-types", "label": "Type Dependency"},
    {"from": "grid-server", "to": "shared-types", "label": "Type Dependency"},
    {"from": "echoes-server", "to": "shared-types", "label": "Type Dependency"},
    {"from": "pulse-server", "to": "echoes-server", "label": "Audit Client"},
    {"from": "lots-server", "to": "echoes-server", "label": "Audit Client"},
    {"from": "seeds-server", "to": "echoes-server", "label": "Audit Client"},
    {"from": "maintain-server", "to": "echoes-server", "label": "Audit Client"},
    {"from": "grid-server", "to": "shared-resilience", "label": "Resilience Patterns"},
    {"from": "glimpse-server", "to": "glimpse-engine", "label": "Engine Integration"},
]

NAMESPACE_META = {
    "system-engineering": {"label": "System Engineering", "color": "#00ff88"},
    "visual-identity": {"label": "Visual Identity", "color": "#ff00ff"},
    "audience-bridge": {"label": "Audience Bridge", "color": "#00ccff"},
}


# ── Filesystem Scanning ──────────────────────────────────────────────────────


def count_files_and_loc(root: Path, dirs: list[str], exts: set[str]) -> tuple[int, int]:
    """Count source files and lines of code under given directories."""
    file_count = 0
    loc = 0
    for d in dirs:
        scan_dir = root / d
        if not scan_dir.exists():
            continue
        for dirpath, _, filenames in os.walk(scan_dir):
            # Skip node_modules, .venv, __pycache__, .git
            rel = Path(dirpath).relative_to(root)
            parts = rel.parts
            if any(p in {"node_modules", ".venv", "__pycache__", ".git", ".mypy_cache",
                         ".pytest_cache", "dist", "build", ".claude"} for p in parts):
                continue
            for fname in filenames:
                if Path(fname).suffix in exts:
                    file_count += 1
                    fpath = Path(dirpath) / fname
                    try:
                        loc += sum(1 for _ in open(fpath, "rb"))
                    except (OSError, PermissionError):
                        pass
    return file_count, loc


def count_test_files(root: Path, dirs: list[str], exts: set[str]) -> int:
    """Count test files."""
    count = 0
    for d in dirs:
        scan_dir = root / d
        if not scan_dir.exists():
            continue
        for dirpath, _, filenames in os.walk(scan_dir):
            rel = Path(dirpath).relative_to(root)
            if any(p in {"node_modules", ".venv", "__pycache__", ".git"} for p in rel.parts):
                continue
            for fname in filenames:
                if Path(fname).suffix in exts and ("test" in fname.lower() or "spec" in fname.lower()):
                    count += 1
    return count


def get_last_modified(root: Path, dirs: list[str], exts: set[str]) -> str | None:
    """Get the most recent modification time of source files."""
    latest = 0.0
    for d in dirs:
        scan_dir = root / d
        if not scan_dir.exists():
            continue
        for dirpath, _, filenames in os.walk(scan_dir):
            rel = Path(dirpath).relative_to(root)
            if any(p in {"node_modules", ".venv", "__pycache__", ".git"} for p in rel.parts):
                continue
            for fname in filenames:
                if Path(fname).suffix in exts:
                    try:
                        mt = os.path.getmtime(Path(dirpath) / fname)
                        if mt > latest:
                            latest = mt
                    except OSError:
                        pass
    if latest > 0:
        return datetime.fromtimestamp(latest, tz=timezone.utc).isoformat()
    return None


def has_file(root: Path, name: str) -> bool:
    """Check if a file exists in the project root."""
    return (root / name).is_file()


def get_git_status(root: Path) -> str:
    """Check if git working tree is clean."""
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=str(root),
            capture_output=True, text=True, timeout=3,
        )
        if result.returncode == 0:
            return "clean" if not result.stdout.strip() else "dirty"
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        pass
    return "unknown"


def detect_dynamic_deps(root: Path, project_id: str, dep_file: str) -> list[dict[str, str]]:
    """Detect dependencies from package.json or pyproject.toml."""
    deps: list[dict[str, str]] = []
    dep_path = root / dep_file
    if not dep_path.is_file():
        return deps

    try:
        content = dep_path.read_text(encoding="utf-8")
        if dep_file.endswith(".json"):
            data = json.loads(content)
            all_deps = {}
            all_deps.update(data.get("dependencies", {}))
            all_deps.update(data.get("devDependencies", {}))
            # Check for workspace references
            for dep_name, dep_version in all_deps.items():
                if "shared-types" in dep_name or "shared-resilience" in dep_name:
                    target = "shared-types"
                    if target != project_id:
                        deps.append({
                            "from": project_id,
                            "to": target,
                            "label": f"npm: {dep_name}",
                        })
    except (json.JSONDecodeError, OSError):
        pass

    return deps


# ── Eval Scoring (from glimpse-bench dimensions) ────────────────────────────


def compute_eval_scores(
    root: Path,
    project: dict[str, Any],
    file_count: int,
    loc: int,
    test_count: int,
    last_modified: str | None,
    git_status: str,
) -> dict[str, Any]:
    """
    Compute eval scores using dimensions adapted from glimpse-bench:
      structure (0-3), evidence (0-3), resilience (0-3),
      activity (0-3), dependency_health (0-3)
    """
    scores: dict[str, int] = {}

    # STRUCTURE: directory organization, separation of concerns
    structure = 0
    if file_count > 0:
        structure += 1
    has_src = any((root / d).is_dir() for d in project.get("src_dirs", []))
    if has_src:
        structure += 1
    dep_path = root / project.get("dep_file", "")
    if dep_path.is_file():
        structure += 1
    scores["structure"] = min(structure, 3)

    # EVIDENCE: documentation quality
    evidence = 0
    if has_file(root, "README.md"):
        evidence += 1
        # Check README size
        try:
            readme_size = (root / "README.md").stat().st_size
            if readme_size > 500:
                evidence += 1
        except OSError:
            pass
    if (root / "docs").is_dir():
        evidence += 1
    scores["evidence"] = min(evidence, 3)

    # RESILIENCE: test coverage (ratio-aware for fairness across project sizes)
    resilience = 0
    if test_count > 0:
        resilience += 1
    if file_count > 0 and test_count > 0:
        test_ratio = test_count / file_count
        if test_ratio >= 0.1:  # 10%+ test files
            resilience += 1
        if test_ratio >= 0.25:  # 25%+ test files
            resilience += 1
    elif test_count > 10:
        resilience += 1
        if test_count > 50:
            resilience += 1
    scores["resilience"] = min(resilience, 3)

    # ACTIVITY: recency of changes
    activity = 0
    if last_modified:
        try:
            lm = datetime.fromisoformat(last_modified)
            now = datetime.now(timezone.utc)
            days_ago = (now - lm).days
            if days_ago <= 1:
                activity = 3
            elif days_ago <= 7:
                activity = 2
            elif days_ago <= 30:
                activity = 1
        except (ValueError, TypeError):
            pass
    scores["activity"] = activity

    # DEPENDENCY_HEALTH: declared deps, proper config, git tracked
    dep_health = 0
    if dep_path.is_file():
        dep_health += 1
    # Git-tracked (not unknown) is healthy; dirty is fine for active development
    if git_status in ("clean", "dirty"):
        dep_health += 1
    # Has a proper src directory structure
    has_src = any((root / d).is_dir() for d in project.get("src_dirs", []))
    if has_src and file_count > 0:
        dep_health += 1
    scores["dependency_health"] = min(dep_health, 3)

    total = sum(scores.values())
    max_score = 15

    if total >= 12:
        verdict = "RECOMMENDED"
    elif total >= 8:
        verdict = "ACCEPTABLE"
    else:
        verdict = "NEEDS_ATTENTION"

    return {
        "scores": scores,
        "total": total,
        "maxScore": max_score,
        "verdict": verdict,
    }


def compute_health_score(eval_result: dict[str, Any]) -> int:
    """Convert eval total (0-15) to health percentage (0-100)."""
    return round((eval_result["total"] / eval_result["maxScore"]) * 100)


# ── Status Mapping ───────────────────────────────────────────────────────────


def determine_status(health: int, tier: str) -> str:
    """Map health score to K8s-style status."""
    if health >= 80:
        return "production"
    elif health >= 60:
        return "active"
    elif health >= 40:
        return "working"
    else:
        return "pre-alpha"


# ── Format LOC ───────────────────────────────────────────────────────────────


def format_loc(loc: int) -> str:
    if loc >= 100_000:
        return f"{loc // 1000}k+"
    elif loc >= 1_000:
        return f"~{loc // 1000}k"
    return str(loc)


# ── Main Scanner ─────────────────────────────────────────────────────────────


def scan_workspace() -> dict[str, Any]:
    """Scan the workspace and generate a K8s-style cluster manifest."""
    namespaces: dict[str, dict[str, Any]] = {}
    all_services: list[dict[str, str]] = []
    pod_evals: dict[str, dict[str, Any]] = {}

    for project_id, meta in PROJECTS.items():
        root = WORKSPACE / meta.get("path", project_id)
        if not root.is_dir():
            continue

        ns_key = meta["ns"]
        if ns_key not in namespaces:
            ns_meta = NAMESPACE_META.get(ns_key, {"label": ns_key, "color": "#ffffff"})
            namespaces[ns_key] = {"label": ns_meta["label"], "pods": []}

        # Scan metrics
        file_count, loc = count_files_and_loc(root, meta["src_dirs"], meta["src_exts"])
        test_count = count_test_files(root, meta.get("test_dirs", []), meta["src_exts"])
        last_modified = get_last_modified(root, meta["src_dirs"], meta["src_exts"])
        git_status = get_git_status(root)

        # Eval scoring
        eval_result = compute_eval_scores(
            root, meta, file_count, loc, test_count, last_modified, git_status
        )
        health = compute_health_score(eval_result)
        status = determine_status(health, meta["tier"])

        pod_evals[project_id] = eval_result

        pod = {
            "id": project_id,
            "name": meta["name"],
            "initials": meta["initials"],
            "status": status,
            "tier": meta["tier"],
            "loc": format_loc(loc),
            "locRaw": loc,
            "files": file_count,
            "tests": test_count,
            "health": health,
            "lastModified": last_modified,
            "gitStatus": git_status,
            "desc": meta["desc"],
            "labels": meta["labels"],
            "eval": eval_result,
        }

        namespaces[ns_key]["pods"].append(pod)

        # Detect dynamic dependencies
        dynamic_deps = detect_dynamic_deps(root, project_id, meta.get("dep_file", ""))
        all_services.extend(dynamic_deps)

    # Add known static dependencies (deduplicated)
    seen_edges = {(s["from"], s["to"]) for s in all_services}
    for dep in KNOWN_DEPS:
        key = (dep["from"], dep["to"])
        if key not in seen_edges:
            # Only add if both projects exist in scan
            from_exists = any(
                p["id"] == dep["from"]
                for ns in namespaces.values()
                for p in ns["pods"]
            )
            to_exists = any(
                p["id"] == dep["to"]
                for ns in namespaces.values()
                for p in ns["pods"]
            )
            if from_exists and to_exists:
                all_services.append(dep)
                seen_edges.add(key)

    # Compute ecosystem-wide eval summary
    all_totals = [e["total"] for e in pod_evals.values()]
    ecosystem_score = round(sum(all_totals) / len(all_totals) * 100 / 15) if all_totals else 0
    recommended_count = sum(1 for e in pod_evals.values() if e["verdict"] == "RECOMMENDED")
    acceptable_count = sum(1 for e in pod_evals.values() if e["verdict"] == "ACCEPTABLE")

    if ecosystem_score >= 75:
        ecosystem_verdict = "HEALTHY"
    elif ecosystem_score >= 50:
        ecosystem_verdict = "STABLE"
    else:
        ecosystem_verdict = "NEEDS_ATTENTION"

    manifest = {
        "clusterName": "cascade-projects",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "generator": "k8s-codebase-analyzer v1.0",
        "namespaces": namespaces,
        "services": all_services,
        "evalSummary": {
            "ecosystemScore": ecosystem_score,
            "ecosystemVerdict": ecosystem_verdict,
            "projectCount": len(pod_evals),
            "recommended": recommended_count,
            "acceptable": acceptable_count,
            "needsAttention": len(pod_evals) - recommended_count - acceptable_count,
        },
    }

    return manifest


# ── Output ───────────────────────────────────────────────────────────────────


def write_js_manifest(manifest: dict[str, Any], path: Path) -> None:
    """Write manifest as a JS file loadable by cluster-field.html."""
    json_str = json.dumps(manifest, indent=2, ensure_ascii=False)
    js_content = f"// Auto-generated by k8s-codebase-analyzer — {manifest['generatedAt']}\n"
    js_content += f"// Do not edit manually. Re-run: python scripts/k8s-codebase-analyzer.py\n"
    js_content += f"window.LIVE_MANIFEST = {json_str};\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(js_content, encoding="utf-8")


def write_json_manifest(manifest: dict[str, Any], path: Path) -> None:
    """Write raw JSON manifest."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")


def print_summary(manifest: dict[str, Any]) -> None:
    """Print a terminal summary of the scan."""
    ev = manifest["evalSummary"]
    print()
    print("  ┌─────────────────────────────────────────────────────────────┐")
    print(f"  │  K8S CODEBASE ANALYZER — CLUSTER SCAN REPORT              │")
    print("  ├─────────────────────────────────────────────────────────────┤")
    print(f"  │  Cluster:    {manifest['clusterName']:<46} │")
    print(f"  │  Generated:  {manifest['generatedAt'][:19]:<46} │")
    print(f"  │  Projects:   {ev['projectCount']:<46} │")
    print(f"  │  Ecosystem:  {ev['ecosystemScore']}% — {ev['ecosystemVerdict']:<39} │")
    print("  ├─────────────────────────────────────────────────────────────┤")
    print(f"  │  Recommended:    {ev['recommended']:<42} │")
    print(f"  │  Acceptable:     {ev['acceptable']:<42} │")
    print(f"  │  Needs Attention: {ev['needsAttention']:<41} │")
    print("  ├─────────────────────────────────────────────────────────────┤")

    for ns_key, ns in manifest["namespaces"].items():
        ns_label = ns["label"]
        print(f"  │                                                           │")
        print(f"  │  [{ns_key}]  {ns_label:<43} │")
        for pod in ns["pods"]:
            ev_data = pod["eval"]
            bar = "█" * (pod["health"] // 10) + "░" * (10 - pod["health"] // 10)
            status_icon = {"production": "●", "active": "◉", "working": "○", "pre-alpha": "◌"}.get(pod["status"], "?")
            line = f"    {status_icon} {pod['name']:<16} {bar} {pod['health']}%  {pod['loc']:>6} LOC  {ev_data['verdict'][:4]}"
            print(f"  │{line:<60}│")

    print("  ├─────────────────────────────────────────────────────────────┤")
    print(f"  │  Dependencies: {len(manifest['services'])} service connections              │")
    for svc in manifest["services"][:8]:
        line = f"    {svc['from']:<18} → {svc['to']:<18} [{svc['label']}]"
        print(f"  │{line:<60}│")
    if len(manifest["services"]) > 8:
        print(f"  │    ... and {len(manifest['services']) - 8} more{'':<43}│")
    print("  └─────────────────────────────────────────────────────────────┘")
    print()


# ── CLI ──────────────────────────────────────────────────────────────────────


def cmd_rank(manifest: dict[str, Any]) -> None:
    """Print ranked leaderboard of all pods sorted by eval score."""
    pods = []
    for ns in manifest["namespaces"].values():
        for p in ns["pods"]:
            pods.append(p)
    pods.sort(key=lambda p: (-p["eval"]["total"], -p["health"], p["name"]))

    print()
    print("  CLUSTER LEADERBOARD — Ranked by Eval Score")
    print("  " + "=" * 62)
    print(f"  {'#':<4} {'Project':<20} {'Score':>6} {'Health':>8} {'Verdict':<16} {'LOC':>8}")
    print(f"  {'─'*4} {'─'*20} {'─'*6} {'─'*8} {'─'*16} {'─'*8}")
    for i, p in enumerate(pods, 1):
        ev = p["eval"]
        icon = {"RECOMMENDED": "+", "ACCEPTABLE": "~", "NEEDS_ATTENTION": "!"}.get(ev["verdict"], "?")
        print(f"  {icon}{i:<3} {p['name']:<20} {ev['total']:>2}/{ev['maxScore']:<3} {p['health']:>6}%  {ev['verdict']:<16} {p['loc']:>8}")
    print()
    ev_s = manifest["evalSummary"]
    print(f"  Ecosystem: {ev_s['ecosystemScore']}% {ev_s['ecosystemVerdict']}")
    print(f"  Recommended: {ev_s['recommended']} | Acceptable: {ev_s['acceptable']} | Attention: {ev_s['needsAttention']}")
    print()


def cmd_enforce(manifest: dict[str, Any], threshold: int) -> int:
    """Check all pods against a minimum eval score. Returns exit code 1 if any fail."""
    failures = []
    for ns in manifest["namespaces"].values():
        for p in ns["pods"]:
            if p["eval"]["total"] < threshold:
                failures.append((p["name"], p["eval"]["total"], p["eval"]["maxScore"]))
    if failures:
        print(f"\n  ENFORCEMENT FAILED — {len(failures)} pod(s) below threshold {threshold}/15:")
        for name, score, mx in failures:
            print(f"    ! {name}: {score}/{mx}")
        print()
        return 1
    else:
        print(f"\n  ENFORCEMENT PASSED — all pods >= {threshold}/15")
        return 0


def main() -> None:
    json_only = "--json" in sys.argv
    js_only = "--js" in sys.argv
    rank_only = "--rank" in sys.argv
    enforce_flag = any(a.startswith("--enforce") for a in sys.argv)
    enforce_threshold = 8  # default
    for a in sys.argv:
        if a.startswith("--enforce="):
            try:
                enforce_threshold = int(a.split("=", 1)[1])
            except ValueError:
                pass

    manifest = scan_workspace()

    if js_only:
        # Output JS content to stdout for redirection
        json_str = json.dumps(manifest, indent=2, ensure_ascii=False)
        print(f"// Auto-generated by k8s-codebase-analyzer — {manifest['generatedAt']}")
        print(f"// Do not edit manually. Re-run: python scripts/k8s-codebase-analyzer.py")
        print(f"window.LIVE_MANIFEST = {json_str};")
        return

    if rank_only:
        cmd_rank(manifest)
        if enforce_flag:
            sys.exit(cmd_enforce(manifest, enforce_threshold))
        return

    if json_only:
        print(json.dumps(manifest, indent=2, ensure_ascii=False))
        return

    # Try to write files: primary path first, then temp fallback
    written = []
    pairs = [
        (OUTPUT_JS, _TEMP_JS, write_js_manifest, "JS"),
        (OUTPUT_JSON, _TEMP_JSON, write_json_manifest, "JSON"),
    ]
    for primary, fallback, writer, label in pairs:
        for path in [primary, fallback]:
            try:
                writer(manifest, path)
                written.append(str(path))
                break
            except OSError:
                continue

    print_summary(manifest)
    if written:
        for w in written:
            print(f"  Output: {w}")
    else:
        print(f"  Could not write output files. Use --js flag and redirect:")
        print(f"    python scripts/k8s-codebase-analyzer.py --js")
    print()
    print(f"  Open projects/cluster-field.html in a browser to see the live cluster map.")
    print(f"  Rank:    python scripts/k8s-codebase-analyzer.py --rank")
    print(f"  Enforce: python scripts/k8s-codebase-analyzer.py --rank --enforce=8")
    print()

    if enforce_flag:
        sys.exit(cmd_enforce(manifest, enforce_threshold))


if __name__ == "__main__":
    main()
