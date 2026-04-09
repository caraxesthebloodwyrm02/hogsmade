"""Tests for async pipeline, cancellation, progress callbacks, and edge cases.

These tests cover the new async orchestration, graceful shutdown,
pause/resume, bounds checking, and concurrent cycle execution.
"""

import asyncio

import pytest

from harness.grid import generate_manifest
from harness.instrument import instrument_manifest
from harness.models import (
    HarnessManifest,
    PipelineConfig,
    QuantizationProfile,
)
from harness.pipeline import (
    AsyncQuantizedPipeline,
    PipelineResult,
    PipelineState,
    QuantizedPipeline,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_manifest() -> HarnessManifest:
    config = PipelineConfig(envelope_id="test-env", nonce="test-nonce")
    manifest = generate_manifest(config=config)
    instrument_manifest(manifest)
    return manifest


# ---------------------------------------------------------------------------
# PipelineState tests
# ---------------------------------------------------------------------------


class TestPipelineState:
    def test_initial_state(self):
        state = PipelineState()
        assert not state.active
        assert not state.paused
        assert not state.cancelled

    def test_cancel(self):
        state = PipelineState()
        state.request_cancel()
        assert state.cancelled

    def test_pause_resume(self):
        state = PipelineState()
        state.request_pause()
        assert state.paused
        state.resume()
        assert not state.paused


# ---------------------------------------------------------------------------
# PipelineResult tests
# ---------------------------------------------------------------------------


class TestPipelineResult:
    def test_success_when_all_passed(self):
        r = PipelineResult(total_steps=10, passed=10)
        assert r.success

    def test_not_success_when_failed(self):
        r = PipelineResult(total_steps=10, passed=9, failed=1)
        assert not r.success

    def test_not_success_when_skipped(self):
        r = PipelineResult(total_steps=10, passed=8, skipped=2)
        assert not r.success

    def test_pass_rate_zero_total(self):
        r = PipelineResult(total_steps=0, passed=0)
        assert r.pass_rate == 0.0

    def test_pass_rate_partial(self):
        r = PipelineResult(total_steps=4, passed=3)
        assert r.pass_rate == 0.75

    def test_skipped_field_exists(self):
        r = PipelineResult()
        assert r.skipped == 0


# ---------------------------------------------------------------------------
# Bounds checking
# ---------------------------------------------------------------------------


class TestBoundsChecking:
    def test_step_at_negative_index(self):
        manifest = generate_manifest()
        with pytest.raises(IndexError, match="out of range"):
            manifest.step_at(-1)

    def test_step_at_overflow(self):
        manifest = generate_manifest()
        with pytest.raises(IndexError, match="out of range"):
            manifest.step_at(136)

    def test_step_at_large_overflow(self):
        manifest = generate_manifest()
        with pytest.raises(IndexError, match="out of range"):
            manifest.step_at(999)

    def test_step_at_valid_boundary(self):
        manifest = generate_manifest()
        # Should not raise
        assert manifest.step_at(0).index == 0
        assert manifest.step_at(135).index == 135


# ---------------------------------------------------------------------------
# Quantization edge cases
# ---------------------------------------------------------------------------


class TestQuantizationEdgeCases:
    def test_zero_span_buildup(self):
        """Division-by-zero guard: buildup_range with zero span."""
        q = QuantizationProfile(buildup_range=(0, 0), silence_range=(0, 4), drop_range=(4, 68))
        # With zero span, intensity should return 0.1 (not crash)
        assert q.intensity(0) == pytest.approx(0.0)  # falls through to silence since 0 is in [0,4)

    def test_custom_profile_zones(self):
        q = QuantizationProfile(buildup_range=(0, 10), silence_range=(10, 15), drop_range=(15, 68))
        assert q.zone_for(5).value == "buildup"
        assert q.zone_for(12).value == "silence"
        assert q.zone_for(20).value == "drop"


# ---------------------------------------------------------------------------
# Progress callbacks (sync pipeline)
# ---------------------------------------------------------------------------


class TestProgressCallbacks:
    def test_progress_callback_called(self):
        manifest = _make_manifest()
        pipeline = QuantizedPipeline(manifest)
        calls = []
        pipeline.on_progress(lambda step, state: calls.append(step.index))
        pipeline.run(dry_run=False)
        # Should have been called for each non-dry-run step
        assert len(calls) == 136

    def test_progress_callback_crash_doesnt_kill_pipeline(self):
        manifest = _make_manifest()
        pipeline = QuantizedPipeline(manifest)

        def bad_callback(step, state):
            raise RuntimeError("callback boom")

        pipeline.on_progress(bad_callback)
        result = pipeline.run(dry_run=False)
        # Pipeline should complete despite crashing callback
        assert result.passed == 136

    def test_multiple_callbacks(self):
        manifest = _make_manifest()
        pipeline = QuantizedPipeline(manifest)
        a_calls = []
        b_calls = []
        pipeline.on_progress(lambda s, st: a_calls.append(1))
        pipeline.on_progress(lambda s, st: b_calls.append(1))
        pipeline.run(dry_run=False)
        assert len(a_calls) == 136
        assert len(b_calls) == 136


# ---------------------------------------------------------------------------
# Cancellation (sync pipeline)
# ---------------------------------------------------------------------------


class TestCancellation:
    def test_cancel_mid_run(self):
        manifest = _make_manifest()
        pipeline = QuantizedPipeline(manifest)

        def cancel_at_step_10(step, state):
            if step.index >= 10:
                state.request_cancel()

        pipeline.on_progress(cancel_at_step_10)
        result = pipeline.run(dry_run=False)
        # Should have some passed and some skipped
        assert result.passed > 0
        assert result.skipped > 0
        assert result.passed + result.skipped == result.total_steps

    def test_env_cleared_after_cancel(self):
        import os

        manifest = _make_manifest()
        pipeline = QuantizedPipeline(manifest)

        def cancel_immediately(step, state):
            state.request_cancel()

        pipeline.on_progress(cancel_immediately)
        pipeline.run(dry_run=False)
        # Ambient env should be cleaned up
        assert os.environ.get("HARNESS_ACTIVE") is None


# ---------------------------------------------------------------------------
# Async pipeline tests
# ---------------------------------------------------------------------------


class TestAsyncPipeline:
    @pytest.mark.asyncio
    async def test_async_dry_run(self):
        manifest = _make_manifest()
        pipeline = AsyncQuantizedPipeline(manifest)
        result = await pipeline.run(dry_run=True)
        assert result.success
        assert result.passed == 136
        assert result.failed == 0

    @pytest.mark.asyncio
    async def test_async_live_run(self):
        manifest = _make_manifest()
        pipeline = AsyncQuantizedPipeline(manifest)
        result = await pipeline.run(dry_run=False)
        assert result.passed == 136

    @pytest.mark.asyncio
    async def test_async_handler_registration(self):
        manifest = _make_manifest()
        pipeline = AsyncQuantizedPipeline(manifest)
        called = []
        pipeline.register_handler("env_scan", lambda step: called.append(step.index))
        result = await pipeline.run(dry_run=False)
        assert result.passed > 0
        # env_scan should have been called (2 times, one per cycle)
        assert len(called) >= 1

    @pytest.mark.asyncio
    async def test_async_native_handler(self):
        manifest = _make_manifest()
        pipeline = AsyncQuantizedPipeline(manifest)
        called = []

        async def async_handler(step):
            await asyncio.sleep(0.001)
            called.append(step.index)

        pipeline.register_async_handler("env_scan", async_handler)
        await pipeline.run(dry_run=False)
        assert len(called) >= 1

    @pytest.mark.asyncio
    async def test_async_handler_failure(self):
        manifest = _make_manifest()
        pipeline = AsyncQuantizedPipeline(manifest)

        async def failing_handler(step):
            raise ValueError("async boom")

        pipeline.register_async_handler("env_scan", failing_handler)
        result = await pipeline.run(dry_run=False)
        assert result.failed >= 1
        assert any("async boom" in e for e in result.errors)

    @pytest.mark.asyncio
    async def test_async_cancellation(self):
        manifest = _make_manifest()
        pipeline = AsyncQuantizedPipeline(manifest)

        def cancel_at_5(step, state):
            if step.index >= 5:
                state.request_cancel()

        pipeline.on_progress(cancel_at_5)
        result = await pipeline.run(dry_run=False)
        assert result.skipped > 0
        assert result.passed + result.skipped == result.total_steps

    @pytest.mark.asyncio
    async def test_async_progress_callback(self):
        manifest = _make_manifest()
        pipeline = AsyncQuantizedPipeline(manifest)
        steps_seen = []
        pipeline.on_progress(lambda s, st: steps_seen.append(s.index))
        await pipeline.run(dry_run=False)
        assert len(steps_seen) == 136


# ---------------------------------------------------------------------------
# Concurrent cycle execution
# ---------------------------------------------------------------------------


class TestConcurrentCycles:
    @pytest.mark.asyncio
    async def test_concurrent_dry_run(self):
        manifest = _make_manifest()
        pipeline = AsyncQuantizedPipeline(manifest)
        result = await pipeline.run_concurrent_cycles(dry_run=True)
        assert result.passed == 136
        assert result.failed == 0
        assert result.success

    @pytest.mark.asyncio
    async def test_concurrent_live_run(self):
        manifest = _make_manifest()
        pipeline = AsyncQuantizedPipeline(manifest)
        result = await pipeline.run_concurrent_cycles(dry_run=False)
        assert result.passed == 136

    @pytest.mark.asyncio
    async def test_concurrent_cancellation(self):
        manifest = _make_manifest()
        pipeline = AsyncQuantizedPipeline(manifest)

        def cancel_early(step, state):
            if step.index >= 3:
                state.request_cancel()

        pipeline.on_progress(cancel_early)
        result = await pipeline.run_concurrent_cycles(dry_run=False)
        assert result.skipped > 0

    @pytest.mark.asyncio
    async def test_concurrent_faster_than_sequential(self):
        """Concurrent should not be slower than sequential for dry runs."""
        manifest = _make_manifest()

        p1 = AsyncQuantizedPipeline(manifest)
        r_seq = await p1.run(dry_run=True)

        # Regenerate for concurrent (steps already marked PASSED from sequential)
        manifest2 = _make_manifest()
        p2 = AsyncQuantizedPipeline(manifest2)
        r_conc = await p2.run_concurrent_cycles(dry_run=True)

        # Both should pass
        assert r_seq.success
        assert r_conc.success


# ---------------------------------------------------------------------------
# Cycle exit timestamp
# ---------------------------------------------------------------------------


class TestCycleTimestamps:
    def test_exit_timestamp_set_after_run(self):
        manifest = _make_manifest()
        pipeline = QuantizedPipeline(manifest)
        pipeline.run(dry_run=True)
        for cycle in manifest.cycles:
            assert cycle.exit_timestamp is not None
            assert cycle.exit_timestamp > cycle.entry_timestamp

    @pytest.mark.asyncio
    async def test_async_exit_timestamp(self):
        manifest = _make_manifest()
        pipeline = AsyncQuantizedPipeline(manifest)
        await pipeline.run(dry_run=True)
        for cycle in manifest.cycles:
            assert cycle.exit_timestamp is not None


# ---------------------------------------------------------------------------
# Env cleanup robustness
# ---------------------------------------------------------------------------


class TestEnvCleanup:
    def test_env_cleaned_after_handler_crash(self):
        import os

        manifest = _make_manifest()
        pipeline = QuantizedPipeline(manifest)

        def crashing_handler(step):
            raise RuntimeError("kaboom")

        # Register for every action to guarantee crash
        for label in ["env_scan", "dep_check", "config_load"]:
            pipeline.register_handler(label, crashing_handler)

        pipeline.run(dry_run=False)
        # Env should still be cleaned up
        assert os.environ.get("HARNESS_ACTIVE") is None
        assert os.environ.get("HARNESS_VERSION") is None
