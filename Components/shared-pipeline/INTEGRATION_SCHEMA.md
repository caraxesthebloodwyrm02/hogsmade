# @cascade/shared-pipeline — Integration Schema

Version: 1.0.0
Date: 2026-03-25
Status: Canonical reference for test-driven vertical integration

---

## 1. Design Overview

### 1.1 Core Abstraction

The shader-pass pipeline is a **staged function composition with accumulating read-only context**. Each pass receives:

- **State** (`TState`) — mutable domain data threaded forward
- **Residue** (`ResidueStack`) — frozen append-only trail of all prior deposits

This creates a natural gradient: early passes are **active** (transform state), later passes are **observant** (rich residue to read, less to do).

```
                    ┌─────────────┐
  Initial State ───▶│   Pass 0    │──▶ deposits Residue[0]
                    │  (active)   │
                    └──────┬──────┘
                           │
              State + R[0] │
                    ┌──────▼──────┐
                    │   Pass 1    │──▶ deposits Residue[1]
                    │ (balanced)  │
                    └──────┬──────┘
                           │
           State + R[0..1] │
                    ┌──────▼──────┐
                    │   Pass 2    │──▶ deposits Residue[2]
                    │ (observant) │
                    └──────┬──────┘
                           │
                           ▼
                   PipelineResult {
                     state,
                     residue: R[0..2],
                     durationMs,
                     passCount
                   }
```

### 1.2 Invariants (Enforced by Tests)

| # | Invariant | Enforcement |
|---|-----------|-------------|
| I1 | Passes execute in declared array order | `pipeline.test.ts` — order + state threading |
| I2 | Residue stack grows by exactly 1 per pass | `pipeline.test.ts` — length check |
| I3 | Residue is deeply frozen after deposit | `pipeline.test.ts` — mutation throws TypeError |
| I4 | Pass N reads only R[0..N-1], never R[N..] | Structural — runner copies+freezes before each call |
| I5 | State threads forward (output.state → next input.state) | `pipeline.test.ts` — arithmetic chain |
| I6 | Zero passes → initial state + empty residue | `pipeline.test.ts` — empty pipeline case |
| I7 | Each ResidueEntry has passId + ISO timestamp + frozen data | `governance.test.ts` — timestamp validation |

### 1.3 Module Map

```
src/
  types.ts      47 LOC   7 interfaces — the contract surface
  residue.ts    31 LOC   4 query helpers — findResidue, recentResidue, hasRun, readDeposit
  pipeline.ts  123 LOC   createPipeline (sync), createAsyncPipeline (async)
  passes.ts     52 LOC   3 built-in passes — timestamp, auditMark, confidence
  index.ts      16 LOC   barrel re-exports
  examples/
    governance.ts  95 LOC  4-pass governance intake proof of concept
```

---

## 2. Type Contract Surface

### 2.1 Core Types

```typescript
// --- Residue layer ---
ResidueEntry  { passId, timestamp, data: Record<string, unknown> }  // all readonly
ResidueStack  = ReadonlyArray<Readonly<ResidueEntry>>

// --- Pass interface ---
PassInput<T>  { state: T, residue: ResidueStack, passIndex, pipelineId }  // all readonly
PassOutput<T> { state: T, deposit: Record<string, unknown> }

Pass<T>       { id, description?, execute(PassInput<T>) → PassOutput<T> }
AsyncPass<T>  { id, description?, execute(PassInput<T>) → Promise<PassOutput<T>> }

// --- Result ---
PipelineResult<T> { pipelineId, state: T, residue: ResidueStack, passCount, durationMs }
```

### 2.2 Compatibility with Existing Systems

