"""Pydantic models for the harness step system, grid cycles, and pipeline config."""

from __future__ import annotations

import hashlib
import re
import time
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field, computed_field

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class StepPhase(StrEnum):
    """Four phases of the (4+4)^2 grid per cycle."""

    SETUP = "setup"  # Quadrant A: infrastructure, config, deps, validation
    EXECUTE = "execute"  # Quadrant B: build, deploy, verify, integrate
    INSTRUMENT = "instrument"  # Quadrant C: IO capture, routing, firing
    COMPLETE = "complete"  # Quadrant D: checkpoint, audit, transition, handoff


class StepKind(StrEnum):
    """Step classification within a phase."""

    GRID = "grid"  # Regular grid cell step (64 per cycle)
    BOUNDARY = "boundary"  # Cycle boundary transition (4 per cycle)


class QuantizationZone(StrEnum):
    """Quantization zones for the buildup-silence-drop pattern."""

    BUILDUP = "buildup"  # Gradual ramp: increasing intensity
    SILENCE = "silence"  # Brief absence: deliberate gap
    DROP = "drop"  # Execution burst: high-intensity


class TransistorState(StrEnum):
    """Binary transistor gate: the basic '10'."""

    OFF = "0"
    ON = "1"


class PipelineMode(StrEnum):
    """Analog (manual modulation) vs modular (automated)."""

    ANALOG = "analog"
    MODULAR = "modular"


class StepStatus(StrEnum):
    """Execution status of a harness step."""

    PENDING = "pending"
    ACTIVE = "active"
    PASSED = "passed"
    FAILED = "failed"
    SKIPPED = "skipped"


# ---------------------------------------------------------------------------
# Core Models
# ---------------------------------------------------------------------------


class GridPosition(BaseModel):
    """Position within the (4+4)^2 = 8x8 grid."""

    row: int = Field(ge=0, lt=8, description="Row in 8x8 grid (0-7)")
    col: int = Field(ge=0, lt=8, description="Column in 8x8 grid (0-7)")

    @computed_field
    @property
    def quadrant(self) -> str:
        """Which 4x4 quadrant this cell belongs to (A/B/C/D)."""
        if self.row < 4 and self.col < 4:
            return "A"
        if self.row < 4 and self.col >= 4:
            return "B"
        if self.row >= 4 and self.col < 4:
            return "C"
        return "D"

    @computed_field
    @property
    def phase(self) -> StepPhase:
        """Map quadrant to phase."""
        return {
            "A": StepPhase.SETUP,
            "B": StepPhase.EXECUTE,
            "C": StepPhase.INSTRUMENT,
            "D": StepPhase.COMPLETE,
        }[self.quadrant]

    @computed_field
    @property
    def cell_index(self) -> int:
        """Flat index in row-major order (0-63)."""
        return self.row * 8 + self.col


class DecoratedVar(BaseModel):
    """A decorated variable that fires at a specific trigger point.

    Placed selectively before the drop zone in the pipeline.
    """

    name: str = Field(description="Variable name (env-safe)")
    value: str = Field(description="Value to set when triggered")
    trigger_step: int = Field(description="Step index that activates this var")
    zone: QuantizationZone = Field(
        default=QuantizationZone.DROP,
        description="Which zone this var is designed for",
    )
    fire_on: str = Field(
        default="step_enter",
        description="Event that triggers firing: step_enter | step_exit | checkpoint",
    )

    @computed_field
    @property
    def env_key(self) -> str:
        """Environment variable key format (sanitised for shell safety)."""
        safe = re.sub(r"[^A-Z0-9_]", "_", self.name.upper())
        return f"HARNESS_{safe}"


class TransistorHook(BaseModel):
    """Binary gate hook — the basic '10' programming.

    A transistor that can be ON or OFF, hooked into the pipeline
    at specific positions to control signal flow.
    """

    hook_id: str
    state: TransistorState = TransistorState.OFF
    armed_at_step: int = Field(description="Step where transistor arms")
    fires_at_step: int = Field(description="Step where transistor fires (if ON)")
    signal: str = Field(default="HARNESS_TRANSISTOR", description="Signal name to emit")

    def arm(self) -> None:
        """Arm the transistor (set to ON)."""
        self.state = TransistorState.ON

    def fire(self) -> dict[str, str]:
        """Fire the transistor if armed. Returns env dict to set."""
        if self.state == TransistorState.ON:
            self.state = TransistorState.OFF
            return {f"{self.signal}_{self.hook_id}": "1"}
        return {f"{self.signal}_{self.hook_id}": "0"}


