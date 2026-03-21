import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from constants import CADENCE, RHYTHM_PASS_COUNT, MODULAR_PASS_INDEX, GatePassProfile  # noqa: E402


class ConstantsBehaviorTests(unittest.TestCase):
    def test_cadence_has_four_phases(self) -> None:
        self.assertEqual(len(CADENCE), 4)
        self.assertEqual(CADENCE, ("map", "balance", "tighten", "verify"))

    def test_rhythm_precedes_modular(self) -> None:
        self.assertLess(RHYTHM_PASS_COUNT, MODULAR_PASS_INDEX)

    def test_gate_pass_default_cadence_matches_constant(self) -> None:
        profile = GatePassProfile(pass_index=1, mode="Rhythm")
        self.assertEqual(profile.cadence, CADENCE)

    def test_gate_pass_is_frozen(self) -> None:
        profile = GatePassProfile(pass_index=1, mode="Rhythm")
        with self.assertRaises(AttributeError):
            profile.mode = "Modular"

    def test_gate_pass_accepts_custom_cadence(self) -> None:
        custom = ("a", "b", "c", "d")
        profile = GatePassProfile(pass_index=1, mode="Rhythm", cadence=custom)
        self.assertEqual(profile.cadence, custom)


if __name__ == "__main__":
    unittest.main()
