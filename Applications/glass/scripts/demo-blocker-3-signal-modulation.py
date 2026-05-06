#!/usr/bin/env python3
"""Demonstrates signal-driven field modulation.

Run Glass first: npm run dev
Then: python scripts/demo-blocker-3-signal-modulation.py

Simulates work intensity increasing over time.
Expected outcome:
- Field starts calm
- Field brightens as signals increase
- LFO speeds up
"""

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

def write_signals(session_id, git_lines, iters, bridge_path):
    state = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "session_id": session_id,
        "agent_state": "idle",
        "threshold_state": "ground",
        "progress": 0.0,
        "blocks": [],
        "conversation": [],
        "voices": [],
        "signals": {
            "git_diff_lines": git_lines,
            "iteration_count": iters,
            "session_age_minutes": 5
        }
    }
    bridge_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    tmp = bridge_path.parent / f".tmp.{os.getpid()}.demo3"
    tmp.write_text(json.dumps(state, indent=2))
    tmp.chmod(0o600)
    tmp.rename(bridge_path)

SIGNAL_PROGRESSION = [
    (0, 0, "Session start — no work yet"),
    (20, 2, "First few edits"),
    (50, 5, "Building momentum"),
    (100, 10, "Moderate work volume"),
    (200, 15, "Approaching hot threshold"),
    (300, 25, "Hot session — intense work"),
]

if __name__ == "__main__":
    bridge = Path.home() / ".caraxes" / "field-bridge.json"
    sid = f"demo-session-{os.getpid()}"

    for git_lines, iter_count, label in SIGNAL_PROGRESSION:
        print(f"  {label} (diff: {git_lines}, iters: {iter_count})")
        write_signals(sid, git_lines, iter_count, bridge)
        time.sleep(4)

    print("✅ Demonstration complete.")
