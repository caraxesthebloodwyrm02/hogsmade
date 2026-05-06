#!/usr/bin/env python3
"""Demonstrates agent state visualization in Glass field.

Run Glass first: npm run dev
Then: python scripts/demo-blocker-1-visual-feedback.py

Expected outcome:
- Field shows Spaceman appearing (idle → thinking transition)
- Spaceman pulses during thinking state
- Spaceman glows during writing state
- Field settles during reviewing state
"""

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

def write_state(session_id, agent_state, bridge_path):
    state = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "session_id": session_id,
        "agent_state": agent_state,
        "threshold_state": "ground",
        "progress": 0.0,
        "blocks": [],
        "conversation": [],
        "voices": [],
        "signals": {"git_diff_lines": 0, "iteration_count": 0, "session_age_minutes": 0}
    }
    bridge_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    tmp = bridge_path.parent / f".tmp.{os.getpid()}.demo1"
    tmp.write_text(json.dumps(state, indent=2))
    tmp.chmod(0o600)
    tmp.rename(bridge_path)

if __name__ == "__main__":
    bridge = Path.home() / ".caraxes" / "field-bridge.json"
    sid = f"demo-session-{os.getpid()}"

    print("Phase 1: Session starts → agent idle")
    write_state(sid, "idle", bridge)
    time.sleep(2)

    print("Phase 2: User asks question → agent thinking")
    write_state(sid, "thinking", bridge)
    time.sleep(3)

    print("Phase 3: Agent generates code → writing")
    write_state(sid, "writing", bridge)
    time.sleep(4)

    print("Phase 4: Agent runs tests → reviewing")
    write_state(sid, "reviewing", bridge)
    time.sleep(3)

    print("Phase 5: Work complete → idle")
    write_state(sid, "idle", bridge)
    print("✅ Demonstration complete. Check Glass window for state transitions.")
