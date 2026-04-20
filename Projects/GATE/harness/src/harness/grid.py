"""(4+4)^2 GRID distribution engine.

Generates the 8x8 grid structure and distributes 136 harness steps
across 2 full cycles. Each cycle = 64 grid steps + 4 boundary transitions.

Grid layout (8x8 from overlaying two 4x4 quadrants):
  Quadrant A (rows 0-3, cols 0-3): SETUP    — infrastructure, config, deps, validation
  Quadrant B (rows 0-3, cols 4-7): EXECUTE  — build, deploy, verify, integrate
  Quadrant C (rows 4-7, cols 0-3): INSTRUMENT — IO capture, routing, firing
  Quadrant D (rows 4-7, cols 4-7): COMPLETE — checkpoint, audit, transition, handoff
"""

from __future__ import annotations

from harness.models import (
    GridPosition,
    HarnessCycle,
    HarnessManifest,
    HarnessStep,
    PipelineConfig,
    QuantizationProfile,
    StepKind,
    StepPhase,
)

# ---------------------------------------------------------------------------
# Phase label templates — 4 sub-tasks per quadrant row
# ---------------------------------------------------------------------------

QUADRANT_LABELS: dict[str, list[list[str]]] = {
    "A": [  # SETUP: 4 rows x 4 cols
        ["env_scan", "dep_check", "config_load", "path_verify"],
        ["secret_gate", "nonce_validate", "envelope_check", "scope_bind"],
        ["workspace_lock", "branch_verify", "hash_compute", "state_snapshot"],
        ["pre_condition", "gate_pass", "priority_sort", "setup_done"],
    ],
    "B": [  # EXECUTE: 4 rows x 4 cols
        ["build_init", "compile_check", "artifact_pack", "version_stamp"],
        ["deploy_stage", "service_start", "health_probe", "route_verify"],
        ["integration_test", "smoke_test", "regression_check", "perf_gate"],
        ["rollback_plan", "canary_eval", "promote_ready", "execute_done"],
    ],
    "C": [  # INSTRUMENT: 4 rows x 4 cols
        ["env_capture", "var_decorate", "trigger_arm", "ambient_set"],
        ["transistor_init", "signal_route", "hook_register", "buffer_alloc"],
        ["io_bind", "stream_open", "metric_tap", "trace_attach"],
        ["fire_sequence", "capture_flush", "signal_verify", "instrument_done"],
    ],
    "D": [  # COMPLETE: 4 rows x 4 cols
        ["checkpoint_write", "audit_append", "nonce_burn", "state_seal"],
        ["result_collect", "diff_compute", "coverage_log", "score_calc"],
        ["handoff_prep", "envelope_seal", "target_route", "manifest_sign"],
        ["transition_gate", "cycle_report", "cleanup_pass", "complete_done"],
    ],
}

# Boundary step labels (4 per cycle)
BOUNDARY_LABELS = [
    "cycle_entry",
    "mid_checkpoint",
    "pre_exit_gate",
    "cycle_exit",
]

# Boundary insertion points within the 68-step cycle
# After steps 0 (entry), 32 (mid), 48 (pre-exit), 67 (exit)
BOUNDARY_POSITIONS = [0, 33, 49, 67]


def _grid_traversal_order() -> list[GridPosition]:
    """Generate the row-major traversal order for the 8x8 grid.

    Traverses quadrants in order: A -> B -> C -> D
    Within each quadrant, row-major (left-to-right, top-to-bottom).
    """
    positions: list[GridPosition] = []
    # Quadrant A: rows 0-3, cols 0-3
    for r in range(4):
        for c in range(4):
            positions.append(GridPosition(row=r, col=c))
    # Quadrant B: rows 0-3, cols 4-7
    for r in range(4):
        for c in range(4, 8):
            positions.append(GridPosition(row=r, col=c))
    # Quadrant C: rows 4-7, cols 0-3
    for r in range(4):
        for c in range(4):
            positions.append(GridPosition(row=r + 4, col=c))
    # Quadrant D: rows 4-7, cols 4-7
    for r in range(4):
        for c in range(4, 8):
            positions.append(GridPosition(row=r + 4, col=c))
    return positions


