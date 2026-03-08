"""Scheduled revision — trigger-based firing routine for systematic log review.

The revision hook scans accumulated transport logs (JSONL traces from the
pathway logger), detects drift in condition firing patterns, and emits a
revision report.  Triggers fire on:

    interval   — wall-clock cadence (e.g. every N evaluations or seconds)
    threshold  — when a metric crosses a boundary (e.g. floor-score variance)
    drift      — when observed weights diverge from baseline by > tolerance

The routine never mutates live weights directly.  It produces a revision
manifest that can be reviewed before promotion — same philosophy as the
glimpse-core "experimental → active" promotion checklist.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Callable


# ── Trigger types ────────────────────────────────────────────────────

class TriggerKind(str, Enum):
    INTERVAL = "interval"
    THRESHOLD = "threshold"
    DRIFT = "drift"


@dataclass
class RevisionTrigger:
    """A condition that causes the revision routine to fire."""
    kind: TriggerKind
    name: str
    check: Callable[["RevisionState"], bool]
    description: str = ""


@dataclass
class RevisionState:
    """Accumulated state tracked between revision checks."""
    eval_count: int = 0
    last_revision_at: float = 0.0
    floor_score_history: dict[str, list[float]] = field(default_factory=dict)
    condition_fire_counts: dict[str, int] = field(default_factory=dict)
    baseline_weights: dict[str, float] = field(default_factory=dict)
    log_entries: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class FloorBranch:
    """One branch feeding into a floor — a condition route with direction."""
    condition: str
    fire_count: int
    weight: float
    direction: str      # "rising", "falling", "steady", "dormant"
    strength: str       # "strong", "moderate", "weak", "silent"


@dataclass
class FloorOutline:
    """Structural outline of a single floor — its branches and appearance."""
    floor: str
    mean_score: float
    trend: str          # "growing", "shrinking", "stable"
    rank: int           # 1 = dominant floor
    branches: list[FloorBranch]
    appearance: str     # prose description of how this floor looks right now


@dataclass
class RevisionManifest:
    """Output of a revision pass — observations and suggested adjustments."""
    triggered_by: str
    timestamp: float
    eval_count: int
    observations: list[dict[str, Any]]
    suggested_adjustments: list[dict[str, Any]]
    drift_report: dict[str, float]
    routine_flow: list[str]
    floor_outline: list[FloorOutline]


# ── Built-in trigger checks ─────────────────────────────────────────

def _interval_check(state: RevisionState, every_n: int = 50) -> bool:
    """Fire every *every_n* evaluations."""
    if state.eval_count == 0:
        return False
    return state.eval_count % every_n == 0


def _threshold_check(state: RevisionState, max_variance: float = 0.25) -> bool:
    """Fire when any floor's score variance exceeds *max_variance*."""
    for scores in state.floor_score_history.values():
        if len(scores) < 5:
            continue
        recent = scores[-10:]
        mean = sum(recent) / len(recent)
        variance = sum((s - mean) ** 2 for s in recent) / len(recent)
        if variance > max_variance:
            return True
    return False


def _drift_check(state: RevisionState, tolerance: float = 0.15) -> bool:
    """Fire when observed fire-rate weights diverge from baseline by > *tolerance*."""
    if not state.baseline_weights or not state.condition_fire_counts:
        return False
    total_fires = sum(state.condition_fire_counts.values()) or 1
    for cond, baseline_w in state.baseline_weights.items():
        observed_w = state.condition_fire_counts.get(cond, 0) / total_fires
        if abs(observed_w - baseline_w) > tolerance:
            return True
    return False


# ── Routine flow — practices and soft reminders ─────────────────────
#
# When a trigger fires these are the actions that take place, in order.
# Each step is a gentle reminder, not a hard gate.

