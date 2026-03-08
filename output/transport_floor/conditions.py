"""Condition and floor definitions for transport routing."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class TransportCondition:
    """A condition that triggers transport to a specific floor."""
    name: str
    triggers: list[str]
    hook_function: str
    weight: float
    scope: list[str]
    route_to: list[str]


@dataclass
class TransportFloor:
    """A sorting floor where data lands based on transport evaluation."""
    name: str
    description: str
    bias: float
    conditions: list[TransportCondition] = field(default_factory=list)


# ── Condition definitions (weights from experience) ──────────────────

CONDITIONS: list[TransportCondition] = [
    TransportCondition(
        name="signal_signature",
        triggers=[
            "frequency", "amplitude", "phase", "resonance",
            "decay", "waveform", "oscillation", "harmonic",
        ],
        hook_function="signal_signature_score",
        weight=0.40,
        scope=["dataset", "entity", "relation"],
        route_to=["flow", "constellation"],
    ),
    TransportCondition(
        name="growth_pattern",
        triggers=[
            "parent", "child", "root", "leaf", "depth",
            "level", "ancestor", "descendant", "sibling", "hierarchy",
        ],
        hook_function="growth_pattern_score",
        weight=0.35,
        scope=["dataset", "relation"],
        route_to=["flow", "clusters"],
    ),
    TransportCondition(
        name="semantic_proximity",
        triggers=[
            "semantic", "proximity", "related", "similar",
            "close", "near", "distance",
        ],
        hook_function="semantic_proximity",
        weight=0.25,
        scope=["dataset", "entity"],
        route_to=["constellation", "clusters"],
    ),
    TransportCondition(
        name="temporal_distance",
        triggers=[
            "time", "date", "before", "after",
            "duration", "interval", "sequence", "order",
        ],
        hook_function="temporal_distance",
        weight=0.30,
        scope=["relation"],
        route_to=["timeline", "flow"],
    ),
    TransportCondition(
        name="influence_link",
        triggers=[
            "influence", "affects", "causes", "triggers",
            "depends", "requires", "enables",
        ],
        hook_function="influence_link",
        weight=0.28,
        scope=["dataset", "relation"],
        route_to=["flow", "constellation"],
    ),
]


# ── Floor definitions (biases from long usage) ───────────────────────

def _build_floors() -> list[TransportFloor]:
    specs = [
        ("flow", "Pathways, branches, signal chains — directional movement through data", 1.35),
        ("constellation", "Network topology — nodes and edges, gravitational clusters", 1.30),
        ("clusters", "Grouping by proximity or similarity — categorical aggregation", 1.20),
        ("timeline", "Temporal ordering — roots in time, seasonal accumulation", 1.10),
    ]
    return [
        TransportFloor(
            name=name,
            description=desc,
            bias=bias,
            conditions=[c for c in CONDITIONS if name in c.route_to],
        )
        for name, desc, bias in specs
    ]


FLOORS: list[TransportFloor] = _build_floors()
