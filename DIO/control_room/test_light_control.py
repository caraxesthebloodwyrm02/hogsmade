import sys
from pathlib import Path
import calendar
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import airflow  # noqa: E402
import light_control  # noqa: E402


class LightControlBehaviorTests(unittest.TestCase):
    def test_lightfunction_logic_maps_smooth_flow_to_cruise(self) -> None:
        snapshot = airflow.AirflowSnapshot(fan_speed=900, temperature=26.0)
        state = light_control.lightfunction_logic(snapshot, instant_transfer=True)

        self.assertEqual(state.phase, "Cruise")
        self.assertEqual(state.transfer_mode, "instant")
        self.assertEqual(state.travel_channel, "instant_transit_lane")

    def test_lightfunction_vice_versa_returns_airflow_ranges(self) -> None:
        state = light_control.LightFunctionState(
            phase="Recovery",
            intensity_pct=85,
            color_temp_k=5400,
            transfer_mode="staged",
            travel_channel="staged_transit_lane",
        )
        hint = light_control.lightfunction_vice_versa(state)

        self.assertEqual(hint["fan_speed_range"], (930.0, 980.0))
        self.assertEqual(hint["temperature_range"], (27.0, 31.0))

    def test_airflow_to_lightfunction_includes_phase_and_lesson(self) -> None:
        with patch.object(airflow, "_measurement_module", None):
            packet = light_control.airflow_to_lightfunction(
                wait_time_s=30,
                player_a=0.0,
                player_b=0.0,
                instant_transfer=False,
            )

        self.assertEqual(packet["airflow_category"], "Smooth Flow")
        self.assertEqual(packet["light_phase"], "Cruise")
        self.assertEqual(packet["transfer_mode"], "staged")
        self.assertIn("LVL shared", packet["lesson"])

    def test_build_phase_calendar_tracks_full_month(self) -> None:
        track = light_control.build_phase_calendar(year=2026, month=2)
        expected_days = calendar.monthrange(2026, 2)[1]

        self.assertEqual(len(track["days"]), expected_days)
        self.assertEqual(sum(track["phase_counts"].values()), expected_days)
        self.assertEqual(track["month_label"], "February")

    def test_build_case_specific_reference_transports_light_nodes(self) -> None:
        with patch.object(airflow, "_measurement_module", None):
            reference = light_control.build_case_specific_reference(
                year=2026,
                month=3,
                intervals_s=(0, 15, 30),
                instant_transfer=True,
            )

        light_nodes = reference["light_nodes"]
        light_edges = reference["light_edges"]

        self.assertEqual(len(light_nodes), 3)
        self.assertEqual(len(light_edges), 2)
        self.assertEqual(light_nodes[0]["id"], "t0")
        self.assertEqual(light_edges[0]["channel"], "instant_transit_lane")
        self.assertEqual(light_edges[0]["latency_ms"], 0)

    def test_render_case_specific_visual_reports_travel_and_long_phase_track(self) -> None:
        with patch.object(airflow, "_measurement_module", None):
            reference = light_control.build_case_specific_reference(
                year=2026,
                month=3,
                intervals_s=(0, 15, 30),
                instant_transfer=True,
            )
            visual = light_control.render_case_specific_visual(reference)

        self.assertIn("Case Specific Reference: Airflow -> LightFunction", visual)
        self.assertIn("Travel Lane: t0->t1 -> t1->t2", visual)
        self.assertIn("Long Phase Track: March", visual)

    def test_build_phase_events_matches_month_day_count(self) -> None:
        events = light_control.build_phase_events_for_month(year=2026, month=3)
        expected_days = calendar.monthrange(2026, 3)[1]
        self.assertEqual(len(events), expected_days)

    def test_export_phase_events_to_ics_has_required_sections(self) -> None:
        events = light_control.build_phase_events_for_month(year=2026, month=3)[:2]
        ics = light_control.export_phase_events_to_ics(events)

        self.assertIn("BEGIN:VCALENDAR", ics)
        self.assertIn("END:VCALENDAR", ics)
        self.assertIn("BEGIN:VEVENT", ics)
        self.assertIn("END:VEVENT", ics)

    def test_gcal_ics_example_contains_expected_fields(self) -> None:
        ics = light_control.build_gcal_ics_example(year=2026, month=3)

        self.assertIn("SUMMARY:", ics)
        self.assertIn("DESCRIPTION:", ics)
        self.assertIn("DTSTART;VALUE=DATE:", ics)
        self.assertIn("DTEND;VALUE=DATE:", ics)
        self.assertIn("UID:", ics)

    def test_gcal_ics_example_reflects_phase_cadence(self) -> None:
        ics = light_control.build_gcal_ics_example(year=2026, month=3)
        summaries = [
            line.split(":", 1)[1]
            for line in ics.splitlines()
            if line.startswith("SUMMARY:")
        ]

        self.assertGreaterEqual(len(summaries), 4)
        self.assertEqual(
            summaries[:4],
            [
                "ControlRoom Phase: map",
                "ControlRoom Phase: balance",
                "ControlRoom Phase: tighten",
                "ControlRoom Phase: verify",
            ],
        )

    def test_gcal_ics_example_is_deterministic_for_fixed_input(self) -> None:
        ics_a = light_control.build_gcal_ics_example(year=2026, month=3)
        ics_b = light_control.build_gcal_ics_example(year=2026, month=3)
        self.assertEqual(ics_a, ics_b)

    def test_gcal_ics_example_integrates_with_case_specific_reference(self) -> None:
        with patch.object(airflow, "_measurement_module", None):
            reference = light_control.build_case_specific_reference(
                year=2026,
                month=3,
                intervals_s=(0, 15, 30),
                instant_transfer=True,
            )

        direct_events = light_control.build_phase_events_for_month(year=2026, month=3)
        self.assertEqual(reference["calendar_events"], direct_events)
        self.assertEqual(len(reference["calendar"]["days"]), len(reference["calendar_events"]))
        self.assertIn(reference["calendar_events"][0]["phase"], reference["calendar_events"][0]["summary"])


if __name__ == "__main__":
    unittest.main()
