# DRIFTGUARD PHASE 1 HANDOFF SCHEMA

## Structured Input for Planning/Research Agent

**Handoff ID**: DG-P1-001
**Date**: 2026-03-31
**From**: Implementation Agent
**To**: Planning/Research Agent
**Priority**: P0 - BLOCKING
**Estimated Duration**: 8 hours
**Dependencies**: None (foundational)

---

## 1. EXECUTIVE CONTEXT

### What Exists Now

DriftGuard is a **functional but monolithic** anti-drift subsystem with:

- **1 monolithic file**: `core/drift-guard/index.js` (595 lines, 4 classes, complexity 97)
- **1 test file**: `tests/drift-guard/orchestrator.test.js` (249 lines)
- **~71% test coverage** (estimated)
- **0% integration coverage** with Glimpse pipeline

### The Problem

The monolithic structure blocks:

- Parallel development (merge conflicts likely)
- Isolated testing (must import entire module)
- Tree-shaking (bundlers can't optimize)
- Code comprehension (595 lines = cognitive overload)

### What Needs to Happen

**Phase 1: Split monolith into focused modules** (THIS HANDOFF)

- Break `index.js` into 5 files by responsibility
- Maintain 100% backward compatibility (exports remain same)
- Keep all existing tests passing
- Prepare for Phase 2 (test expansion)

---

## 2. SPECIFIC TASKS (CHECKLIST FORMAT)

### Task 2.1: Create Directory Structure

```
current:
core/drift-guard/
├── index.js          ← 595 lines, complexity 97
└── adapter.js

target:
core/drift-guard/
├── core/             ← NEW DIRECTORY
│   ├── formulas.js   ← DriftFormulas (extract)
│   ├── detector.js   ← DriftDetector (extract)
│   ├── resolver.js   ← DriftResolver (extract)
│   ├── telemetry.js  ← DriftTelemetry (extract)
│   └── guard.js      ← DriftGuard (extract)
├── adapter.js        ← keep existing
└── index.js          ← barrel exports only (30 lines)
```

**Instructions**:

1. Create `core/drift-guard/core/` directory
2. Copy existing `index.js` to backup: `index.js.bak`
3. Keep `adapter.js` untouched

### Task 2.2: Extract DriftFormulas

**Source Location**: `core/drift-guard/index.js`, lines 26-120 (approx)

**Target Location**: `core/drift-guard/core/formulas.js`

**Extraction Rules**:

```javascript
// What moves:
- class DriftFormulas
- static methods: computeHash, isDrift, calculateSeverity
- static methods: coverageGap, compoundSeverity, suggestAdjustment
- Any private helper functions used ONLY by DriftFormulas

// What stays:
- Constants (keep in index.js if shared)
- Other classes (DriftDetector, etc.)

// What to add:
- Top-level exports for individual functions
- JSDoc for each method
- Single import at top: import { createHash } from 'node:crypto';
```

**Validation Steps**:

```bash
# After extraction, verify:
node -e "import('./core/drift-guard/core/formulas.js').then(m => {
  console.log('Exports:', Object.keys(m));
  // Should show: DriftFormulas, computeHash, isDrift, etc.
})"
```

### Task 2.3: Extract DriftDetector

**Source Location**: `core/drift-guard/index.js`, lines ~121-250

**Target Location**: `core/drift-guard/core/detector.js`

**Extraction Rules**:

```javascript
// What moves:
- class DriftDetector
- constructor with config handling
- method: extractEmbeddedYaml
- method: detect
- Private helper: getFileStats (if exists)
- Private helper: resolve (if exists)

// Dependencies to import:
- import { readFileSync, existsSync, statSync } from 'node:fs'
- import { fileURLToPath } from 'node:url'
- import path from 'node:path'
- import { DriftFormulas } from './formulas.js'

// What to export:
- export { DriftDetector }
- export { extractEmbeddedYaml } // if made standalone
```

**Validation Steps**:

```bash
# Test file read functionality
node -e "import('./core/drift-guard/core/detector.js').then(async m => {
  const d = new m.DriftDetector({root: '.'});
  console.log('Detector created:', !!d);
})"
```

### Task 2.4: Extract DriftResolver

**Source Location**: `core/drift-guard/index.js`, lines ~251-380

**Target Location**: `core/drift-guard/core/resolver.js`

**Extraction Rules**:

```javascript
// What moves:
- class DriftResolver
- constructor with policy handling
- method: decide
- method: execute (the async one with child_process)
- Constants: DRIFT_POLICIES (import from index or duplicate?)

// Dependencies to import:
- import { exec } from 'node:child_process' // for execute method
- import { promisify } from 'node:util'

// What to export:
- export { DriftResolver }
- export { DRIFT_POLICIES } // if not importing from elsewhere
```

**Note on DRIFT_POLICIES**:
Option A: Keep in resolver.js (it's used by resolver.decide)
Option B: Create separate `core/drift-guard/core/policies.js`
**Recommendation**: Keep in resolver.js for now (YAGNI principle)

### Task 2.5: Extract DriftTelemetry

**Source Location**: `core/drift-guard/index.js`, lines ~381-520

**Target Location**: `core/drift-guard/core/telemetry.js`

**Extraction Rules**:

```javascript
// What moves:
- class DriftTelemetry
- constructor with config
- method: log
- method: saveState
- method: loadState
- method: analyzeTrends
- method: ensureDirectories
- Constants: DEFAULT_STATE_PATH, LOG_PATH (if file-specific)

// Dependencies to import:
- import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
- import path from 'node:path'

// What to export:
- export { DriftTelemetry }
- export { DEFAULT_STATE_PATH, LOG_PATH } // if needed externally
```

### Task 2.6: Extract DriftGuard (Orchestrator)

**Source Location**: `core/drift-guard/index.js`, lines ~521-650

**Target Location**: `core/drift-guard/core/guard.js`

**Extraction Rules**:

```javascript
// What moves:
- class DriftGuard
- constructor (imports detector, resolver, telemetry)
- method: guard (the main orchestrator)
- method: ci
- method: health
- Constants: VERSION

// Dependencies to import:
- import { DriftDetector } from './detector.js'
- import { DriftResolver, DRIFT_POLICIES } from './resolver.js'
- import { DriftTelemetry } from './telemetry.js'

// What to export:
- export { DriftGuard }
- export { VERSION }
- export { createDriftGuard } // factory function
```

### Task 2.7: Create Barrel Index

**Target Location**: `core/drift-guard/index.js` (OVERWRITE)

**Contents**:

```javascript
/**
 * @file core/drift-guard/index.js
 * @description Barrel exports for DriftGuard subsystem
 */

// Formulas (pure functions, no side effects)
export {
  DriftFormulas,
  // Individual utilities
  computeHash,
  isDrift,
  calculateSeverity,
  coverageGap,
  compoundSeverity,
  suggestAdjustment,
} from "./core/formulas.js";

// Detector (stateless inspection)
export { DriftDetector } from "./core/detector.js";

// Resolver (decision engine)
export { DriftResolver, DRIFT_POLICIES } from "./core/resolver.js";

// Telemetry (state persistence)
export { DriftTelemetry } from "./core/telemetry.js";

// Main orchestrator
export { DriftGuard, VERSION, createDriftGuard } from "./core/guard.js";

// Re-export policies for convenience
export { DRIFT_POLICIES } from "./core/resolver.js";

// Re-export adapter (existing file)
export { withDriftProtection, createGuardedFrame } from "./adapter.js";
```

**Validation**:

```bash
# This MUST work after refactoring:
node -e "import('./core/drift-guard/index.js').then(m => {
  console.log('✓ All exports available:');
  console.log('  - DriftGuard:', !!m.DriftGuard);
  console.log('  - DriftFormulas:', !!m.DriftFormulas);
  console.log('  - createDriftGuard:', !!m.createDriftGuard);
  console.log('  - DRIFT_POLICIES:', !!m.DRIFT_POLICIES);
})"
```

---

## 3. TESTING REQUIREMENTS

### 3.1 Regression Testing Command

**MUST PASS before handoff complete**:

```bash
cd /home/caraxes/CascadeProjects/glimpse-engine

# Run all existing DriftGuard tests
node --test tests/drift-guard/*.test.js

# Expected: All 16 tests pass
# If any fail, STOP and fix
```

### 3.2 Import Validation Commands

**Validate each module loads independently**:

```bash
# Test 1: Formulas
node -e "import('./core/drift-guard/core/formulas.js').then(m => {
  const h = m.DriftFormulas.computeHash('test');
  console.log('Formulas OK:', h.length === 16);
})"

# Test 2: Detector
node -e "import('./core/drift-guard/core/detector.js').then(m => {
  const d = new m.DriftDetector({root: '.'});
  console.log('Detector OK:', d instanceof m.DriftDetector);
})"

# Test 3: Resolver
node -e "import('./core/drift-guard/core/resolver.js').then(m => {
  const r = new m.DriftResolver(m.DRIFT_POLICIES.ADAPTIVE);
  console.log('Resolver OK:', r.policy.id === 'adaptive');
})"

# Test 4: Telemetry
node -e "import('./core/drift-guard/core/telemetry.js').then(m => {
  const t = new m.DriftTelemetry();
  console.log('Telemetry OK:', !!t.log);
})"

# Test 5: Guard
node -e "import('./core/drift-guard/core/guard.js').then(m => {
  const g = m.createDriftGuard();
  console.log('Guard OK:', g instanceof m.DriftGuard);
})"

# Test 6: Full barrel
node -e "import('./core/drift-guard/index.js').then(m => {
  console.log('Barrel OK:',
    !!m.DriftGuard &&
    !!m.DriftFormulas &&
    !!m.createDriftGuard
  );
})"
```

### 3.3 Engine Integration Test

**CRITICAL - Must not break existing engine**:

```bash
# This imports through core/engine.js
node -e "import('./core/engine.js').then(m => {
  console.log('Engine integration OK:');
  console.log('  - DriftGuard:', !!m.DriftGuard);
  console.log('  - createDriftGuard:', !!m.createDriftGuard);
  console.log('  - DRIFT_POLICIES:', !!m.DRIFT_POLICIES);
})"
```

---

## 4. ARCHITECTURE CONSTRAINTS

### 4.1 Hard Constraints (MUST NOT VIOLATE)

1. **Backward Compatibility**: All existing exports must remain available

   ```javascript
   // This import MUST work after refactoring:
   import { DriftGuard, DriftFormulas } from "./core/drift-guard/index.js";
   ```

2. **Test Compatibility**: All existing tests must pass without modification

   - Do NOT change test file paths
   - Do NOT change test assertions
   - Do NOT change exported function signatures

3. **No New Dependencies**: Only use existing Node.js built-ins

   - ✅ fs, path, crypto, child_process
   - ❌ No npm packages

4. **File Size Targets**:
   - Each file < 200 lines
   - Each class complexity < 50

### 4.2 Soft Constraints (PREFER but can negotiate)

1. **Naming**: Keep class names (DriftGuard, DriftFormulas, etc.)
2. **Constructor signatures**: Don't change what parameters they accept
3. **Method signatures**: Keep public methods unchanged
4. **Error messages**: Keep existing error strings

### 4.3 Code Style Requirements

```javascript
// Use JSDoc for all public methods
/**
 * Calculates drift severity based on line differential
 * @param {number} lineDiff - Positive or negative line count difference
 * @returns {'critical'|'high'|'medium'|'none'} Severity level
 */
static calculateSeverity(lineDiff) {
  // implementation
}

// Use ES modules (import/export)
// Use async/await (not callbacks)
// Use const/let (not var)
```

---

## 5. RESOURCE LOCATIONS

### 5.1 Source Files (Reference)

| Purpose           | Path                                 | Lines | Notes      |
| ----------------- | ------------------------------------ | ----- | ---------- |
| Current monolith  | `core/drift-guard/index.js`          | 595   | SPLIT THIS |
| Adapter (untouch) | `core/drift-guard/adapter.js`        | 120   | Keep as-is |
| Formulas target   | `core/drift-guard/core/formulas.js`  | NEW   | Create     |
| Detector target   | `core/drift-guard/core/detector.js`  | NEW   | Create     |
| Resolver target   | `core/drift-guard/core/resolver.js`  | NEW   | Create     |
| Telemetry target  | `core/drift-guard/core/telemetry.js` | NEW   | Create     |
| Guard target      | `core/drift-guard/core/guard.js`     | NEW   | Create     |

### 5.2 Documentation (Reference)

| Document                               | Purpose                |
| -------------------------------------- | ---------------------- |
| `docs/drift-guard-improvement-plan.md` | Implementation roadmap |
| `COVERAGE-DEBT-ANALYSIS.md`            | Research findings      |
| `docs/drift-guard-usage-patterns.md`   | API usage examples     |
| `docs/drift-guard-cli-reference.md`    | CLI commands           |

### 5.3 Tests (MUST Pass)

| Test File                                | Cases | Purpose            |
| ---------------------------------------- | ----- | ------------------ |
| `tests/drift-guard/orchestrator.test.js` | 16    | Current validation |

---

## 6. SUCCESS CRITERIA

### 6.1 Functional Requirements

- [ ] 6 new files exist in `core/drift-guard/core/`
- [ ] `core/drift-guard/index.js` is only barrel exports (<50 lines)
- [ ] All 16 existing tests pass
- [ ] 6 import validation commands return "OK"
- [ ] Engine integration test passes
- [ ] No duplicate exports in barrel

### 6.2 Quality Metrics

| Metric          | Before | After | Validation                         |
| --------------- | ------ | ----- | ---------------------------------- | ------ |
| Max lines/file  | 595    | <200  | `wc -l core/drift-guard/core/*.js` |
| Max complexity  | 97     | <50   | Code review + jscpd                |
| Files           | 2      | 7     | `ls core/drift-guard/\*_/_.js      | wc -l` |
| Test pass rate  | 16/16  | 16/16 | `node --test`                      |
| Backward compat | 100%   | 100%  | Import validation                  |

### 6.3 Definition of Done

```markdown
✅ All code extracted to focused modules
✅ Barrel exports created
✅ All tests pass
✅ No functionality changed (only moved)
✅ Documentation updated (add file structure to docs)
✅ Commit with message: "refactor(driftguard): split monolith into focused modules"
✅ PR created with "Phase 1 Complete" label
```

---

## 7. RISK MITIGATION

### 7.1 Risk: Breaking Changes

**Mitigation**:

- Keep `index.js.bak` until Phase 2 starts
- Run all validation commands before committing
- Have rollback plan: `mv index.js.bak index.js`

### 7.2 Risk: Import Cycles

**Prevention**:

```
✅ Correct: Guard → Detector, Resolver, Telemetry
✅ Correct: Detector → Formulas
✅ Correct: Resolver → Policies
❌ Wrong: Detector → Guard (cycle)

Check for cycles:
npx madge --circular core/drift-guard/
```

### 7.3 Risk: Missing Exports

**Detection**:

```bash
# List all exports before and after
grep "export " core/drift-guard/index.js.bak > exports-before.txt
grep "export " core/drift-guard/index.js > exports-after.txt
diff exports-before.txt exports-after.txt
# Should be empty (no missing exports)
```

---

## 8. DECISION LOG

### Decisions Made (Don't Revisit)

1. **Keep DRIFT_POLICIES in resolver.js** (not separate file)

   - Reason: Only used by resolver, YAGNI

2. **Don't create separate types.js yet**

   - Reason: Can add later if TypeScript definitions needed

3. **Keep VERSION in guard.js**

   - Reason: It's a DriftGuard constant

4. **Keep barrel exports simple** (no re-organization)
   - Reason: Phase 2 will reorganize if needed

### Decisions to Make (Agent Authority)

1. **Whether to extract private helpers**

   - If function is >20 lines and used by only one class → extract to file
   - Else → keep as private method

2. **Whether to rename anything**
   - Default: NO (keep names for backward compat)
   - Exception: If name is misleading, can rename with alias export

---

## 9. COMMUNICATION PROTOCOLS

### If Blocked

1. Check this handoff document for instructions
2. Check `docs/drift-guard-improvement-plan.md` for context
3. If still blocked: Create `.handoff/BLOCKED.md` with:
   - What you were doing
   - Expected behavior
   - Actual behavior
   - Error message
   - Attempted solutions

### If Scope Creep Detected

**Stick to Phase 1 only**:

- ✅ File splitting
- ✅ Barrel exports
- ✅ Test compatibility
- ❌ New features
- ❌ Bug fixes (unless breaking)
- ❌ Performance optimization
- ❌ Documentation beyond file structure

### When Complete

Create `.handoff/PHASE1-COMPLETE.md` with:

```markdown
# Phase 1 Complete

## Summary

- Files created: [list]
- Tests passing: [count/16]
- Lines per file: [list]
- Complexity per file: [estimate]

## Validation Results
```

[output of all 6 validation commands]

```

## Notes for Phase 2 Agent
- Any gotchas discovered
- Any deferred decisions
- Recommended first task for Phase 2
```

---

## 10. APPENDIX: Quick Reference

### Current Class Locations in Monolith

```
index.js line ranges (approximate):
  1-25   → Constants, imports
  26-120 → class DriftFormulas
  121-250 → class DriftDetector
  251-380 → class DriftResolver (+ DRIFT_POLICIES)
  381-520 → class DriftTelemetry
  521-650 → class DriftGuard (+ factory functions)
  650-715 → Barrel exports
```

### Dependency Graph

```
index.js (barrel)
  ├── formulas.js (no deps)
  ├── detector.js → formulas
  ├── resolver.js → (no internal deps, but uses DRIFT_POLICIES)
  ├── telemetry.js → (no internal deps)
  └── guard.js → detector, resolver, telemetry, policies

adapter.js (untouched)
  └── imports from guard (indirectly through barrel)
```

### Export Map (Must Preserve)

```javascript
// These must remain exported from barrel:
DriftGuard;
DriftFormulas;
DriftDetector;
DriftResolver;
DriftTelemetry;
DRIFT_POLICIES;
createDriftGuard;
withDriftProtection; // from adapter
createGuardedFrame; // from adapter
```

---

**END OF HANDOFF**
**Next Expected Output**: `.handoff/PHASE1-COMPLETE.md` or `.handoff/BLOCKED.md`
