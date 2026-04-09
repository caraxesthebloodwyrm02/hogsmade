"""Tests for the (4+4)^2 GRID distribution engine."""

from harness.grid import (
    _grid_traversal_order,
    _label_for_position,
    generate_cycle,
    generate_manifest,
    print_grid_map,
)
from harness.models import (
    GridPosition,
    PipelineConfig,
    QuantizationProfile,
    QuantizationZone,
    StepKind,
    StepPhase,
)


class TestGridPosition:
    def test_quadrant_a(self):
        pos = GridPosition(row=0, col=0)
        assert pos.quadrant == "A"
        assert pos.phase == StepPhase.SETUP

    def test_quadrant_b(self):
        pos = GridPosition(row=0, col=4)
        assert pos.quadrant == "B"
        assert pos.phase == StepPhase.EXECUTE

    def test_quadrant_c(self):
        pos = GridPosition(row=4, col=0)
        assert pos.quadrant == "C"
        assert pos.phase == StepPhase.INSTRUMENT

    def test_quadrant_d(self):
        pos = GridPosition(row=7, col=7)
        assert pos.quadrant == "D"
        assert pos.phase == StepPhase.COMPLETE

    def test_cell_index(self):
        pos = GridPosition(row=3, col=5)
        assert pos.cell_index == 3 * 8 + 5


class TestGridTraversal:
    def test_traversal_produces_64_positions(self):
        positions = _grid_traversal_order()
        assert len(positions) == 64

    def test_traversal_covers_all_cells(self):
        positions = _grid_traversal_order()
        cells = {(p.row, p.col) for p in positions}
        assert len(cells) == 64

    def test_traversal_quadrant_order(self):
        """Quadrants should appear in order: A, B, C, D."""
        positions = _grid_traversal_order()
        quadrants = [p.quadrant for p in positions]
        # First 16 should be A, next 16 B, next 16 C, next 16 D
        assert all(q == "A" for q in quadrants[:16])
        assert all(q == "B" for q in quadrants[16:32])
        assert all(q == "C" for q in quadrants[32:48])
        assert all(q == "D" for q in quadrants[48:64])

    def test_all_labels_defined(self):
        positions = _grid_traversal_order()
        for pos in positions:
            label = _label_for_position(pos)
            assert label, f"Empty label for {pos.row},{pos.col}"


class TestGenerateCycle:
    def test_cycle_has_68_steps(self):
        cycle = generate_cycle(0)
        assert len(cycle.steps) == 68

    def test_cycle_has_64_grid_steps(self):
        cycle = generate_cycle(0)
        grid_steps = [s for s in cycle.steps if s.kind == StepKind.GRID]
        assert len(grid_steps) == 64

    def test_cycle_has_4_boundary_steps(self):
        cycle = generate_cycle(0)
        boundary_steps = [s for s in cycle.steps if s.kind == StepKind.BOUNDARY]
        assert len(boundary_steps) == 4

    def test_cycle_0_global_indices(self):
        cycle = generate_cycle(0)
        indices = [s.index for s in cycle.steps]
        assert indices == list(range(68))

    def test_cycle_1_global_indices(self):
        cycle = generate_cycle(1)
        indices = [s.index for s in cycle.steps]
        assert indices == list(range(68, 136))

    def test_boundary_labels(self):
        cycle = generate_cycle(0)
        boundary_steps = [s for s in cycle.steps if s.kind == StepKind.BOUNDARY]
        for step in boundary_steps:
            assert step.label.startswith("boundary:")

    def test_grid_labels_have_quadrant_prefix(self):
        cycle = generate_cycle(0)
        grid_steps = [s for s in cycle.steps if s.kind == StepKind.GRID]
        for step in grid_steps:
            assert ":" in step.label
            quadrant = step.label.split(":")[0]
            assert quadrant in ("A", "B", "C", "D")

    def test_quantization_zones_assigned(self):
        cycle = generate_cycle(0)
        zones = {s.quant_zone for s in cycle.steps}
        assert QuantizationZone.BUILDUP in zones
        assert QuantizationZone.SILENCE in zones
        assert QuantizationZone.DROP in zones

    def test_silence_zone_count(self):
        """Default profile: 4 silence steps per cycle."""
        cycle = generate_cycle(0)
        silence = [s for s in cycle.steps if s.quant_zone == QuantizationZone.SILENCE]
        assert len(silence) == 4


class TestGenerateManifest:
    def test_manifest_has_136_steps(self):
        manifest = generate_manifest()
        assert manifest.total_steps == 136

    def test_manifest_has_2_cycles(self):
        manifest = generate_manifest()
        assert len(manifest.cycles) == 2

    def test_manifest_with_config(self):
        config = PipelineConfig(envelope_id="test-123", nonce="abc")
        manifest = generate_manifest(config=config)
        assert manifest.config.envelope_id == "test-123"
        assert manifest.config.nonce == "abc"

    def test_manifest_with_synthetic_context(self):
        ctx = {"agent_a": {"status": "done"}}
        manifest = generate_manifest(synthetic_context=ctx)
        assert manifest.synthetic_context == ctx

    def test_step_hashes_unique(self):
        manifest = generate_manifest()
        hashes = set()
        for cycle in manifest.cycles:
            for step in cycle.steps:
                assert step.step_hash not in hashes, f"Duplicate hash at step {step.index}"
                hashes.add(step.step_hash)

    def test_step_at_accessor(self):
        manifest = generate_manifest()
        step_0 = manifest.step_at(0)
        assert step_0.index == 0
        step_135 = manifest.step_at(135)
        assert step_135.index == 135

    def test_all_four_phases_present(self):
        manifest = generate_manifest()
        phases = set()
        for cycle in manifest.cycles:
            for step in cycle.steps:
                phases.add(step.phase)
        assert phases == {
            StepPhase.SETUP,
            StepPhase.EXECUTE,
            StepPhase.INSTRUMENT,
            StepPhase.COMPLETE,
        }


class TestQuantizationProfile:
    def test_buildup_zone(self):
        q = QuantizationProfile()
        assert q.zone_for(0) == QuantizationZone.BUILDUP
        assert q.zone_for(43) == QuantizationZone.BUILDUP

    def test_silence_zone(self):
        q = QuantizationProfile()
        assert q.zone_for(44) == QuantizationZone.SILENCE
        assert q.zone_for(47) == QuantizationZone.SILENCE

    def test_drop_zone(self):
        q = QuantizationProfile()
        assert q.zone_for(48) == QuantizationZone.DROP
        assert q.zone_for(67) == QuantizationZone.DROP

    def test_buildup_intensity_ramp(self):
        q = QuantizationProfile()
        i_start = q.intensity(0)
        i_end = q.intensity(43)
        assert i_start < i_end
        assert 0.0 < i_start <= 0.15
        assert 0.65 <= i_end <= 0.75

    def test_silence_intensity_zero(self):
        q = QuantizationProfile()
        assert q.intensity(44) == 0.0
        assert q.intensity(47) == 0.0

    def test_drop_intensity_max(self):
        q = QuantizationProfile()
        assert q.intensity(48) == 1.0
        assert q.intensity(67) == 1.0


class TestGridMap:
    def test_print_grid_map_returns_string(self):
        cycle = generate_cycle(0)
        output = print_grid_map(cycle)
        assert isinstance(output, str)
        assert "Cycle 0 Grid Map" in output
        assert "Legend" in output
