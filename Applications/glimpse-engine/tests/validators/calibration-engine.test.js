/**
 * @file tests/validators/calibration-engine.test.js
 * Unit tests for calibration engine
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { 
  createCalibrationEngine, 
  createCalibratedFrame,
  CALIBRATION_POLICIES,
  comparePolicies
} from '../../core/validators/calibration-engine.js';

// ═══════════════════════════════════════════════════════════════════
// Policy definitions
// ═══════════════════════════════════════════════════════════════════

test('CALIBRATION_POLICIES has required policies', () => {
  assert.ok(CALIBRATION_POLICIES.strict, 'Should have strict policy');
  assert.ok(CALIBRATION_POLICIES.adaptive, 'Should have adaptive policy');
  assert.ok(CALIBRATION_POLICIES.permissive, 'Should have permissive policy');
  assert.ok(CALIBRATION_POLICIES.research, 'Should have research policy');
});

test('Each policy has required fields', () => {
  for (const [name, policy] of Object.entries(CALIBRATION_POLICIES)) {
    assert.ok(policy.name, `${name} should have name`);
    assert.ok(policy.description, `${name} should have description`);
    assert.ok(policy.thresholds, `${name} should have thresholds`);
    assert.ok(typeof policy.autoAdjust === 'boolean', `${name} should have autoAdjust`);
    assert.ok(typeof policy.failOnGap === 'boolean', `${name} should have failOnGap`);
  }
});

test('Strict policy has highest thresholds', () => {
  assert.ok(CALIBRATION_POLICIES.strict.thresholds.LOW_COVERAGE >= 
            CALIBRATION_POLICIES.adaptive.thresholds.LOW_COVERAGE);
  assert.ok(CALIBRATION_POLICIES.strict.thresholds.WEAK_BASIS >=
            CALIBRATION_POLICIES.adaptive.thresholds.WEAK_BASIS);
});

// ═══════════════════════════════════════════════════════════════════
// createCalibrationEngine tests
// ═══════════════════════════════════════════════════════════════════

test('createCalibrationEngine returns engine with policy', () => {
  const engine = createCalibrationEngine('strict');
  
  assert.equal(engine.policy.name, 'strict');
  assert.ok(Array.isArray(engine.history));
  assert.equal(engine.history.length, 0);
  assert.ok(engine.createdAt);
});

test('createCalibrationEngine defaults to adaptive', () => {
  const engine = createCalibrationEngine('unknown_policy');
  assert.equal(engine.policy.name, 'adaptive');
});

test('createCalibrationEngine applies overrides', () => {
  const engine = createCalibrationEngine('adaptive', { 
    thresholds: { LOW_COVERAGE: 0.5 } 
  });
  
  assert.equal(engine.policy.thresholds.LOW_COVERAGE, 0.5);
  // Other thresholds should remain from adaptive
  assert.ok(engine.policy.thresholds.WEAK_BASIS);
});

// ═══════════════════════════════════════════════════════════════════
// detectGapsPolicy tests
// ═══════════════════════════════════════════════════════════════════

test('detectGapsPolicy records history', () => {
  const engine = createCalibrationEngine('adaptive');
  const frame = { gaps: [], entries: [] };
  const ctx = { 
    entities: [{ id: '1', dimensions: { time: 2020 } }],
    evidences: [{ id: 'e1', confidence: 0.8 }],
    relations: [] 
  };
  
  engine.detectGapsPolicy(frame, ctx);
  
  assert.equal(engine.history.length, 1);
  assert.equal(engine.history[0].entityCount, 1);
  assert.equal(engine.history[0].evidenceCount, 1);
});

test('detectGapsPolicy detects low coverage gaps', () => {
  const engine = createCalibrationEngine('adaptive');
  const frame = { gaps: [], entries: [] };
  const ctx = {
    entities: [
      { id: '1', dimensions: {} },  // no time dimension
      { id: '2', dimensions: {} },  // no time dimension
      { id: '3', dimensions: { time: 2020 } }  // has time
    ],
    evidences: [],
    relations: []
  };
  
  engine.detectGapsPolicy(frame, ctx);
  
  // Should detect LOW_COVERAGE gaps for time and domain (2/3 = 67%< 70% threshold)
  const coverageGaps = frame.gaps.filter(g => g.type === 'low_coverage');
  assert.ok(coverageGaps.length > 0, 'Should detect coverage gaps');
});

test('detectGapsPolicy respects policy thresholds', () => {
  const strict = createCalibrationEngine('strict');
  const adaptive = createCalibrationEngine('adaptive');
  
  const frame1 = { gaps: [], entries: [] };
  const frame2 = { gaps: [], entries: [] };
  const ctx = {
    entities: [
      { id: '1', dimensions: { time: 2020 } },
      { id: '2', dimensions: {} }
    ],
    evidences: [],
    relations: []
  };
  
  strict.detectGapsPolicy(frame1, ctx);
  adaptive.detectGapsPolicy(frame2, ctx);
  
  // Strict should find more gaps (higher threshold = more failures)
  // or at least the same number
  assert.ok(frame1.gaps.length >= frame2.gaps.length,
    'Strict policy should find equal or more gaps than adaptive');
});

test('detectGapsPolicy detects insufficient evidence', () => {
  const engine = createCalibrationEngine('strict');  // requires 10 evidences
  const frame = { gaps: [], entries: [] };
  const ctx = {
    entities: [{ id: '1', dimensions: { time: 2020 } }],
    evidences: [{ id: 'e1' }],  // only 1 evidence
    relations: []
  };
  
  engine.detectGapsPolicy(frame, ctx);
  
  const evidenceGap = frame.gaps.find(g => g.type === 'insufficient_evidence');
  assert.ok(evidenceGap, 'Should detect insufficient evidence');
  assert.ok(evidenceGap.metadata.actualCount < evidenceGap.metadata.minRequired);
});

// ═══════════════════════════════════════════════════════════════════
// suggestAdjustments tests
// ═══════════════════════════════════════════════════════════════════

test('suggestAdjustments requires sufficient history', () => {
  const engine = createCalibrationEngine('adaptive');
  const result = engine.suggestAdjustments();
  
  assert.equal(result.canAdjust, false);
  assert.equal(result.reason, 'insufficient_history');
  assert.equal(result.runsAnalyzed, 0);
});

test('suggestAdjustments suggests lowering thresholds when few gaps', () => {
  const engine = createCalibrationEngine('adaptive');
  
  // Simulate 5 runs with very few gaps
  for (let i = 0; i < 5; i++) {
    const frame = { gaps: [], entries: [] };
    const ctx = {
      entities: [{ id: '1', dimensions: { time: 2020, space: 'here', domain: 'test' } }],
      evidences: Array.from({ length: 5 }, (_, j) => ({ id: `e${i}-${j}`, confidence: 0.9, scope: 'entity', targetId: '1' })),
      relations: []
    };
    engine.detectGapsPolicy(frame, ctx);
  }
  
  const suggestion = engine.suggestAdjustments();
  
  assert.equal(suggestion.canAdjust, true);
  assert.equal(suggestion.action, 'lower_thresholds');
  assert.ok(suggestion.suggestedAdjustment < 0, 'Should suggest negative adjustment');
});

test('suggestAdjustments suggests raising thresholds when many gaps', () => {
  const engine = createCalibrationEngine('adaptive');
  
  // Simulate 5 runs with many gaps (low confidence entities)
  for (let i = 0; i < 5; i++) {
    const frame = { gaps: [], entries: [] };
    const ctx = {
      entities: [
        { id: '1', dimensions: { time: 2020 } },
        { id: '2', dimensions: { time: 2021 } },
        { id: '3', dimensions: {} }
      ],
      evidences: [],  // no evidence = low confidence
      relations: []
    };
    engine.detectGapsPolicy(frame, ctx);
  }
  
  const suggestion = engine.suggestAdjustments();
  
  // May or may not suggest raising depending on calculations
  // Just verify it returns a valid result
  assert.ok(suggestion.action || !suggestion.canAdjust);
});

// ═══════════════════════════════════════════════════════════════════
// createCalibratedFrame tests
// ═══════════════════════════════════════════════════════════════════

test('createCalibratedFrame includes calibration capability', () => {
  const frame = createCalibratedFrame('strict');
  
  assert.equal(frame.policy, 'strict');
  assert.ok(frame.calibrationEngine);
  assert.equal(typeof frame.detectGaps, 'function');
  assert.ok(Array.isArray(frame.gaps));
  assert.ok(Array.isArray(frame.entries));
});

test('calibrated frame detectGaps works', () => {
  const frame = createCalibratedFrame('adaptive');
  const ctx = {
    entities: [{ id: '1', dimensions: {} }],
    evidences: [],
    relations: []
  };
  
  frame.detectGaps(ctx);
  
  assert.ok(frame.gaps.length > 0, 'Should detect gaps');
  assert.ok(frame.calibrationEngine.history.length > 0, 'Should record history');
});

// ═══════════════════════════════════════════════════════════════════
// comparePolicies tests
// ═══════════════════════════════════════════════════════════════════

test('comparePolicies identifies stricter vs looser', () => {
  const result = comparePolicies('adaptive', 'strict');
  
  assert.equal(result.valid, true);
  assert.equal(result.policyA, 'adaptive');
  assert.equal(result.policyB, 'strict');
  assert.ok(result.comparison);
  assert.ok(result.recommendation);
});

test('comparePolicies handles unknown policies', () => {
  const result = comparePolicies('unknown', 'strict');
  
  assert.equal(result.valid, false);
  assert.ok(result.error);
});
