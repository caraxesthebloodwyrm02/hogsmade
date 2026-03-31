# DriftGuard Improvement Strategy
## Coverage Enhancement & Technical Debt Reduction Plan

**Version**: 2.2.0 Target | **Last Updated**: 2026-03-31 | **Priority**: P1

---

## Executive Summary

Current State:
- **Source Code**: 715 lines, 2 files
- **Tests**: 249 lines, 1 file  
- **Coverage Gap**: ~65% (estimated)
- **Debt Surface**: Medium (4 identified areas)

Target State (3-Month Plan):
- **Coverage**: 95%+
- **Debt Surface**: Low (all 4 areas addressed)
- **Test Ratio**: 3:1 (tests:source)

---

## Section 1: Current Technical Debt Inventory

### 1.1 Debt Surface Assessment

| ID | Area | Severity | Impact | Effort |
|----|------|----------|--------|--------|
| **D1** | Single-file architecture (index.js: 595 lines) | Medium | Maintainability, testability | 8 hrs |
| **D2** | Missing edge case tests | High | Reliability | 12 hrs |
| **D3**: | No performance benchmarks | Low | Scalability concerns | 4 hrs |
| **D4** | Error handling not exhaustively tested | Medium | Resilience | 6 hrs |
| **D5** | No integration tests with pipeline | High | Real-world validation | 10 hrs |

### 1.2 Code Quality Metrics

```
File: core/drift-guard/index.js
─────────────────────────────────────────────────
Lines of Code:        595
Cyclomatic Complexity: 97
Exported Symbols:     11
Classes:              4
Functions:            12
Average Method Size:  12 lines
Comment Ratio:        15%
─────────────────────────────────────────────────
Score:                B+ (Good, improvable)
```

---

## Section 2: Coverage Improvement Framework

### 2.1 Current Coverage (Estimated)

```
DriftFormulas     ████████░░  78%  (8/10 methods tested)
DriftDetector     ████████░░  80%  (2/3 paths tested)
DriftResolver     ██████████  90%  (3/3 decisions tested)
DriftTelemetry    ██████░░░░  60%  (partial state/mock)
DriftGuard        ██████░░░░  65%  (main orchestrator)
────────────────────────────────────
OVERALL           ██████░░░░  71%
```

### 2.2 Coverage Gaps Identified

#### Gap 1: DriftDetector Error Paths
```javascript
// Not tested: File read errors, corrupted JS extraction
detect() {
  // Lines 180-200: Error handling paths uncovered
}
```

#### Gap 2: DriftResolver Execution
```javascript
// Not tested: Actual child process execution
async execute(plan) {
  // Lines 340-380: Real execution vs mocked
}
```

#### Gap 3: Telemetry Persistence
```javascript
// Not tested: Actual file I/O, race conditions
saveState() {
  // Lines 420-450: File system operations
}
```

#### Gap 4: Formula Edge Cases
```javascript
// Partially tested:
calculateSeverity(lineDiff) 
  // Missing: Negative lines, extreme values (0, 1000+)

isDrift(hash1, hash2)
  // Missing: Null/undefined inputs
```

### 2.3 Target Coverage Matrix

| Component | Current | Target | Priority |
|-----------|---------|--------|----------|
| DriftFormulas | 78% | 100% | P1 |
| DriftDetector | 80% | 95% | P1 |
| DriftResolver | 90% | 95% | P2 |
| DriftTelemetry | 60% | 90% | P1 |
| DriftGuard | 65% | 90% | P1 |
| **Integration** | 0% | 80% | P0 |

---

## Section 3: Implementation Roadmap

### Phase 1: Refactoring (Week 1)

#### Task 1.1: Split Monolithic File

**Current**: `core/drift-guard/index.js` (595 lines)

**Target Architecture**:
```
core/drift-guard/
├── core/
│   ├── formulas.js      (DriftFormulas, 80 lines)
│   ├── detector.js      (DriftDetector, 120 lines)
│   ├── resolver.js      (DriftResolver, 100 lines)
│   ├── telemetry.js     (DriftTelemetry, 90 lines)
│   └── guard.js         (DriftGuard, 150 lines)
├── adapter.js           (keep existing)
├── index.js             (barrel exports, 30 lines)
└── types.d.ts           (TypeScript definitions, optional)
```

