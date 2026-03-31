import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from constants import (  # noqa: E402
    CADENCE,
    RHYTHM_PASS_COUNT,
    MODULAR_PASS_INDEX,
    GatePassProfile,
    OscillationEnvelope,
    PHASE_LANE_ENVELOPE,
)


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


class OscillationEnvelopeTests(unittest.TestCase):
    def test_envelope_is_frozen(self) -> None:
        env = OscillationEnvelope(lower=0.35, tension=0.65, upper=1.0)
        with self.assertRaises(AttributeError):
            env.lower = 0.5

    def test_envelope_default_direction_is_neutral(self) -> None:
        env = OscillationEnvelope(lower=0.35, tension=0.65, upper=1.0)
        self.assertEqual(env.direction, 0.0)

    def test_envelope_str_contains_boundary_markers(self) -> None:
        env = OscillationEnvelope(lower=0.35, tension=0.65, upper=1.0)
        rendered = str(env)
        self.assertIn("|", rendered)
        self.assertIn("&", rendered)
        self.assertIn("0.35", rendered)
        self.assertIn("0.65", rendered)
        self.assertIn("1.0", rendered)

    def test_envelope_repr_matches_str(self) -> None:
        env = OscillationEnvelope(lower=0.35, tension=0.65, upper=1.0)
        self.assertEqual(repr(env), str(env))

    def test_envelope_rejects_tension_below_lower(self) -> None:
        with self.assertRaises(ValueError):
            OscillationEnvelope(lower=0.5, tension=0.2, upper=1.0)

    def test_envelope_rejects_tension_above_upper(self) -> None:
        with self.assertRaises(ValueError):
            OscillationEnvelope(lower=0.0, tension=1.5, upper=1.0)

    def test_envelope_rejects_lower_above_upper(self) -> None:
        with self.assertRaises(ValueError):
            OscillationEnvelope(lower=1.0, tension=0.5, upper=0.0)

    def test_envelope_rejects_direction_out_of_range(self) -> None:
        with self.assertRaises(ValueError):
            OscillationEnvelope(lower=0.0, tension=0.5, upper=1.0, direction=2.0)
        with self.assertRaises(ValueError):
            OscillationEnvelope(lower=0.0, tension=0.5, upper=1.0, direction=-1.5)

    def test_envelope_accepts_direction_at_bounds(self) -> None:
        env_pos = OscillationEnvelope(lower=0.0, tension=0.5, upper=1.0, direction=1.0)
        self.assertEqual(env_pos.direction, 1.0)
        env_neg = OscillationEnvelope(lower=0.0, tension=0.5, upper=1.0, direction=-1.0)
        self.assertEqual(env_neg.direction, -1.0)

    def test_phase_lane_envelope_invariants(self) -> None:
        self.assertIsInstance(PHASE_LANE_ENVELOPE, OscillationEnvelope)
        self.assertEqual(PHASE_LANE_ENVELOPE.lower, 0.35)
        self.assertEqual(PHASE_LANE_ENVELOPE.tension, 0.65)
        self.assertEqual(PHASE_LANE_ENVELOPE.upper, 1.0)
        self.assertEqual(PHASE_LANE_ENVELOPE.direction, 0.0)


if __name__ == "__main__":
    unittest.main()
