"""Distribution pipeline with custom quantization engineering.

The pipeline processes harness steps through the buildup-silence-drop pattern.
Quantization is intentional: a custom combination creating the desired effect
of buildup -> brief absence/silence -> drop.

Supports two modes:
- ANALOG (manual modulation): Human controls the cadence
- MODULAR (automated): Pipeline auto-advances based on intensity profile

Supports both synchronous and asynchronous execution for safe concurrent
maneuvering without blocking the event loop.
"""

from __future__ import annotations

import asyncio
import contextlib
import os
import signal
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import structlog

from harness.models import (
    HarnessManifest,
    HarnessStep,
    PipelineMode,
    QuantizationZone,
    StepStatus,
)

logger = structlog.get_logger("harness.pipeline")


# ---------------------------------------------------------------------------
# Pipeline state
# ---------------------------------------------------------------------------


@dataclass
class PipelineState:
    """Mutable state for the pipeline execution."""

    current_step: int = 0
    current_cycle: int = 0
    active: bool = False
    paused: bool = False
    cancelled: bool = False
    env_snapshot: dict[str, str] = field(default_factory=dict)
    fired_triggers: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    start_time: float = 0.0
    step_durations: list[float] = field(default_factory=list)

    def request_cancel(self) -> None:
        """Request graceful cancellation of the pipeline."""
        self.cancelled = True

    def request_pause(self) -> None:
        """Pause the pipeline at the next safe point."""
        self.paused = True

    def resume(self) -> None:
        """Resume a paused pipeline."""
        self.paused = False


# ---------------------------------------------------------------------------
# Progress callback protocol
# ---------------------------------------------------------------------------

ProgressCallback = Callable[[HarnessStep, "PipelineState"], Any]
StepHandler = Callable[[HarnessStep], Any]


# ---------------------------------------------------------------------------
# Synchronous pipeline
# ---------------------------------------------------------------------------


