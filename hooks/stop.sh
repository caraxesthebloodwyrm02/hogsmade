#!/usr/bin/env bash
# CascadeProjects/hooks/stop.sh
# Claude Code Stop hook — captures Stage 6 reports into the ori notebook.
#
# Trigger: session end (registered under hooks.Stop in ~/.claude/settings.json).
# Reads the session transcript, finds <!-- STAGE-6-REPORT-BEGIN/END --> fences,
# and appends each one as a category:"decision" entry in ~/.ori/notebook/notebook.ndjson.
#
# Writes directly to the NDJSON file (same format as ori-server appendNote) so
# it works even when the MCP server is not running.

set -uo pipefail

# Consume stdin before the Python heredoc takes over
HOOK_EVENT=$(cat)
export HOOK_EVENT

python3 << 'PYEOF'
import datetime
import json
import os
import pathlib
import re
import sys
import time

ORI_DIR = pathlib.Path(os.environ.get("ORI_DATA_DIR", "")).expanduser() or pathlib.Path.home() / ".ori"
NOTEBOOK_DIR = ORI_DIR / "notebook"
NOTEBOOK_FILE = NOTEBOOK_DIR / "notebook.ndjson"

FENCE_START = "<!-- STAGE-6-REPORT-BEGIN -->"
FENCE_END   = "<!-- STAGE-6-REPORT-END -->"

PROJECTS_ROOT = pathlib.Path.home() / ".claude" / "projects"


def generate_id() -> str:
    ts = int(time.time() * 1000)
    import secrets
    rand = secrets.token_hex(4)
    return f"note-{ts}-{rand}"


def find_transcript(event: dict) -> pathlib.Path | None:
    # Primary: Claude Code provides transcript_path directly
    tp = event.get("transcript_path")
    if tp:
        p = pathlib.Path(tp)
        if p.exists():
            return p

    # Fallback: most recently modified session JSONL under ~/.claude/projects/
    if PROJECTS_ROOT.exists():
        candidates = sorted(
            PROJECTS_ROOT.rglob("*.jsonl"),
            key=lambda f: f.stat().st_mtime,
            reverse=True,
        )
        if candidates:
            return candidates[0]
    return None


def extract_reports(transcript: pathlib.Path) -> list[str]:
    reports: list[str] = []
    try:
        text = transcript.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return reports

    for raw_line in text.splitlines():
        try:
            entry = json.loads(raw_line)
        except json.JSONDecodeError:
            continue
        msg = entry.get("message", {})
        if not isinstance(msg, dict) or msg.get("role") != "assistant":
            continue
        content = msg.get("content") or []
        for block in content:
            if not isinstance(block, dict) or block.get("type") != "text":
                continue
            text_body = block.get("text", "")
            pos = 0
            while True:
                start = text_body.find(FENCE_START, pos)
                if start == -1:
                    break
                end = text_body.find(FENCE_END, start + len(FENCE_START))
                if end == -1:
                    break
                body = text_body[start + len(FENCE_START):end].strip()
                if body:
                    reports.append(body)
                pos = end + len(FENCE_END)
    return reports


def extract_title(body: str) -> str:
    for line in body.splitlines():
        stripped = line.lstrip("#").strip()
        if stripped and line.startswith("#"):
            return stripped
    # Fall back to first non-empty line
    for line in body.splitlines():
        if line.strip():
            return line.strip()[:120]
    return "Stage 6 Report"


def extract_tags(body: str) -> list[str]:
    tags = ["stage-6", "stop-hook"]
    m = re.search(r"Row\s+(\d+)", body)
    if m:
        tags.append(f"row-{m.group(1)}")
    # Pick up /command names (word boundary after slash, no path slashes)
    for cmd in re.findall(r"(?<!\w)/([a-z][a-z0-9-]+)(?=\b)", body):
        tag = f"cmd-{cmd}"
        if tag not in tags:
            tags.append(tag)
    return tags


def main() -> None:
    try:
        event = json.loads(os.environ.get("HOOK_EVENT", "{}"))
    except json.JSONDecodeError:
        event = {}

    transcript = find_transcript(event)
    if not transcript:
        sys.exit(0)

    reports = extract_reports(transcript)
    if not reports:
        sys.exit(0)

    NOTEBOOK_DIR.mkdir(parents=True, exist_ok=True)

    written = 0
    for body in reports:
        entry = {
            "id": generate_id(),
            "timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
            "category": "decision",
            "title": extract_title(body),
            "body": body,
            "tags": extract_tags(body),
            "source": "stop-hook",
        }
        with NOTEBOOK_FILE.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
        written += 1

    print(
        f"[stop-hook] wrote {written} notebook entr{'y' if written == 1 else 'ies'} → {NOTEBOOK_FILE}",
        file=sys.stderr,
    )


main()
PYEOF
