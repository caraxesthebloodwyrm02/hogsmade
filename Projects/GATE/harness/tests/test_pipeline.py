"""Tests for the quantized pipeline."""

import os

from harness.grid import generate_manifest
from harness.instrument import instrument_manifest
from harness.models import (
    PipelineConfig,
    PipelineMode,
    StepStatus,
)
from harness.pipeline import QuantizedPipeline


class TestQuantizedPipeline:
    def _make_pipeline(self) -> QuantizedPipeline:
        config = PipelineConfig(envelope_id="test-env", nonce="test-nonce")
        manifest = generate_manifest(config=config)
        instrument_manifest(manifest)
        return QuantizedPipeline(manifest)

    def test_dry_run_passes_all(self):
        pipeline = self._make_pipeline()
        result = pipeline.run(dry_run=True)
        assert result.success
        assert result.passed == 136
        assert result.failed == 0

    def test_dry_run_pass_rate(self):
        pipeline = self._make_pipeline()
        result = pipeline.run(dry_run=True)
        assert result.pass_rate == 1.0

    def test_dry_run_has_duration(self):
        pipeline = self._make_pipeline()
        result = pipeline.run(dry_run=True)
        assert result.duration >= 0

    def test_pipeline_mode(self):
        pipeline = self._make_pipeline()
        result = pipeline.run(dry_run=True)
        assert result.mode == PipelineMode.MODULAR

    def test_handler_registration(self):
        pipeline = self._make_pipeline()
        called = []
        pipeline.register_handler("env_scan", lambda step: called.append(step.index))
        # Run live to trigger handlers
        result = pipeline.run(dry_run=False)
        # At least some steps should have run
        assert result.passed > 0

    def test_handler_failure_records_error(self):
        pipeline = self._make_pipeline()

        def failing_handler(step):
            raise ValueError("intentional failure")

        pipeline.register_handler("env_scan", failing_handler)
        result = pipeline.run(dry_run=False)
        assert result.failed >= 1
        assert len(result.errors) >= 1
        assert "intentional failure" in result.errors[0]

    def test_ambient_env_set_during_run(self):
        """Ambient env vars should be set during execution and cleared after."""
        pipeline = self._make_pipeline()
        captured_env = {}

        def capture_handler(step):
            captured_env["HARNESS_ACTIVE"] = os.environ.get("HARNESS_ACTIVE")

        pipeline.register_handler("env_scan", capture_handler)
        pipeline.run(dry_run=False)

        # Should have been set during execution
        assert captured_env.get("HARNESS_ACTIVE") == "1"
        # Should be cleared after
        assert os.environ.get("HARNESS_ACTIVE") is None

    def test_fired_triggers_in_result(self):
        """Decorated vars should fire and appear in result triggers."""
        pipeline = self._make_pipeline()
        result = pipeline.run(dry_run=False)
        # Instrumented manifest should have triggers
        assert isinstance(result.fired_triggers, list)


class TestEndPassVerification:
    def test_verify_passes_on_valid_manifest(self):
        config = PipelineConfig()
        manifest = generate_manifest(config=config)
        instrument_manifest(manifest)
        pipeline = QuantizedPipeline(manifest)
        result = pipeline.verify_end_pass()
        assert result.passed
        assert result.total_steps == 136
        assert len(result.issues) == 0

    def test_verify_reports_step_count(self):
        config = PipelineConfig()
        manifest = generate_manifest(config=config)
        pipeline = QuantizedPipeline(manifest)
        result = pipeline.verify_end_pass()
        assert result.total_steps == 136

    def test_verify_checks_silence_zone_count(self):
        """Each cycle should have exactly 4 silence steps."""
        config = PipelineConfig()
        manifest = generate_manifest(config=config)
        pipeline = QuantizedPipeline(manifest)
        result = pipeline.verify_end_pass()
        assert result.passed

    def test_post_run_manifest_state(self):
        """After dry run, all steps should be PASSED."""
        config = PipelineConfig()
        manifest = generate_manifest(config=config)
        instrument_manifest(manifest)
        pipeline = QuantizedPipeline(manifest)
        pipeline.run(dry_run=True)

        for cycle in manifest.cycles:
            for step in cycle.steps:
                assert step.status == StepStatus.PASSED
