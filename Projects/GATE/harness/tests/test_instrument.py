"""Tests for IO instrumentation."""

from harness.grid import generate_manifest
from harness.instrument import (
    build_ambient_context,
    create_decorated_vars,
    create_transistor_hooks,
    identify_pre_drop_steps,
    instrument_manifest,
)
from harness.models import (
    PipelineConfig,
    QuantizationZone,
    TransistorState,
)


class TestPreDropIdentification:
    def test_pre_drop_steps_found(self):
        manifest = generate_manifest()
        pre_drop = identify_pre_drop_steps(manifest)
        assert len(pre_drop) > 0

    def test_pre_drop_includes_silence_zone(self):
        manifest = generate_manifest()
        pre_drop = identify_pre_drop_steps(manifest)
        # Should include silence zone steps (4 per cycle = 8 total)
        # Plus the last buildup step per cycle (2 total)
        assert len(pre_drop) >= 8

    def test_pre_drop_steps_are_sorted(self):
        manifest = generate_manifest()
        pre_drop = identify_pre_drop_steps(manifest)
        assert pre_drop == sorted(pre_drop)


class TestTransistorHooks:
    def test_hooks_created(self):
        manifest = generate_manifest()
        pre_drop = identify_pre_drop_steps(manifest)
        hooks = create_transistor_hooks(manifest, pre_drop)
        assert len(hooks) > 0

    def test_primary_hooks_per_cycle(self):
        """Should have at least 2 hooks per cycle (primary + midpoint)."""
        manifest = generate_manifest()
        pre_drop = identify_pre_drop_steps(manifest)
        hooks = create_transistor_hooks(manifest, pre_drop)
        assert len(hooks) >= 4  # 2 per cycle * 2 cycles

    def test_hook_starts_off(self):
        manifest = generate_manifest()
        pre_drop = identify_pre_drop_steps(manifest)
        hooks = create_transistor_hooks(manifest, pre_drop)
        for hook in hooks:
            assert hook.state == TransistorState.OFF

    def test_hook_arm_fire_cycle(self):
        """Test the basic '10' programming: arm then fire."""
        manifest = generate_manifest()
        pre_drop = identify_pre_drop_steps(manifest)
        hooks = create_transistor_hooks(manifest, pre_drop)
        hook = hooks[0]

        # Initially OFF
        assert hook.state == TransistorState.OFF

        # Arm it
        hook.arm()
        assert hook.state == TransistorState.ON

        # Fire it — should return "1" and reset to OFF
        result = hook.fire()
        assert hook.state == TransistorState.OFF
        assert any(v == "1" for v in result.values())

    def test_hook_fire_when_off_returns_zero(self):
        manifest = generate_manifest()
        pre_drop = identify_pre_drop_steps(manifest)
        hooks = create_transistor_hooks(manifest, pre_drop)
        hook = hooks[0]

        # Fire without arming
        result = hook.fire()
        assert any(v == "0" for v in result.values())


class TestDecoratedVars:
    def test_vars_created(self):
        manifest = generate_manifest()
        pre_drop = identify_pre_drop_steps(manifest)
        dvars = create_decorated_vars(manifest, pre_drop)
        assert len(dvars) > 0

    def test_vars_per_cycle(self):
        """Should have 3 vars per cycle: attention, drop_signal, cycle_complete."""
        manifest = generate_manifest()
        pre_drop = identify_pre_drop_steps(manifest)
        dvars = create_decorated_vars(manifest, pre_drop)
        assert len(dvars) == 6  # 3 per cycle * 2 cycles

    def test_env_key_format(self):
        manifest = generate_manifest()
        pre_drop = identify_pre_drop_steps(manifest)
        dvars = create_decorated_vars(manifest, pre_drop)
        for dv in dvars:
            assert dv.env_key.startswith("HARNESS_")

    def test_attention_var_in_silence_zone(self):
        manifest = generate_manifest()
        pre_drop = identify_pre_drop_steps(manifest)
        dvars = create_decorated_vars(manifest, pre_drop)
        attention_vars = [dv for dv in dvars if "attention" in dv.name]
        assert len(attention_vars) == 2  # One per cycle
        for av in attention_vars:
            assert av.zone == QuantizationZone.SILENCE

    def test_drop_signal_in_drop_zone(self):
        manifest = generate_manifest()
        pre_drop = identify_pre_drop_steps(manifest)
        dvars = create_decorated_vars(manifest, pre_drop)
        drop_vars = [dv for dv in dvars if "drop_signal" in dv.name]
        assert len(drop_vars) == 2
        for dv in drop_vars:
            assert dv.zone == QuantizationZone.DROP


class TestAmbientContext:
    def test_ambient_includes_defaults(self):
        manifest = generate_manifest()
        ctx = build_ambient_context(manifest)
        assert "HARNESS_ACTIVE" in ctx
        assert ctx["HARNESS_ACTIVE"] == "1"

    def test_ambient_includes_synthetic_context(self):
        manifest = generate_manifest(synthetic_context={"test_key": "test_value"})
        ctx = build_ambient_context(manifest)
        assert "HARNESS_CTX_TEST_KEY" in ctx

    def test_ambient_includes_gate_vars(self):
        config = PipelineConfig(envelope_id="env-123", nonce="nonce-456")
        manifest = generate_manifest(config=config)
        ctx = build_ambient_context(manifest)
        assert ctx.get("HARNESS_ENVELOPE_ID") == "env-123"
        assert ctx.get("HARNESS_NONCE") == "nonce-456"


class TestInstrumentManifest:
    def test_full_instrumentation(self):
        manifest = generate_manifest()
        plan = instrument_manifest(manifest)
        assert len(plan.transistor_hooks) >= 4
        assert len(plan.decorated_vars) == 6
        assert len(plan.pre_drop_steps) >= 8
        assert len(plan.ambient_vars) > 0

    def test_hooks_attached_to_steps(self):
        manifest = generate_manifest()
        instrument_manifest(manifest)

        steps_with_hooks = 0
        for cycle in manifest.cycles:
            for step in cycle.steps:
                if step.transistor_hooks:
                    steps_with_hooks += 1
        assert steps_with_hooks > 0

    def test_dvars_attached_to_steps(self):
        manifest = generate_manifest()
        instrument_manifest(manifest)

        steps_with_dvars = 0
        for cycle in manifest.cycles:
            for step in cycle.steps:
                if step.decorated_vars:
                    steps_with_dvars += 1
        assert steps_with_dvars > 0