ROUTINE_FLOW: list[str] = [
    "Pause — a trigger fired. Collect the current log window before acting.",
    "Read the accumulated notes: which conditions fired, which stayed silent.",
    "Sketch the floor outline — for each floor, list its feeding branches.",
    "Mark direction: is each branch rising, falling, or steady since last revision?",
    "Note appearance: which floor dominates? Is it pulling away or converging?",
    "Check for dormant branches — conditions that should fire but haven't.",
    "Compare drift against baseline — flag anything beyond tolerance.",
    "Draft suggestions — never auto-apply, always surface for review.",
    "Persist the manifest to revision-log.jsonl (append-only).",
    "Reset the window — carry forward baseline, clear score history for next cycle.",
]


# ── Default triggers ─────────────────────────────────────────────────

DEFAULT_TRIGGERS: list[RevisionTrigger] = [
    RevisionTrigger(
        kind=TriggerKind.INTERVAL,
        name="periodic_50",
        check=lambda s: _interval_check(s, every_n=50),
        description="Fire every 50 evaluations",
    ),
    RevisionTrigger(
        kind=TriggerKind.THRESHOLD,
        name="score_variance",
        check=lambda s: _threshold_check(s, max_variance=0.25),
        description="Fire when floor-score variance exceeds 0.25",
    ),
    RevisionTrigger(
        kind=TriggerKind.DRIFT,
        name="weight_drift",
        check=lambda s: _drift_check(s, tolerance=0.15),
        description="Fire when condition fire-rate drifts >15% from baseline",
    ),
]


# ── Revision routine ────────────────────────────────────────────────