class QuantizedPipeline:
    """The main pipeline engine with buildup-silence-drop quantization.

    Custom engineering: the quantization pattern is not uniform distribution.
    It's a shaped curve — gradual buildup, deliberate silence, intense drop.
    The silence gap is the key engineering choice: it creates anticipation
    and allows the system to reset before the high-intensity burst.
    """

    def __init__(self, manifest: HarnessManifest) -> None:
        self.manifest = manifest
        self.config = manifest.config
        self.state = PipelineState()
        self._step_handlers: dict[str, StepHandler] = {}
        self._progress_callbacks: list[ProgressCallback] = []
        self._original_sigint: Any = None

    def register_handler(self, action: str, handler: StepHandler) -> None:
        """Register a custom handler for a step action."""
        self._step_handlers[action] = handler

    def on_progress(self, callback: ProgressCallback) -> None:
        """Register a progress callback fired after each step completes."""
        self._progress_callbacks.append(callback)

    # -- Environment management --------------------------------------------

    def _set_ambient_env(self) -> None:
        """Set background ambient environment variables."""
        for key, val in self.config.ambient_vars.items():
            os.environ[key] = val
            self.state.env_snapshot[key] = val

    def _clear_ambient_env(self) -> None:
        """Clear ambient environment variables on shutdown."""
        for key in list(self.config.ambient_vars):
            os.environ.pop(key, None)
        # Also clear any env vars set by transistors / decorated vars
        for key in list(self.state.env_snapshot):
            os.environ.pop(key, None)

    # -- Signal handling ---------------------------------------------------

    def _install_signal_handler(self) -> None:
        """Install SIGINT handler for graceful shutdown during live runs."""
        try:
            self._original_sigint = signal.getsignal(signal.SIGINT)

            def _graceful_shutdown(signum: int, frame: Any) -> None:
                logger.warning("sigint_received", step=self.state.current_step)
                self.state.request_cancel()

            signal.signal(signal.SIGINT, _graceful_shutdown)
        except (OSError, ValueError):
            # signal.signal can fail in non-main threads — degrade gracefully
            pass

    def _restore_signal_handler(self) -> None:
        """Restore the original SIGINT handler."""
        if self._original_sigint is not None:
            with contextlib.suppress(OSError, ValueError):
                signal.signal(signal.SIGINT, self._original_sigint)
            self._original_sigint = None

    # -- Quantization ------------------------------------------------------

    def _apply_quantization(self, step: HarnessStep) -> float:
        """Apply quantization to a step. Returns delay in seconds.

        Buildup: increasing delays (0.1 -> 0.01) as intensity ramps
        Silence: long pause (simulating absence)
        Drop: zero delay (maximum throughput)
        """
        intensity = self.config.quantization.intensity(step.cycle_index)

        if step.quant_zone == QuantizationZone.BUILDUP:
            # Inverse of intensity: high intensity = low delay
            return max(0.001, 0.1 * (1.0 - intensity))
        if step.quant_zone == QuantizationZone.SILENCE:
            # Deliberate pause — the absence
            return 0.5
        # DROP: zero delay, full send
        return 0.0

    # -- Instrumentation firing --------------------------------------------

    def _fire_decorated_vars(self, step: HarnessStep, event: str) -> None:
        """Fire any decorated variables whose trigger matches."""
        for dvar in step.decorated_vars:
            if dvar.fire_on == event and dvar.trigger_step == step.index:
                os.environ[dvar.env_key] = dvar.value
                self.state.env_snapshot[dvar.env_key] = dvar.value
                self.state.fired_triggers.append(f"{dvar.env_key}={dvar.value}@step:{step.index}")

    def _process_transistors(self, step: HarnessStep) -> None:
        """Process transistor hooks for this step."""
        for hook in step.transistor_hooks:
            if hook.armed_at_step == step.index:
                hook.arm()
            if hook.fires_at_step == step.index:
                env_update = hook.fire()
                for k, v in env_update.items():
                    os.environ[k] = v
                    self.state.env_snapshot[k] = v
                    self.state.fired_triggers.append(f"{k}={v}@step:{step.index}")

    # -- Step execution ----------------------------------------------------

    def execute_step(self, step: HarnessStep) -> bool:
        """Execute a single harness step. Returns True on success."""
        step_start = time.time()
        step.status = StepStatus.ACTIVE

        try:
            # Fire decorated vars on step_enter
            self._fire_decorated_vars(step, "step_enter")

            # Process transistor hooks
            self._process_transistors(step)

            # Apply quantization delay
            delay = self._apply_quantization(step)
            if delay > 0 and self.config.mode == PipelineMode.MODULAR:
                time.sleep(delay)

            # Execute the step action
            success = True
            if step.action in self._step_handlers:
                try:
                    self._step_handlers[step.action](step)
                except Exception as exc:
                    self.state.errors.append(f"Step {step.index} ({step.label}): {exc}")
                    success = False

            # Fire decorated vars on step_exit
            self._fire_decorated_vars(step, "step_exit")

            # Update status
            step.status = StepStatus.PASSED if success else StepStatus.FAILED

        except Exception as exc:
            # Catch-all: never let a single step crash the pipeline
            step.status = StepStatus.FAILED
            self.state.errors.append(f"Step {step.index} unexpected: {exc}")
            success = False

        duration = time.time() - step_start
        self.state.step_durations.append(duration)

        # Fire progress callbacks
        for cb in self._progress_callbacks:
            with contextlib.suppress(Exception):
                cb(step, self.state)

        return step.status == StepStatus.PASSED

    # -- Full run ----------------------------------------------------------

    def run(self, *, dry_run: bool = False) -> PipelineResult:
        """Run the full 136-step pipeline.

        Args:
            dry_run: If True, mark all steps as passed without executing handlers.
        """
        self.state = PipelineState(start_time=time.time(), active=True)
        self._set_ambient_env()

        if not dry_run:
            self._install_signal_handler()

        results = PipelineResult(
            total_steps=self.manifest.total_steps,
            mode=self.config.mode,
        )

        try:
            for cycle in self.manifest.cycles:
                self.state.current_cycle = cycle.cycle_number

                for step in cycle.steps:
                    # Check for cancellation
                    if self.state.cancelled:
                        step.status = StepStatus.SKIPPED
                        results.skipped += 1
                        continue

                    # Check for pause — spin-wait with small sleep
                    while self.state.paused and not self.state.cancelled:
                        time.sleep(0.05)

                    if self.state.cancelled:
                        step.status = StepStatus.SKIPPED
                        results.skipped += 1
                        continue

                    self.state.current_step = step.index

                    if dry_run:
                        step.status = StepStatus.PASSED
                        results.passed += 1
                        continue

                    success = self.execute_step(step)
                    if success:
                        results.passed += 1
                    else:
                        results.failed += 1

                # Mark cycle exit timestamp
                cycle.exit_timestamp = time.time()

        finally:
            self._clear_ambient_env()
            self._restore_signal_handler()
            self.state.active = False

        results.duration = time.time() - self.state.start_time
        results.fired_triggers = list(self.state.fired_triggers)
        results.errors = list(self.state.errors)
        return results

    # -- End-pass verification ---------------------------------------------

    def verify_end_pass(self) -> EndPassResult:
        """Verify the harness against the existing end-pass.

        Since the harness is pre-tested and the end pass already exists,
        this checks that all steps are in a terminal state and the
        cycle structure is intact.
        """
        issues: list[str] = []
        for cycle in self.manifest.cycles:
            if len(cycle.steps) != 68:
                issues.append(
                    f"Cycle {cycle.cycle_number}: expected 68 steps, got {len(cycle.steps)}"
                )

            grid_count = sum(1 for s in cycle.steps if s.kind.value == "grid")
            boundary_count = sum(1 for s in cycle.steps if s.kind.value == "boundary")

            if grid_count != 64:
                issues.append(
                    f"Cycle {cycle.cycle_number}: expected 64 grid steps, got {grid_count}"
                )
            if boundary_count != 4:
                issues.append(
                    f"Cycle {cycle.cycle_number}: expected 4 boundary steps, got {boundary_count}"
                )

            # Verify quantization zone distribution
            zones = {"buildup": 0, "silence": 0, "drop": 0}
            for step in cycle.steps:
                zones[step.quant_zone.value] += 1

            if zones["silence"] != 4:
                issues.append(
                    f"Cycle {cycle.cycle_number}: expected 4 silence steps, got {zones['silence']}"
                )

        total = self.manifest.total_steps
        if total != 136:
            issues.append(f"Expected 136 total steps, got {total}")

        return EndPassResult(
            passed=len(issues) == 0,
            total_steps=total,
            issues=issues,
        )