def _label_for_position(pos: GridPosition) -> str:
    """Get the human-readable label for a grid position."""
    q = pos.quadrant
    local_row = pos.row % 4
    local_col = pos.col % 4
    return QUADRANT_LABELS[q][local_row][local_col]


def generate_cycle(
    cycle_number: int,
    quant: QuantizationProfile | None = None,
) -> HarnessCycle:
    """Generate one full cycle of 68 harness steps.

    64 grid steps distributed across the (4+4)^2 grid,
    plus 4 boundary transitions inserted at strategic positions.
    """
    if quant is None:
        quant = QuantizationProfile()

    grid_positions = _grid_traversal_order()
    if len(grid_positions) != 64:
        raise ValueError(f"Expected 64 grid positions, got {len(grid_positions)}")

    # Build all 68 steps: interleave grid steps with boundary steps
    steps: list[HarnessStep] = []
    grid_idx = 0
    boundary_idx = 0
    global_offset = cycle_number * 68

    for cycle_idx in range(68):
        is_boundary = cycle_idx in BOUNDARY_POSITIONS and boundary_idx < 4

        if is_boundary:
            step = HarnessStep(
                index=global_offset + cycle_idx,
                cycle=cycle_number,
                cycle_index=cycle_idx,
                kind=StepKind.BOUNDARY,
                phase=StepPhase.SETUP
                if boundary_idx == 0
                else StepPhase.EXECUTE
                if boundary_idx == 1
                else StepPhase.INSTRUMENT
                if boundary_idx == 2
                else StepPhase.COMPLETE,
                grid_pos=None,
                quant_zone=quant.zone_for(cycle_idx),
                label=f"boundary:{BOUNDARY_LABELS[boundary_idx]}",
                action=f"boundary_transition_{BOUNDARY_LABELS[boundary_idx]}",
            )
            boundary_idx += 1
        else:
            pos = grid_positions[grid_idx]
            label = _label_for_position(pos)
            step = HarnessStep(
                index=global_offset + cycle_idx,
                cycle=cycle_number,
                cycle_index=cycle_idx,
                kind=StepKind.GRID,
                phase=pos.phase,
                grid_pos=pos,
                quant_zone=quant.zone_for(cycle_idx),
                label=f"{pos.quadrant}:{label}",
                action=label,
            )
            grid_idx += 1

        steps.append(step)

    if len(steps) != 68:
        raise ValueError(f"Expected 68 steps, got {len(steps)}")
    return HarnessCycle(cycle_number=cycle_number, steps=steps)


def generate_manifest(
    config: PipelineConfig | None = None,
    synthetic_context: dict | None = None,
) -> HarnessManifest:
    """Generate the full 136-step harness manifest across 2 cycles.

    This is the primary entry point for the grid distribution engine.
    """
    if config is None:
        config = PipelineConfig()

    quant = config.quantization

    cycle_0 = generate_cycle(0, quant)
    cycle_1 = generate_cycle(1, quant)

    manifest = HarnessManifest(
        cycles=[cycle_0, cycle_1],
        config=config,
        synthetic_context=synthetic_context or {},
    )

    if manifest.total_steps != 136:
        raise ValueError(f"Expected 136 total steps, got {manifest.total_steps}")
    return manifest


def print_grid_map(cycle: HarnessCycle) -> str:
    """Print an ASCII visualization of the 8x8 grid for a cycle."""
    lines = [f"=== Cycle {cycle.cycle_number} Grid Map ===", ""]
    lines.append("     " + "  ".join(f"C{c}" for c in range(8)))
    lines.append("    " + "-" * 32)

    # Build grid from steps
    grid: dict[tuple[int, int], HarnessStep] = {}
    for step in cycle.steps:
        if step.grid_pos is not None:
            grid[(step.grid_pos.row, step.grid_pos.col)] = step

    for r in range(8):
        row_str = f"R{r} | "
        for c in range(8):
            if (r, c) in grid:
                step = grid[(r, c)]
                status_char = {
                    "pending": ".",
                    "active": "*",
                    "passed": "#",
                    "failed": "X",
                    "skipped": "-",
                }[step.status.value]
                row_str += f" {status_char} "
            else:
                row_str += " _ "
        lines.append(row_str)

    lines.append("")
    lines.append("Legend: . pending  * active  # passed  X failed  - skipped  _ empty")
    return "\n".join(lines)
