import sys
from pathlib import Path
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import airflow  # noqa: E402
import light_control  # noqa: E402
from combined_space import InteractiveIterationTool  # noqa: E402


class ControlRoomSmokeTests(unittest.TestCase):
    def test_smoke_runtime_packet_pipeline(self) -> None:
        with patch.object(airflow, "_measurement_module", None):
            knob_output = airflow.knob(wait_time_s=30, player_a=0.0, player_b=0.0)
            packet = light_control.airflow_to_lightfunction(
                wait_time_s=30,
                player_a=0.0,
                player_b=0.0,
                instant_transfer=True,
            )

        self.assertIn("Fan speed:", knob_output)
        self.assertIn("Lesson:", knob_output)
        self.assertEqual(packet["airflow_category"], "Smooth Flow")
        self.assertEqual(packet["light_phase"], "Cruise")
        self.assertIn("Beat:", packet["lesson"])

    def test_smoke_visual_and_gcal_artifacts(self) -> None:
        with patch.object(airflow, "_measurement_module", None):
            reference = light_control.build_case_specific_reference(
                year=2026,
                month=3,
                intervals_s=(0, 15, 30),
                instant_transfer=True,
            )
            visual = light_control.render_case_specific_visual(reference)

        ics = light_control.build_gcal_ics_example(year=2026, month=3)

        self.assertIn("Travel Lane:", visual)
        self.assertIn("Long Phase Track:", visual)
        self.assertIn("BEGIN:VCALENDAR", ics)
        self.assertIn("SUMMARY:ControlRoom Phase: map", ics)


class CombinedSpaceSmokeTests(unittest.TestCase):
    def test_smoke_episode_summary_includes_airflow_context(self) -> None:
        with patch.object(airflow, "_measurement_module", None):
            tool = InteractiveIterationTool()
            summary = tool.episode_summary()

        self.assertEqual(summary["total_parts"], 4)
        self.assertEqual(len(summary["parts"]), 4)
        self.assertIn("airflow_category", summary["parts"][0])
        self.assertIn("light_phase", summary["parts"][0])

    def test_smoke_airflow_context_matches_light_control(self) -> None:
        with patch.object(airflow, "_measurement_module", None):
            tool = InteractiveIterationTool()
            ctx = tool.airflow_context(1)
            direct_packet = light_control.airflow_to_lightfunction(
                wait_time_s=0, instant_transfer=True,
            )

        self.assertEqual(ctx["airflow_category"], direct_packet["airflow_category"])
        self.assertEqual(ctx["light_phase"], direct_packet["light_phase"])


if __name__ == "__main__":
    unittest.main()
