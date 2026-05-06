#!/usr/bin/env python3
"""Demonstrates bidirectional conversation flow.

Run Glass first: npm run dev
Then: python scripts/demo-blocker-4-bidirectional-conversation.py

This script simulates the agent side of the W5 bridge.
"""

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

def write_conversation(session_id, conv, bridge_path):
    state = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "session_id": session_id,
        "agent_state": "idle",
        "threshold_state": "ground",
        "progress": 0.0,
        "blocks": [],
        "conversation": conv,
        "voices": [],
        "signals": {"git_diff_lines": 0, "iteration_count": 0, "session_age_minutes": 0}
    }
    bridge_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    tmp = bridge_path.parent / f".tmp.{os.getpid()}.demo4"
    tmp.write_text(json.dumps(state, indent=2))
    tmp.chmod(0o600)
    tmp.rename(bridge_path)

if __name__ == "__main__":
    bridge = Path.home() / ".caraxes" / "field-bridge.json"
    sid = f"demo-session-{os.getpid()}"

    conv = [
        {"role": "user", "text": "Show me the last commit.", "timestamp": datetime.now(timezone.utc).isoformat()}
    ]

    print("Step 1: User types in Glass (simulated)")
    write_conversation(sid, conv, bridge)
    time.sleep(3)

    print("Step 2: Agent reads user message")
    print(f"  Found user message: {conv[0]['text']}")
    time.sleep(2)

    print("Step 3: Agent responds via glass_emit_turn")
    conv.append({
        "role": "agent",
        "text": f"I received your message: '{conv[0]['text']}'. Here is the commit...",
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    write_conversation(sid, conv, bridge)

    print("Step 4: Check Glass — agent response should appear")
    print("✅ Demonstration complete.")