| System | Type Bridge | Direction |
|--------|-------------|-----------|
| `MCPPolicyEngine` (shared-types) | A pass can call `engine.evaluateStrict(ctx)` internally and deposit the `PolicyResult` into residue | Pipeline wraps policy engine |
| `emitAudit` (shared-types) | `auditMarkPass(source)` mirrors the audit event shape; a pass could call `emitAudit()` as a side effect | Pipeline feeds audit trail |
| Glimpse `multi-pass.js` | Glimpse state shape maps to `TState`; each Glimpse pass (rule eval, cross-ref, consolidation) maps to `Pass<GlimpseState>` | Future migration target |
| GRID `BoundaryEngine` | Prevention→Detection→Remediation maps to 3 `Pass<BoundaryState>` objects | Same pattern, Python port future |

---

## 3. Integration Targets

### 3.1 Target Map

```
@cascade/shared-pipeline
    │
    ├── T1: grid-server        — gate validation as pipeline
    ├── T2: glimpse-server     — analysis as pipeline
    ├── T3: echoes-server      — audit processing as pipeline
    ├── T4: afloat-server      — workflow execution as pipeline
    ├── T5: seeds-server       — health scoring as pipeline
    └── T6: glimpse-engine     — multi-pass inference migration (JS→TS bridge)
```

### 3.2 Integration Classification

| Target | Complexity | Risk | Test Strategy |
|--------|-----------|------|---------------|
| T1: grid-server | Medium | Low — additive, no existing pipeline | Unit → Integration |
| T2: glimpse-server | Medium | Low — wraps existing analyze flow | Unit → Integration |
| T3: echoes-server | Low | Low — audit is append-only | Unit only |
| T4: afloat-server | Medium | Medium — workflow state is complex | Unit → Integration → Contract |
| T5: seeds-server | Low | Low — scoring is pure | Unit only |
| T6: glimpse-engine | High | Medium — JS→TS bridge, large state | Unit → Contract → Migration |

---

## 4. Test-Driven Integration Strategy

### Phase 0: Foundation (COMPLETE)

**Status**: 32/32 tests passing

```
tests/
  pipeline.test.ts   10 tests — runner mechanics, ordering, freeze, threading, async
  residue.test.ts     9 tests — query helpers
  passes.test.ts      6 tests — built-in passes
  governance.test.ts   7 tests — domain example end-to-end
```

These tests define the contract. No integration proceeds until Phase 0 is green.

---

### Phase 1: Adapter Layer Tests (Write Tests First)

**Goal**: Prove that each integration target's domain state can flow through the pipeline without the target's actual runtime.

**Pattern**: For each target, create `tests/integration/<target>.adapter.test.ts` that:
1. Defines the target's `TState` type
2. Creates mock passes matching the target's actual processing stages
3. Asserts residue accumulation matches expected deposit shapes
4. Asserts final state matches expected output shape

#### Step 1.1 — grid-server adapter

```
tests/integration/grid-server.adapter.test.ts
```

```typescript
// TState shape
interface GateValidationState {
  envelopeId: string;
  nonce: string;
  targetPartition: string;
  secret: string;
  validationResult?: PolicyResult;
  verdict?: PolicyVerdict;
}

// Passes to implement
// 1. timestampPass (builtin)
// 2. nonceValidationPass — calls GateSecurityPolicy.validateNonce(), deposits result
// 3. secretValidationPass — reads nonce result from residue, calls validateSecret()
// 4. verdictPass — reads all prior policy results, picks strictest verdict

// Test cases
// - Valid envelope → allow verdict, 4 residue entries
// - Burned nonce → deny at pass 2, remaining passes see deny in residue
// - Test secret in prod → deny at pass 3
// - Residue trail is complete even on deny (no early exit)
```

#### Step 1.2 — glimpse-server adapter

```
tests/integration/glimpse-server.adapter.test.ts
```

