"""IO instrumentation for the harness pipeline.

Captures attention instances through:
- Environment variables (ambient context)
- Background ambients (persistent state)
- Transistor hooks (binary on/off gates, the basic "10")
- Decorated variables (fire at specific triggers)

The IO instrumentation comes right before the drop zone —
selectively and carefully placed for maximum effect.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import structlog

from harness.models import (
    DecoratedVar,
    HarnessManifest,
    QuantizationZone,
    TransistorHook,
    TransistorState,
)

logger = structlog.get_logger("harness.instrument")


@dataclass
class InstrumentationPlan:
    """Plan for IO instrumentation across the pipeline."""

    decorated_vars: list[DecoratedVar] = field(default_factory=list)
    transistor_hooks: list[TransistorHook] = field(default_factory=list)
    ambient_vars: dict[str, str] = field(default_factory=dict)
    pre_drop_steps: list[int] = field(default_factory=list)


def identify_pre_drop_steps(manifest: HarnessManifest) -> list[int]:
    """Identify steps immediately before the drop zone in each cycle.

    These are the critical placement points for IO instrumentation.
    The instrumentation fires right before the drop for maximum impact.
    """
    pre_drop: list[int] = []
    quant = manifest.config.quantization

    for cycle in manifest.cycles:
        for step in cycle.steps:
            # Find steps in the silence zone (right before drop)
            if step.quant_zone == QuantizationZone.SILENCE:
                pre_drop.append(step.index)
            # Also include the last buildup step (transition point)
            if (
                step.quant_zone == QuantizationZone.BUILDUP
                and step.cycle_index == quant.buildup_range[1] - 1
            ):
                pre_drop.append(step.index)

    return sorted(set(pre_drop))


def create_transistor_hooks(
    manifest: HarnessManifest,
    pre_drop_steps: list[int],
) -> list[TransistorHook]:
    """Create transistor hooks — the basic '10' programming.

    Arms a transistor at the last silence step, fires at the first drop step.
    This creates the binary gate that controls signal flow into the drop zone.
    """
    hooks: list[TransistorHook] = []

    for cycle in manifest.cycles:
        silence_steps = [s for s in cycle.steps if s.quant_zone == QuantizationZone.SILENCE]
        drop_steps = [s for s in cycle.steps if s.quant_zone == QuantizationZone.DROP]

        if silence_steps and drop_steps:
            # Primary transistor: arms at last silence, fires at first drop
            hook = TransistorHook(
                hook_id=f"c{cycle.cycle_number}_primary",
                state=TransistorState.OFF,
                armed_at_step=silence_steps[-1].index,
                fires_at_step=drop_steps[0].index,
                signal="HARNESS_DROP_GATE",
            )
            hooks.append(hook)

            # Secondary transistor: mid-drop checkpoint
            mid_drop = drop_steps[len(drop_steps) // 2]
            hook2 = TransistorHook(
                hook_id=f"c{cycle.cycle_number}_midpoint",
                state=TransistorState.OFF,
                armed_at_step=drop_steps[0].index,
                fires_at_step=mid_drop.index,
                signal="HARNESS_DROP_MIDPOINT",
            )
            hooks.append(hook2)

    return hooks


def create_decorated_vars(
    manifest: HarnessManifest,
    pre_drop_steps: list[int],
) -> list[DecoratedVar]:
    """Create decorated variables that fire at specific trigger points.

    Placed right before the drop zone for selective, careful activation.
    """
    dvars: list[DecoratedVar] = []

    for cycle in manifest.cycles:
        silence_steps = [s for s in cycle.steps if s.quant_zone == QuantizationZone.SILENCE]
        drop_steps = [s for s in cycle.steps if s.quant_zone == QuantizationZone.DROP]

        # Attention capture var: fires at first silence step
        if silence_steps:
            dvars.append(
                DecoratedVar(
                    name=f"attention_c{cycle.cycle_number}",
                    value="captured",
                    trigger_step=silence_steps[0].index,
                    zone=QuantizationZone.SILENCE,
                    fire_on="step_enter",
                )
            )

        # Drop signal var: fires at first drop step
        if drop_steps:
            dvars.append(
                DecoratedVar(
                    name=f"drop_signal_c{cycle.cycle_number}",
                    value="active",
                    trigger_step=drop_steps[0].index,
                    zone=QuantizationZone.DROP,
                    fire_on="step_enter",
                )
            )

        # Completion var: fires at last drop step
        if drop_steps:
            dvars.append(
                DecoratedVar(
                    name=f"cycle_complete_c{cycle.cycle_number}",
                    value="done",
                    trigger_step=drop_steps[-1].index,
                    zone=QuantizationZone.DROP,
                    fire_on="step_exit",
                )
            )

    return dvars


def build_ambient_context(
    manifest: HarnessManifest,
) -> dict[str, str]:
    """Build background ambient environment variables.

    These persist throughout the pipeline execution and provide
    contextual state for the attention instance.
    """
    ctx = dict(manifest.config.ambient_vars)

    # Add synthetic context from parallel agent checkpoints
    if manifest.synthetic_context:
        for key, val in manifest.synthetic_context.items():
            safe_key = f"HARNESS_CTX_{key.upper().replace('-', '_').replace('.', '_')}"
            ctx[safe_key] = str(val)[:256]  # Truncate to safe env var length

    # Add GATE integration vars
    if manifest.config.envelope_id:
        ctx["HARNESS_ENVELOPE_ID"] = manifest.config.envelope_id
    if manifest.config.nonce:
        ctx["HARNESS_NONCE"] = manifest.config.nonce

    return ctx


def instrument_manifest(manifest: HarnessManifest) -> InstrumentationPlan:
    """Apply full IO instrumentation to the manifest.

    This is the main entry point. It:
    1. Identifies pre-drop placement points
    2. Creates transistor hooks (the basic "10")
    3. Creates decorated vars with trigger metadata
    4. Builds ambient context
    5. Attaches instrumentation to the relevant steps
    """
    pre_drop = identify_pre_drop_steps(manifest)
    hooks = create_transistor_hooks(manifest, pre_drop)
    dvars = create_decorated_vars(manifest, pre_drop)
    ambient = build_ambient_context(manifest)

    # Attach instrumentation to steps
    hook_map: dict[int, list[TransistorHook]] = {}
    for hook in hooks:
        hook_map.setdefault(hook.armed_at_step, []).append(hook)
        hook_map.setdefault(hook.fires_at_step, []).append(hook)

    dvar_map: dict[int, list[DecoratedVar]] = {}
    for dv in dvars:
        dvar_map.setdefault(dv.trigger_step, []).append(dv)

    for cycle in manifest.cycles:
        for step in cycle.steps:
            if step.index in hook_map:
                step.transistor_hooks.extend(hook_map[step.index])
            if step.index in dvar_map:
                step.decorated_vars.extend(dvar_map[step.index])

    plan = InstrumentationPlan(
        decorated_vars=dvars,
        transistor_hooks=hooks,
        ambient_vars=ambient,
        pre_drop_steps=pre_drop,
    )

    logger.info(
        "instrumentation_applied",
        transistors=len(hooks),
        decorated_vars=len(dvars),
        ambient_vars=len(ambient),
        pre_drop_points=len(pre_drop),
    )

    return plan