class HarnessStep(BaseModel):
    """A single harness step — one of 136 in the full deployment."""

    index: int = Field(ge=0, lt=136, description="Global step index (0-135)")
    cycle: int = Field(ge=0, lt=2, description="Cycle number (0 or 1)")
    cycle_index: int = Field(ge=0, lt=68, description="Index within cycle (0-67)")
    kind: StepKind
    phase: StepPhase
    grid_pos: GridPosition | None = Field(
        default=None, description="Grid position (None for boundary steps)"
    )
    quant_zone: QuantizationZone
    label: str = Field(description="Human-readable step label")
    action: str = Field(default="", description="Action to execute")
    status: StepStatus = StepStatus.PENDING
    decorated_vars: list[DecoratedVar] = Field(default_factory=list)
    transistor_hooks: list[TransistorHook] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @computed_field
    @property
    def step_hash(self) -> str:
        """Deterministic hash for this step's identity."""
        raw = f"{self.index}:{self.cycle}:{self.cycle_index}:{self.label}"
        return hashlib.sha256(raw.encode()).hexdigest()[:12]


class HarnessCycle(BaseModel):
    """One full cycle of 68 steps (64 grid + 4 boundary)."""

    cycle_number: int = Field(ge=0, lt=2)
    steps: list[HarnessStep] = Field(min_length=68, max_length=68)
    entry_timestamp: float = Field(default_factory=time.time)
    exit_timestamp: float | None = None

    @computed_field
    @property
    def grid_steps(self) -> int:
        return sum(1 for s in self.steps if s.kind == StepKind.GRID)

    @computed_field
    @property
    def boundary_steps(self) -> int:
        return sum(1 for s in self.steps if s.kind == StepKind.BOUNDARY)

    @computed_field
    @property
    def passed(self) -> int:
        return sum(1 for s in self.steps if s.status == StepStatus.PASSED)


class QuantizationProfile(BaseModel):
    """Defines the buildup-silence-drop distribution for a cycle.

    The 68 steps per cycle are allocated across zones:
    - Buildup: gradual ramp (steps 0-43, 44 steps)
    - Silence: brief absence (steps 44-47, 4 steps)
    - Drop: execution burst (steps 48-67, 20 steps)
    """

    buildup_range: tuple[int, int] = (0, 44)  # 44 steps: gradual
    silence_range: tuple[int, int] = (44, 48)  # 4 steps: pause
    drop_range: tuple[int, int] = (48, 68)  # 20 steps: burst

    def zone_for(self, cycle_index: int) -> QuantizationZone:
        """Determine which quantization zone a step belongs to."""
        if self.buildup_range[0] <= cycle_index < self.buildup_range[1]:
            return QuantizationZone.BUILDUP
        if self.silence_range[0] <= cycle_index < self.silence_range[1]:
            return QuantizationZone.SILENCE
        return QuantizationZone.DROP

    def intensity(self, cycle_index: int) -> float:
        """Compute intensity (0.0-1.0) for a step based on its zone.

        Buildup: linear ramp 0.1 -> 0.7
        Silence: 0.0
        Drop: 1.0 (full intensity)
        """
        zone = self.zone_for(cycle_index)
        if zone == QuantizationZone.BUILDUP:
            span = self.buildup_range[1] - self.buildup_range[0]
            if span <= 0:
                return 0.1
            progress = (cycle_index - self.buildup_range[0]) / span
            return 0.1 + progress * 0.6
        if zone == QuantizationZone.SILENCE:
            return 0.0
        return 1.0


class PipelineConfig(BaseModel):
    """Full pipeline configuration."""

    mode: PipelineMode = PipelineMode.MODULAR
    quantization: QuantizationProfile = Field(default_factory=QuantizationProfile)
    gate_dir: str = Field(default="/home/caraxes/CascadeProjects/Projects/GATE")
    manifest_dir: str = Field(
        default="/home/caraxes/CascadeProjects/Projects/GATE/harness/manifests"
    )
    envelope_id: str | None = None
    nonce: str | None = None
    ambient_vars: dict[str, str] = Field(
        default_factory=lambda: {
            "HARNESS_ACTIVE": "1",
            "HARNESS_VERSION": "0.1.0",
            "HARNESS_CYCLES": "2",
            "HARNESS_STEPS_TOTAL": "136",
        }
    )
    transistor_base: str = Field(
        default="10", description="Base transistor pattern (binary on/off)"
    )


class HarnessManifest(BaseModel):
    """The complete 136-step harness manifest."""

    version: str = "0.1.0"
    cycles: list[HarnessCycle] = Field(min_length=2, max_length=2)
    config: PipelineConfig = Field(default_factory=PipelineConfig)
    synthetic_context: dict[str, Any] = Field(
        default_factory=dict,
        description="Context collected from parallel agent checkpoints",
    )
    created_at: float = Field(default_factory=time.time)

    @computed_field
    @property
    def total_steps(self) -> int:
        return sum(len(c.steps) for c in self.cycles)

    @computed_field
    @property
    def total_passed(self) -> int:
        return sum(c.passed for c in self.cycles)

    def step_at(self, global_index: int) -> HarnessStep:
        """Get step by global index (0-135).

        Raises:
            IndexError: If global_index is out of the valid range.
        """
        if global_index < 0 or global_index >= self.total_steps:
            raise IndexError(f"Step index {global_index} out of range [0, {self.total_steps})")
        cycle_num = global_index // 68
        cycle_idx = global_index % 68
        return self.cycles[cycle_num].steps[cycle_idx]
