import sys
from pathlib import Path
import io
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent / "control_room"))

from combined_space import (  # noqa: E402
    EpisodePhase,
    EpisodePart,
    InteractiveIterationTool,
    choose_speed_multiplier,
)
from control_room.constants import (  # noqa: E402
    CADENCE,
    RHYTHM_PASS_COUNT,
    MODULAR_PASS_INDEX,
    GatePassProfile,
)
import airflow  # noqa: E402


# ---------------------------------------------------------------------------
# A: Dataclass behavior
# ---------------------------------------------------------------------------

class EpisodeDataclassTests(unittest.TestCase):
    def test_episode_phase_attributes(self) -> None:
        phase = EpisodePhase(
            name="Test Phase",
            duration_seconds=120,
            focus_prompt="Focus here.",
            concurrency_level="single-thread",
        )
        self.assertEqual(phase.name, "Test Phase")
        self.assertEqual(phase.duration_seconds, 120)

    def test_episode_part_duration_is_sum_of_phases(self) -> None:
        part = EpisodePart(
            index=1,
            title="Test Part",
            phase_one=EpisodePhase("P1", 100, "f", "c"),
            phase_two=EpisodePhase("P2", 290, "f", "c"),
        )
        self.assertEqual(part.duration_seconds(), 390)

    def test_gate_pass_default_cadence(self) -> None:
        profile = GatePassProfile(pass_index=1, mode="Rhythm")
        self.assertEqual(profile.cadence, CADENCE)


# ---------------------------------------------------------------------------
# B: InteractiveIterationTool construction
# ---------------------------------------------------------------------------

class ConstructionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tool = InteractiveIterationTool()

    def test_default_parts_has_four_parts(self) -> None:
        self.assertEqual(len(self.tool.parts), 4)

    def test_default_parts_titles(self) -> None:
        titles = [p.title for p in self.tool.parts]
        self.assertEqual(titles, ["Cold Open", "Pressure Build", "Evolution Scene", "Finale"])

    def test_default_parts_timing_adds_up(self) -> None:
        active = sum(p.duration_seconds() for p in self.tool.parts)
        expected = self.tool.TOTAL_EXECUTION_SECONDS - self.tool.ISOLATION_BREAK_SECONDS
        self.assertEqual(active, expected)
        self.assertEqual(active, 1560)

    def test_gate_passes_built_correctly(self) -> None:
        self.assertEqual(len(self.tool.gate_passes), MODULAR_PASS_INDEX)
        rhythm = [gp for gp in self.tool.gate_passes if gp.mode == "Rhythm"]
        modular = [gp for gp in self.tool.gate_passes if gp.mode == "Modular"]
        self.assertEqual(len(rhythm), RHYTHM_PASS_COUNT)
        self.assertEqual(len(modular), 1)

    def test_validate_timing_rejects_wrong_part_count(self) -> None:
        parts = InteractiveIterationTool()._default_parts()[:3]
        with self.assertRaises(ValueError) as ctx:
            InteractiveIterationTool(parts=parts)
        self.assertIn("4 parts", str(ctx.exception))

    def test_validate_timing_rejects_wrong_total_time(self) -> None:
        parts = InteractiveIterationTool()._default_parts()
        parts[0].phase_one.duration_seconds = 999
        with self.assertRaises(ValueError) as ctx:
            InteractiveIterationTool(parts=parts)
        self.assertIn("Active time must be", str(ctx.exception))


# ---------------------------------------------------------------------------
# C: Stage and trigger logic
# ---------------------------------------------------------------------------

class StageAndTriggerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tool = InteractiveIterationTool()

    def test_stage_for_part_mapping(self) -> None:
        expected = {1: "setup", 2: "build", 3: "mutation", 4: "closure"}
        for part_index, stage in expected.items():
            self.assertEqual(self.tool._stage_for_part(part_index), stage)

    def test_stage_for_part_clamps_out_of_range(self) -> None:
        self.assertEqual(self.tool._stage_for_part(0), "setup")
        self.assertEqual(self.tool._stage_for_part(10), "closure")

    def test_phase_trigger_phase_one(self) -> None:
        trigger = self.tool._phase_trigger(1, "Phase 1 (3-4 min): Setup Pulse")
        self.assertEqual(trigger, "part_1_phase_one_gate")

    def test_phase_trigger_phase_two(self) -> None:
        trigger = self.tool._phase_trigger(2, "Phase 2 (~3 min): Conflict Sprint")
        self.assertEqual(trigger, "part_2_phase_two_gate")


