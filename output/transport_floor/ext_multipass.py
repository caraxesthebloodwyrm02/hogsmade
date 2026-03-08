"""Extension 1 — Multi-pass transformation.

Runs data through the transport engine multiple times, reshaping it between
passes so it can land on different floors as the signal evolves.

Use case: a dataset that starts as a flat hierarchy but, after the first pass
enriches it with branching metadata, the second pass detects growth_pattern
and re-routes from clusters → flow.

Architecture hook-in points (from codemap):
    [1c] evaluate_parallel  — called once per pass
    [1f] score accumulation — each pass contributes to floor scores independently
    [3b] scheduler.record   — each pass is a separate revision event
"""

from __future__ import annotations

import asyncio
import copy
from dataclasses import dataclass, field
from typing import Any, Callable

from transport_floor.conditions import CONDITIONS, FLOORS
from transport_floor.engine import TransportEngine
from transport_floor.hooks import register_all_hooks


# ── Transform functions ──────────────────────────────────────────────
# Each transform receives the data + previous pass result, returns reshaped data.

TransformFn = Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]]


def enrich_hierarchy(data: dict[str, Any], prev: dict[str, Any]) -> dict[str, Any]:
    """After a flat-data pass, inject branching metadata so growth_pattern fires."""
    enriched = copy.deepcopy(data)
    evidence = prev.get("evidence", [])
    if evidence:
        top_condition = max(evidence, key=lambda e: e.get("weighted_score", 0))
        enriched["parent"] = top_condition.get("condition", "root")
        enriched["child"] = prev.get("destination_floor", "unknown")
        enriched["depth"] = len(evidence)
    return enriched


def inject_temporal(data: dict[str, Any], prev: dict[str, Any]) -> dict[str, Any]:
    """After any pass, add time-ordering metadata so temporal_distance fires."""
    enriched = copy.deepcopy(data)
    enriched["sequence"] = list(prev.get("triggers_matched", {}).keys())
    enriched["order"] = prev.get("conditions_fired", 0)
    enriched["before"] = prev.get("destination_floor", "")
    return enriched


def amplify_signal(data: dict[str, Any], prev: dict[str, Any]) -> dict[str, Any]:
    """Boost acoustic keywords based on which signals were strongest last pass."""
    enriched = copy.deepcopy(data)
    for ev in prev.get("evidence", []):
        if ev.get("condition") == "signal_signature":
            for trigger in ev.get("triggers", []):
                enriched[f"{trigger}_harmonic"] = enriched.get(trigger, 0)
            enriched["resonance"] = "amplified"
    return enriched


def broaden_influence(data: dict[str, Any], prev: dict[str, Any]) -> dict[str, Any]:
    """After any pass, inject causal links between fired conditions."""
    enriched = copy.deepcopy(data)
    fired = [ev["condition"] for ev in prev.get("evidence", [])]
    if len(fired) >= 2:
        enriched["influence"] = fired[0]
        enriched["affects"] = fired[1]
        enriched["causes"] = fired
    return enriched


# ── Built-in transform chains ───────────────────────────────────────

TRANSFORM_CHAINS: dict[str, list[TransformFn]] = {
    "flat_to_tree": [enrich_hierarchy, inject_temporal],
    "signal_amplify": [amplify_signal, inject_temporal],
    "causal_discovery": [broaden_influence, enrich_hierarchy],
    "full_sweep": [enrich_hierarchy, amplify_signal, broaden_influence, inject_temporal],
}


# ── Multi-pass result ───────────────────────────────────────────────

@dataclass
class PassResult:
    """Result of a single pass in a multi-pass evaluation."""
    pass_index: int
    transform_name: str
    destination_floor: str
    floor_score: float
    conditions_fired: int
    data_snapshot: dict[str, Any]
    raw_result: dict[str, Any]


@dataclass
class MultiPassResult:
    """Aggregated result across all passes."""
    chain_name: str
    passes: list[PassResult]
    floor_journey: list[str]         # sequence of floors visited
    floor_changed: bool              # did the data move floors?
    dominant_floor: str              # floor with highest cumulative score
    cumulative_scores: dict[str, float]


# ── Multi-pass engine ───────────────────────────────────────────────

class MultiPassEngine:
    """Run data through multiple transformation passes.

    Usage::

        mp = MultiPassEngine()
        result = await mp.run(data, chain="flat_to_tree")
        print(result.floor_journey)   # e.g. ["clusters", "flow", "timeline"]
        print(result.floor_changed)   # True
    """

    def __init__(self) -> None:
        self.engine = TransportEngine(CONDITIONS, FLOORS)
        register_all_hooks(self.engine)

    async def run(
        self,
        data: dict[str, Any],
        chain: str | list[TransformFn] = "flat_to_tree",
        preset_bias: dict[str, float] | None = None,
    ) -> MultiPassResult:
        transforms = TRANSFORM_CHAINS[chain] if isinstance(chain, str) else chain
        chain_name = chain if isinstance(chain, str) else "custom"

        passes: list[PassResult] = []
        cumulative: dict[str, float] = {f.name: 0.0 for f in FLOORS}
        current_data = copy.deepcopy(data)

        # Pass 0: evaluate raw data
        result = await self.engine.evaluate_parallel(current_data, preset_bias)
        passes.append(PassResult(
            pass_index=0,
            transform_name="raw",
            destination_floor=result["destination_floor"],
            floor_score=result["floor_score"],
            conditions_fired=result["conditions_fired"],
            data_snapshot=copy.deepcopy(current_data),
            raw_result=result,
        ))
        for floor_name, score in result["all_floor_scores"].items():
            cumulative[floor_name] += score

        # Subsequent passes: transform then evaluate
        for i, transform in enumerate(transforms, start=1):
            current_data = transform(current_data, result)
            result = await self.engine.evaluate_parallel(current_data, preset_bias)
            passes.append(PassResult(
                pass_index=i,
                transform_name=transform.__name__,
                destination_floor=result["destination_floor"],
                floor_score=result["floor_score"],
                conditions_fired=result["conditions_fired"],
                data_snapshot=copy.deepcopy(current_data),
                raw_result=result,
            ))
            for floor_name, score in result["all_floor_scores"].items():
                cumulative[floor_name] += score

        journey = [p.destination_floor for p in passes]
        dominant = max(cumulative.items(), key=lambda x: x[1])[0]

        return MultiPassResult(
            chain_name=chain_name,
            passes=passes,
            floor_journey=journey,
            floor_changed=len(set(journey)) > 1,
            dominant_floor=dominant,
            cumulative_scores=cumulative,
        )


# ── CLI entry ────────────────────────────────────────────────────────

async def demo() -> None:
    mp = MultiPassEngine()

    samples = {
        "flat_data": {"schema": "users", "field": "name", "record": 500},
        "audio_mix": {"frequency": 440, "amplitude": 0.9, "waveform": "saw"},
        "event_log": {"timestamp": "2026-03-08", "duration": 120},
    }

    for chain_name in TRANSFORM_CHAINS:
        print(f"\n{'='*60}")
        print(f"Chain: {chain_name}")
        print(f"{'='*60}")
        for name, data in samples.items():
            result = await mp.run(data, chain=chain_name)
            journey = " → ".join(result.floor_journey)
            changed = "YES" if result.floor_changed else "no"
            print(f"  {name:<14s}  journey: {journey:<40s}  changed: {changed}")


if __name__ == "__main__":
    asyncio.run(demo())
