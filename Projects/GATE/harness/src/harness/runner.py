"""Harness runner — CLI entry point for generate, verify, and execute.

Usage:
    uv run python -m harness.runner --generate    # Generate manifest
    uv run python -m harness.runner --verify      # Verify end-pass
    uv run python -m harness.runner --run         # Execute pipeline (dry-run by default)
    uv run python -m harness.runner --run --live  # Execute pipeline for real
    uv run python -m harness.runner --run --async # Async pipeline execution
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

import structlog

from harness.grid import generate_manifest
from harness.instrument import instrument_manifest
from harness.manifest import write_manifest, write_manifest_json
from harness.models import PipelineConfig
from harness.pipeline import AsyncQuantizedPipeline, QuantizedPipeline

logger = structlog.get_logger("harness.runner")

# ---------------------------------------------------------------------------
# Synthetic context from parallel agent checkpoints
# ---------------------------------------------------------------------------

SYNTHETIC_CONTEXT = {
    "agent_a": {
        "session": "ses_28f3ff623ffeM2HcRV3ObpHHr4",
        "title": "Investigate blocked/jammed scopes and revive release sequence",
        "model": "claude-sonnet-4.6",
        "status": "active",
        "progress": "2/5 todos",
        "work_product": {
            "eligibility_tool": "update_case_args added to eligibility-server",
            "gate_envelope": "envelope_commit-wave-2026-04.json sealed",
            "active_nonce": "f5495a0942654d67925a2cfc911cb354",
            "governance_score": 0.821893,
            "release_wave": "packaging-release-revive-2026-04",
            "repos_committed": [
                "GRID-main:581acca",
                "CascadeProjects:15c5616",
                "afloat:4c7a554",
                "Vision:7f50711",
                "apiguard:4b70f70",
                "echoes:8b49c4fe",
            ],
            "pending": [
                "reseal GATE envelope with fresh timestamp/nonce",
                "advance beat balance -> tighten -> verify",
                "evaluate promotion gate",
            ],
        },
    },
    "agent_b": {
        "session": "ses_28f424099ffezTQy2RluGi4YSQ",
        "title": "MCQ implementation and AI brain test fixes",
        "model": "claude-opus-4.6",
        "status": "compacted",
        "progress": "6/13 todos",
        "work_product": {
            "mcq_page": "completed",
            "governance_audit": "completed",
            "filesystem_audit": "completed",
            "probe_architecture": "4-layer (YAML, JSON, Python, Markdown)",
            "probe_router": "src/application/mothership/routers/probe.py",
            "api_route": "registered in config/api_routes.yaml",
            "tests_written": ["test_models.py"],
            "tests_pending": [
                "test_registry.py",
                "test_scanner.py",
                "test_reporter.py",
                "test_engine.py",
            ],
            "pending": [
                "complete probe test files",
                "lint and type-check",
                "full regression test",
            ],
        },
    },
    "ecosystem_state": {
        "grid_version": "2.8.0",
        "grid_health": "healthy",
        "workspace_score": "9/10",
        "ci_status": "green 5/6 repos",
        "open_prs": 0,
        "tests_passing": "1045+286+347",
    },
}


def build_config_from_gate() -> PipelineConfig:
    """Build pipeline config integrated with GATE state.

    Gracefully degrades if the envelope file is missing or malformed.
    """
    gate_dir = "/home/caraxes/CascadeProjects/Projects/GATE"
    envelope_path = Path(gate_dir) / "incoming" / "envelope_commit-wave-2026-04.json"

    envelope_id = None
    nonce = None

    if envelope_path.exists():
        try:
            envelope = json.loads(envelope_path.read_text(encoding="utf-8"))
            envelope_id = envelope.get("envelope_id")
            nonce = envelope.get("nonce")
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("envelope_read_failed", path=str(envelope_path), error=str(exc))

    return PipelineConfig(
        envelope_id=envelope_id,
        nonce=nonce,
        gate_dir=gate_dir,
    )


def _build_manifest() -> tuple:
    """Shared manifest construction for all commands."""
    config = build_config_from_gate()
    manifest = generate_manifest(config=config, synthetic_context=SYNTHETIC_CONTEXT)
    plan = instrument_manifest(manifest)
    return manifest, plan, config


def cmd_generate(args: argparse.Namespace) -> int:
    """Generate the 136-step harness manifest."""
    manifest, plan, _config = _build_manifest()

    # Write outputs
    md_path = write_manifest(manifest)
    json_path = write_manifest_json(manifest)

    logger.info(
        "manifest_generated",
        total_steps=manifest.total_steps,
        cycles=len(manifest.cycles),
        transistors=len(plan.transistor_hooks),
        decorated_vars=len(plan.decorated_vars),
        md_path=str(md_path),
        json_path=str(json_path),
    )

    print(f"Manifest generated: {manifest.total_steps} steps across {len(manifest.cycles)} cycles")
    print(f"  Markdown: {md_path}")
    print(f"  JSON:     {json_path}")
    print(f"  Transistors: {len(plan.transistor_hooks)}")
    print(f"  Decorated vars: {len(plan.decorated_vars)}")
    print(f"  Pre-drop points: {len(plan.pre_drop_steps)}")
    return 0


def cmd_verify(args: argparse.Namespace) -> int:
    """Verify the harness against the end-pass."""
    manifest, _plan, _config = _build_manifest()

    pipeline = QuantizedPipeline(manifest)
    result = pipeline.verify_end_pass()

    if result.passed:
        print(f"END-PASS VERIFIED: {result.total_steps} steps, structure intact")
        return 0
    else:
        print(f"END-PASS FAILED: {len(result.issues)} issues")
        for issue in result.issues:
            print(f"  - {issue}")
        return 1


def _print_result(result, dry_run: bool, async_mode: bool = False) -> None:
    """Print pipeline result summary."""
    mode_label = "ASYNC " if async_mode else ""
    run_label = "DRY RUN" if dry_run else "LIVE"
    print(f"Pipeline {mode_label}{run_label} complete:")
    print(f"  Total: {result.total_steps}")
    print(f"  Passed: {result.passed}")
    print(f"  Failed: {result.failed}")
    if result.skipped > 0:
        print(f"  Skipped: {result.skipped}")
    print(f"  Duration: {result.duration:.3f}s")
    print(f"  Pass rate: {result.pass_rate:.1%}")
    print(f"  Mode: {result.mode.value}")

    if result.fired_triggers:
        print(f"  Triggers fired: {len(result.fired_triggers)}")
        for t in result.fired_triggers[:10]:
            print(f"    - {t}")
        if len(result.fired_triggers) > 10:
            print(f"    ... and {len(result.fired_triggers) - 10} more")

    if result.errors:
        print(f"  Errors: {len(result.errors)}")
        for e in result.errors:
            print(f"    - {e}")


def cmd_run(args: argparse.Namespace) -> int:
    """Execute the pipeline (sync)."""
    manifest, _plan, _config = _build_manifest()

    pipeline = QuantizedPipeline(manifest)
    dry_run = not args.live

    if dry_run:
        print("DRY RUN: marking all steps as passed without executing handlers")

    result = pipeline.run(dry_run=dry_run)
    _print_result(result, dry_run)

    # Write post-execution manifest
    md_path = write_manifest(manifest, filename="harness-post-execution.md")
    print(f"  Post-execution manifest: {md_path}")

    return 0 if result.success else 1


def cmd_run_async(args: argparse.Namespace) -> int:
    """Execute the pipeline (async)."""
    manifest, _plan, _config = _build_manifest()

    async_pipeline = AsyncQuantizedPipeline(manifest)
    dry_run = not args.live
    concurrent = getattr(args, "concurrent", False)

    if dry_run:
        print("ASYNC DRY RUN: marking all steps as passed without executing handlers")

    async def _run():
        if concurrent:
            return await async_pipeline.run_concurrent_cycles(dry_run=dry_run)
        return await async_pipeline.run(dry_run=dry_run)

    result = asyncio.run(_run())
    _print_result(result, dry_run, async_mode=True)

    md_path = write_manifest(manifest, filename="harness-post-execution-async.md")
    print(f"  Post-execution manifest: {md_path}")

    return 0 if result.success else 1


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="GATE Harness — (4x4)^2 deployment harness engineering"
    )

    group = parser.add_mutually_exclusive_group(required=False)
    group.add_argument("--generate", action="store_true", help="Generate 136-step manifest")
    group.add_argument("--verify", action="store_true", help="Verify end-pass")
    group.add_argument("--run", action="store_true", help="Execute pipeline (sync)")
    group.add_argument("--run-async", action="store_true", help="Execute pipeline (async)")

    parser.add_argument("--live", action="store_true", help="Live execution (not dry-run)")
    parser.add_argument(
        "--concurrent",
        action="store_true",
        help="Run cycles concurrently (async mode only)",
    )

    args = parser.parse_args()

    if args.generate:
        sys.exit(cmd_generate(args))
    elif args.verify:
        sys.exit(cmd_verify(args))
    elif args.run:
        sys.exit(cmd_run(args))
    elif args.run_async:
        sys.exit(cmd_run_async(args))
    else:
        parser.print_help()
        sys.exit(0)


if __name__ == "__main__":
    main()
