"""Shared constants for the DIO control room and episode tool."""

from dataclasses import dataclass
from typing import Literal, Tuple, Union

CADENCE: Tuple[str, str, str, str] = ("map", "balance", "tighten", "verify")
RHYTHM_PASS_COUNT: int = 6
MODULAR_PASS_INDEX: int = 7

# Duplicated string values centralized
CATEGORY_VALUES: Tuple[str, str, str, str] = ("Smooth Flow", "Thermal Drift", "Air Drift", "Correction Zone")
LIGHT_PHASE_VALUES: Tuple[str, str, str, str] = ("Cruise", "Warm Shift", "Vector Shift", "Recovery")
FLOW_BAND_VALUES: Tuple[str, str] = ("centered", "drift")
HEAT_BAND_VALUES: Tuple[str, str] = ("steady", "swing")
TRANSFER_MODE_VALUES: Tuple[str, str] = ("instant", "staged")
TRAVEL_CHANNEL_VALUES: Tuple[str, str] = ("instant_transit_lane", "staged_transit_lane")
TRIGGER_BOARD_LANE_ORDER: Tuple[str, ...] = ("entry_lane", "phase_lane", "countdown_lane", "break_lane", "promotion_lane", "exit_lane")

# Literal type aliases for type safety
FlowBand = Literal["centered", "drift"]
HeatBand = Literal["steady", "swing"]
AirflowCategory = Literal["Smooth Flow", "Thermal Drift", "Air Drift", "Correction Zone"]
LightPhase = Literal["Cruise", "Warm Shift", "Vector Shift", "Recovery"]
TransferMode = Literal["instant", "staged"]
TravelChannel = Literal["instant_transit_lane", "staged_transit_lane"]
BeatPhase = Literal["map", "balance", "tighten", "verify"]
StageName = Literal["setup", "build", "mutation", "closure"]


@dataclass(frozen=True)
class GatePassProfile:
    pass_index: int
    mode: str
    cadence: Tuple[str, str, str, str] = CADENCE


@dataclass(frozen=True)
class OscillationEnvelope:
    """Bounded constraint envelope for trigger board lanes.

    The | & | pattern: lower and upper are hard boundaries,
    tension is the conjunction/equilibrium point, direction
    biases the initial exploration vector.

    Values derived from glimpse confidence scoring physics:
    lower=0.35 (confidence floor), tension=0.65 (equilibrium),
    upper=1.0 (full saturation). The ADSR-shaped cadence
    (map/balance/tighten/verify) traverses this range.
    """

    lower: float
    tension: float
    upper: float
    direction: float = 0.0

    def __post_init__(self) -> None:
        if not (self.lower <= self.tension <= self.upper):
            raise ValueError(
                f"Envelope violated: lower ({self.lower}) <= tension ({self.tension}) <= upper ({self.upper})"
            )
        if not (-1.0 <= self.direction <= 1.0):
            raise ValueError(f"Direction must be in [-1.0, 1.0], got {self.direction}")

    def __str__(self) -> str:
        return f"|{self.lower}|&{self.tension}|{self.upper}|d={self.direction}"

    def __repr__(self) -> str:
        return str(self)


PHASE_LANE_ENVELOPE = OscillationEnvelope(lower=0.35, tension=0.65, upper=1.0)

LaneValue = Union[str, OscillationEnvelope]
