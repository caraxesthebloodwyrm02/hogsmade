"""Extension 2 — Cross-floor resonance.

After the base engine assigns data to a primary floor, this extension
propagates signal between floors based on shared conditions, producing
a resonance map that shows how strongly each floor echoes the others.

Use case: a dataset lands on "flow" but has strong secondary signals for
"constellation". The resonance extension quantifies that overlap and can
surface hybrid views or flag ambiguous routing.

Architecture hook-in points (from codemap):
    [1f] score accumulation — resonance reads all_floor_scores, not just max
    [2g] floor bias         — resonance applies its own cross-floor dampening
    [4d] direction detect   — resonance tracks inter-floor coupling over time
    [4g] appearance compose — resonance extends appearance with echo descriptions
"""

from __future__ import annotations

import asyncio
import copy
from dataclasses import dataclass, field
from typing import Any

from transport_floor.conditions import CONDITIONS, FLOORS, TransportCondition
from transport_floor.engine import TransportEngine
from transport_floor.hooks import register_all_hooks


# ── Resonance types ─────────────────────────────────────────────────

@dataclass
class FloorEcho:
    """How strongly one floor echoes another."""
    source_floor: str
    target_floor: str
    coupling: float         # 0.0 = no shared conditions, 1.0 = identical routes
    shared_conditions: list[str]
    signal_ratio: float     # target_score / source_score


@dataclass
class ResonanceMap:
    """Full resonance analysis for one evaluation."""
    primary_floor: str
    primary_score: float
    echoes: list[FloorEcho]
    ambiguity: float        # 0.0 = clear winner, 1.0 = tie between floors
    hybrid_candidate: str | None   # suggested hybrid if ambiguity > threshold
    floor_scores: dict[str, float]
    resonance_signature: str       # compact text summary


@dataclass
class ResonanceTrace:
    """Accumulated resonance observations over multiple evaluations."""
    evaluations: int = 0
    coupling_history: dict[str, list[float]] = field(default_factory=dict)
    ambiguity_history: list[float] = field(default_factory=list)
    hybrid_suggestions: dict[str, int] = field(default_factory=dict)


# ── Coupling matrix ─────────────────────────────────────────────────

def _build_coupling_matrix() -> dict[tuple[str, str], tuple[float, list[str]]]:
    """Precompute coupling between every pair of floors.

    Coupling = |shared conditions| / |union of conditions|.
    """
    floor_conditions: dict[str, set[str]] = {}
    for floor in FLOORS:
        floor_conditions[floor.name] = {
            c.name for c in CONDITIONS if floor.name in c.route_to
        }

    matrix: dict[tuple[str, str], tuple[float, list[str]]] = {}
    floor_names = [f.name for f in FLOORS]
    for i, a in enumerate(floor_names):
        for b in floor_names[i + 1:]:
            shared = floor_conditions[a] & floor_conditions[b]
            union = floor_conditions[a] | floor_conditions[b]
            coupling = len(shared) / len(union) if union else 0.0
            pair_key_ab = (a, b)
            pair_key_ba = (b, a)
            shared_list = sorted(shared)
            matrix[pair_key_ab] = (coupling, shared_list)
            matrix[pair_key_ba] = (coupling, shared_list)
    return matrix


COUPLING_MATRIX = _build_coupling_matrix()


# ── Resonance engine ────────────────────────────────────────────────

