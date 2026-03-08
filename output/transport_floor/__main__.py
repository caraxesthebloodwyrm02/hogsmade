"""Run transport floor evaluation on sample datasets.

Usage:
    python -m transport_floor
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from transport_floor.conditions import CONDITIONS, FLOORS
from transport_floor.engine import TransportEngine
from transport_floor.hooks import register_all_hooks
from transport_floor.revision import RevisionScheduler

ROOT = Path(__file__).resolve().parents[1].parent  # CascadeProjects
REPORT_PATH = ROOT / "tmp" / "jupyter-notebook" / "transport-floor-report.json"
REVISION_LOG_DIR = ROOT / "tmp" / "jupyter-notebook" / "revision-logs"

EXIT_WARNINGS = {
    1:   "EXIT 1 — degenerate: no conditions fired or no valid destination.",
    429: "EXIT 429 — saturated: all conditions fired, floor scores overloaded.",
}


def _result_memo(name: str, result: dict) -> str:
    """Concise result memo from execution report."""
    code = result.get("exit_code", 0)
    floor = result.get("destination_floor", "none")
    score = result.get("floor_score", 0.0)
    fired = result.get("conditions_fired", 0)
    total = len(CONDITIONS)
    triggers = result.get("triggers_matched", {})
    matched_keys = [k for keys in triggers.values() for k in keys]
    top_evidence = ""
    if result.get("evidence"):
        top = max(result["evidence"], key=lambda e: e.get("weighted_score", 0))
        top_evidence = f"{top['condition']}={top['weighted_score']:.3f}"
    return (
        f"MEMO [{name}] exit={code} | floor={floor} score={score:.3f} | "
        f"fired={fired}/{total} | triggers={len(matched_keys)} | top={top_evidence}"
    )

SAMPLE_DATASETS: dict[str, dict] = {
    "audio_signal": {
        "frequency": 440,
        "amplitude": 0.8,
        "phase": 0.5,
        "resonance": "high",
        "decay_rate": 0.3,
        "waveform": "sine",
    },
    "org_hierarchy": {
        "parent": "CEO",
        "child": "VP",
        "root": "Board",
        "depth": 5,
        "hierarchy_level": 2,
    },
    "event_sequence": {
        "timestamp": "2026-03-08",
        "sequence": ["start", "process", "end"],
        "duration": 3600,
        "before": "checkpoint",
        "after": "completion",
    },
    "influence_network": {
        "influence": "strong",
        "causes": ["A", "B"],
        "depends_on": "C",
        "triggers": "cascade",
    },
}


async def run() -> tuple[dict, RevisionScheduler]:
    engine = TransportEngine(CONDITIONS, FLOORS)
    register_all_hooks(engine)
    scheduler = RevisionScheduler(log_dir=REVISION_LOG_DIR)

    results: dict[str, dict] = {}
    for name, data in SAMPLE_DATASETS.items():
        result = await engine.evaluate_parallel(data)
        results[name] = result

        # 1e guard: if exit_code 429 or 1 → warning + concise memo
        exit_code = result.get("exit_code", 0)
        if exit_code in EXIT_WARNINGS:
            print(f"\n!! WARNING [{name}]: {EXIT_WARNINGS[exit_code]}")
            print(f"   {_result_memo(name, result)}")
            scheduler.record(result)
        else:
            scheduler.record(result)
            print(f"\n=== {name} ===")
            print(f"  Destination Floor : {result['destination_floor']}")
            print(f"  Floor Score       : {result['floor_score']:.3f}")
            print(f"  Conditions Fired  : {result['conditions_fired']}")
            print(f"  All Floor Scores  : {result['all_floor_scores']}")
            print(f"  Triggers Matched  : {result['triggers_matched']}")

        # Check triggers after each evaluation
        manifest = scheduler.check_and_revise()
        if manifest:
            print(f"  >> Revision fired: {manifest.triggered_by}")

    return results, scheduler


def export_report(results: dict) -> None:
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    report = {
        "generatedAt": "2026-03-08T21:30:00Z",
        "scope": "Data sorting floor - NOT training phases or benchmarks",
        "conditions": [
            {
                "name": c.name,
                "triggers": c.triggers,
                "hook": c.hook_function,
                "weight": c.weight,
                "routes_to": c.route_to,
            }
            for c in CONDITIONS
        ],
        "floors": [
            {"name": f.name, "description": f.description, "bias": f.bias}
            for f in FLOORS
        ],
        "sampleRuns": {
            name: {
                "destination_floor": r["destination_floor"],
                "floor_score": r["floor_score"],
                "conditions_fired": r["conditions_fired"],
                "evidence_count": len(r["evidence"]),
            }
            for name, r in results.items()
        },
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"\nReport exported to: {REPORT_PATH}")


def print_revision(scheduler: RevisionScheduler) -> None:
    manifest = scheduler.force_revise(reason="end_of_run")

    # ── Routine flow (soft reminders) ────────────────────────────────
    print("\n--- routine flow ---")
    for i, step in enumerate(manifest.routine_flow, 1):
        print(f"  {i:2d}. {step}")

    # ── Revision summary ─────────────────────────────────────────────
    print(f"\n=== Revision Report ===")
    print(f"  Triggered by  : {manifest.triggered_by}")
    print(f"  Eval count    : {manifest.eval_count}")
    print(f"  Drift report  : {manifest.drift_report}")
    for obs in manifest.observations:
        print(f"  [{obs['type']}] {obs.get('floor', obs.get('condition', ''))}: "
              f"{obs.get('mean_score', obs.get('fire_rate', obs.get('note', '')))}")
    for adj in manifest.suggested_adjustments:
        print(f"  >> {adj['suggestion']}")
    if not manifest.suggested_adjustments:
        print("  >> No adjustments suggested — weights stable.")

    # ── Floor outline (structural map) ───────────────────────────────
    print("\n--- floor outline ---")
    for fo in manifest.floor_outline:
        print(f"\n  [{fo.floor}]  rank #{fo.rank}  trend: {fo.trend}  mean: {fo.mean_score:.4f}")
        print(f"    {fo.appearance}")
        for b in fo.branches:
            arrow = {"rising": "\u2197", "falling": "\u2198", "steady": "\u2192", "dormant": "\u00b7"}[b.direction]
            print(f"      {arrow} {b.condition:<22s}  fires: {b.fire_count}  "
                  f"w: {b.weight:.2f}  {b.direction}/{b.strength}")

    print(f"\n  Log dir: {scheduler.log_dir}")


if __name__ == "__main__":
    transport_results, scheduler = asyncio.run(run())
    export_report(transport_results)
    print_revision(scheduler)
