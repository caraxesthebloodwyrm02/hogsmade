from dataclasses import dataclass
import calendar
from datetime import date, timedelta
from typing import Dict, List, Tuple

import airflow


@dataclass(frozen=True)
class LightFunctionState:
    phase: str
    intensity_pct: int
    color_temp_k: int
    transfer_mode: str
    travel_channel: str


_LIGHT_PROFILE_BY_CATEGORY: Dict[str, Tuple[str, int, int]] = {
    "Smooth Flow": ("Cruise", 55, 4200),
    "Thermal Drift": ("Warm Shift", 65, 3600),
    "Air Drift": ("Vector Shift", 75, 5000),
    "Correction Zone": ("Recovery", 85, 5400),
}

_AIRFLOW_HINT_BY_PHASE: Dict[str, Dict[str, Tuple[float, float]]] = {
    "Cruise": {"fan_speed_range": (880.0, 920.0), "temperature_range": (25.0, 27.0)},
    "Warm Shift": {"fan_speed_range": (870.0, 930.0), "temperature_range": (27.0, 30.0)},
    "Vector Shift": {"fan_speed_range": (920.0, 960.0), "temperature_range": (24.0, 27.0)},
    "Recovery": {"fan_speed_range": (930.0, 980.0), "temperature_range": (27.0, 31.0)},
}


def lightfunction_logic(
    snapshot: airflow.AirflowSnapshot,
    instant_transfer: bool = True,
) -> LightFunctionState:
    dial_state = airflow.derive_dial_state(snapshot)
    phase, intensity_pct, color_temp_k = _LIGHT_PROFILE_BY_CATEGORY[dial_state.category]
    transfer_mode = "instant" if instant_transfer else "staged"
    travel_channel = "instant_transit_lane" if instant_transfer else "staged_transit_lane"

    return LightFunctionState(
        phase=phase,
        intensity_pct=intensity_pct,
        color_temp_k=color_temp_k,
        transfer_mode=transfer_mode,
        travel_channel=travel_channel,
    )


def lightfunction_vice_versa(light_state: LightFunctionState) -> Dict[str, Tuple[float, float]]:
    return _AIRFLOW_HINT_BY_PHASE[light_state.phase]


def airflow_to_lightfunction(
    wait_time_s: int = 0,
    player_a: float = 0.0,
    player_b: float = 0.0,
    instant_transfer: bool = True,
) -> Dict[str, str]:
    snapshot, wait_bucket = airflow.resolve_airflow_snapshot(
        wait_time_s=wait_time_s,
        player_a=player_a,
        player_b=player_b,
    )
    dial_state = airflow.derive_dial_state(snapshot)
    light_state = lightfunction_logic(snapshot=snapshot, instant_transfer=instant_transfer)
    orchestration = airflow.AirflowOrchestrator().run()

    return {
        "airflow_category": dial_state.category,
        "light_phase": light_state.phase,
        "intensity_pct": str(light_state.intensity_pct),
        "color_temp_k": str(light_state.color_temp_k),
        "transfer_mode": light_state.transfer_mode,
        "travel_channel": light_state.travel_channel,
        "beat_phase": orchestration["beat_phase"],
        "wait_bucket": str(wait_bucket),
        "lesson": airflow.build_lesson_artifact(
            category=dial_state.category,
            beat_phase=orchestration["beat_phase"],
            wait_bucket=wait_bucket,
        ),
    }


def build_phase_calendar(
    year: int,
    month: int,
    cadence: Tuple[str, str, str, str] = ("map", "balance", "tighten", "verify"),
) -> Dict[str, object]:
    cal = calendar.Calendar(firstweekday=calendar.MONDAY)
    days: List[Dict[str, object]] = []
    cadence_index = 0

    for week in cal.monthdayscalendar(year, month):
        for weekday_index, day in enumerate(week):
            if day == 0:
                continue
            phase = cadence[cadence_index % len(cadence)]
            days.append(
                {
                    "day": day,
                    "weekday": calendar.day_name[weekday_index],
                    "phase": phase,
                }
            )
            cadence_index += 1

    phase_counts = {phase: 0 for phase in cadence}
    for day_info in days:
        phase_counts[day_info["phase"]] += 1

    return {
        "year": year,
        "month": month,
        "month_label": calendar.month_name[month],
        "days": days,
        "phase_counts": phase_counts,
    }


def build_phase_events_for_month(
    year: int,
    month: int,
    cadence: Tuple[str, str, str, str] = ("map", "balance", "tighten", "verify"),
) -> List[Dict[str, str]]:
    phase_calendar = build_phase_calendar(year=year, month=month, cadence=cadence)
    days_obj = phase_calendar.get("days", [])
    days = days_obj if isinstance(days_obj, list) else []
    events: List[Dict[str, str]] = []

    for day_info in days:
        if not isinstance(day_info, dict):
            continue
        day = int(day_info["day"])
        phase = str(day_info["phase"])
        weekday = str(day_info["weekday"])
        start_day = date(year, month, day)
        end_day = start_day + timedelta(days=1)
        events.append(
            {
                "uid": f"{start_day.strftime('%Y%m%d')}-{phase}@controlroom.local",
                "dtstamp": f"{start_day.strftime('%Y%m%d')}T000000Z",
                "dtstart": start_day.strftime("%Y%m%d"),
                "dtend": end_day.strftime("%Y%m%d"),
                "summary": f"ControlRoom Phase: {phase}",
                "description": (
                    f"Phase {phase} on {weekday}, {start_day.isoformat()} "
                    f"for airflow-light coordination."
                ),
                "phase": phase,
            }
        )

    return events


