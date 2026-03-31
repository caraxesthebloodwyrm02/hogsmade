#!/usr/bin/env python3
"""Underscore isolation enforcement checker.

Scans Python files for cross-module access to _private names.
Default deny: every hit is a violation unless explicitly exempted.

Exit codes:
  0 — no violations
  1 — violations found
"""

from __future__ import annotations

import ast
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

# ---------------------------------------------------------------------------
# Exemptions — third-party internals and known-acceptable patterns
# ---------------------------------------------------------------------------

THIRD_PARTY_MODULES = frozenset({
    "pandas",
    "prometheus_client",
    "slowapi",
    "httpx",
    "starlette",
    "fastapi",
})

EXEMPT_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"self\._"),      # own-instance private access
    re.compile(r"cls\._"),       # classmethod private access
    re.compile(r"super\(\)\._"), # parent class private
]


@dataclass
class Violation:
    filepath: str
    line: int
    col: int
    code: str
    description: str


@dataclass
class CheckResult:
    violations: list[Violation] = field(default_factory=list)
    files_scanned: int = 0


# ---------------------------------------------------------------------------
# AST-based checker
# ---------------------------------------------------------------------------

class _UnderscoreVisitor(ast.NodeVisitor):
    """Walk an AST and flag cross-module access to _private names."""

    def __init__(self, filepath: str, source_lines: list[str]) -> None:
        self.filepath = filepath
        self.source_lines = source_lines
        self.violations: list[Violation] = []
        self._module_private_names: set[str] = set()
        self._import_violations: list[Violation] = []

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        if node.name.startswith("_") and not node.name.startswith("__"):
            self._module_private_names.add(node.name)
        self.generic_visit(node)

    visit_AsyncFunctionDef = visit_FunctionDef

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        """Flag `from X import _private_name`."""
        if node.names is None:
            return
        for alias in node.names:
            name = alias.name
            if name.startswith("_") and not name.startswith("__"):
                module = node.module or ""
                # Exempt third-party internals
                top_level = module.split(".")[0] if module else ""
                if top_level in THIRD_PARTY_MODULES:
                    continue
                line_text = self._get_line(node.lineno)
                self._import_violations.append(Violation(
                    filepath=self.filepath,
                    line=node.lineno,
                    col=node.col_offset,
                    code=line_text.strip(),
                    description=f"Cross-module import of private name '{name}' from '{module}'",
                ))
        self.generic_visit(node)

    def visit_Attribute(self, node: ast.Attribute) -> None:
        """Flag `obj._private_name` cross-object access."""
        attr = node.attr
        if not attr.startswith("_") or attr.startswith("__"):
            self.generic_visit(node)
            return

        line_text = self._get_line(node.lineno)

        # Exempt self._ and cls._
        for pat in EXEMPT_PATTERNS:
            if pat.search(line_text):
                self.generic_visit(node)
                return

        # Check if the access is on a module-level name (likely cross-module)
        if isinstance(node.value, ast.Name):
            obj_name = node.value.id
            if obj_name in ("self", "cls", "super"):
                self.generic_visit(node)
                return

            self.violations.append(Violation(
                filepath=self.filepath,
                line=node.lineno,
                col=node.col_offset,
                code=line_text.strip(),
                description=f"Cross-module access to '{obj_name}.{attr}'",
            ))

        self.generic_visit(node)

    def _get_line(self, lineno: int) -> str:
        if 0 < lineno <= len(self.source_lines):
            return self.source_lines[lineno - 1]
        return ""

    def get_all_violations(self) -> list[Violation]:
        return self._import_violations + self.violations


def check_file(filepath: Path) -> list[Violation]:
    """Check a single Python file for underscore isolation violations."""
    try:
        source = filepath.read_text(errors="replace")
    except (OSError, PermissionError):
        return []

    try:
        tree = ast.parse(source, filename=str(filepath))
    except SyntaxError:
        return []

    lines = source.splitlines()
    visitor = _UnderscoreVisitor(str(filepath), lines)
    visitor.visit(tree)
    return visitor.get_all_violations()


_EXCLUDE_DIRS = frozenset({".venv", "node_modules", "__pycache__", "site-packages", ".git"})


def check_directory(root: Path, exclude_patterns: list[str] | None = None) -> CheckResult:
    """Recursively check all .py files under *root*."""
    result = CheckResult()

    for py_file in root.rglob("*.py"):
        if any(part in _EXCLUDE_DIRS for part in py_file.parts):
            continue
        result.files_scanned += 1
        violations = check_file(py_file)
        result.violations.extend(violations)

    return result


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(
        description="Underscore isolation enforcement checker (default-deny).",
    )
    parser.add_argument(
        "paths",
        nargs="*",
        type=Path,
        default=[Path(".")],
        help="Directories or files to check.",
    )
    parser.add_argument(
        "--format",
        choices=["text", "json"],
        default="text",
        help="Output format.",
    )
    args = parser.parse_args(argv)

    all_violations: list[Violation] = []
    total_files = 0

    for path in args.paths:
        if path.is_file():
            total_files += 1
            all_violations.extend(check_file(path))
        elif path.is_dir():
            result = check_directory(path)
            total_files += result.files_scanned
            all_violations.extend(result.violations)

    if args.format == "json":
        import json
        records = [
            {
                "file": v.filepath,
                "line": v.line,
                "col": v.col,
                "code": v.code,
                "description": v.description,
            }
            for v in all_violations
        ]
        print(json.dumps({"violations": records, "count": len(records), "files_scanned": total_files}, indent=2))
    else:
        if all_violations:
            for v in all_violations:
                print(f"{v.filepath}:{v.line}:{v.col}: {v.description}")
                print(f"  {v.code}")
            print(f"\n{len(all_violations)} violation(s) in {total_files} files.")
        else:
            print(f"No violations found in {total_files} files.")

    return 1 if all_violations else 0


if __name__ == "__main__":
    raise SystemExit(main())