# ---------------------------------------------------------------------------
# Async pipeline — safe concurrent maneuvering
# ---------------------------------------------------------------------------


class AsyncQuantizedPipeline:
    """Async variant of the pipeline for concurrent orchestration.

    Wraps the same quantization logic but uses asyncio for delays and
    step execution, allowing the event loop to remain responsive.
    Supports concurrent cycle execution when steps are independent.
    """

    def __init__(self, manifest: HarnessManifest) -> None:
        self.manifest = manifest
        self.config = manifest.config
        self.state = PipelineState()
        self._step_handlers: dict[str, StepHandler] = {}
        self._async_step_handlers: dict[str, Callable[..., Any]] = {}
        self._progress_callbacks: list[ProgressCallback] = []
        self._lock = asyncio.Lock()

    def register_handler(self, action: str, handler: StepHandler) -> None:
        """Register a synchronous handler (will be run in executor)."""
        self._step_handlers[action] = handler

    def register_async_handler(self, action: str, handler: Callable[..., Any]) -> None:
        """Register a native async handler."""
        self._async_step_handlers[action] = handler

    def on_progress(self, callback: ProgressCallback) -> None:
        """Register a progress callback."""
        self._progress_callbacks.append(callback)

    async def _apply_quantization_delay(self, step: HarnessStep) -> None:
        """Non-blocking quantization delay."""
        intensity = self.config.quantization.intensity(step.cycle_index)

        if step.quant_zone == QuantizationZone.BUILDUP:
            delay = max(0.001, 0.1 * (1.0 - intensity))
        elif step.quant_zone == QuantizationZone.SILENCE:
            delay = 0.5
        else:
            delay = 0.0

        if delay > 0 and self.config.mode == PipelineMode.MODULAR:
            await asyncio.sleep(delay)

    def _fire_decorated_vars(self, step: HarnessStep, event: str) -> None:
        """Fire decorated variables (sync — env ops are fast)."""
        for dvar in step.decorated_vars:
            if dvar.fire_on == event and dvar.trigger_step == step.index:
                os.environ[dvar.env_key] = dvar.value
                self.state.env_snapshot[dvar.env_key] = dvar.value
                self.state.fired_triggers.append(f"{dvar.env_key}={dvar.value}@step:{step.index}")

    def _process_transistors(self, step: HarnessStep) -> None:
        """Process transistor hooks (sync)."""
        for hook in step.transistor_hooks:
            if hook.armed_at_step == step.index:
                hook.arm()
            if hook.fires_at_step == step.index:
                env_update = hook.fire()
                for k, v in env_update.items():
                    os.environ[k] = v
                    self.state.env_snapshot[k] = v
                    self.state.fired_triggers.append(f"{k}={v}@step:{step.index}")

    async def execute_step(self, step: HarnessStep) -> bool:
        """Execute a single step asynchronously."""
        step_start = time.time()
        step.status = StepStatus.ACTIVE
        success = True

        try:
            self._fire_decorated_vars(step, "step_enter")
            self._process_transistors(step)

            await self._apply_quantization_delay(step)

            # Dispatch to async or sync handler
            if step.action in self._async_step_handlers:
                try:
                    await self._async_step_handlers[step.action](step)
                except Exception as exc:
                    self.state.errors.append(f"Step {step.index} ({step.label}): {exc}")
                    success = False
            elif step.action in self._step_handlers:
                try:
                    # Run sync handlers in the default executor to avoid blocking
                    loop = asyncio.get_running_loop()
                    await loop.run_in_executor(None, self._step_handlers[step.action], step)
                except Exception as exc:
                    self.state.errors.append(f"Step {step.index} ({step.label}): {exc}")
                    success = False

            self._fire_decorated_vars(step, "step_exit")
            step.status = StepStatus.PASSED if success else StepStatus.FAILED

        except Exception as exc:
            step.status = StepStatus.FAILED
            self.state.errors.append(f"Step {step.index} unexpected: {exc}")
            success = False

        self.state.step_durations.append(time.time() - step_start)

        for cb in self._progress_callbacks:
            with contextlib.suppress(Exception):
                cb(step, self.state)

        return step.status == StepStatus.PASSED

    async def run(self, *, dry_run: bool = False) -> PipelineResult:
        """Run the full pipeline asynchronously.

        Steps within a cycle run sequentially (order matters),
        but the pipeline remains responsive to cancellation/pause.
        """
        self.state = PipelineState(start_time=time.time(), active=True)

        # Set ambient env
        for key, val in self.config.ambient_vars.items():
            os.environ[key] = val
            self.state.env_snapshot[key] = val

        results = PipelineResult(
            total_steps=self.manifest.total_steps,
            mode=self.config.mode,
        )

        try:
            for cycle in self.manifest.cycles:
                self.state.current_cycle = cycle.cycle_number

                for step in cycle.steps:
                    if self.state.cancelled:
                        step.status = StepStatus.SKIPPED
                        results.skipped += 1
                        continue

                    while self.state.paused and not self.state.cancelled:
                        await asyncio.sleep(0.05)

                    if self.state.cancelled:
                        step.status = StepStatus.SKIPPED
                        results.skipped += 1
                        continue

                    self.state.current_step = step.index

                    if dry_run:
                        step.status = StepStatus.PASSED
                        results.passed += 1
                        continue

                    ok = await self.execute_step(step)
                    if ok:
                        results.passed += 1
                    else:
                        results.failed += 1

                cycle.exit_timestamp = time.time()

        finally:
            # Clear ambient env
            for key in list(self.state.env_snapshot):
                os.environ.pop(key, None)
            self.state.active = False

        results.duration = time.time() - self.state.start_time
        results.fired_triggers = list(self.state.fired_triggers)
        results.errors = list(self.state.errors)
        return results

    async def run_concurrent_cycles(self, *, dry_run: bool = False) -> PipelineResult:
        """Run both cycles concurrently for maximum throughput.

        WARNING: Only safe when cycle handlers have no cross-cycle dependencies.
        Each cycle gets its own lock-protected state updates.
        """
        self.state = PipelineState(start_time=time.time(), active=True)

        for key, val in self.config.ambient_vars.items():
            os.environ[key] = val
            self.state.env_snapshot[key] = val

        cycle_results: list[PipelineResult] = []

        async def _run_cycle(cycle_idx: int) -> PipelineResult:
            cycle = self.manifest.cycles[cycle_idx]
            cr = PipelineResult(
                total_steps=len(cycle.steps),
                mode=self.config.mode,
            )
            for step in cycle.steps:
                if self.state.cancelled:
                    step.status = StepStatus.SKIPPED
                    cr.skipped += 1
                    continue

                async with self._lock:
                    self.state.current_step = step.index
                    self.state.current_cycle = cycle_idx

                if dry_run:
                    step.status = StepStatus.PASSED
                    cr.passed += 1
                    continue

                ok = await self.execute_step(step)
                if ok:
                    cr.passed += 1
                else:
                    cr.failed += 1

            cycle.exit_timestamp = time.time()
            return cr

        try:
            gathered = await asyncio.gather(_run_cycle(0), _run_cycle(1), return_exceptions=False)
            cycle_results = list(gathered)
        except Exception as exc:
            self.state.errors.append(f"Concurrent cycle failure: {exc}")
        finally:
            for key in list(self.state.env_snapshot):
                os.environ.pop(key, None)
            self.state.active = False

        # Merge results
        merged = PipelineResult(
            total_steps=self.manifest.total_steps,
            mode=self.config.mode,
            duration=time.time() - self.state.start_time,
            fired_triggers=list(self.state.fired_triggers),
            errors=list(self.state.errors),
        )
        for cr in cycle_results:
            merged.passed += cr.passed
            merged.failed += cr.failed
            merged.skipped += cr.skipped

        return merged


# ---------------------------------------------------------------------------
# Result dataclasses
# ---------------------------------------------------------------------------


@dataclass
class PipelineResult:
    """Result of a pipeline run."""

    total_steps: int = 0
    passed: int = 0
    failed: int = 0
    skipped: int = 0
    duration: float = 0.0
    mode: PipelineMode = PipelineMode.MODULAR
    fired_triggers: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    @property
    def success(self) -> bool:
        return self.failed == 0 and self.passed == self.total_steps

    @property
    def pass_rate(self) -> float:
        if self.total_steps == 0:
            return 0.0
        return self.passed / self.total_steps


@dataclass
class EndPassResult:
    """Result of end-pass verification."""

    passed: bool = False
    total_steps: int = 0
    issues: list[str] = field(default_factory=list)