class ResonanceEngine:
    """Wraps TransportEngine to add cross-floor resonance analysis.

    Usage::

        re = ResonanceEngine()
        rmap = await re.evaluate(data)
        print(rmap.resonance_signature)
        # "flow(0.184) ~~> constellation(0.142, coupling=0.40) | ambiguity: 0.23"

        # Accumulated analysis
        re.evaluate(data2)
        re.evaluate(data3)
        summary = re.summarize()
    """

    def __init__(self, ambiguity_threshold: float = 0.30) -> None:
        self.engine = TransportEngine(CONDITIONS, FLOORS)
        register_all_hooks(self.engine)
        self.ambiguity_threshold = ambiguity_threshold
        self.trace = ResonanceTrace()

    async def evaluate(
        self,
        data: dict[str, Any],
        preset_bias: dict[str, float] | None = None,
    ) -> ResonanceMap:
        """Run transport evaluation and compute resonance map."""
        result = await self.engine.evaluate_parallel(data, preset_bias)
        scores = result["all_floor_scores"]
        primary = result["destination_floor"]
        primary_score = result["floor_score"]

        # Build echoes from primary to every other floor
        echoes: list[FloorEcho] = []
        for floor_name, score in scores.items():
            if floor_name == primary:
                continue
            pair = (primary, floor_name)
            coupling, shared = COUPLING_MATRIX.get(pair, (0.0, []))
            ratio = score / primary_score if primary_score > 0 else 0.0
            echoes.append(FloorEcho(
                source_floor=primary,
                target_floor=floor_name,
                coupling=round(coupling, 4),
                shared_conditions=shared,
                signal_ratio=round(ratio, 4),
            ))

        echoes.sort(key=lambda e: e.signal_ratio, reverse=True)

        # Ambiguity: how close is #2 to #1?
        sorted_scores = sorted(scores.values(), reverse=True)
        if len(sorted_scores) >= 2 and sorted_scores[0] > 0:
            ambiguity = round(sorted_scores[1] / sorted_scores[0], 4)
        else:
            ambiguity = 0.0

        # Hybrid suggestion
        hybrid: str | None = None
        if ambiguity > self.ambiguity_threshold and echoes:
            strongest_echo = echoes[0]
            hybrid = f"{primary}+{strongest_echo.target_floor}"

        # Compact signature
        echo_parts = []
        for e in echoes[:2]:
            echo_parts.append(f"{e.target_floor}({e.signal_ratio:.2f}, c={e.coupling:.2f})")
        sig = f"{primary}({primary_score:.3f})"
        if echo_parts:
            sig += " ~~> " + " | ".join(echo_parts)
        sig += f" | ambiguity: {ambiguity:.2f}"
        if hybrid:
            sig += f" → hybrid: {hybrid}"

        rmap = ResonanceMap(
            primary_floor=primary,
            primary_score=primary_score,
            echoes=echoes,
            ambiguity=ambiguity,
            hybrid_candidate=hybrid,
            floor_scores=scores,
            resonance_signature=sig,
        )

        # Track
        self.trace.evaluations += 1
        self.trace.ambiguity_history.append(ambiguity)
        for e in echoes:
            key = f"{e.source_floor}->{e.target_floor}"
            self.trace.coupling_history.setdefault(key, []).append(e.signal_ratio)
        if hybrid:
            self.trace.hybrid_suggestions[hybrid] = (
                self.trace.hybrid_suggestions.get(hybrid, 0) + 1
            )

        return rmap

    def summarize(self) -> dict[str, Any]:
        """Summarize accumulated resonance observations."""
        avg_ambiguity = (
            sum(self.trace.ambiguity_history) / len(self.trace.ambiguity_history)
            if self.trace.ambiguity_history else 0.0
        )

        # Strongest persistent couplings
        persistent: dict[str, float] = {}
        for pair, ratios in self.trace.coupling_history.items():
            persistent[pair] = round(sum(ratios) / len(ratios), 4)

        top_hybrids = sorted(
            self.trace.hybrid_suggestions.items(),
            key=lambda x: x[1],
            reverse=True,
        )

        return {
            "evaluations": self.trace.evaluations,
            "avg_ambiguity": round(avg_ambiguity, 4),
            "persistent_couplings": persistent,
            "top_hybrid_suggestions": top_hybrids[:3],
            "high_ambiguity_rate": round(
                sum(1 for a in self.trace.ambiguity_history if a > self.ambiguity_threshold)
                / max(len(self.trace.ambiguity_history), 1),
                4,
            ),
        }


# ── CLI entry ────────────────────────────────────────────────────────

async def demo() -> None:
    re = ResonanceEngine(ambiguity_threshold=0.30)

    samples = {
        "pure_signal": {"frequency": 440, "amplitude": 0.9, "resonance": "high", "waveform": "sine"},
        "mixed_bag": {"frequency": 440, "parent": "root", "child": "leaf", "sequence": [1, 2, 3], "time": "now"},
        "causal_net": {"influence": "strong", "causes": ["A"], "affects": "B", "similar": "C", "semantic": "link"},
        "flat_schema": {"schema": "users", "field": "name", "table": "accounts", "record": 500},
        "time_series": {"timestamp": "2026-03-08", "duration": 3600, "before": "start", "after": "end", "interval": 60},
    }

    print("=== Resonance Analysis ===\n")
    for name, data in samples.items():
        rmap = await re.evaluate(data)
        print(f"  {name:<14s}  {rmap.resonance_signature}")

    print(f"\n=== Accumulated Summary ===\n")
    summary = re.summarize()
    print(f"  Evaluations        : {summary['evaluations']}")
    print(f"  Avg ambiguity      : {summary['avg_ambiguity']:.2f}")
    print(f"  High-ambiguity rate: {summary['high_ambiguity_rate']:.0%}")
    print(f"  Persistent couplings:")
    for pair, ratio in sorted(summary["persistent_couplings"].items(), key=lambda x: x[1], reverse=True):
        print(f"    {pair:<30s}  avg ratio: {ratio:.3f}")
    if summary["top_hybrid_suggestions"]:
        print(f"  Top hybrid suggestions:")
        for hybrid, count in summary["top_hybrid_suggestions"]:
            print(f"    {hybrid:<20s}  suggested {count}x")


if __name__ == "__main__":
    asyncio.run(demo())
