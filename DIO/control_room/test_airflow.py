import sys
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import airflow  # noqa: E402


class AirflowBehaviorTests(unittest.TestCase):
    def test_fallback_distribution_when_measurement_module_missing(self) -> None:
        with patch.object(airflow, "_measurement_module", None):
            snapshot = airflow.get_airflow_snapshot(
                wait_time_s=45,
                player_a=1.0,
                player_b=1.0,
            )

        self.assertEqual(snapshot.fan_speed, 935)
        self.assertAlmostEqual(snapshot.temperature, 27.5)

    def test_fallback_triggers_only_when_measurement_module_missing(self) -> None:
        fake_module = SimpleNamespace(
            get_fan_speed_and_temperature=lambda: (1001, 31.0)
        )
        with patch.object(airflow, "_measurement_module", fake_module):
            snapshot = airflow.get_airflow_snapshot(
                wait_time_s=60,
                player_a=1.0,
                player_b=1.0,
            )

        self.assertEqual(snapshot.fan_speed, 1001)
        self.assertAlmostEqual(snapshot.temperature, 31.0)

    def test_module_without_callable_reader_is_error(self) -> None:
        with patch.object(airflow, "_measurement_module", SimpleNamespace()):
            with self.assertRaises(RuntimeError):
                airflow.get_airflow_snapshot()

    def test_fallback_fan_speed_stays_within_100_count_envelope(self) -> None:
        with patch.object(airflow, "_measurement_module", None):
            for bucket in range(5):
                wait_time_s = bucket * 15
                for player_a in (-1.0, 0.0, 1.0):
                    for player_b in (-1.0, 0.0, 1.0):
                        snapshot = airflow.get_airflow_snapshot(
                            wait_time_s=wait_time_s,
                            player_a=player_a,
                            player_b=player_b,
                        )
                        self.assertGreaterEqual(snapshot.fan_speed, 850)
                        self.assertLessEqual(snapshot.fan_speed, 950)

    def test_all_category_matrix_labels_are_reachable(self) -> None:
        self.assertEqual(
            airflow.derive_dial_state(
                airflow.AirflowSnapshot(fan_speed=900, temperature=26.0)
            ).category,
            "Smooth Flow",
        )
        self.assertEqual(
            airflow.derive_dial_state(
                airflow.AirflowSnapshot(fan_speed=900, temperature=29.0)
            ).category,
            "Thermal Drift",
        )
        self.assertEqual(
            airflow.derive_dial_state(
                airflow.AirflowSnapshot(fan_speed=960, temperature=26.0)
            ).category,
            "Air Drift",
        )
        self.assertEqual(
            airflow.derive_dial_state(
                airflow.AirflowSnapshot(fan_speed=960, temperature=29.0)
            ).category,
            "Correction Zone",
        )

    def test_rhythm_phase_mapping_and_final_mode(self) -> None:
        orchestrator = airflow.AirflowOrchestrator()
        expected_phases = {
            1: "map",
            2: "balance",
            3: "tighten",
            4: "verify",
            5: "map",
            6: "balance",
            7: "tighten",
        }

        for pass_count, expected_phase in expected_phases.items():
            self.assertEqual(
                orchestrator._beat_phase_for_pass(pass_count),
                expected_phase,
            )

        result = orchestrator.run()
        self.assertEqual(result["mode"], "Modular")
        self.assertEqual(result["pass_count"], "7")
        self.assertEqual(result["beat_phase"], "tighten")

    def test_knob_output_contains_extended_contract(self) -> None:
        with patch.object(airflow, "_measurement_module", None):
            output = airflow.knob(wait_time_s=30, player_a=0.0, player_b=0.0)

        self.assertIn("Fan speed:", output)
        self.assertIn("Mode:", output)
        self.assertIn("Cadence:", output)
        self.assertIn("Trigger Board:", output)
        self.assertIn("Auxiliary BUS Route:", output)
        self.assertIn("Dial:", output)
        self.assertIn("Category:", output)
        self.assertIn("Lesson:", output)
        self.assertIn("Beat:", output)
        self.assertIn("Wait:", output)

    def test_direct_interval_bucket_mapping(self) -> None:
        direct_interval_cases = (
            (-1, 0),
            (0, 0),
            (14, 0),
            (15, 1),
            (29, 1),
            (30, 2),
            (44, 2),
            (45, 3),
            (59, 3),
            (60, 4),
            (180, 4),
        )

        for wait_time_s, expected_bucket in direct_interval_cases:
            self.assertEqual(airflow._wait_bucket(wait_time_s), expected_bucket)

    def test_realtime_reference_graph_structure(self) -> None:
        with patch.object(airflow, "_measurement_module", None):
            graph = airflow.build_realtime_reference_graph(
                intervals_s=(0, 15, 30, 45),
                player_a=0.0,
                player_b=0.0,
            )

        nodes = graph["nodes"]
        edges = graph["edges"]
        self.assertEqual(len(nodes), 4)
        self.assertEqual(len(edges), 3)
        self.assertEqual([node["id"] for node in nodes], ["t0", "t1", "t2", "t3"])
        self.assertEqual(edges[0]["from"], "t0")
        self.assertEqual(edges[0]["to"], "t1")
        self.assertEqual(edges[0]["delta_wait_s"], 15)
        self.assertTrue(all(edge["transport"] == "realtime" for edge in edges))

    def test_realtime_reference_graph_carries_rhythm_and_lessons(self) -> None:
        with patch.object(airflow, "_measurement_module", None):
            graph = airflow.build_realtime_reference_graph(
                intervals_s=(0, 15, 30, 45, 60, 75, 90),
                player_a=0.0,
                player_b=0.0,
            )

        nodes = graph["nodes"]
        expected = [
            ("1", "Rhythm", "map"),
            ("2", "Rhythm", "balance"),
            ("3", "Rhythm", "tighten"),
            ("4", "Rhythm", "verify"),
            ("5", "Rhythm", "map"),
            ("6", "Rhythm", "balance"),
            ("7", "Modular", "tighten"),
        ]

        for node, (pass_count, mode, beat_phase) in zip(nodes, expected):
            self.assertEqual(node["pass_count"], pass_count)
            self.assertEqual(node["mode"], mode)
            self.assertEqual(node["beat_phase"], beat_phase)
            self.assertIn("LVL shared", node["lesson"])

    def test_visual_reference_ascii_reports_transport(self) -> None:
        with patch.object(airflow, "_measurement_module", None):
            graph = airflow.build_realtime_reference_graph(intervals_s=(0, 15, 30))
            visual = airflow.render_reference_graph_ascii(graph)

        self.assertIn("Reference Graph (Realtime Interval Transport)", visual)
        self.assertIn("t0 @ 0s", visual)
        self.assertIn("Beat:map", visual)
        self.assertIn("Transport Lane: t0->t1 -> t1->t2", visual)


if __name__ == "__main__":
    unittest.main()