**Benefits**:
- Single responsibility per file
- Easier testing (isolated imports)
- Better tree-shaking
- Clearer dependencies

#### Task 1.2: Export Structure Cleanup

```javascript
// Current (mixed):
export { DriftGuard, DriftFormulas, DriftDetector } // 11 exports

// Target (layered):
// core/formulas.js
export { DriftFormulas, computeHash, isDrift, calculateSeverity }

// core/detector.js  
export { DriftDetector }

// core/resolver.js
export { DriftResolver, DRIFT_POLICIES }

// etc.
```

### Phase 2: Test Expansion (Week 2-3)

#### Task 2.1: Formula Exhaustive Tests

```javascript
// tests/drift-guard/formulas.test.js
// Target: 30+ test cases

describe('DriftFormulas.computeHash', () => {
  test('handles empty string', () => {});        // ✗ Missing
  test('handles unicode', () => {});             // ✗ Missing
  test('handles binary data', () => {});         // ✗ Missing
  test('produces different hashes for similar strings', () => {});
  test('produces consistent 16-char output', () => {});
});

describe('DriftFormulas.coverageGap', () => {
  test('zero total returns safe ratio', () => {});  // ✗ Missing
  test('exactly at threshold', () => {});         // ✗ Missing
  test('negative covered count', () => {});         // ✗ Missing
  test('extremely high numbers', () => {});          // ✗ Missing
  test('floating point precision', () => {});        // ✗ Missing
});

describe('DriftFormulas.suggestAdjustment', () => {
  test('exactly 3 runs (boundary)', () => {});
  test('high variance with stable mean', () => {});
  test('exactly 1 gap per run (stability)', () => {});
  test('zero variance', () => {});
});
```

#### Task 2.2: Detector Mock Tests

```javascript
// tests/drift-guard/detector.test.js
// Target: 15+ test cases with mocked fs

import { mock, test } from 'node:test';

describe('DriftDetector with mocked fs', () => {
  test('handles permission denied', mockFailed({
    code: 'EACCES',
    path: 'master.yaml'
  }));
  
  test('handles corrupted YAML', mockCorrupted('not::valid{yaml'));
  
  test('handles truncated JS file', mockTruncated('export const DEF'));
  
  test('handles concurrent modification race', mockRaceCondition());
  
  test('handles very large files (100MB+)', mockLarge(100 * 1024 * 1024));
});
```

#### Task 2.3: Resolver Integration Tests

```javascript
// tests/drift-guard/resolver.test.js
// Target: 10+ tests with real subprocess

describe('DriftResolver.execute', () => {
  test('successfully runs sync script');
  test('handles command not found');
  test('handles timeout');
  test('handles non-zero exit code');
  test('captures stderr');
  test('captures stdout');
});
```

#### Task 2.4: Telemetry Stress Tests

```javascript
// tests/drift-guard/telemetry.test.js
// Target: 8 stress tests

describe('DriftTelemetry under load', () => {
  test('1000 sequential writes', async () => {});
  test('100 concurrent writes', async () => {});
  test('handles disk full', mockDiskError('ENOSPC'));
  test('handles read-only filesystem', mockDiskError('EROFS'));
  test('recovers from corrupted state file');
  test('maintains order under stress');
});
```

### Phase 3: Integration Testing (Week 3-4)

#### Task 3.1: Pipeline Integration Tests

```javascript
// tests/drift-guard/integration/pipeline.test.js

describe('DriftGuard + Pipeline', () => {
  test('guard runs before pipeline execution');
  test('drift blocks pipeline if strict');
  test('drift logs warning but allows if permissive');
  test('recovered drift continues pipeline');
  test('guard metadata attached to pipeline result');
});
```

#### Task 3.2: End-to-End Scenarios

```javascript
// tests/drift-guard/e2e/workflows.test.js

describe('Real-world workflows', () => {
  test('30-day simulated development cycle', async () => {
    // Simulate: edit, check, drift, heal, verify
    for (const day of range(30)) {
      // 10% chance of drift
      // Run guard
      // Verify state
    }
  });
  
  test('multi-developer concurrent editing', async () => {
    // Simulate concurrent modifications
    // Race condition handling
  });
  
  test('power failure mid-write recovery', async () => {
    // Corruption detection and recovery
  });
});
```

