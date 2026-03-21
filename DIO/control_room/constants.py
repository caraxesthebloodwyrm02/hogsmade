"""Shared constants for the DIO control room and episode tool."""

from dataclasses import dataclass
from typing import Tuple

CADENCE: Tuple[str, str, str, str] = ("map", "balance", "tighten", "verify")
RHYTHM_PASS_COUNT: int = 6
MODULAR_PASS_INDEX: int = 7


@dataclass(frozen=True)
class GatePassProfile:
    pass_index: int
    mode: str
    cadence: Tuple[str, str, str, str] = CADENCE
