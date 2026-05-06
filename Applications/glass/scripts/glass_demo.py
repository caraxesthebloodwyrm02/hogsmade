#!/usr/bin/env python3
"""glass_demo.py — Live demo driver for the Glass spatial development environment.

Walks the full field lifecycle — session init, agent state transitions,
signal accumulation, ceremony sequence (ground → elevated → returning),
block emission, and conversation — by writing scripted BridgeState payloads
to the bridge file atomically.

Prerequisites:
    Glass running: npm run dev  (in a separate terminal)

Usage:
    python scripts/glass_demo.py
    python scripts/glass_demo.py --bridge-path /tmp/field-bridge.json
    python scripts/glass_demo.py --speed 2.0   # run at 2× speed
    python scripts/glass_demo.py --dry-run     # print JSON to stdout, no writes
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

# ── Types — mirrors bridge/schema.ts ─────────────────────────────────────────

AgentState = Literal["idle", "thinking", "writing", "reviewing", "elevated"]
ThresholdState = Literal[
    "ground", "evaluating", "floor_rising", "voices_appearing",
    "voice_1_active", "voice_2_active", "voice_3_active",
    "elevated", "returning", "denied",
]


def ts() -> str:
    return datetime.now(timezone.utc).isoformat()


def make_state(
    session_id: str,
    agent_state: AgentState,
    threshold_state: ThresholdState,
    progress: float,
    blocks: list[dict],
    conversation: list[dict],
    voices: list[dict],
    signals: dict[str, int],
) -> dict[str, Any]:
    return {
        "timestamp": ts(),
        "session_id": session_id,
        "agent_state": agent_state,
        "threshold_state": threshold_state,
        "progress": progress,
        "blocks": blocks,
        "conversation": conversation,
        "voices": voices,
        "signals": signals,
    }


# ── Atomic bridge writer ──────────────────────────────────────────────────────

def write_bridge(state: dict, bridge_path: Path, dry_run: bool) -> None:
    payload = json.dumps(state, indent=2)
    if dry_run:
        print(payload)
        return
    bridge_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    tmp = bridge_path.parent / f".tmp.{os.getpid()}.glass_demo"
    tmp.write_text(payload, encoding="utf-8")
    tmp.chmod(0o600)
    tmp.rename(bridge_path)


# ── Step helper ───────────────────────────────────────────────────────────────

def step(label: str, delay: float, speed: float) -> None:
    wait = delay / speed
    print(f"  [{wait:>5.1f}s]  {label}")
    if wait > 0:
        time.sleep(wait)


# ── Demo fixture data ─────────────────────────────────────────────────────────

VOICE_TEMPLATES = [
    {"id": "I",   "color": "amber",  "position": "left",   "text": "", "active": False},
    {"id": "II",  "color": "silver", "position": "center", "text": "", "active": False},
    {"id": "III", "color": "gold",   "position": "right",  "text": "", "active": False},
]

CODE_BLOCK: dict[str, Any] = {
    "id": "demo-block-001",
    "type": "code",
    "language": "typescript",
    "content": (
        "// ModulationEngine — ADSR envelope\n"
        "export function tick(state: ThresholdState, dt: number): BusValues {\n"
        "  const env = ENVELOPES[state];\n"
        "  const lfo = Math.sin(t * env.lfoRate * TAU) * env.lfoDepth;\n"
        "  return { disk: BASE.disk.scale + env.sustain * RECIPE.disk.scale + lfo };\n"
        "}"
    ),
    "position": {"x": 320, "y": 180},
    "origin": "agent",
}

NOTE_BLOCK: dict[str, Any] = {
    "id": "demo-block-002",
    "type": "note",
    "language": "text",
    "content": (
        "Phase 3 — W2: signals wired.\n"
        "git_diff_lines feeds ambient intensity.\n"
        "ModulationEngine sustain scales with signal heat."
    ),
    "position": {"x": 640, "y": 180},
    "origin": "agent",
}

OUTPUT_BLOCK: dict[str, Any] = {
    "id": "demo-block-003",
    "type": "output",
    "language": "text",
    "content": (
        "✓ 133 tests passed in 299ms\n"
        "  bridge-watcher    16 ✓\n"
        "  FieldState        12 ✓\n"
        "  ModulationEngine   9 ✓"
    ),
    "position": {"x": 480, "y": 380},
    "origin": "agent",
}


# ── Demo sequence ─────────────────────────────────────────────────────────────

def run_demo(bridge_path: Path, speed: float, dry_run: bool) -> None:
    session_id = (
        f"demo-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M')}"
        f"-{uuid.uuid4().hex[:8]}"
    )
    conversation: list[dict] = []
    blocks: list[dict] = []
    signals: dict[str, int] = {
        "git_diff_lines": 0,
        "iteration_count": 0,
        "session_age_minutes": 0,
    }

    write_count = 0

    def emit(
        agent_state: AgentState = "idle",
        threshold_state: ThresholdState = "ground",
        progress: float = 0.0,
        voices: list[dict] | None = None,
        label: str = "",
        delay: float = 1.0,
    ) -> None:
        nonlocal write_count
        signals["iteration_count"] += 1
        write_count += 1
        state = make_state(
            session_id=session_id,
            agent_state=agent_state,
            threshold_state=threshold_state,
            progress=progress,
            blocks=list(blocks),
            conversation=list(conversation),
            voices=voices or [],
            signals=dict(signals),
        )
        write_bridge(state, bridge_path, dry_run)
        step(label or f"→ {threshold_state} / {agent_state}", delay, speed)

    # Header
    bridge_display = str(bridge_path)
    if not dry_run:
        print(f"\n╔══════════════════════════════════════════════════╗")
        print(f"║        Glass — Demo Sequence Driver              ║")
        print(f"╠══════════════════════════════════════════════════╣")
        print(f"║  session : {session_id:<38} ║")
        print(f"║  bridge  : {bridge_display:<38} ║")
        print(f"║  speed   : {speed:<38.1f} ║")
        print(f"╚══════════════════════════════════════════════════╝\n")

    # ── Phase 1: Session init ─────────────────────────────────────────────────
    print("Phase 1 · Session init")
    emit(
        agent_state="idle",
        threshold_state="ground",
        progress=0.0,
        label="Session open — ground / idle",
        delay=1.5,
    )

    # ── Phase 2: Agent active ─────────────────────────────────────────────────
    print("\nPhase 2 · Agent active")
    conversation.append({
        "role": "user",
        "text": "Wire up signal-driven modulation for Phase 3 W2.",
        "timestamp": ts(),
    })
    emit(
        agent_state="thinking",
        threshold_state="ground",
        progress=0.0,
        label="User prompt received — agent thinking",
        delay=2.0,
    )

    conversation.append({
        "role": "agent",
        "text": "Reading ModulationEngine and bridge signals now.",
        "timestamp": ts(),
    })
    emit(
        agent_state="writing",
        threshold_state="ground",
        progress=0.0,
        label="Agent writing — conversation grows",
        delay=2.0,
    )

    # ── Phase 3: Signal accumulation ─────────────────────────────────────────
    print("\nPhase 3 · Signal accumulation")
    for diff_lines in [40, 90, 150, 210]:
        signals["git_diff_lines"] = diff_lines
        signals["session_age_minutes"] = diff_lines // 20
        label = f"git_diff_lines={diff_lines:<4}  — field heats up"
        if diff_lines >= 200:
            label += "  ← HOT threshold crossed"
        emit(
            agent_state="writing",
            threshold_state="ground",
            progress=min(diff_lines / 250.0, 1.0),
            label=label,
            delay=1.2,
        )

    # ── Phase 4: Block emission ───────────────────────────────────────────────
    print("\nPhase 4 · Block emission")
    blocks.append(CODE_BLOCK)
    emit(
        agent_state="writing",
        threshold_state="ground",
        progress=0.85,
        label="Code block spawned in field",
        delay=1.5,
    )

    blocks.append(NOTE_BLOCK)
    emit(
        agent_state="reviewing",
        threshold_state="ground",
        progress=0.9,
        label="Note block added — agent reviewing",
        delay=1.5,
    )

    # ── Phase 5: Threshold ceremony ───────────────────────────────────────────
    print("\nPhase 5 · Threshold ceremony")

    # evaluating
    emit(
        agent_state="reviewing",
        threshold_state="evaluating",
        progress=0.0,
        label="Evaluating — threshold line appears",
        delay=2.0,
    )
    for p in [0.25, 0.5, 0.75, 1.0]:
        emit(
            agent_state="reviewing",
            threshold_state="evaluating",
            progress=p,
            label=f"  evaluating  progress={p:.2f}",
            delay=0.8,
        )

    # floor_rising
    emit(
        agent_state="reviewing",
        threshold_state="floor_rising",
        progress=0.0,
        label="Floor rising — disk scales up",
        delay=1.5,
    )
    for p in [0.25, 0.5, 0.75, 1.0]:
        emit(
            agent_state="reviewing",
            threshold_state="floor_rising",
            progress=p,
            label=f"  floor_rising progress={p:.2f}",
            delay=0.6,
        )

    # voices_appearing
    emit(
        agent_state="reviewing",
        threshold_state="voices_appearing",
        progress=0.0,
        label="Voices appearing — three orbs fade in",
        delay=1.5,
    )
    for p in [0.3, 0.6, 1.0]:
        emit(
            agent_state="reviewing",
            threshold_state="voices_appearing",
            progress=p,
            label=f"  voices_appearing progress={p:.1f}",
            delay=0.7,
        )

    # Voice I — Velocity (amber)
    voices: list[dict] = [
        {**VOICE_TEMPLATES[0], "text": "Momentum is high. Diff exceeds threshold. Velocity approves.", "active": True},
        {**VOICE_TEMPLATES[1], "active": False},
        {**VOICE_TEMPLATES[2], "active": False},
    ]
    emit(
        agent_state="elevated",
        threshold_state="voice_1_active",
        progress=0.0,
        voices=voices,
        label="Voice I  (Velocity / amber)  speaks",
        delay=2.5,
    )

    # Voice II — Guard (silver)
    voices = [
        {**VOICE_TEMPLATES[0], "text": "Momentum is high. Velocity approves.", "active": False},
        {**VOICE_TEMPLATES[1], "text": "Test suite green. Safety clears the motion.", "active": True},
        {**VOICE_TEMPLATES[2], "active": False},
    ]
    emit(
        agent_state="elevated",
        threshold_state="voice_2_active",
        progress=0.0,
        voices=voices,
        label="Voice II (Guard / silver)   speaks",
        delay=2.5,
    )

    # Voice III — Lens (gold)
    voices = [
        {**VOICE_TEMPLATES[0], "text": "Momentum is high. Velocity approves.", "active": False},
        {**VOICE_TEMPLATES[1], "text": "Test suite green. Safety clears.", "active": False},
        {**VOICE_TEMPLATES[2], "text": "Signals mapped. Ceremony ratified. Lens confirms.", "active": True},
    ]
    emit(
        agent_state="elevated",
        threshold_state="voice_3_active",
        progress=0.0,
        voices=voices,
        label="Voice III (Lens / gold)     speaks",
        delay=2.5,
    )

    # Elevated — all voices ratified
    all_voices: list[dict] = [
        {**VOICE_TEMPLATES[0], "text": "Velocity approves.", "active": True},
        {**VOICE_TEMPLATES[1], "text": "Safety clears.",     "active": True},
        {**VOICE_TEMPLATES[2], "text": "Lens confirms.",     "active": True},
    ]
    conversation.append({
        "role": "agent",
        "text": "Ceremony elevated. All three voices ratified. W2 complete.",
        "timestamp": ts(),
    })
    emit(
        agent_state="elevated",
        threshold_state="elevated",
        progress=1.0,
        voices=all_voices,
        label="ELEVATED — full ceremony, all voices present",
        delay=3.0,
    )

    # ── Phase 6: Output block + return ────────────────────────────────────────
    print("\nPhase 6 · Output and return")
    blocks.append(OUTPUT_BLOCK)
    emit(
        agent_state="reviewing",
        threshold_state="elevated",
        progress=1.0,
        voices=all_voices,
        label="Test output block emitted",
        delay=1.5,
    )

    # returning
    emit(
        agent_state="idle",
        threshold_state="returning",
        progress=0.0,
        voices=all_voices,
        label="Returning — field settling",
        delay=1.5,
    )
    for p in [0.33, 0.66, 1.0]:
        emit(
            agent_state="idle",
            threshold_state="returning",
            progress=p,
            label=f"  returning progress={p:.2f}",
            delay=0.8,
        )

    # ground — session end
    conversation.append({
        "role": "agent",
        "text": "Session complete. Field returned to ground.",
        "timestamp": ts(),
    })
    emit(
        agent_state="idle",
        threshold_state="ground",
        progress=0.0,
        voices=[],
        label="Ground — session complete",
        delay=1.0,
    )

    if not dry_run:
        print(f"\n✓  Demo complete. {write_count} bridge writes.")
        print(f"   Bridge  : {bridge_path}")
        print(f"   Session : {session_id}\n")


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> int:
    default_bridge = Path(
        os.environ.get("GLASS_BRIDGE_PATH", str(Path.home() / ".caraxes" / "field-bridge.json"))
    )
    parser = argparse.ArgumentParser(
        description="Glass demo driver — walks the full field lifecycle via bridge file writes.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--bridge-path",
        type=Path,
        default=default_bridge,
        metavar="PATH",
        help=f"Bridge file path (default: {default_bridge})",
    )
    parser.add_argument(
        "--speed",
        type=float,
        default=1.0,
        metavar="N",
        help="Playback speed multiplier (default: 1.0)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print bridge JSON to stdout; do not write the bridge file",
    )
    args = parser.parse_args()

    if args.speed <= 0:
        parser.error("--speed must be > 0")

    try:
        run_demo(
            bridge_path=args.bridge_path,
            speed=args.speed,
            dry_run=args.dry_run,
        )
    except KeyboardInterrupt:
        print("\n\n⚠  Demo interrupted by user.")
        return 130

    return 0


if __name__ == "__main__":
    sys.exit(main())
