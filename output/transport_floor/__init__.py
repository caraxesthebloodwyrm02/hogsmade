"""
transport_floor — Data sorting floor assignment via parallel condition evaluation.

Notebook origin:
    output/jupyter-notebook/transport-floor-logic.ipynb

Scope:
    Data sorting floor — NOT training phases or benchmark evaluations.
    "Floor" refers to the destination where data lands based on signal characteristics.
    "Transport" is the routing mechanism: input → scoring → floor assignment.

Top observations:
    1. Signal detection is the most reliable transport indicator (weight 0.40).
       Acoustic-inspired keywords (frequency, amplitude, resonance) are highly
       predictive of time-series/waveform data that benefits from flow views.
    2. All conditions evaluate in parallel — no priority bias in evaluation order.
       Combined scores from multiple angles produce richer signal than sequential
       short-circuit evaluation.
    3. Experience-derived floor biases (flow=1.35, constellation=1.30, clusters=1.20,
       timeline=1.10) reflect long-term observation that directional/flow views are
       the most commonly useful starting point for unfamiliar datasets.
    4. Hook functions are registered by name into a safe registry, mirroring the
       glimpse-core function registry validated in the .ipynb harness. Each hook
       returns a float score; the engine never executes unregistered functions.
    5. The noisiest condition is semantic_proximity (weight 0.25). False positives
       from generic keywords like "close" and "near" are common; the 0.8 damping
       factor in the hook compensates.

Modules:
    conditions  — TransportCondition/TransportFloor dataclasses + definitions
    hooks       — Registered scoring functions (signal, growth, temporal, etc.)
    engine      — TransportEngine with parallel async evaluation
    revision    — Trigger-based scheduled revision of accumulated transport logs
"""

from transport_floor.conditions import CONDITIONS, FLOORS, TransportCondition, TransportFloor
from transport_floor.hooks import register_all_hooks
from transport_floor.engine import TransportEngine
from transport_floor.revision import RevisionScheduler, RevisionTrigger, TriggerKind

__all__ = [
    "CONDITIONS",
    "FLOORS",
    "TransportCondition",
    "TransportFloor",
    "TransportEngine",
    "register_all_hooks",
    "RevisionScheduler",
    "RevisionTrigger",
    "TriggerKind",
]