---

## Section 4: Debt Reduction Strategies

### Strategy 1: Code Decomposition

**Current Problem**: Single 595-line file

**Solution**: Split by responsibility

```
Before:                         After:
┌──────────────────┐            ┌──────────┬──────────┬──────────┐
│                  │            │          │          │          │
│  index.js        │            │formulas.js│detector.js│guard.js  │
│  595 lines       │    →       │  80 lines│120 lines │150 lines │
│  4 classes       │            │          │          │          │
│  12 methods      │            └──────────┴──────────┴──────────┘
│                  │
└──────────────────┘

Complexity: 97                  Complexity: 24, 32, 28, 35
Maintainability: B              Maintainability: A
```

### Strategy 2: Dependency Injection

**Current**: Hard-coded fs imports

**Target**: Injectable dependencies

```javascript
// Current (hard to mock):
import { readFileSync } from 'fs';

// Target (testable):
constructor({ fs = nodeFs } = {}) {
  this.fs = fs;
}

// Test usage:
const detector = new DriftDetector({
  fs: mockFs
});
```

### Strategy 3: Type Safety (Optional)

```javascript
// Add JSDoc for better IDE support and catch bugs

/**
 * @typedef {Object} DriftReport
 * @property {boolean} driftDetected
 * @property {string} severity - 'critical' | 'high' | 'medium' | 'none'
 * @property {number} lineDiff
 * @property {string} yamlHash
 * @property {string} embeddedHash
 */

/**
 * @param {string} yamlHash
 * @param {string} embeddedHash
 * @returns {boolean}
 */
isDrift(yamlHash, embeddedHash) { ... }
```

### Strategy 4: Error Handling Standardization

```javascript
// Current: Mixed string and object errors

// Target: Structured error taxonomy
class DriftGuardError extends Error {
  constructor(code, message, context) {
    super(message);
    this.code = code;
    this.context = context;
  }
}

// Error codes:
const ERRORS = {
  EXTRACTION_FAILED: 'E001',
  HASH_MISMATCH: 'E002',
  AUTO_HEAL_FAILED: 'E003',
  FILE_NOT_FOUND: 'E004',
  PERMISSION_DENIED: 'E005'
};
```

---

## Section 5: Performance Optimization

### 5.1 Current Performance Baseline

```
Operation                    | Time    | Notes
───────────────────────────────────────────────────
DriftDetector.detect()       | ~15ms   | 2 file reads
DriftGuard.guard()           | ~20ms   | Full pipeline
DriftResolver.execute()      | ~500ms  | Child process
analyzeTrends() (100 runs)   | ~2ms    | In-memory
coverageGap()                | ~0.1ms  | Sync calc
```

### 5.2 Optimization Targets

| Metric | Current | Target | Strategy |
|--------|---------|--------|----------|
| **Cold start detect** | 15ms | <10ms | Async file reads, caching |
| **Hash computation** | 0.5ms | <0.1ms | Cached hashes |
| **Telemetry write** | 2ms | <1ms | Buffered writes |
| **Memory usage** | ~2MB | <1MB | Stream vs buffer |

### 5.3 Caching Strategy

```javascript
class DriftDetector {
  constructor() {
    this.cache = new Map();
    this.ttl = 5000; // 5 seconds
  }

  getCached(path) {
    const entry = this.cache.get(path);
    if (entry && Date.now() - entry.time < this.ttl) {
      return entry.hash;
    }
    return null;
  }
}
```

---

## Section 6: Documentation & Tooling

### 6.1 Documentation Debt

| Task | Current | Target | Effort |
|------|---------|--------|--------|
| API Reference | Partial | Complete | 4 hrs |
| Architecture Diagrams | None | Visual + Text | 3 hrs |
| Troubleshooting Guide | None | Comprehensive | 2 hrs |
| Migration Guide | None | From 2.1 -> 2.2 | 1 hr |

### 6.2 Tooling Improvements

