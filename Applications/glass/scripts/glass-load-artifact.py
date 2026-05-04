#!/usr/bin/env python3
"""Load a markdown artifact into the Glass field as an agent note block.

Usage:
  python scripts/glass-load-artifact.py AUTONOMY-ROUTINE-CARD.md
  python scripts/glass-load-artifact.py AUTONOMY-EXERCISE-WORKSHEET.md --x 980 --y 120

The script upserts based on the filename so it can be rerun without duplicating the artifact.
If the bridge file does not exist yet, a minimal valid bridge state is created first.
"""

from __future__ import annotations

import argparse
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def ts() -> str:
    return datetime.now(timezone.utc).isoformat()


def default_bridge_state() -> dict[str, Any]:
    return {
        "timestamp": ts(),
        "session_id": f"autonomy-card-{uuid.uuid4().hex[:8]}",
        "agent_state": "idle",
        "threshold_state": "ground",
        "progress": 0,
        "blocks": [],
        "conversation": [],
        "voices": [],
        "signals": {
            "git_diff_lines": 0,
            "iteration_count": 0,
            "session_age_minutes": 0,
        },
        "_hot_threshold": {
            "git_diff_lines": 200,
            "iteration_count": 15,
            "session_age_minutes": 60,
        },
    }


def read_state(bridge_path: Path) -> dict[str, Any]:
    if not bridge_path.exists():
        return default_bridge_state()
    try:
        return json.loads(bridge_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return default_bridge_state()


def write_state(bridge_path: Path, state: dict[str, Any], dry_run: bool) -> None:
    payload = json.dumps(state, indent=2)
    if dry_run:
        print(payload)
        return

    bridge_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    tmp = bridge_path.parent / f".tmp.{os.getpid()}.autonomy-card"
    tmp.write_text(payload, encoding="utf-8")
    tmp.chmod(0o600)
    tmp.rename(bridge_path)


def load_artifact(artifact_path: Path) -> str:
    content = artifact_path.read_text(encoding="utf-8").strip()
    return f"# Artifact\n\nSource: {artifact_path.name}\n\n{content}\n"


def upsert_artifact_block(state: dict[str, Any], content: str, block_id: str, x: int, y: int) -> dict[str, Any]:
    blocks = state.get("blocks")
    if not isinstance(blocks, list):
        blocks = []

    artifact_block = {
        "id": block_id,
        "type": "note",
        "language": "markdown",
        "content": content,
        "position": {"x": x, "y": y},
        "origin": "agent",
    }

    replaced = False
    updated_blocks: list[dict[str, Any]] = []

    for block in blocks:
        if isinstance(block, dict) and block.get("id") == block_id:
            existing_position = block.get("position") if isinstance(block.get("position"), dict) else None
            if existing_position and x is None and y is None:
                artifact_block["position"] = existing_position
            updated_blocks.append(artifact_block)
            replaced = True
        else:
            updated_blocks.append(block)

    if not replaced:
        updated_blocks.append(artifact_block)

    state["blocks"] = updated_blocks
    state["timestamp"] = ts()
    return state


def main() -> int:
    parser = argparse.ArgumentParser(description="Load a markdown artifact into the Glass field")
    parser.add_argument("artifact", help="Filename of the markdown artifact (e.g., AUTONOMY-ROUTINE-CARD.md)")
    parser.add_argument(
        "--bridge-path",
        default=str(Path.home() / ".caraxes" / "field-bridge.json"),
        help="Path to the Glass bridge JSON file",
    )
    parser.add_argument("--x", type=int, default=980, help="Block x position")
    parser.add_argument("--y", type=int, default=120, help="Block y position")
    parser.add_argument("--dry-run", action="store_true", help="Print resulting bridge JSON")
    args = parser.parse_args()

    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent
    artifact_path = project_root / args.artifact

    if not artifact_path.exists():
        print(f"Error: Artifact not found at {artifact_path}")
        return 1

    bridge_path = Path(args.bridge_path).expanduser().resolve()
    block_id = f"artifact-{artifact_path.stem.lower()}"

    state = read_state(bridge_path)
    artifact_content = load_artifact(artifact_path)
    state = upsert_artifact_block(state, artifact_content, block_id, args.x, args.y)
    write_state(bridge_path, state, args.dry_run)

    if not args.dry_run:
        print(
            json.dumps(
                {
                    "ok": True,
                    "bridge": str(bridge_path),
                    "block_id": block_id,
                    "position": {"x": args.x, "y": args.y},
                }
            )
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
