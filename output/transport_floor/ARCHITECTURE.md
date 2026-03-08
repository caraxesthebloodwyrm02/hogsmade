# Transport Floor — Architecture

Data sorting floor assignment via parallel async condition evaluation.
**Not** training phases or ML benchmarks. The floor is where data lands.

## Core Flow

```
data ──→ scan triggers ──→ parallel eval ──→ weight ──→ route ──→ floor
              │                  │               │          │
         keywords in        asyncio.gather   cond.weight  floor.bias
         JSON match          (*tasks)        × preset     × experience
```

## Layers

### 1. Conditions (`conditions.py`)

5 conditions, each with trigger keywords, a hook function name, and a weight.

| Condition | Weight | Triggers (sample) | Routes To |
|-----------|--------|-------------------|-----------|
| signal_signature | 0.40 | frequency, amplitude, resonance | flow, constellation |
| growth_pattern | 0.35 | parent, child, root, depth | flow, clusters |
| temporal_distance | 0.30 | time, date, sequence, duration | timeline, flow |
| influence_link | 0.28 | influence, causes, depends | flow, constellation |
| semantic_proximity | 0.25 | semantic, similar, distance | constellation, clusters |

### 2. Floors (`conditions.py`)

4 destination floors with experience-derived biases.

| Floor | Bias | Description |
|-------|------|-------------|
| flow | 1.35 | Directional movement — pathways, signal chains |
| constellation | 1.30 | Network topology — nodes, edges, gravitational clusters |
| clusters | 1.20 | Grouping by proximity or similarity |
| timeline | 1.10 | Temporal ordering — roots in time |

### 3. Engine (`engine.py`)

```
evaluate_parallel(data, preset_bias?)
├── _scan_triggers(data)          # JSON-serialize, match keywords
├── asyncio.gather(*tasks)        # parallel: one task per matched condition
│   └── _eval(cond, triggers)     # lookup hook in registry → to_thread(hook)
├── weighted_score = base × cond.weight × bias
├── floor_scores[name] += weighted_score   # distribute to target floors
├── floor_scores[name] *= floor.bias       # apply experience bias
└── return max(floor_scores)               # destination floor
```

### 4. Hooks (`hooks.py`)

Safe registry — engine never executes unregistered functions.

```
ALL_HOOKS → register_all_hooks(engine) → engine._registry[name] = func
```

Each hook: `(data, triggers) → float` score.

- `signal_signature_score` — coherence weight 0.4, per-keyword weights
- `growth_pattern_score` — branching_factor weight 0.5
- `semantic_proximity` — damped ×0.8 (noisy)
- `temporal_distance` — high reliability ×0.9
- `influence_link` — moderate ×0.85 (sparse)

### 5. Revision (`revision.py`)

Trigger-based log revision with structural floor outline.

```
record(result) → check_and_revise() → if trigger fires:
├── routine flow          # 10 soft reminder steps
├── _observe()            # floor means, fire rates, dormant conditions
├── _compute_drift()      # observed vs baseline
├── _suggest_adjustments()# never auto-applied
├── _build_floor_outline()# branches per floor, direction, appearance
└── _persist_manifest()   # append-only JSONL
```

**Triggers**: interval (every N evals), threshold (score variance), drift (fire-rate divergence).

**Floor outline** per floor:
- **rank** — #1 = dominant
- **trend** — growing / shrinking / stable (first-half vs second-half)
- **branches** — each condition with direction (rising ↗ / falling ↘ / steady → / dormant ·) and strength (strong / moderate / weak / silent)
- **appearance** — prose description

### 6. Entry Point (`__main__.py`)

```
python -m transport_floor

→ engine + hooks + scheduler
→ evaluate 4 sample datasets
→ record + check triggers after each
→ export JSON report
→ force final revision (routine flow + floor outline)
```

## Design Principles

1. **Parallel, not sequential** — no priority bias in evaluation order
2. **Safe registry** — hooks registered by name; unregistered = fallback score
3. **Experience weights** — biases from long observation, not arbitrary defaults
4. **Never auto-mutate** — revision produces manifest for review, not live changes
5. **Append-only logging** — JSONL for tamper-resistant audit trail