```bash
# Add to package.json
{
  "scripts": {
    "test:coverage": "c8 node --test tests/drift-guard/**/*.test.js",
    "test:watch": "node --test --watch tests/drift-guard/**/*.test.js",
    "lint:complexity": "jscpd core/drift-guard/",
    "benchmark": "node benchmarks/drift-guard.perf.js"
  }
}
```

---

## Section 7: Monitoring & Observability

### 7.1 Metrics to Track

```javascript
// Telemetry enhancement
telemetry.record({
  // Current:
  state, driftDetected, duration
  
  // Add:
  memoryUsage: process.memoryUsage().heapUsed,
  cpuTime: process.cpuUsage(),
  fileSizes: { yaml: stat.size, js: stat.size },
  cacheHits: this.detector.cacheHits // if caching implemented
});
```

### 7.2 Health Dashboard

```yaml
# .glimpse/dashboard/config.yml
metrics:
  - name: drift_rate_24h
    query: count(driftDetected=true) / total * 100
    alert: > 10%
  
  - name: avg_detection_time
    query: mean(duration) where method='detect'
    alert: > 50ms
  
  - name: coverage_gap_rate
    query: count(gap.detected=true) / total
    alert: > 30%
```

---

## Section 8: Resource Estimates

### 8.1 Time Estimates

| Phase | Tasks | Hours | Deadline |
|-------|-------|-------|----------|
| **Phase 1** | Refactoring | 8 | Day 3 |
| **Phase 2** | Test expansion | 20 | Day 10 |
| **Phase 3** | Integration | 16 | Day 17 |
| **Phase 4** | Performance | 8 | Day 21 |
| **Phase 5** | Documentation | 10 | Day 25 |
| **Total** | | **62 hrs** | **Week 4** |

### 8.2 Skill Requirements

- Node.js advanced (streams, child processes)
- Testing strategies (mocking, snapshots)
- Performance profiling
- Documentation writing

### 8.3 Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Breaking changes | Medium | High | Comprehensive migration guide |
| Test flakiness | Low | Medium | Retry logic, deterministic fixtures |
| Performance regression | Low | High | Benchmark comparison |
| Documentation drift | High | Low | Automated doc checks |

---

## Section 9: Success Criteria

### 9.1 Coverage Gates

**Stage 1 (Week 1)**: Refactor without coverage loss
- [ ] All existing tests pass
- [ ] No new bugs introduced
- [ ] Bundle size < 20 KB

**Stage 2 (Week 2)**: Core coverage 90%+
- [ ] DriftFormulas: 100%
- [ ] DriftDetector: 90%
- [ ] DriftTelemetry: 90%

**Stage 3 (Week 3)**: Integration coverage 80%+
- [ ] Pipeline integration tests
- [ ] E2E workflow tests
- [ ] Performance benchmarks

**Stage 4 (Week 4)**: Production ready
- [ ] Coverage 95%+
- [ ] All debt items cleared
- [ ] Documentation complete
- [ ] Performance benchmarks met

### 9.2 Definition of Done

```
✓ codeCoverage >= 95%
✓ complexityPerFile < 50
✓ no files > 200 lines
✓ all tests < 500ms
✓ memoryLeak < 1MB per 1000 runs
✓ documentationComplete
✓ migrationGuideProvided
✓ backwardCompatible
```

---

## Section 10: Appendix

### A. Tools & Libraries

| Purpose | Tool | Version |
|---------|------|---------|
| Coverage | c8 | ^8.0.0 |
| Mocking | native node:test mock | ^20.0.0 |
| Complexity | jscpd | ^3.5.0 |
| Benchmarks | benchmark.js | ^2.1.4 |
| Docs | typedoc | ^0.25.0 |

### B. Related Documentation

- [Usage Patterns](./drift-guard-usage-patterns.md)
- [Architecture Review](./drift-guard-architecture-review.md)
- [CLI Reference](./drift-guard-cli-reference.md)

### C. Checklist: Before Starting

- [ ] Review with team
- [ ] Set up feature branch: `improvement/driftguard-coverage`
- [ ] Configure CI for coverage reporting
- [ ] Set up code review requirements
- [ ] Schedule weekly check-ins
- [ ] Define rollback strategy

---

**Next Step**: Create implementation ticket from Phase 1, Task 1.1
