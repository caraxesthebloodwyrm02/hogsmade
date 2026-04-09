"""Markdown manifest generator.

Generates the desired output description in markdown format,
connected to the pipeline design. The manifest is the human-readable
deployment specification that drives the harness execution.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

from harness.grid import print_grid_map
from harness.models import (
    HarnessManifest,
    QuantizationZone,
    StepKind,
    StepPhase,
)


def render_manifest_markdown(
    manifest: HarnessManifest,
    title: str = "Deployment Harness Manifest",
) -> str:
    """Render the full harness manifest as markdown.

    This is the desired output — described in markdown, connected
    to the pipeline design, ready to manifest through execution.
    """
    lines: list[str] = []
    ts = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime(manifest.created_at))

    # Header
    lines.append(f"# {title}")
    lines.append("")
    lines.append(f"**Generated**: {ts}  ")
    lines.append(f"**Version**: {manifest.version}  ")
    lines.append(f"**Total Steps**: {manifest.total_steps}  ")
    lines.append(f"**Cycles**: {len(manifest.cycles)}  ")
    lines.append(f"**Mode**: {manifest.config.mode.value}  ")
    lines.append("")

    # Synthetic context
    if manifest.synthetic_context:
        lines.append("## Synthetic Context (from parallel agents)")
        lines.append("")
        for key, val in manifest.synthetic_context.items():
            if isinstance(val, dict):
                lines.append(f"### {key}")
                lines.append("```json")
                lines.append(json.dumps(val, indent=2))
                lines.append("```")
            else:
                lines.append(f"- **{key}**: {val}")
        lines.append("")

    # Quantization profile
    q = manifest.config.quantization
    lines.append("## Quantization Profile")
    lines.append("")
    lines.append("| Zone | Step Range | Steps | Pattern |")
    lines.append("|------|-----------|-------|---------|")
    lines.append(
        f"| Buildup | {q.buildup_range[0]}-{q.buildup_range[1] - 1} | "
        f"{q.buildup_range[1] - q.buildup_range[0]} | Gradual ramp 0.1->0.7 |"
    )
    lines.append(
        f"| Silence | {q.silence_range[0]}-{q.silence_range[1] - 1} | "
        f"{q.silence_range[1] - q.silence_range[0]} | Deliberate pause 0.0 |"
    )
    lines.append(
        f"| Drop | {q.drop_range[0]}-{q.drop_range[1] - 1} | "
        f"{q.drop_range[1] - q.drop_range[0]} | Full intensity 1.0 |"
    )
    lines.append("")

    # Per-cycle detail
    for cycle in manifest.cycles:
        lines.append(f"## Cycle {cycle.cycle_number}")
        lines.append("")

        # Grid map
        lines.append("### Grid Map")
        lines.append("```")
        lines.append(print_grid_map(cycle))
        lines.append("```")
        lines.append("")

        # Step summary by phase
        lines.append("### Steps by Phase")
        lines.append("")
        lines.append("| Phase | Grid | Boundary | Total |")
        lines.append("|-------|------|----------|-------|")

        for phase in StepPhase:
            phase_steps = [s for s in cycle.steps if s.phase == phase]
            grid = sum(1 for s in phase_steps if s.kind == StepKind.GRID)
            boundary = sum(1 for s in phase_steps if s.kind == StepKind.BOUNDARY)
            lines.append(f"| {phase.value} | {grid} | {boundary} | {grid + boundary} |")
        lines.append("")

        # Step summary by quantization zone
        lines.append("### Steps by Quantization Zone")
        lines.append("")
        lines.append("| Zone | Count | Intensity |")
        lines.append("|------|-------|-----------|")
        for zone in QuantizationZone:
            zone_steps = [s for s in cycle.steps if s.quant_zone == zone]
            if zone_steps:
                intensities = [
                    manifest.config.quantization.intensity(s.cycle_index) for s in zone_steps
                ]
                avg_intensity = sum(intensities) / max(len(intensities), 1)
                lines.append(f"| {zone.value} | {len(zone_steps)} | {avg_intensity:.2f} |")
        lines.append("")

        # Detailed step list
        lines.append("### Step Sequence")
        lines.append("")
        lines.append("| # | Kind | Phase | Zone | Label | Status |")
        lines.append("|---|------|-------|------|-------|--------|")
        for step in cycle.steps:
            grid_info = ""
            if step.grid_pos:
                grid_info = f"[{step.grid_pos.row},{step.grid_pos.col}]"
            lines.append(
                f"| {step.index} | {step.kind.value} {grid_info} | "
                f"{step.phase.value} | {step.quant_zone.value} | "
                f"`{step.label}` | {step.status.value} |"
            )
        lines.append("")

    # IO Instrumentation summary
    all_dvars = []
    all_hooks = []
    for cycle in manifest.cycles:
        for step in cycle.steps:
            all_dvars.extend(step.decorated_vars)
            all_hooks.extend(step.transistor_hooks)

    if all_dvars or all_hooks:
        lines.append("## IO Instrumentation")
        lines.append("")

        if all_hooks:
            lines.append("### Transistor Hooks")
            lines.append("")
            lines.append("| Hook ID | Signal | Arms At | Fires At | State |")
            lines.append("|---------|--------|---------|----------|-------|")
            seen = set()
            for hook in all_hooks:
                if hook.hook_id not in seen:
                    seen.add(hook.hook_id)
                    lines.append(
                        f"| {hook.hook_id} | {hook.signal} | "
                        f"step {hook.armed_at_step} | step {hook.fires_at_step} | "
                        f"{hook.state.value} |"
                    )
            lines.append("")

        if all_dvars:
            lines.append("### Decorated Variables")
            lines.append("")
            lines.append("| Env Key | Value | Trigger Step | Zone | Fire On |")
            lines.append("|---------|-------|-------------|------|---------|")
            seen = set()
            for dv in all_dvars:
                if dv.env_key not in seen:
                    seen.add(dv.env_key)
                    lines.append(
                        f"| `{dv.env_key}` | {dv.value} | "
                        f"step {dv.trigger_step} | {dv.zone.value} | {dv.fire_on} |"
                    )
            lines.append("")

    # Ambient environment
    if manifest.config.ambient_vars:
        lines.append("## Ambient Environment")
        lines.append("")
        lines.append("```bash")
        for k, v in sorted(manifest.config.ambient_vars.items()):
            # Shell-safe quoting for values that may contain spaces/specials
            safe_v = v.replace("'", "'\\''")
            lines.append(f"export {k}='{safe_v}'")
        lines.append("```")
        lines.append("")

    # GATE integration
    if manifest.config.envelope_id or manifest.config.nonce:
        lines.append("## GATE Integration")
        lines.append("")
        if manifest.config.envelope_id:
            lines.append(f"- **Envelope ID**: `{manifest.config.envelope_id}`")
        if manifest.config.nonce:
            lines.append(f"- **Active Nonce**: `{manifest.config.nonce}`")
        lines.append(f"- **Gate Dir**: `{manifest.config.gate_dir}`")
        lines.append("")

    # Execution summary
    lines.append("## Execution Summary")
    lines.append("")
    total_passed = manifest.total_passed
    total = manifest.total_steps
    pct = (total_passed / total * 100) if total > 0 else 0
    lines.append(f"- **Passed**: {total_passed}/{total} ({pct:.1f}%)")
    lines.append(f"- **Grid Steps**: {sum(c.grid_steps for c in manifest.cycles)}")
    lines.append(f"- **Boundary Steps**: {sum(c.boundary_steps for c in manifest.cycles)}")
    lines.append("")

    return "\n".join(lines)


def write_manifest(
    manifest: HarnessManifest,
    output_dir: str | None = None,
    filename: str | None = None,
) -> Path:
    """Write manifest markdown to the manifests directory."""
    if output_dir is None:
        output_dir = manifest.config.manifest_dir

    os.makedirs(output_dir, exist_ok=True)

    if filename is None:
        ts = time.strftime("%Y%m%d-%H%M%S", time.gmtime(manifest.created_at))
        filename = f"harness-manifest-{ts}.md"

    path = Path(output_dir) / filename
    content = render_manifest_markdown(manifest)
    path.write_text(content, encoding="utf-8")
    return path


def write_manifest_json(
    manifest: HarnessManifest,
    output_dir: str | None = None,
    filename: str | None = None,
) -> Path:
    """Write manifest as structured JSON for programmatic consumption."""
    if output_dir is None:
        output_dir = manifest.config.manifest_dir

    os.makedirs(output_dir, exist_ok=True)

    if filename is None:
        ts = time.strftime("%Y%m%d-%H%M%S", time.gmtime(manifest.created_at))
        filename = f"harness-manifest-{ts}.json"

    path = Path(output_dir) / filename
    path.write_text(manifest.model_dump_json(indent=2), encoding="utf-8")
    return path