```typescript
// TState shape (mirrors glimpse-engine pipeline output subset)
interface GlimpseAnalysisState {
  records: unknown[];
  entities: Array<{ id: string; name: string; type: string }>;
  relations: Array<{ id: string; source: string; target: string }>;
  evidences: unknown[];
  contextLenses: Array<{ label: string; score: number }>;
  confidenceReport?: { overallScore: number };
}

// Passes to implement
// 1. timestampPass (builtin)
// 2. entityExtractionPass — populates entities from records
// 3. relationBuildPass — reads entities from residue, builds relations
// 4. inferencePass — multi-pass rule evaluation, deposits evidence
// 5. confidencePass (builtin, with custom scorer)
// 6. summaryPass — reads all residue, produces analysis summary

// Test cases
// - Empty records → entities=[], relations=[], confidence low
// - 3 entities → relations built, evidence accumulated
// - Confidence scorer reads entity count from state
// - Summary pass sees 5 prior residue entries
```

#### Step 1.3 — echoes-server adapter

```
tests/integration/echoes-server.adapter.test.ts
```

```typescript
// TState shape
interface AuditProcessingState {
  events: Array<{ source: string; tool: string; status: string; timestamp: string }>;
  validated: Array<{ eventIndex: number; policyResult: PolicyResult }>;
  stats?: { total: number; allowed: number; denied: number };
}

// Passes to implement
// 1. auditMarkPass('echoes-server') (builtin)
// 2. integrityPass — validates each event via AuditIntegrityGuard
// 3. statsPass — reads validation results, computes aggregate stats

// Test cases
// - All valid events → stats.denied = 0
// - Stale timestamp → denied count increments
// - Unknown source → denied count increments
// - Stats pass reads integrity deposits correctly
```

#### Step 1.4 — afloat-server adapter

```
tests/integration/afloat-server.adapter.test.ts
```

```typescript
// TState shape
interface WorkflowExecutionState {
  workflowId: string;
  steps: Array<{ id: string; type: string; config: Record<string, unknown> }>;
  currentStep: number;
  results: Record<string, unknown>;
  status: 'pending' | 'running' | 'complete' | 'failed';
}

// Passes to implement (async pipeline)
// 1. timestampPass
// 2. validationPass — validates step configs
// 3. executionPass — runs each step, deposits per-step results
// 4. reconciliationPass — reads all step results, determines final status

// Test cases
// - 3-step workflow completes → status='complete', 4 residue entries
// - Step 2 fails → status='failed', residue shows failure point
// - Empty workflow → status='complete' immediately
// - Async pipeline correctly awaits each pass
```

#### Step 1.5 — seeds-server adapter

```
tests/integration/seeds-server.adapter.test.ts
```

```typescript
// TState shape
interface HealthScoringState {
  repos: Array<{ name: string; lastCommit: string; openIssues: number; ciStatus: string }>;
  scores: Record<string, number>;
  overallScore?: number;
}

// Passes to implement
// 1. timestampPass
// 2. repoScoringPass — scores each repo individually
// 3. aggregatePass — reads all scores, computes overall

// Test cases
// - 3 healthy repos → overallScore > 0.8
// - 1 failing CI → that repo's score < 0.5, overall drops
// - Empty repos → overallScore = 0
```

**Execution rule**: Write ALL adapter tests first. They will fail (no adapter implementations exist yet). This is the red phase.

---

### Phase 2: Adapter Implementations (Make Tests Green)

For each target, create `src/adapters/<target>.ts` containing the domain-specific passes.

#### Step 2.1 — File structure

```
src/adapters/
  grid-server.ts       — GateValidationState + 3 domain passes
  glimpse-server.ts    — GlimpseAnalysisState + 4 domain passes
  echoes-server.ts     — AuditProcessingState + 2 domain passes
  afloat-server.ts     — WorkflowExecutionState + 3 async domain passes
  seeds-server.ts      — HealthScoringState + 2 domain passes
```

#### Step 2.2 — Implementation order (by risk, ascending)

| Order | Target | Why this order |
|-------|--------|----------------|
| 1 | seeds-server | Simplest state, pure scoring, 2 passes |
| 2 | echoes-server | Simple state, uses existing AuditIntegrityGuard |
| 3 | grid-server | Medium state, uses existing GateSecurityPolicy |
| 4 | glimpse-server | Medium state, bridges to Glimpse analysis |
| 5 | afloat-server | Complex state, async pipeline, workflow orchestration |