class RevisionScheduler:
    """Hooks into the transport engine to systematically revise logs.

    Usage::

        from transport_floor.revision import RevisionScheduler

        scheduler = RevisionScheduler()
        # After each engine.evaluate_parallel() call:
        scheduler.record(transport_result)
        manifest = scheduler.check_and_revise()
        if manifest:
            print("Revision fired:", manifest.triggered_by)
    """

    def __init__(
        self,
        triggers: list[RevisionTrigger] | None = None,
        baseline_weights: dict[str, float] | None = None,
        log_dir: Path | None = None,
    ) -> None:
        self.triggers = triggers or DEFAULT_TRIGGERS
        self.state = RevisionState(
            last_revision_at=time.time(),
            baseline_weights=baseline_weights or {
                "signal_signature": 0.30,
                "growth_pattern": 0.25,
                "temporal_distance": 0.20,
                "influence_link": 0.15,
                "semantic_proximity": 0.10,
            },
        )
        self.log_dir = log_dir
        self._manifests: list[RevisionManifest] = []

    def record(self, transport_result: dict[str, Any]) -> None:
        """Ingest one transport evaluation result into revision state."""
        self.state.eval_count += 1
        self.state.log_entries.append(transport_result)

        # Track floor scores
        for floor_name, score in transport_result.get("all_floor_scores", {}).items():
            self.state.floor_score_history.setdefault(floor_name, []).append(score)

        # Track condition fire counts
        for ev in transport_result.get("evidence", []):
            cond = ev.get("condition", "")
            self.state.condition_fire_counts[cond] = (
                self.state.condition_fire_counts.get(cond, 0) + 1
            )

    def check_and_revise(self) -> RevisionManifest | None:
        """Check all triggers; if any fires, run revision and return manifest."""
        fired_trigger: RevisionTrigger | None = None
        for trigger in self.triggers:
            if trigger.check(self.state):
                fired_trigger = trigger
                break

        if fired_trigger is None:
            return None

        manifest = self._build_manifest(fired_trigger)
        self._manifests.append(manifest)
        self.state.last_revision_at = time.time()

        if self.log_dir:
            self._persist_manifest(manifest)

        return manifest

    def force_revise(self, reason: str = "manual") -> RevisionManifest:
        """Force a revision pass regardless of triggers."""
        trigger = RevisionTrigger(
            kind=TriggerKind.INTERVAL,
            name=reason,
            check=lambda _: True,
            description=f"Forced revision: {reason}",
        )
        manifest = self._build_manifest(trigger)
        self._manifests.append(manifest)
        self.state.last_revision_at = time.time()

        if self.log_dir:
            self._persist_manifest(manifest)

        return manifest

    @property
    def history(self) -> list[RevisionManifest]:
        """All revision manifests produced so far."""
        return list(self._manifests)

    # ── internals ────────────────────────────────────────────────────

    def _build_manifest(self, trigger: RevisionTrigger) -> RevisionManifest:
        now = time.time()
        observations = self._observe()
        drift = self._compute_drift()
        adjustments = self._suggest_adjustments(observations, drift)
        outline = self._build_floor_outline()

        return RevisionManifest(
            triggered_by=trigger.name,
            timestamp=now,
            eval_count=self.state.eval_count,
            observations=observations,
            suggested_adjustments=adjustments,
            drift_report=drift,
            routine_flow=ROUTINE_FLOW,
            floor_outline=outline,
        )

    def _build_floor_outline(self) -> list[FloorOutline]:
        """Build structural outline — branches per floor, direction, appearance."""
        from transport_floor.conditions import CONDITIONS, FLOORS

        # Rank floors by mean score
        floor_means: dict[str, float] = {}
        for floor_name, scores in self.state.floor_score_history.items():
            floor_means[floor_name] = sum(scores) / len(scores) if scores else 0.0
        ranked = sorted(floor_means.items(), key=lambda x: x[1], reverse=True)
        rank_map = {name: i + 1 for i, (name, _) in enumerate(ranked)}

        outlines: list[FloorOutline] = []
        for floor in FLOORS:
            scores = self.state.floor_score_history.get(floor.name, [])
            mean = floor_means.get(floor.name, 0.0)
            rank = rank_map.get(floor.name, len(FLOORS))

            # Trend: compare first half vs second half
            trend = "stable"
            if len(scores) >= 4:
                mid = len(scores) // 2
                first_half = sum(scores[:mid]) / mid
                second_half = sum(scores[mid:]) / (len(scores) - mid)
                delta = second_half - first_half
                if delta > 0.05:
                    trend = "growing"
                elif delta < -0.05:
                    trend = "shrinking"

            # Branches: each condition that routes to this floor
            branches: list[FloorBranch] = []
            for cond in CONDITIONS:
                if floor.name not in cond.route_to:
                    continue
                fires = self.state.condition_fire_counts.get(cond.name, 0)

                # Direction from log history
                cond_scores = [
                    ev.get("weighted_score", 0)
                    for entry in self.state.log_entries
                    for ev in entry.get("evidence", [])
                    if ev.get("condition") == cond.name
                ]
                if not cond_scores:
                    direction = "dormant"
                elif len(cond_scores) < 2:
                    direction = "steady"
                else:
                    half = len(cond_scores) // 2
                    early = sum(cond_scores[:half]) / half
                    late = sum(cond_scores[half:]) / (len(cond_scores) - half)
                    if late > early * 1.1:
                        direction = "rising"
                    elif late < early * 0.9:
                        direction = "falling"
                    else:
                        direction = "steady"

                # Strength label
                total_fires = sum(self.state.condition_fire_counts.values()) or 1
                rate = fires / total_fires
                if rate == 0:
                    strength = "silent"
                elif rate >= 0.3:
                    strength = "strong"
                elif rate >= 0.15:
                    strength = "moderate"
                else:
                    strength = "weak"

                branches.append(FloorBranch(
                    condition=cond.name,
                    fire_count=fires,
                    weight=cond.weight,
                    direction=direction,
                    strength=strength,
                ))

            # Compose appearance description
            active_branches = [b for b in branches if b.strength != "silent"]
            if not active_branches:
                appearance = f"{floor.name}: quiet — no branches feeding in."
            else:
                dominant = max(active_branches, key=lambda b: b.fire_count)
                appearance = (
                    f"{floor.name} (rank #{rank}, {trend}): "
                    f"led by {dominant.condition} ({dominant.direction}, {dominant.strength}), "
                    f"{len(active_branches)} active branch(es), "
                    f"mean score {mean:.3f}."
                )

            outlines.append(FloorOutline(
                floor=floor.name,
                mean_score=round(mean, 4),
                trend=trend,
                rank=rank,
                branches=branches,
                appearance=appearance,
            ))

        return outlines

    def _observe(self) -> list[dict[str, Any]]:
        """Scan logs and extract top-level observations."""
        obs: list[dict[str, Any]] = []

        # Floor dominance
        for floor, scores in self.state.floor_score_history.items():
            if not scores:
                continue
            mean = sum(scores) / len(scores)
            obs.append({
                "type": "floor_mean",
                "floor": floor,
                "mean_score": round(mean, 4),
                "sample_count": len(scores),
            })

        # Condition fire frequency
        total = sum(self.state.condition_fire_counts.values()) or 1
        for cond, count in self.state.condition_fire_counts.items():
            obs.append({
                "type": "condition_frequency",
                "condition": cond,
                "fire_count": count,
                "fire_rate": round(count / total, 4),
            })

        # Dormant conditions (never fired)
        fired = set(self.state.condition_fire_counts.keys())
        for baseline_cond in self.state.baseline_weights:
            if baseline_cond not in fired:
                obs.append({
                    "type": "dormant_condition",
                    "condition": baseline_cond,
                    "note": "Never fired in current window",
                })

        return obs

    def _compute_drift(self) -> dict[str, float]:
        """Compare observed fire-rates against baseline weights."""
        drift: dict[str, float] = {}
        total = sum(self.state.condition_fire_counts.values()) or 1
        for cond, baseline_w in self.state.baseline_weights.items():
            observed_w = self.state.condition_fire_counts.get(cond, 0) / total
            drift[cond] = round(observed_w - baseline_w, 4)
        return drift

    def _suggest_adjustments(
        self,
        observations: list[dict[str, Any]],
        drift: dict[str, float],
    ) -> list[dict[str, Any]]:
        """Generate adjustment suggestions (never auto-applied)."""
        suggestions: list[dict[str, Any]] = []

        for cond, delta in drift.items():
            if abs(delta) > 0.15:
                direction = "over-firing" if delta > 0 else "under-firing"
                suggestions.append({
                    "condition": cond,
                    "issue": direction,
                    "drift": delta,
                    "suggestion": (
                        f"Consider {'reducing' if delta > 0 else 'increasing'} "
                        f"weight for '{cond}' — observed drift {delta:+.2%} from baseline"
                    ),
                })

        # Flag dormant conditions
        for obs in observations:
            if obs.get("type") == "dormant_condition":
                suggestions.append({
                    "condition": obs["condition"],
                    "issue": "dormant",
                    "drift": -self.state.baseline_weights.get(obs["condition"], 0),
                    "suggestion": (
                        f"Condition '{obs['condition']}' has never fired — "
                        f"verify triggers are reachable or reduce baseline weight"
                    ),
                })

        return suggestions

    def _persist_manifest(self, manifest: RevisionManifest) -> None:
        """Append manifest to JSONL log file."""
        if not self.log_dir:
            return
        self.log_dir.mkdir(parents=True, exist_ok=True)
        log_file = self.log_dir / "revision-log.jsonl"
        entry = {
            "triggered_by": manifest.triggered_by,
            "timestamp": manifest.timestamp,
            "eval_count": manifest.eval_count,
            "observations": manifest.observations,
            "suggested_adjustments": manifest.suggested_adjustments,
            "drift_report": manifest.drift_report,
            "routine_flow": manifest.routine_flow,
            "floor_outline": [
                {
                    "floor": fo.floor,
                    "mean_score": fo.mean_score,
                    "trend": fo.trend,
                    "rank": fo.rank,
                    "appearance": fo.appearance,
                    "branches": [
                        {
                            "condition": b.condition,
                            "fire_count": b.fire_count,
                            "weight": b.weight,
                            "direction": b.direction,
                            "strength": b.strength,
                        }
                        for b in fo.branches
                    ],
                }
                for fo in manifest.floor_outline
            ],
        }
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
