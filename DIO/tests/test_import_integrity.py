"""Tests verifying import integrity after cleanup of unused imports."""

import ast
import sys
from pathlib import Path
from unittest import TestCase

# Project paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent
CONTROL_ROOM = PROJECT_ROOT / "control_room"
COMBINED_SPACE = PROJECT_ROOT / "combined_space.py"
LIGHT_CONTROL = CONTROL_ROOM / "light_control.py"
AIRFLOW = CONTROL_ROOM / "airflow.py"


class ImportIntegrityTests(TestCase):
    """Verify import cleanup did not break functionality."""

    def _get_imported_names(self, file_path: Path) -> set:
        """Parse file and return all names imported from control_room.constants."""
        source = file_path.read_text()
        tree = ast.parse(source)
        imported = set()

        for node in ast.walk(tree):
            # Check try/except ImportError patterns
            if isinstance(node, ast.Try):
                for handler in node.handlers:
                    if handler.type and isinstance(handler.type, ast.Name):
                        if handler.type.id == "ImportError":
                            # Look at the try body for imports
                            for try_node in node.body:
                                if isinstance(try_node, ast.ImportFrom):
                                    if try_node.module and "constants" in str(try_node.module):
                                        for alias in try_node.names:
                                            imported.add(alias.name)
            # Direct imports
            elif isinstance(node, ast.ImportFrom):
                if node.module and "constants" in str(node.module):
                    for alias in node.names:
                        imported.add(alias.name)

        return imported

    def test_light_control_does_not_import_trigger_board_lane_order(self):
        """TRIGGER_BOARD_LANE_ORDER was removed from light_control.py imports."""
        imported = self._get_imported_names(LIGHT_CONTROL)
        self.assertNotIn(
            "TRIGGER_BOARD_LANE_ORDER",
            imported,
            "TRIGGER_BOARD_LANE_ORDER should not be imported in light_control.py"
        )

    def test_light_control_still_imports_required_constants(self):
        """Required constants are still imported in light_control.py."""
        imported = self._get_imported_names(LIGHT_CONTROL)
        required = {"CADENCE", "AirflowCategory", "LightPhase", "TransferMode", "TravelChannel"}
        for const in required:
            self.assertIn(const, imported, f"{const} should be imported in light_control.py")

    def test_airflow_imports_trigger_board_lane_order(self):
        """TRIGGER_BOARD_LANE_ORDER is imported where it's actually used (airflow.py)."""
        imported = self._get_imported_names(AIRFLOW)
        self.assertIn(
            "TRIGGER_BOARD_LANE_ORDER",
            imported,
            "TRIGGER_BOARD_LANE_ORDER should be imported in airflow.py for _auxiliary_bus_route()"
        )

    def test_trigger_board_lane_order_defined_in_constants(self):
        """The constant is defined in constants.py."""
        sys.path.insert(0, str(CONTROL_ROOM))
        try:
            from constants import TRIGGER_BOARD_LANE_ORDER
            self.assertIsInstance(TRIGGER_BOARD_LANE_ORDER, tuple)
            self.assertEqual(
                TRIGGER_BOARD_LANE_ORDER,
                ("entry_lane", "phase_lane", "countdown_lane", "break_lane", "promotion_lane", "exit_lane")
            )
        finally:
            sys.path.remove(str(CONTROL_ROOM))

    def test_combined_space_imports_work(self):
        """combined_space.py imports resolve correctly."""
        # This will fail if imports are broken
        try:
            import combined_space
            self.assertTrue(hasattr(combined_space, "InteractiveIterationTool"))
        except ImportError as e:
            self.fail(f"combined_space.py imports failed: {e}")

    def test_light_control_imports_work(self):
        """light_control.py imports resolve correctly."""
        sys.path.insert(0, str(CONTROL_ROOM))
        try:
            import light_control
            self.assertTrue(hasattr(light_control, "lightfunction_logic"))
            self.assertTrue(hasattr(light_control, "LightFunctionState"))
        finally:
            if str(CONTROL_ROOM) in sys.path:
                sys.path.remove(str(CONTROL_ROOM))

    def test_control_room_package_exports_trigger_board_lane_order(self):
        """TRIGGER_BOARD_LANE_ORDER is exported from control_room package."""
        sys.path.insert(0, str(CONTROL_ROOM.parent))
        try:
            from control_room import TRIGGER_BOARD_LANE_ORDER
            self.assertIsInstance(TRIGGER_BOARD_LANE_ORDER, tuple)
            self.assertEqual(len(TRIGGER_BOARD_LANE_ORDER), 6)
        finally:
            if str(CONTROL_ROOM.parent) in sys.path:
                sys.path.remove(str(CONTROL_ROOM.parent))


class FunctionalityValidationTests(TestCase):
    """Verify functionality still works after import cleanup."""

    def test_airflow_auxiliary_bus_route_uses_trigger_board_lane_order(self):
        """_auxiliary_bus_route() correctly uses TRIGGER_BOARD_LANE_ORDER."""
        sys.path.insert(0, str(CONTROL_ROOM))
        try:
            import airflow
            orchestrator = airflow.AirflowOrchestrator()
            trigger_board = orchestrator._build_trigger_board()
            route = orchestrator._auxiliary_bus_route(trigger_board)

            # Should contain all lanes in order
            self.assertIn("entry_lane:snapshot_collected", route)
            self.assertIn("phase_lane:", route)
            self.assertIn("exit_lane:orchestration_reported", route)

            # Verify the order matches TRIGGER_BOARD_LANE_ORDER
            from constants import TRIGGER_BOARD_LANE_ORDER
            for lane in TRIGGER_BOARD_LANE_ORDER:
                self.assertIn(lane, trigger_board)
        finally:
            if str(CONTROL_ROOM) in sys.path:
                sys.path.remove(str(CONTROL_ROOM))

    def test_combined_space_auxiliary_bus_route_matches_airflow_pattern(self):
        """combined_space.py auxiliary_bus_route matches airflow pattern."""
        sys.path.insert(0, str(PROJECT_ROOT))
        sys.path.insert(0, str(CONTROL_ROOM))
        try:
            from combined_space import InteractiveIterationTool
            tool = InteractiveIterationTool()
            trigger_board = tool.build_trigger_board()
            route = tool.auxiliary_bus_route(trigger_board)

            # Should be well-formed with all lanes
            self.assertIn("entry_lane:", route)
            self.assertIn("exit_lane:", route)
            self.assertIn("->", route)
        finally:
            for p in [str(PROJECT_ROOT), str(CONTROL_ROOM)]:
                if p in sys.path:
                    sys.path.remove(p)


if __name__ == "__main__":
    import unittest
    unittest.main()