#### Step 2.3 — Per-adapter implementation checklist

For each adapter:
- [ ] Define `TState` interface (export from adapter module)
- [ ] Implement each `Pass<TState>` or `AsyncPass<TState>`
- [ ] Each pass deposits under a namespaced key (e.g., `gate:nonce-check`)
- [ ] Each pass reads prior residue via `findResidue` / `readDeposit` (not state)
- [ ] Run adapter tests → all green
- [ ] Run full suite → no regressions (32 foundation + N adapter tests)

**Gate**: Phase 2 is complete when `npm test` reports 0 failures across all test files.

---

### Phase 3: Contract Tests (Cross-Package Verification)

**Goal**: Verify that pipeline outputs satisfy the data contracts consumed by downstream systems.

#### Step 3.1 — Audit contract (`shared-types/emitAudit` compatibility)

```
tests/contracts/audit-contract.test.ts
```

```typescript
// Assert: auditMarkPass deposits are structurally compatible with AuditEvent
// Assert: pipeline residue timestamps are valid ISO strings
// Assert: pipeline pipelineId can serve as audit `source` field
```

#### Step 3.2 — Snapshot contract (seeds snapshot compatibility)

```
tests/contracts/snapshot-contract.test.ts
```

```typescript
// Assert: seeds adapter final state contains `overallScore` (number)
// Assert: seeds adapter final state contains `repos[].healthScore` (number)
// Assert: values are within [0, 1] range
```

#### Step 3.3 — PolicyResult contract (security-policy compatibility)

```
tests/contracts/policy-contract.test.ts
```

```typescript
// Assert: grid-server adapter deposits contain valid PolicyResult shapes
// Assert: verdict values are from PolicyVerdict union
// Assert: policyId follows P-XXX-NNN format
```

**Gate**: Phase 3 tests import types from `@cascade/shared-types` directly. They fail if shared-types changes break the contract.

---

### Phase 4: Live Integration Tests (Wire to Real Servers)

**Goal**: Run pipeline through actual MCP server tool handlers.

#### Step 4.1 — grid-server integration

```
grid-server/tests/pipeline-integration.test.ts
```

- Import `createPipeline` from `@cascade/shared-pipeline`
- Import actual `GateSecurityPolicy` from `@cascade/shared-types/security-policy`
- Create gate validation pipeline with real policy calls
- Assert: pipeline result matches existing `validate_envelope` tool output shape

#### Step 4.2 — echoes-server integration

```
echoes-server/tests/pipeline-integration.test.ts
```

- Import pipeline + `AuditIntegrityGuard`
- Feed real audit events through pipeline
- Assert: validated events match `record_audit` + `query_audit` expectations

#### Step 4.3 — glimpse-server integration

```
glimpse-server/tests/pipeline-integration.test.ts
```

- Import pipeline
- Feed sample dataset through glimpse analysis pipeline
- Assert: output shape matches `glimpse_analyze` tool response

**Gate**: Each server's existing tests MUST still pass after pipeline integration. `npm test` in each server directory → 0 failures.

---

### Phase 5: Glimpse Engine Bridge (JS → TS Migration Path)

**Goal**: Prove that the existing `glimpse-engine/core/multi-pass.js` 3-pass pattern can be expressed as `@cascade/shared-pipeline` passes.

#### Step 5.1 — Shape mapping test

```
tests/migration/glimpse-engine-shape.test.ts
```

```typescript
// Map the existing Glimpse pipeline state to a TState:
interface GlimpseEngineState {
  records: unknown[];
  profile: { flags: Record<string, boolean> };
  entities: unknown[];
  relations: unknown[];
  evidences: unknown[];
  entityLensScores: Record<string, Record<string, number>>;
  lensBuckets: Record<string, { score: number; evidenceIds: string[] }>;
  ruleTraces: unknown[];
  confidenceFrame: { gaps: unknown[]; inferences: unknown[] };
}

// Assert: existing multi-pass.js output shape is assignable to GlimpseEngineState
// Assert: each pass (rule eval, cross-ref, consolidation) can be a Pass<GlimpseEngineState>
// Assert: residue accumulation preserves the same evidence/confidence data
```