# ---------------------------------------------------------------------------
# D: Trigger board and bus route
# ---------------------------------------------------------------------------

class TriggerBoardTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tool = InteractiveIterationTool()

    def test_trigger_board_has_all_lanes(self) -> None:
        board = self.tool._build_trigger_board()
        expected_lanes = {
            "entry_lane", "phase_lane", "countdown_lane",
            "break_lane", "promotion_lane", "exit_lane",
        }
        self.assertEqual(set(board.keys()), expected_lanes)

    def test_auxiliary_bus_route_format(self) -> None:
        board = self.tool._build_trigger_board()
        route = self.tool._auxiliary_bus_route(board)
        self.assertIn("entry_lane:", route)
        self.assertIn(" -> ", route)
        self.assertEqual(route.count(" -> "), 5)

    def test_promotion_lane_contains_rhythm_count(self) -> None:
        board = self.tool._build_trigger_board()
        self.assertIn(str(RHYTHM_PASS_COUNT), board["promotion_lane"])


# ---------------------------------------------------------------------------
# E: Modular pass execution
# ---------------------------------------------------------------------------

class ModularPassTests(unittest.TestCase):
    def test_execute_modular_pass_sets_completed(self) -> None:
        tool = InteractiveIterationTool()
        with patch("sys.stdout", new_callable=io.StringIO):
            tool._execute_modular_pass()
        self.assertEqual(tool.completed_passes, MODULAR_PASS_INDEX)

    def test_modular_pass_prints_mode(self) -> None:
        tool = InteractiveIterationTool()
        buf = io.StringIO()
        with patch("sys.stdout", buf):
            tool._execute_modular_pass()
        output = buf.getvalue()
        self.assertIn("Modular", output)
        self.assertIn("PASS 7", output)


# ---------------------------------------------------------------------------
# F: Speed multiplier validation
# ---------------------------------------------------------------------------

class SpeedMultiplierTests(unittest.TestCase):
    def test_run_countdown_rejects_zero_multiplier(self) -> None:
        tool = InteractiveIterationTool()
        with self.assertRaises(ValueError):
            tool._run_countdown(10, "test", 0)

    def test_run_countdown_rejects_negative_multiplier(self) -> None:
        tool = InteractiveIterationTool()
        with self.assertRaises(ValueError):
            tool._run_countdown(10, "test", -1.0)

    def test_choose_speed_multiplier_default(self) -> None:
        with patch("builtins.input", return_value=""), \
             patch("sys.stdout", new_callable=io.StringIO):
            result = choose_speed_multiplier()
        self.assertEqual(result, 1.0)

    def test_choose_speed_multiplier_invalid(self) -> None:
        with patch("builtins.input", return_value="abc"), \
             patch("sys.stdout", new_callable=io.StringIO):
            with self.assertRaises(ValueError):
                choose_speed_multiplier()


# ---------------------------------------------------------------------------
# G: Airflow context wiring (integration with control_room)
# ---------------------------------------------------------------------------

class AirflowContextTests(unittest.TestCase):
    def test_airflow_context_returns_expected_keys(self) -> None:
        with patch.object(airflow, "_measurement_module", None):
            tool = InteractiveIterationTool()
            ctx = tool.airflow_context(1)
        expected_keys = {
            "part_index", "stage", "airflow_category", "light_phase",
            "beat_phase", "fan_speed", "temperature",
        }
        self.assertEqual(set(ctx.keys()), expected_keys)

    def test_airflow_context_uses_part_index(self) -> None:
        with patch.object(airflow, "_measurement_module", None):
            tool = InteractiveIterationTool()
            ctx1 = tool.airflow_context(1)
            ctx3 = tool.airflow_context(3)
        self.assertEqual(ctx1["stage"], "setup")
        self.assertEqual(ctx3["stage"], "mutation")

    def test_episode_summary_structure(self) -> None:
        with patch.object(airflow, "_measurement_module", None):
            tool = InteractiveIterationTool()
            summary = tool.episode_summary()
        self.assertEqual(summary["total_parts"], 4)
        self.assertEqual(summary["total_execution_s"], 1800)
        self.assertEqual(summary["isolation_break_s"], 240)
        self.assertEqual(summary["gate_pass_count"], MODULAR_PASS_INDEX)
        self.assertEqual(len(summary["parts"]), 4)

        first_part = summary["parts"][0]
        self.assertEqual(first_part["title"], "Cold Open")
        self.assertIn("airflow_category", first_part)
        self.assertIn("light_phase", first_part)


if __name__ == "__main__":
    unittest.main()