def _escape_ics_text(value: str) -> str:
    return (
        value.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\n", "\\n")
    )


def export_phase_events_to_ics(
    events: List[Dict[str, str]],
    calendar_name: str = "ControlRoom Phases",
) -> str:
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//ControlRoom//LightControl//EN",
        "CALSCALE:GREGORIAN",
        f"X-WR-CALNAME:{_escape_ics_text(calendar_name)}",
    ]

    for event in events:
        lines.extend(
            [
                "BEGIN:VEVENT",
                f"UID:{event['uid']}",
                f"DTSTAMP:{event['dtstamp']}",
                f"DTSTART;VALUE=DATE:{event['dtstart']}",
                f"DTEND;VALUE=DATE:{event['dtend']}",
                f"SUMMARY:{_escape_ics_text(event['summary'])}",
                f"DESCRIPTION:{_escape_ics_text(event['description'])}",
                "END:VEVENT",
            ]
        )

    lines.append("END:VCALENDAR")
    return "\n".join(lines) + "\n"


def build_gcal_ics_example(
    year: int,
    month: int,
    cadence: Tuple[str, str, str, str] = ("map", "balance", "tighten", "verify"),
) -> str:
    events = build_phase_events_for_month(year=year, month=month, cadence=cadence)
    return export_phase_events_to_ics(events=events)


def build_case_specific_reference(
    year: int,
    month: int,
    intervals_s: Tuple[int, ...] = (0, 15, 30, 45, 60),
    player_a: float = 0.0,
    player_b: float = 0.0,
    instant_transfer: bool = True,
) -> Dict[str, object]:
    airflow_graph = airflow.build_realtime_reference_graph(
        intervals_s=intervals_s,
        player_a=player_a,
        player_b=player_b,
    )
    airflow_nodes_obj = airflow_graph.get("nodes", [])
    airflow_nodes = airflow_nodes_obj if isinstance(airflow_nodes_obj, list) else []
    light_nodes: List[Dict[str, object]] = []

    for node in airflow_nodes:
        if not isinstance(node, dict):
            continue
        snapshot = airflow.AirflowSnapshot(
            fan_speed=int(node["fan_speed"]),
            temperature=float(node["temperature"]),
        )
        light_state = lightfunction_logic(snapshot, instant_transfer=instant_transfer)
        light_nodes.append(
            {
                "id": node["id"],
                "wait_time_s": int(node["wait_time_s"]),
                "phase": light_state.phase,
                "intensity_pct": light_state.intensity_pct,
                "color_temp_k": light_state.color_temp_k,
                "transfer_mode": light_state.transfer_mode,
                "travel_channel": light_state.travel_channel,
                "beat_phase": node["beat_phase"],
                "lesson": node["lesson"],
            }
        )

    transport_edges: List[Dict[str, object]] = []
    for index in range(len(light_nodes) - 1):
        transport_edges.append(
            {
                "from": light_nodes[index]["id"],
                "to": light_nodes[index + 1]["id"],
                "channel": light_nodes[index]["travel_channel"],
                "latency_ms": 0 if instant_transfer else 250,
            }
        )

    return {
        "airflow": airflow_graph,
        "light_nodes": light_nodes,
        "light_edges": transport_edges,
        "calendar": build_phase_calendar(year=year, month=month),
        "calendar_events": build_phase_events_for_month(year=year, month=month),
    }


def render_case_specific_visual(reference: Dict[str, object]) -> str:
    light_nodes_obj = reference.get("light_nodes", [])
    light_edges_obj = reference.get("light_edges", [])
    calendar_obj = reference.get("calendar", {})

    light_nodes = light_nodes_obj if isinstance(light_nodes_obj, list) else []
    light_edges = light_edges_obj if isinstance(light_edges_obj, list) else []
    calendar_track = calendar_obj if isinstance(calendar_obj, dict) else {}

    lines = [
        "Case Specific Reference: Airflow -> LightFunction",
        "Transport: instant transfers and travel channels",
    ]

    for node in light_nodes:
        if not isinstance(node, dict):
            continue
        intensity = int(node["intensity_pct"])
        intensity_bar = "=" * max(1, min(20, intensity // 5))
        lines.append(
            f"{node['id']} @ {node['wait_time_s']}s | Phase:{node['phase']} | "
            f"Intensity:{intensity}% {intensity_bar} | "
            f"Kelvin:{node['color_temp_k']} | Beat:{node['beat_phase']}"
        )

    if light_edges:
        lane = " -> ".join(
            f"{edge['from']}->{edge['to']}" for edge in light_edges if isinstance(edge, dict)
        )
        lines.append(f"Travel Lane: {lane}")

    month_label = calendar_track.get("month_label", "")
    days_obj = calendar_track.get("days", [])
    days = days_obj if isinstance(days_obj, list) else []
    lines.append(f"Long Phase Track: {month_label} | Days tracked:{len(days)}")

    return "\n".join(lines)
