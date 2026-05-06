#!/usr/bin/env python3
"""Demonstrates Glass ceremony milestone system.

Run Glass first: npm run dev
Then: python scripts/demo-blocker-2-ceremony-milestones.py

Expected outcome:
- Field floor rises
- Three voices appear sequentially
- Each voice delivers assessment
- Field reaches 'elevated' state
"""

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

def write_state(session_id, threshold_state, progress, voices, bridge_path):
    state = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "session_id": session_id,
        "agent_state": "idle",
        "threshold_state": threshold_state,
        "progress": progress,
        "blocks": [],
        "conversation": [],
        "voices": voices,
        "signals": {"git_diff_lines": 200, "iteration_count": 15, "session_age_minutes": 10}
    }
    bridge_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    tmp = bridge_path.parent / f".tmp.{os.getpid()}.demo2"
    tmp.write_text(json.dumps(state, indent=2))
    tmp.chmod(0o600)
    tmp.rename(bridge_path)

CEREMONY_SEQUENCE = [
    ("ground", 0.0, [], "Initial state"),
    ("evaluating", 0.0, [], "Checking if threshold met"),
    ("evaluating", 1.0, [], "Threshold confirmed"),
    ("floor_rising", 0.5, [], "Floor animation begins"),
    ("voices_appearing", 0.3, [], "Voice orbs materialize"),
    ("voice_1_active", 0.0, [
        {"id": "I", "color": "amber", "position": "left",
         "text": "Velocity assessed: 15 iterations, strong momentum", "active": True}
    ], "Voice I: Velocity"),
    ("voice_2_active", 0.0, [
        {"id": "I", "color": "amber", "position": "left", "text": "Velocity passed.", "active": False},
        {"id": "II", "color": "silver", "position": "center",
         "text": "Safety confirmed: triadic guard passing, no regressions", "active": True}
    ], "Voice II: Guard"),
    ("voice_3_active", 0.0, [
        {"id": "I", "color": "amber", "position": "left", "text": "Velocity passed.", "active": False},
        {"id": "II", "color": "silver", "position": "center", "text": "Safety passed.", "active": False},
        {"id": "III", "color": "gold", "position": "right",
         "text": "Clarity achieved: coherent architecture, tests passing", "active": True}
    ], "Voice III: Lens"),
    ("elevated", 0.0, [], "All voices approved — elevated state reached"),
]

if __name__ == "__main__":
    bridge = Path.home() / ".caraxes" / "field-bridge.json"
    sid = f"demo-session-{os.getpid()}"

    for threshold_state, progress, voices, label in CEREMONY_SEQUENCE:
        print(f"  {label}")
        write_state(sid, threshold_state, progress, voices, bridge)
        time.sleep(3)

    print("✅ Demonstration complete. Field is elevated.")
