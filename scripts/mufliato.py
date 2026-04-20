#!/usr/bin/env python3
"""
mufliato.py — mechanical extraction and substitution for sensitive documentation.

Handles phases 2 and 4 of the Mufliato workflow:
  - Phase 2: scan for sensitive patterns and build an extraction manifest
  - Phase 4: apply a substitution map and write sanitized output

Phase 3 (role distillation) and phase 5 (semantic validation) are LLM work —
they belong in the Mufliato agent workflow, not here.

Usage:
    python scripts/mufliato.py scan <input.md>
    python scripts/mufliato.py sanitize <input.md> [--output <output.md>] [--noise-level low|medium|high]
    python scripts/mufliato.py sanitize <input.md> --submap <submap.json>

Outputs:
    <output.md>           — sanitized document
    .mufliato-log.json    — extraction manifest for auditability
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

# ── Pattern registry ──────────────────────────────────────────────────────────

PATTERNS: list[tuple[str, str, re.Pattern[str]]] = [
    ("abs_path_unix", "absolute path (unix)", re.compile(r"/(?:home|Users|root|var|etc|opt|srv)/\S+")),
    ("abs_path_windows", "absolute path (windows)", re.compile(r"[A-Za-z]:\\Users\\\S+")),
    ("env_assignment", "env var with value", re.compile(r"[A-Z_]{3,}=(?![${\s])\S+")),
    ("api_key_literal", "api key literal", re.compile(r"(?:api_key|apikey|token|secret|password|credential)[=:\s]+['\"]?\S{8,}['\"]?", re.IGNORECASE)),
    ("port_literal", "port number binding", re.compile(r"(?:port|PORT)[=:\s]+(\d{4,5})\b")),
    ("localhost_binding", "localhost binding", re.compile(r"(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d{4,5}")),
    ("deep_path", "deep directory path (depth >2)", re.compile(r"(?:\.{0,2}/[\w.-]+){3,}/[\w.-]+")),
]

# ── Default substitution map ──────────────────────────────────────────────────

DEFAULT_SUBMAP: dict[str, str] = {
    # Exact-match overrides (checked before regex)
}

REGEX_SUBMAP: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"/(?:home|Users|root)/\w+/([\w/.-]+)"), r"/workspace/\1"),
    (re.compile(r"/(?:home|Users|root)/\w+"), "/workspace"),
    (re.compile(r"[A-Za-z]:\\Users\\\w+\\([\w\\.-]+)"), r"C:\\workspace\\\1"),
    (re.compile(r"[A-Za-z]:\\Users\\\w+"), "C:\\workspace"),
    (re.compile(r"(?:api_key|apikey|token|secret|password|credential)([=:\s]+)['\"]?\S{8,}['\"]?", re.IGNORECASE), r"\g<0>".replace(r"\g<0>", "") + "${SECRET}"),
    (re.compile(r"((?:port|PORT)[=:\s]+)\d{4,5}\b"), r"\g<1>${SERVICE_PORT}"),
    (re.compile(r"((?:localhost|127\.0\.0\.1|0\.0\.0\.0):)\d{4,5}"), r"\g<1>${SERVICE_PORT}"),
]

# ── Data model ────────────────────────────────────────────────────────────────

@dataclass
class Finding:
    line: int
    pattern_type: str
    pattern_label: str
    raw_value: str
    context_hint: str


@dataclass
class ExtractionManifest:
    source: str
    source_hash: str
    scan_date: str
    findings: list[Finding] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "source": self.source,
            "source_hash": self.source_hash,
            "scan_date": self.scan_date,
            "findings": [
                {
                    "line": f.line,
                    "pattern_type": f.pattern_type,
                    "pattern_label": f.pattern_label,
                    "raw_value": f.raw_value,
                    "context_hint": f.context_hint,
                }
                for f in self.findings
            ],
        }


# ── Core routines ─────────────────────────────────────────────────────────────

def _context_hint(words: list[str], match_start: int, match_end: int, window: int = 5) -> str:
    """Return up to `window` words surrounding a match for role inference."""
    pre = words[:match_start][-window:]
    post = words[match_end:][:window]
    return " ".join(pre + ["<<<"] + post)


def scan(text: str, source_name: str) -> ExtractionManifest:
    """Phase 2: scan text for sensitive patterns; return extraction manifest."""
    source_hash = hashlib.sha256(text.encode()).hexdigest()[:8]
    manifest = ExtractionManifest(
        source=source_name,
        source_hash=source_hash,
        scan_date=date.today().isoformat(),
    )

    for lineno, line in enumerate(text.splitlines(), start=1):
        words = line.split()
        for pattern_type, pattern_label, pattern in PATTERNS:
            for m in pattern.finditer(line):
                word_positions = [i for i, w in enumerate(words) if m.group() in w]
                pos = word_positions[0] if word_positions else len(words) // 2
                hint = _context_hint(words, max(0, pos - 5), pos + 1)
                manifest.findings.append(
                    Finding(
                        line=lineno,
                        pattern_type=pattern_type,
                        pattern_label=pattern_label,
                        raw_value=m.group(),
                        context_hint=hint,
                    )
                )

    return manifest


def _apply_regex_submap(text: str) -> str:
    """Apply the regex substitution map to text."""
    # api_key pattern needs special handling to preserve key name
    api_re = re.compile(
        r"((?:api_key|apikey|token|secret|password|credential)[=:\s]+)['\"]?\S{8,}['\"]?",
        re.IGNORECASE,
    )
    text = api_re.sub(r"\1${SECRET}", text)

    for pattern, replacement in REGEX_SUBMAP[3:]:  # skip api_key — handled above
        try:
            text = pattern.sub(replacement, text)
        except re.error:
            pass

    # path substitutions (first two entries — do last to avoid double-replacing)
    for pattern, replacement in REGEX_SUBMAP[:3]:
        text = pattern.sub(replacement, text)

    return text


def sanitize(
    text: str,
    source_name: str,
    submap: dict[str, str] | None = None,
) -> tuple[str, ExtractionManifest]:
    """Phase 4: apply substitution map; return (sanitized_text, manifest)."""
    manifest = scan(text, source_name)
    sanitized = text

    # Exact-match substitutions first
    combined_submap = {**DEFAULT_SUBMAP, **(submap or {})}
    for raw, replacement in combined_submap.items():
        sanitized = sanitized.replace(raw, replacement)

    # Regex substitutions
    sanitized = _apply_regex_submap(sanitized)

    return sanitized, manifest


def provenance_footer(manifest: ExtractionManifest, mode: str, audience: str) -> str:
    return (
        f"\n<!-- Sanitized via Mufliato"
        f" | mode={mode}"
        f" | audience={audience}"
        f" | source_hash={manifest.source_hash}"
        f" | date={manifest.scan_date} -->\n"
    )


# ── CLI ───────────────────────────────────────────────────────────────────────

def cmd_scan(args: argparse.Namespace) -> None:
    path = Path(args.input)
    text = path.read_text(encoding="utf-8")
    manifest = scan(text, path.name)

    if not manifest.findings:
        print(f"[mufliato] No sensitive patterns found in {path.name}.")
        return

    print(f"[mufliato] {len(manifest.findings)} finding(s) in {path.name}:\n")
    for f in manifest.findings:
        print(f"  L{f.line:>4}  [{f.pattern_type}]  {f.raw_value!r}")
        print(f"         context: {f.context_hint}")

    log_path = Path(".mufliato-log.json")
    log_path.write_text(json.dumps(manifest.to_dict(), indent=2), encoding="utf-8")
    print(f"\n[mufliato] Extraction manifest written to {log_path}")


def cmd_sanitize(args: argparse.Namespace) -> None:
    input_path = Path(args.input)
    output_path = Path(args.output) if args.output else input_path.with_suffix(".sanitized.md")

    submap: dict[str, str] | None = None
    if args.submap:
        submap = json.loads(Path(args.submap).read_text(encoding="utf-8"))

    text = input_path.read_text(encoding="utf-8")
    sanitized, manifest = sanitize(text, input_path.name, submap=submap)

    mode = "substitute"
    audience = "public"
    sanitized += provenance_footer(manifest, mode=mode, audience=audience)

    output_path.write_text(sanitized, encoding="utf-8")

    log_path = Path(".mufliato-log.json")
    log_path.write_text(json.dumps(manifest.to_dict(), indent=2), encoding="utf-8")

    # Verification pass
    re_scan = scan(sanitized, input_path.name)
    remaining = len(re_scan.findings)

    print(f"[mufliato] Sanitized → {output_path}")
    print(f"[mufliato] Manifest  → {log_path}")
    print(f"[mufliato] Findings before: {len(manifest.findings)}  after: {remaining}")
    if remaining:
        print(f"[mufliato] WARNING: {remaining} pattern(s) survived substitution — review manually or pass to agent workflow for semantic resolution.")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="mufliato",
        description="Mechanical extraction and substitution for sensitive documentation.",
    )
    sub = p.add_subparsers(dest="command", required=True)

    scan_p = sub.add_parser("scan", help="Scan for sensitive patterns (Phase 2 only)")
    scan_p.add_argument("input", help="Input markdown file")

    san_p = sub.add_parser("sanitize", help="Scan + substitute (Phases 2 + 4)")
    san_p.add_argument("input", help="Input markdown file")
    san_p.add_argument("--output", "-o", help="Output path (default: <input>.sanitized.md)")
    san_p.add_argument("--submap", help="JSON file with exact-match substitutions to overlay")
    san_p.add_argument(
        "--noise-level",
        choices=["low", "medium", "high"],
        default="medium",
        help="Reserved for agent workflow — not used by mechanical pass",
    )

    return p


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "scan":
        cmd_scan(args)
    elif args.command == "sanitize":
        cmd_sanitize(args)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
