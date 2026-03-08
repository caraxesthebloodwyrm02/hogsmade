"""Registered scoring functions for transport conditions."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from transport_floor.engine import TransportEngine


def signal_signature_score(data: dict, triggers: list[str]) -> float:
    """Score based on acoustic signal parameters.

    Weights from experience:
      coherence 0.4  — signal integrity is most important
      spatial   0.3  — distribution matters
      reliability 0.2
      connectivity 0.1
    """
    trigger_weights = {
        "frequency": 1.0, "amplitude": 1.0, "phase": 0.9, "resonance": 0.95,
        "decay": 0.85, "waveform": 0.9, "oscillation": 0.8, "harmonic": 0.85,
    }
    score = sum(trigger_weights.get(t, 0.5) for t in triggers)
    return score * 0.4  # coherence weight


def growth_pattern_score(data: dict, triggers: list[str]) -> float:
    """Score based on branching/tree indicators.

    Weights from experience:
      branching_factor 0.5  — primary indicator
      depth_coverage   0.3
      connectivity     0.2
    """
    trigger_weights = {
        "parent": 1.0, "child": 1.0, "root": 0.95, "leaf": 0.9,
        "depth": 0.85, "level": 0.8, "ancestor": 0.75, "descendant": 0.75,
        "sibling": 0.7, "hierarchy": 0.85,
    }
    score = sum(trigger_weights.get(t, 0.5) for t in triggers)
    return score * 0.5  # branching_factor weight


def semantic_proximity(data: dict, triggers: list[str]) -> float:
    """Score based on semantic similarity indicators.

    Damped by 0.8 — false positives are common with generic keywords.
    """
    trigger_weights = {
        "semantic": 1.0, "proximity": 0.9, "related": 0.7, "similar": 0.8,
        "close": 0.6, "near": 0.5, "distance": 0.7,
    }
    score = sum(trigger_weights.get(t, 0.4) for t in triggers)
    return score * 0.8


def temporal_distance(data: dict, triggers: list[str]) -> float:
    """Score based on temporal indicators.

    High reliability (0.9) — time-ordered data almost always benefits from
    timeline view.
    """
    trigger_weights = {
        "time": 1.0, "date": 1.0, "before": 0.9, "after": 0.9,
        "duration": 0.85, "interval": 0.8, "sequence": 0.95, "order": 0.9,
    }
    score = sum(trigger_weights.get(t, 0.5) for t in triggers)
    return score * 0.9


def influence_link(data: dict, triggers: list[str]) -> float:
    """Score based on causal/influence indicators.

    Moderate-high (0.85) — valuable but sparse in most datasets.
    """
    trigger_weights = {
        "influence": 1.0, "affects": 0.95, "causes": 1.0, "triggers": 0.9,
        "depends": 0.85, "requires": 0.8, "enables": 0.75,
    }
    score = sum(trigger_weights.get(t, 0.5) for t in triggers)
    return score * 0.85


# ── Registry helper ──────────────────────────────────────────────────

ALL_HOOKS: dict[str, object] = {
    "signal_signature_score": signal_signature_score,
    "growth_pattern_score": growth_pattern_score,
    "semantic_proximity": semantic_proximity,
    "temporal_distance": temporal_distance,
    "influence_link": influence_link,
}


def register_all_hooks(engine: "TransportEngine") -> None:
    """Register every hook function on *engine*."""
    for name, func in ALL_HOOKS.items():
        engine.register_hook(name, func)
