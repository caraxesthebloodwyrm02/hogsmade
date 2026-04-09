# Harness Team Specification

**Format**: Pokemon GO 1500 CP Great League  
**Architectural Role**: Long-running domain-function constraint harness

## Team Composition

### Bastiodon — Foundation Layer

| Attribute | Value |
|-----------|-------|
| Types | Steel / Rock |
| Role | Lead / Anchor |
| Fast Move | Smack Down |
| Charged Moves | Stone Edge, Flamethrower |
| CP Cap | 1500 |

**Domain-Function Contract**:
- Represents **long-running stability** — bulk and persistence across the full buildup window
- Acts as the **fail-closed anchor** — when other layers drop, Foundation holds
- Operates entirely in the **Buildup quantization zone** (steps 0–43 per cycle)
- Transistor role: **arms** — holds gate state across the extended buildup; gate does not fire until explicitly triggered

**Struggle Scenario**: Bastiodon's Smack Down is a 4-turn fast move that generates energy slowly. The Foundation Layer must accumulate energy (signal state) across the full 44-step buildup window before the drop zone becomes viable. This models the constraint that foundational infrastructure must stabilize before higher-order integration can fire.

**Architectural Mapping**:
- Parallels: database migrations, config init, cert loading, dependency resolution
- Pipeline phase: Quadrant A (Setup) + early Quadrant B (Execute)
- Verifiable signal: transistor hook `ARM_FOUNDATION` armed at step 12, fires at step 43

---

### Talonflame — Probe Layer

| Attribute | Value |
|-----------|-------|
| Types | Fire / Flying |
| Role | Safe Switch / Probe |
| Fast Move | Incinerate |
| Charged Moves | Brave Bird, Flame Charge |
| CP Cap | 1500 |

**Domain-Function Contract**:
- Represents **fast signal emission** — high-throughput scanning, probe bursts
- Provides **energy accumulation** — Flame Charge stacks into the drop window
- Operates in the **Buildup quantization zone** (steps 0–43), transitioning into Silence (44–47)
- Transistor role: **emits** — fires probe signals during buildup; primes the drop zone before Exeggutor fires

**Struggle Scenario**: Incinerate is a 5-turn fast move (unusually long channel). The Probe Layer emits signals on a fixed 5-turn cadence — probes must be designed around this emission schedule or they will miss the timing window. This models the constraint that high-throughput scanners have a fixed poll interval; the system must accommodate the cadence rather than demand arbitrary emission.

**Architectural Mapping**:
- Parallels: health check loops, log collectors, metric emitters, probe agents
- Pipeline phase: Quadrant B (Execute) + Quadrant C (Instrument)
- Verifiable signal: decorated var `HARNESS_PROBE_CADENCE=5` fires at step 28

---

### Alolan Exeggutor — Integration Layer

| Attribute | Value |
|-----------|-------|
| Types | Grass / Dragon |
| Role | Coverage / Closer |
| Fast Move | Dragon Tail |
| Charged Moves | Dragon Pulse, Seed Bomb |
| CP Cap | 1500 |

**Domain-Function Contract**:
- Represents **cross-domain integration** — multi-type coverage, collaboration between subsystems
- Acts as the **drop zone executor** — fires the burst after Foundation arms and Probe primes
- Operates in the **Drop quantization zone** (steps 48–67 per cycle)
- Transistor role: **fires** — executes the final burst after transistor gates are armed/emitted by Bastiodon and Talonflame

**Struggle Scenario**: Alolan Exeggutor is Grass/Dragon — sharing a double vulnerability to Ice-type moves. When two domains share the same dependency (e.g., both rely on a cold-storage system), a single failure propagates to both coverage paths simultaneously. Integration calls must route around the double-weakness window by having fallback paths that do not share the same vulnerability.

**Architectural Mapping**:
- Parallels: API integration tests, cross-service calls, choreographed multi-step workflows
- Pipeline phase: Quadrant D (Complete) — checkpoint, audit, transition, handoff
- Verifiable signal: transistor hook `FIRE_INTEGRATION` fires at step 65, producing the final manifest write

---

## Quantization Profile (per cycle, 68 steps)

| Zone | Steps | Range | Intensity | Owner |
|------|-------|-------|-----------|-------|
| Buildup | 44 | 0–43 | 0.1→0.7 (linear ramp) | Bastiodon + Talonflame |
| Silence | 4 | 44–47 | 0.0 (deliberate pause) | Transition |
| Drop | 20 | 48–67 | 1.0 (full intensity) | Alolan Exeggutor |

## Transistor Pattern

Base pattern: `10` (binary — arm=1, fire=0).

All three members participate in the transistor chain:
1. **Bastiodon** arms the gate (`ARM_FOUNDATION`) at step 12
2. **Talonflame** emits a probe signal (`EMIT_PROBE`) at step 28
3. **Exeggutor** fires the drop (`FIRE_INTEGRATION`) at step 65

Between arm and fire: 53 steps of accumulated state. The silence zone (steps 44–47) acts as a deliberate gap before the drop — no signal is emitted, no gate is toggled. This models a mandatory quiesce before high-intensity execution.

## Two-Cycle Structure

The full harness runs **2 cycles × 68 steps = 136 steps**. The team composition repeats across both cycles with the same layer mapping. Cycle 0 is the dry run (probe mode); Cycle 1 is the live run (execute mode). Manifests capture both cycles and their transistor state independently.
