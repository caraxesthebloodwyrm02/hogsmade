# integrated shared environment


# [header]
import time
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from control_room.constants import (
    MODULAR_PASS_INDEX,
    PHASE_LANE_ENVELOPE,
    RHYTHM_PASS_COUNT,
    GatePassProfile,
    LaneValue,
)


@dataclass
class EpisodePhase:
    name: str
    duration_seconds: int
    focus_prompt: str
    concurrency_level: str


@dataclass
class EpisodePart:
    index: int
    title: str
    phase_one: EpisodePhase
    phase_two: EpisodePhase

    def duration_seconds(self) -> int:
        return self.phase_one.duration_seconds + self.phase_two.duration_seconds


class InteractiveIterationTool:
    TOTAL_EXECUTION_SECONDS = 1800
    ISOLATION_BREAK_SECONDS = 240
    PHASE_ONE_SECONDS = 210
    PHASE_TWO_SECONDS = 180
    STAGE_SEQUENCE: Tuple[str, str, str, str] = ("setup", "build", "mutation", "closure")

    def __init__(self, parts: Optional[List[EpisodePart]] = None) -> None:
        self.parts = parts if parts is not None else self.default_parts()
        self.gate_passes = self._build_gate_passes()
        self.completed_passes = 0
        self._validate_timing()

    def _build_gate_passes(self) -> List[GatePassProfile]:
        # Delegate to canonical implementation in airflow.py
        from control_room.airflow import AirflowOrchestrator
        return list(AirflowOrchestrator._build_gate_passes())

    def stage_for_part(self, part_index: int) -> str:
        stage_index = min(max(part_index - 1, 0), len(self.STAGE_SEQUENCE) - 1)
        return self.STAGE_SEQUENCE[stage_index]

    def phase_trigger(self, part_index: int, phase_name: str) -> str:
        phase_gate = "phase_one_gate" if "Phase 1" in phase_name else "phase_two_gate"
        return f"part_{part_index}_{phase_gate}"

    def build_trigger_board(self) -> Dict[str, LaneValue]:
        from control_room.constants import TRIGGER_BOARD_LANE_ORDER
        return {
            "entry_lane": "user_confirmed_part_start",
            "phase_lane": PHASE_LANE_ENVELOPE,
            "countdown_lane": "countdown_tick_active",
            "break_lane": "part_index_equals_2",
            "promotion_lane": f"completed_passes_reached_{RHYTHM_PASS_COUNT}",
            "exit_lane": "phase_completion_confirmed",
        }

    def auxiliary_bus_route(self, trigger_board: Dict[str, LaneValue]) -> str:
        from control_room.constants import TRIGGER_BOARD_LANE_ORDER
        return " -> ".join(f"{lane}:{trigger_board[lane]}" for lane in TRIGGER_BOARD_LANE_ORDER)

    def promote_to_modular(self) -> Dict[str, object]:
        """Authoritative state transition: Rhythm -> Modular. Returns trigger context."""
        self.completed_passes = MODULAR_PASS_INDEX
        trigger_board = self.build_trigger_board()
        return {
            "trigger_board": trigger_board,
            "bus_route": self.auxiliary_bus_route(trigger_board),
        }

    def execute_modular_pass(self) -> None:
        context = self.promote_to_modular()
        print("\n===== PASS 7: MODULAR ORCHESTRATION =====")
        print("Mode: Modular")
        print(f"Trigger Board: {context['trigger_board']}")
        print(f"Auxiliary BUS Route: {context['bus_route']}")

    def default_parts(self) -> List[EpisodePart]:
        return [
            EpisodePart(
                index=1,
                title="Cold Open",
                phase_one=EpisodePhase(
                    name="Phase 1 (3-4 min): Setup Pulse",
                    duration_seconds=self.PHASE_ONE_SECONDS,
                    focus_prompt="Define a clear objective and one measurable win.",
                    concurrency_level="single-thread focus",
                ),
                phase_two=EpisodePhase(
                    name="Phase 2 (~3 min): Hook Tightening",
                    duration_seconds=self.PHASE_TWO_SECONDS,
                    focus_prompt="Compress scope and execute one high-impact pass.",
                    concurrency_level="2-stream execution",
                ),
            ),
            EpisodePart(
                index=2,
                title="Pressure Build",
                phase_one=EpisodePhase(
                    name="Phase 1 (3-4 min): Signal Expansion",
                    duration_seconds=self.PHASE_ONE_SECONDS,
                    focus_prompt="Add a second tactic without losing narrative clarity.",
                    concurrency_level="single-thread focus",
                ),
                phase_two=EpisodePhase(
                    name="Phase 2 (~3 min): Conflict Sprint",
                    duration_seconds=self.PHASE_TWO_SECONDS,
                    focus_prompt="Run two quick micro-iterations in parallel.",
                    concurrency_level="high concurrency",
                ),
            ),
            EpisodePart(
                index=3,
                title="Evolution Scene",
                phase_one=EpisodePhase(
                    name="Phase 1 (3-4 min): Mutation Pass",
                    duration_seconds=self.PHASE_ONE_SECONDS,
                    focus_prompt="Introduce one bold variation to shift momentum.",
                    concurrency_level="single-thread focus",
                ),
                phase_two=EpisodePhase(
                    name="Phase 2 (~3 min): X-Factor Window",
                    duration_seconds=self.PHASE_TWO_SECONDS,
                    focus_prompt="Narrow the window and orchestrate concurrent actions.",
                    concurrency_level="high concurrency",
                ),
            ),
            EpisodePart(
                index=4,
                title="Finale",
                phase_one=EpisodePhase(
                    name="Phase 1 (3-4 min): Closure Arc",
                    duration_seconds=self.PHASE_ONE_SECONDS,
                    focus_prompt="Stabilize what worked and remove loose edges.",
                    concurrency_level="single-thread focus",
                ),
                phase_two=EpisodePhase(
                    name="Phase 2 (~3 min): Audience Lock",
                    duration_seconds=self.PHASE_TWO_SECONDS,
                    focus_prompt="Deliver the sharpest version with compact timing.",
                    concurrency_level="high concurrency",
                ),
            ),
        ]

    def _validate_timing(self) -> None:
        active_seconds = sum(part.duration_seconds() for part in self.parts)
        expected_active_seconds = self.TOTAL_EXECUTION_SECONDS - self.ISOLATION_BREAK_SECONDS

        if len(self.parts) != 4:
            raise ValueError("The structure must contain exactly 4 parts.")

        if active_seconds != expected_active_seconds:
            raise ValueError(
                f"Active time must be {expected_active_seconds}s, found {active_seconds}s."
            )

    def airflow_context(self, part_index: int) -> Dict[str, str]:
        """Query control room for airflow+light context at this episode part."""
        from control_room import airflow, light_control

        wait_time_s = (part_index - 1) * 15
        snapshot = airflow.get_airflow_snapshot(wait_time_s=wait_time_s)
        dial_state = airflow.derive_dial_state(snapshot)
        light_state = light_control.lightfunction_logic(snapshot)
        orchestration = airflow.AirflowOrchestrator().run()

        return {
            "part_index": str(part_index),
            "stage": self.stage_for_part(part_index),
            "airflow_category": dial_state.category,
            "light_phase": light_state.phase,
            "beat_phase": orchestration["beat_phase"],
            "fan_speed": str(snapshot.fan_speed),
            "temperature": f"{snapshot.temperature:.1f}",
        }

    def episode_summary(self) -> Dict[str, object]:
        """Build a summary of the episode structure with control room context."""
        parts_summary: List[Dict[str, object]] = []
        for part in self.parts:
            context = self.airflow_context(part.index)
            parts_summary.append({
                "part_index": part.index,
                "title": part.title,
                "stage": context["stage"],
                "airflow_category": context["airflow_category"],
                "light_phase": context["light_phase"],
                "beat_phase": context["beat_phase"],
                "phase_one_duration_s": part.phase_one.duration_seconds,
                "phase_two_duration_s": part.phase_two.duration_seconds,
            })

        return {
            "total_parts": len(self.parts),
            "total_execution_s": self.TOTAL_EXECUTION_SECONDS,
            "isolation_break_s": self.ISOLATION_BREAK_SECONDS,
            "completed_passes": self.completed_passes,
            "gate_pass_count": len(self.gate_passes),
            "parts": parts_summary,
        }

    def _render_overview(self) -> None:
        print("\n=== INTERACTIVE ITERATION TOOL ===")
        print("TV short-episode architecture: 4 parts, 2 phases each")
        print(f"Total execution: {self.TOTAL_EXECUTION_SECONDS}s (30 minutes)")
        print(f"Isolation break: {self.ISOLATION_BREAK_SECONDS}s (8 minutes)")
        print(f"Gate-pass cadence: {self.gate_passes[0].cadence}")
        print(
            f"Mode promotion: Rhythm passes 1-{RHYTHM_PASS_COUNT}, "
            f"Modular pass {MODULAR_PASS_INDEX}"
        )
        try:
            ctx = self.airflow_context(1)
            print(f"Control room: {ctx['airflow_category']} | {ctx['light_phase']}")
        except Exception:
            print("Control room: offline")
        print("The second phase in each part is tighter for engagement and x-factor build-up.\n")

    def run_countdown(self, seconds: int, label: str, speed_multiplier: float) -> None:
        if speed_multiplier <= 0:
            raise ValueError("Speed multiplier must be greater than 0.")

        print(f"\n>> {label} | Duration: {seconds}s")
        print("Type your actions while the timer runs; press Enter when done with this segment.")

        checkpoint = 60
        for remaining in range(seconds, 0, -1):
            if remaining == seconds or remaining <= 10 or remaining % checkpoint == 0:
                print(f"   {remaining:>4}s remaining")
            time.sleep(1 / speed_multiplier)

    def _run_phase(self, part_index: int, phase: EpisodePhase, speed_multiplier: float) -> None:
        print(f"\n{phase.name}")
        print(f"Stage: {self.stage_for_part(part_index)} | Trigger: {self.phase_trigger(part_index, phase.name)}")
        print(f"Focus: {phase.focus_prompt}")
        print(f"Concurrency: {phase.concurrency_level}")
        input("Press Enter to start this phase...")
        self.run_countdown(phase.duration_seconds, phase.name, speed_multiplier)
        input("Phase complete. Press Enter to continue...\n")

    def run(self, speed_multiplier: float = 1.0) -> None:
        self._render_overview()
        input("Press Enter to launch Part 1...\n")

        for part in self.parts:
            print(f"\n===== PART {part.index}: {part.title} [{self.stage_for_part(part.index)}] =====")
            self._run_phase(part.index, part.phase_one, speed_multiplier)
            self._run_phase(part.index, part.phase_two, speed_multiplier)

            if part.index == 2:
                print("\n===== ISOLATION BREAK SESSION =====")
                print("Disconnect, no new input, let the previous iteration settle.")
                input("Press Enter to begin the 240s isolation break...")
                self.run_countdown(
                    self.ISOLATION_BREAK_SECONDS,
                    "Isolation Break Session",
                    speed_multiplier,
                )
                input("Break complete. Press Enter to enter Part 3...\n")

        self.completed_passes = RHYTHM_PASS_COUNT
        self.execute_modular_pass()

        print("\n=== EPISODE EXECUTION COMPLETE ===")
        print("4-part structure complete across 30 minutes with an 8-minute isolation break.")
        print("Review output signal and choose what evolves into the next episode.")


def choose_speed_multiplier() -> float:
    print("\nTiming mode:")
    print("- Real-time mode: multiplier 1.0 (full 30-minute run)")
    print("- Compressed mode: multiplier > 1.0 (faster demo)")

    raw = input("Enter speed multiplier (default 1.0): ").strip()
    if not raw:
        return 1.0

    try:
        value = float(raw)
    except ValueError as exc:
        raise ValueError("Speed multiplier must be a number.") from exc

    if value <= 0:
        raise ValueError("Speed multiplier must be greater than 0.")

    return value


def run_iteration_episode() -> None:
    tool = InteractiveIterationTool()
    speed_multiplier = choose_speed_multiplier()
    tool.run(speed_multiplier=speed_multiplier)


if __name__ == "__main__":
    run_iteration_episode()