#### Step 5.2 — Equivalence test

```
tests/migration/glimpse-engine-equivalence.test.ts
```

- Run same sample data through both:
  - Original: `runMultiPassInference()` from `glimpse-engine/core/multi-pass.js`
  - Pipeline: equivalent 3-pass `createPipeline<GlimpseEngineState>` with adapted passes
- Assert: entity lens scores match
- Assert: evidence counts match
- Assert: contradiction detection results match

**Gate**: This phase does NOT replace `glimpse-engine`. It proves the migration path is viable. The actual migration is a separate initiative.

---

## 5. Vertical Integration Dependency Graph

```
Phase 0: Foundation (DONE)
    │
    ▼
Phase 1: Adapter Tests (red)
    │  Write failing tests for all 5 targets
    │  No implementation code yet
    │
    ▼
Phase 2: Adapter Implementations (green)
    │  Implement adapters in risk-ascending order
    │  Each adapter makes its tests green
    │  Full suite stays green throughout
    │
    ▼
Phase 3: Contract Tests
    │  Cross-package type verification
    │  Imports from @cascade/shared-types
    │  Catches breaking changes at boundary
    │
    ▼
Phase 4: Live Integration
    │  Tests live in each MCP server's test dir
    │  Wire pipeline to real tool handlers
    │  Existing server tests must not break
    │
    ▼
Phase 5: Glimpse Engine Bridge
    │  Shape mapping + equivalence proof
    │  Does NOT replace glimpse-engine
    │  Proves migration viability only
```

### Build Order Impact

Current build order (from root CLAUDE.md):
```
1. shared-types
2. shared-resilience
3. shared-pipeline  ← NEW (depends on shared-types)
4. MCP servers      ← now optionally depend on shared-pipeline
5. glimpse-artifact
```

`shared-pipeline` slots between `shared-resilience` and the MCP servers. It has one dependency (`@cascade/shared-types`) and zero circular dependencies.

---

## 6. Risk Registry

| Risk | Impact | Mitigation |
|------|--------|------------|
| TState explosion — overly complex domain states | Adapter complexity, hard-to-debug pipelines | Cap at 10 state fields per adapter; split into sub-pipelines if larger |
| Residue size growth in long pipelines | Memory pressure, slow freeze operations | Monitor `durationMs`; add `maxResidue` option if > 50 passes needed |
| Frozen residue blocks legitimate read patterns | Adapter authors confused by TypeError on mutation | Clear error message in docs; residue query helpers handle all read patterns |
| Async pass error propagation | Unhandled rejections crash pipeline | Phase 4 tests must cover async error cases; consider `onError` hook |
| Glimpse engine bridge (Phase 5) state size | GlimpseEngineState is very large (~20 fields) | Use sub-state pattern: pipeline operates on slice, maps back to full state |
| shared-types breaking change | Contract tests in Phase 3 fail | Contract tests are the early warning system — that's their purpose |

---

## 7. Success Criteria

| Phase | Metric | Target |
|-------|--------|--------|
| 0 | Foundation tests | 32/32 pass (ACHIEVED) |
| 1 | Adapter test count | >= 25 failing tests across 5 adapters |
| 2 | Adapter test pass rate | 100% (all red → green) |
| 3 | Contract tests | >= 9 tests covering 3 contracts |
| 4 | Integration tests | >= 6 tests across 3 servers, 0 regressions |
| 5 | Equivalence proof | Entity lens scores match within 0.01 tolerance |
| All | Total test count | >= 72 |
| All | Build time | < 3s for full `npm run build` |
| All | Test time | < 5s for full `npm test` |
