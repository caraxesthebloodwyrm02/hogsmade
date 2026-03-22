from dataclasses import dataclass
import importlib
from typing import Callable, Dict, List, Optional, Tuple

try:
    from control_room.constants import (
        CADENCE, RHYTHM_PASS_COUNT, MODULAR_PASS_INDEX, GatePassProfile, PHASE_LANE_ENVELOPE, LaneValue,
    )
except ImportError:
    from constants import (
        CADENCE, RHYTHM_PASS_COUNT, MODULAR_PASS_INDEX, GatePassProfile, PHASE_LANE_ENVELOPE, LaneValue,
    )

try:
    _measurement_module = importlib.import_module("measurement")
except ModuleNotFoundError:
    _measurement_module = None


@dataclass(frozen=True)
class AirflowSnapshot:
    fan_speed: int
    temperature: float


@dataclass(frozen=True)
class DialState:
    fan_angle_deg: float
    temp_angle_deg: float
    flow_band: str
    heat_band: str
    category: str


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(value, upper))


def wait_bucket(wait_time_s: int) -> int:
    return min(max(wait_time_s // 15, 0), 4)


def _build_fallback_snapshot(
    wait_time_s: int,
    player_a: float,
    player_b: float,
) -> Tuple[AirflowSnapshot, int]:
    fan_offsets = (-50, -25, 0, 25, 50)
    temp_offsets = (-2.0, -1.0, 0.0, 1.0, 2.0)
    bucket = wait_bucket(wait_time_s)
    collab = _clamp((player_a + player_b) / 2.0, -1.0, 1.0)

    fan_speed = 900 + fan_offsets[bucket] + round(collab * 10)
    temperature = 26.0 + temp_offsets[bucket] + (collab * 0.5)
    fan_speed = int(_clamp(fan_speed, 850, 950))

    return AirflowSnapshot(fan_speed=fan_speed, temperature=float(temperature)), bucket


def _measurement_reader() -> Optional[Callable[[], Tuple[int, float]]]:
    if _measurement_module is None:
        return None
    reader = getattr(_measurement_module, "get_fan_speed_and_temperature", None)
    if callable(reader):
        return reader
    raise RuntimeError(
        "measurement module must define callable get_fan_speed_and_temperature"
    )


def resolve_airflow_snapshot(
    wait_time_s: int = 0,
    player_a: float = 0.0,
    player_b: float = 0.0,
) -> Tuple[AirflowSnapshot, int]:
    reader = _measurement_reader()
    if reader is None:
        return _build_fallback_snapshot(wait_time_s, player_a, player_b)

    fan_speed, temperature = reader()
    return (
        AirflowSnapshot(fan_speed=int(fan_speed), temperature=float(temperature)),
        wait_bucket(wait_time_s),
    )


def get_airflow_snapshot(
    wait_time_s: int = 0,
    player_a: float = 0.0,
    player_b: float = 0.0,
) -> AirflowSnapshot:
    snapshot, _ = resolve_airflow_snapshot(wait_time_s, player_a, player_b)
    return snapshot


def derive_dial_state(snapshot: AirflowSnapshot) -> DialState:
    fan_angle = _clamp(((snapshot.fan_speed - 850) / 100.0) * 360.0, 0.0, 360.0)
    temp_angle = _clamp(((snapshot.temperature - 24.0) / 4.0) * 360.0, 0.0, 360.0)

    flow_band = "centered" if abs(snapshot.fan_speed - 900) <= 50 else "drift"
    heat_band = "steady" if abs(snapshot.temperature - 26.0) <= 2 else "swing"
    category_map = {
        ("centered", "steady"): "Smooth Flow",
        ("centered", "swing"): "Thermal Drift",
        ("drift", "steady"): "Air Drift",
        ("drift", "swing"): "Correction Zone",
    }
    category = category_map[(flow_band, heat_band)]

    return DialState(
        fan_angle_deg=fan_angle,
        temp_angle_deg=temp_angle,
        flow_band=flow_band,
        heat_band=heat_band,
        category=category,
    )


def build_lesson_artifact(category: str, beat_phase: str, wait_bucket: int) -> str:
    return (
        f"LVL shared | TYPE varied | {category} | Beat:{beat_phase} | Wait:{wait_bucket}"
    )


def evaluate_airflow(snapshot: AirflowSnapshot) -> str:
    if snapshot.fan_speed > 1000 and snapshot.temperature > 30:
        return "Warning: Fan speed is high and temperature is above 30 degrees!"
    return "Fan speed and temperature are within normal ranges."


class AirflowOrchestrator:

    def __init__(self) -> None:
        self.completed_passes = 0
        self.gate_passes = self._build_gate_passes()

    def _build_gate_passes(self) -> Tuple[GatePassProfile, ...]:
        gate_passes = []
        for pass_index in range(1, MODULAR_PASS_INDEX + 1):
            mode = "Rhythm" if pass_index <= RHYTHM_PASS_COUNT else "Modular"
            gate_passes.append(GatePassProfile(pass_index=pass_index, mode=mode))
        return tuple(gate_passes)

    def _build_trigger_board(self) -> Dict[str, LaneValue]:
        return {
            "entry_lane": "snapshot_collected",
            "phase_lane": PHASE_LANE_ENVELOPE,
            "countdown_lane": "status_broadcast",
            "break_lane": "line_balance_checkpoint",
            "promotion_lane": f"completed_passes_reached_{RHYTHM_PASS_COUNT}",
            "exit_lane": "orchestration_reported",
        }

    def _auxiliary_bus_route(self, trigger_board: Dict[str, LaneValue]) -> str:
        lane_order = [
            "entry_lane",
            "phase_lane",
            "countdown_lane",
            "break_lane",
            "promotion_lane",
            "exit_lane",
        ]
        return " -> ".join(f"{lane}:{trigger_board[lane]}" for lane in lane_order)

    def beat_phase_for_pass(self, pass_count: int) -> str:
        cadence = self.gate_passes[0].cadence if self.gate_passes else CADENCE
        cadence_index = (max(pass_count, 1) - 1) % len(cadence)
        return cadence[cadence_index]

    def run(self) -> Dict[str, str]:
        for gate_pass in self.gate_passes:
            self.completed_passes = gate_pass.pass_index

        trigger_board = self._build_trigger_board()
        return {
            "mode": "Modular" if self.completed_passes == MODULAR_PASS_INDEX else "Rhythm",
            "pass_count": str(self.completed_passes),
            "trigger_board": str(trigger_board),
            "auxiliary_bus_route": self._auxiliary_bus_route(trigger_board),
            "cadence": str(self.gate_passes[0].cadence),
            "beat_phase": self.beat_phase_for_pass(self.completed_passes),
        }


def build_realtime_reference_graph(
    intervals_s: Tuple[int, ...] = (0, 15, 30, 45, 60),
    player_a: float = 0.0,
    player_b: float = 0.0,
) -> Dict[str, object]:
    cadence = CADENCE
    nodes: List[Dict[str, object]] = []

    for index, wait_time_s in enumerate(intervals_s):
        snapshot, wait_bucket = resolve_airflow_snapshot(
            wait_time_s=wait_time_s,
            player_a=player_a,
            player_b=player_b,
        )
        dial_state = derive_dial_state(snapshot)
        pass_count = (index % MODULAR_PASS_INDEX) + 1
        beat_phase = cadence[(pass_count - 1) % len(cadence)]
        mode = (
            "Modular"
            if pass_count == MODULAR_PASS_INDEX
            else "Rhythm"
        )

        nodes.append(
            {
                "id": f"t{index}",
                "wait_time_s": int(wait_time_s),
                "wait_bucket": int(wait_bucket),
                "fan_speed": snapshot.fan_speed,
                "temperature": round(snapshot.temperature, 2),
                "category": dial_state.category,
                "mode": mode,
                "pass_count": str(pass_count),
                "beat_phase": beat_phase,
                "lesson": build_lesson_artifact(
                    category=dial_state.category,
                    beat_phase=beat_phase,
                    wait_bucket=wait_bucket,
                ),
            }
        )

    edges: List[Dict[str, object]] = []
    for index in range(len(nodes) - 1):
        current_node = nodes[index]
        next_node = nodes[index + 1]
        edges.append(
            {
                "from": current_node["id"],
                "to": next_node["id"],
                "transport": "realtime",
                "channel": "interval_stream",
                "delta_wait_s": int(next_node["wait_time_s"])
                - int(current_node["wait_time_s"]),
            }
        )

    return {
        "nodes": nodes,
        "edges": edges,
        "legend": {
            "x_axis": "wait_time_seconds",
            "y_axes": ("fan_speed_rpm", "temperature_c"),
            "transport_model": "sequential_interval_stream",
        },
    }


def render_reference_graph_ascii(graph: Dict[str, object]) -> str:
    nodes_obj = graph.get("nodes", [])
    edges_obj = graph.get("edges", [])
    nodes = nodes_obj if isinstance(nodes_obj, list) else []
    edges = edges_obj if isinstance(edges_obj, list) else []

    lines = [
        "Reference Graph (Realtime Interval Transport)",
        "X=wait(s) | Y1=fan RPM | Y2=temp C",
    ]

    for node in nodes:
        if not isinstance(node, dict):
            continue

        fan_speed = int(node.get("fan_speed", 0))
        temperature = float(node.get("temperature", 0.0))
        fan_bar = "#" * max(1, min(20, int(round((fan_speed - 850) / 5.0))))
        temp_bar = "*" * max(1, min(20, int(round((temperature - 24.0) * 5.0))))

        lines.append(
            f"{node.get('id')} @ {node.get('wait_time_s')}s | "
            f"RPM {fan_speed:>3} {fan_bar} | "
            f"TEMP {temperature:>4.1f} {temp_bar} | "
            f"{node.get('category')} | Beat:{node.get('beat_phase')}"
        )

    if edges:
        lane = " -> ".join(
            f"{edge.get('from')}->{edge.get('to')}"
            for edge in edges
            if isinstance(edge, dict)
        )
        lines.append(f"Transport Lane: {lane}")

    return "\n".join(lines)


def visual_reference(
    intervals_s: Tuple[int, ...] = (0, 15, 30, 45, 60),
    player_a: float = 0.0,
    player_b: float = 0.0,
) -> str:
    graph = build_realtime_reference_graph(
        intervals_s=intervals_s,
        player_a=player_a,
        player_b=player_b,
    )
    return render_reference_graph_ascii(graph)


def knob(wait_time_s: int = 0, player_a: float = 0.0, player_b: float = 0.0) -> str:
    snapshot, wait_bucket = resolve_airflow_snapshot(wait_time_s, player_a, player_b)
    status = evaluate_airflow(snapshot)
    dial_state = derive_dial_state(snapshot)
    orchestrator = AirflowOrchestrator()
    orchestration = orchestrator.run()
    lesson = build_lesson_artifact(
        category=dial_state.category,
        beat_phase=orchestration["beat_phase"],
        wait_bucket=wait_bucket,
    )
    return (
        f"{status}\n"
        f"Fan speed: {snapshot.fan_speed} RPM, Temperature: {snapshot.temperature:.1f} °C\n"
        f"Mode: {orchestration['mode']} | Passes: {orchestration['pass_count']}\n"
        f"Cadence: {orchestration['cadence']}\n"
        f"Trigger Board: {orchestration['trigger_board']}\n"
        f"Auxiliary BUS Route: {orchestration['auxiliary_bus_route']}\n"
        f"Dial: Fan {dial_state.fan_angle_deg:.1f}° | Temp {dial_state.temp_angle_deg:.1f}° | "
        f"Flow:{dial_state.flow_band} | Heat:{dial_state.heat_band} | Category:{dial_state.category}\n"
        f"Lesson: {lesson}"
    )


if __name__ == "__main__":
    print(knob())
