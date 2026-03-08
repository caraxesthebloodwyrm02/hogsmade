"""TransportEngine — parallel condition evaluation with experience-weighted scoring."""

from __future__ import annotations

import asyncio
import json
from typing import Any, Callable

from transport_floor.conditions import TransportCondition, TransportFloor


class TransportEngine:
    """Parallel transport evaluation with experience-weighted scoring.

    Insights baked into the design:
      - Signal detection is most reliable  (highest weight)
      - Tree structures are common but often incomplete
      - Semantic matching is useful but noisy
      - Temporal patterns are reliable when present
      - Causal links are valuable but sparse
    """

    def __init__(
        self,
        conditions: list[TransportCondition],
        floors: list[TransportFloor],
    ) -> None:
        self.conditions = conditions
        self.floors = {f.name: f for f in floors}
        self._registry: dict[str, Callable[..., float]] = {}

    def register_hook(self, name: str, func: Callable[..., float]) -> None:
        """Register a safe function for condition evaluation."""
        self._registry[name] = func

    # ── internals ────────────────────────────────────────────────────

    def _scan_triggers(self, data: dict[str, Any]) -> dict[str, list[str]]:
        """Scan *data* for trigger keywords, return matches per condition."""
        text_content = json.dumps(data).lower()
        matches: dict[str, list[str]] = {}
        for cond in self.conditions:
            found = [t for t in cond.triggers if t in text_content]
            if found:
                matches[cond.name] = found
        return matches

    # ── public API ───────────────────────────────────────────────────

    async def evaluate_parallel(
        self,
        data: dict[str, Any],
        preset_bias: dict[str, float] | None = None,
    ) -> dict[str, Any]:
        """Evaluate all conditions in parallel, apply experience weights.

        Returns transport decision with evidence trail.
        """
        trigger_matches = self._scan_triggers(data)

        async def _eval(cond_name: str, triggers: list[str]) -> tuple[str, float, list[str]]:
            cond = next(c for c in self.conditions if c.name == cond_name)
            hook = self._registry.get(cond.hook_function)
            if hook:
                score = await asyncio.to_thread(hook, data, triggers)
            else:
                score = len(triggers) * cond.weight
            return cond_name, score, triggers

        tasks = [_eval(name, trigs) for name, trigs in trigger_matches.items()]
        results = await asyncio.gather(*tasks) if tasks else []

        # Apply experience weights and floor routing
        floor_scores: dict[str, float] = {name: 0.0 for name in self.floors}
        evidence: list[dict[str, Any]] = []

        for cond_name, base_score, triggers in results:
            cond = next(c for c in self.conditions if c.name == cond_name)
            bias = (preset_bias or {}).get(cond_name, 1.0)
            weighted_score = base_score * cond.weight * bias

            for floor_name in cond.route_to:
                floor_scores[floor_name] += weighted_score

            evidence.append({
                "condition": cond_name,
                "triggers": triggers,
                "base_score": base_score,
                "weighted_score": weighted_score,
                "routed_to": cond.route_to,
            })

        # Apply floor biases
        for floor_name, floor in self.floors.items():
            floor_scores[floor_name] *= floor.bias

        destination = max(floor_scores.items(), key=lambda x: x[1]) if floor_scores else (None, 0.0)

        # Exit codes:
        #   0   — normal execution
        #   1   — degenerate: no conditions fired or no valid destination
        #   429 — saturated: every condition fired (rate-limit analog)
        total_conditions = len(self.conditions)
        fired = len(results)
        if destination[0] is None or fired == 0:
            exit_code = 1
        elif fired >= total_conditions:
            exit_code = 429
        else:
            exit_code = 0

        return {
            "exit_code": exit_code,
            "destination_floor": destination[0],
            "floor_score": destination[1],
            "all_floor_scores": floor_scores,
            "evidence": evidence,
            "conditions_fired": fired,
            "triggers_matched": trigger_matches,
        }
