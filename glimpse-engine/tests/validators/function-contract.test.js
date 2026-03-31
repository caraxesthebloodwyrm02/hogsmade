/**
 * @file tests/validators/function-contract.test.js
 * Unit tests for function contract validation
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateFunctionContracts,
  generateFunctionStub,
  generateHealingPatch,
  formatReport,
  quickValidate
} from '../../core/validators/function-contract.js';

// ═══════════════════════════════════════════════════════════════════
// validateFunctionContracts tests
// ═══════════════════════════════════════════════════════════════════

test('validateFunctionContracts validates complete match', () => {
  const registry = {
    testFn: {
      args: { x: 'number', y: 'string' },
      returns: 'boolean',
      scope: ['dataset']
    }
  };
  
  const implementations = {
    testFn: (ctx, { x, y }) => true
  };
  
  const report = validateFunctionContracts(registry, implementations);
  
  assert.equal(report.valid, true);
  assert.equal(report.missing.length, 0);
  assert.equal(report.orphaned.length, 0);
  assert.equal(report.mismatched.length, 0);
  assert.equal(report.summary.coverage, 1.0);
});

test('validateFunctionContracts detects missing implementations', () => {
  const registry = {
    present: { args: {}, returns: 'boolean', scope: ['dataset'] },
    missing: { args: {}, returns: 'number', scope: ['dataset'] }
  };
  
  const implementations = {
    present: () => true
  };
  
  const report = validateFunctionContracts(registry, implementations);
  
  assert.equal(report.valid, false);
  assert.equal(report.missing.length, 1);
  assert.equal(report.missing[0], 'missing');
  assert.equal(report.summary.coverage, 0.5);
});

test('validateFunctionContracts detects orphaned implementations', () => {
  const registry = {
    declared: { args: {}, returns: 'boolean', scope: ['dataset'] }
  };
  
  const implementations = {
    declared: () => true,
    orphan: () => false
  };
  
  const report = validateFunctionContracts(registry, implementations);
  
  assert.equal(report.valid, false);
  assert.equal(report.orphaned.length, 1);
  assert.equal(report.orphaned[0], 'orphan');
});

test('validateFunctionContracts detects arity mismatch', () => {
  const registry = {
    testFn: {
      args: { a: 'number', b: 'number', c: 'number' },
      returns: 'number',
      scope: ['dataset']
    }
  };
  
  // Implementation only accepts 2 args (plus ctx)
  const implementations = {
    testFn: (ctx, { a, b }) => a + b
  };
  
  const report = validateFunctionContracts(registry, implementations);
  
  assert.equal(report.valid, false);
  assert.equal(report.mismatched.length, 1);
  assert.equal(report.mismatched[0].reason, 'arity_mismatch');
  assert.equal(report.mismatched[0].declaredArgs, 3);
  assert.equal(report.mismatched[0].implementedArity, 2); // destructured object = 1 param
});

test('validateFunctionContracts handles empty registry', () => {
  const report = validateFunctionContracts({}, {});
  
  assert.equal(report.valid, true);
  assert.equal(report.summary.coverage, 0);
});

test('validateFunctionContracts validates return types', () => {
  const registry = {
    validFn: {
      args: {},
      returns: 'boolean',
      scope: ['dataset']
    },
    unknownFn: {
      args: {},
      returns: 'unknown_type',
      scope: ['dataset']
    }
  };
  
  const implementations = {
    validFn: () => true,
    unknownFn: () => null
  };
  
  const report = validateFunctionContracts(registry, implementations);
  
  assert.equal(report.valid, true); // Still valid, just warnings
  const unknownMismatch = report.mismatched.find(m => m.name === 'unknownFn');
  assert.ok(unknownMismatch);
  assert.equal(unknownMismatch.reason, 'unknown_return_type');
});

// ═══════════════════════════════════════════════════════════════════
// generateFunctionStub tests
// ═══════════════════════════════════════════════════════════════════

test('generateFunctionStub creates valid stub for boolean return', () => {
  const declaration = {
    args: { x: 'number', y: 'string' },
    returns: 'boolean',
    description: 'Test function',
    scope: ['dataset', 'entity']
  };
  
  const stub = generateFunctionStub('myFunction', declaration);
  
  assert.ok(stub.includes('function myFunction'));
  assert.ok(stub.includes('[STUB] myFunction called'));
  assert.ok(stub.includes('return false'));  // boolean default
  assert.ok(stub.includes('@param {Object} ctx'));
  assert.ok(stub.includes('Test function'));
  assert.ok(stub.includes('Scope: dataset | entity'));
  assert.ok(stub.includes('@returns {boolean}'));
});

test('generateFunctionStub creates valid stub for score return', () => {
  const declaration = {
    args: { value: 'number' },
    returns: 'score',
    description: 'Score calculator',
    scope: ['dataset']
  };
  
  const stub = generateFunctionStub('calcScore', declaration);
  
  assert.ok(stub.includes('return 0'));  // score default
  assert.ok(stub.includes('Score calculator'));
});

test('generateFunctionStub creates valid stub for string return', () => {
  const declaration = {
    args: {},
    returns: 'string',
    description: 'String generator'
  };
  
  const stub = generateFunctionStub('getString', declaration);
  
  assert.ok(stub.includes("return ''"));  // string default
});

test('generateFunctionStub handles no arguments', () => {
  const declaration = {
    args: {},
    returns: 'undefined',
    description: 'No args function'
  };
  
  const stub = generateFunctionStub('noArgs', declaration);
  
  assert.ok(stub.includes('function noArgs(ctx)'));  // No destructuring
});

// ═══════════════════════════════════════════════════════════════════
// generateHealingPatch tests
// ═══════════════════════════════════════════════════════════════════

test('generateHealingPatch creates patches for missing functions', () => {
  const report = {
    missing: ['missingFn'],
    orphaned: [],
    mismatched: [],
    valid: false,
    details: {
      missingFn: {
        declared: {
          args: { x: 'number' },
          returns: 'boolean',
          description: 'Missing function'
        }
      }
    }
  };
  
  const patch = generateHealingPatch(report);
  
  assert.equal(patch.files.length, 1);
  assert.equal(patch.files[0].action, 'create');
  assert.ok(patch.files[0].path.includes('missingFn'));
  assert.ok(patch.files[0].content.includes('function missingFn'));
  assert.ok(patch.createdAt);
  assert.ok(Array.isArray(patch.instructions));
});

test('generateHealingPatch includes instructions for orphaned functions', () => {
  const report = {
    missing: [],
    orphaned: ['orphanFn'],
    mismatched: [],
    valid: false
  };
  
  const patch = generateHealingPatch(report);
  
  assert.equal(patch.instructions.length, 1);
  assert.equal(patch.instructions[0].action, 'add_to_registry');
  assert.equal(patch.instructions[0].function, 'orphanFn');
});

test('generateHealingPatch includes fix instructions for mismatches', () => {
  const report = {
    missing: [],
    orphaned: [],
    mismatched: [{
      name: 'badFn',
      reason: 'arity_mismatch',
      declaredArgs: 3,
      implementedArity: 2,
      severity: 'high'
    }],
    valid: false
  };
  
  const patch = generateHealingPatch(report);
  
  const instruction = patch.instructions.find(i => i.function === 'badFn');
  assert.ok(instruction);
  assert.equal(instruction.action, 'fix_arity');
  assert.ok(instruction.message.includes('arity'));
});

// ═══════════════════════════════════════════════════════════════════
// formatReport tests
// ═══════════════════════════════════════════════════════════════════

test('formatReport formats valid report', () => {
  const report = {
    valid: true,
    summary: { coverage: 1.0, totalDeclared: 10 },
    missing: [],
    orphaned: [],
    mismatched: []
  };
  
  const formatted = formatReport(report);
  
  assert.ok(formatted.includes('VALID'));
  assert.ok(formatted.includes('100.0%'));
  assert.ok(formatted.includes('10'));
});

test('formatReport formats invalid report with issues', () => {
  const report = {
    valid: false,
    summary: { coverage: 0.7, totalDeclared: 10 },
    missing: ['fn1', 'fn2', 'fn3'],
    orphaned: ['orphan1'],
    mismatched: [{ name: 'bad', reason: 'arity' }]
  };
  
  const formatted = formatReport(report);
  
  assert.ok(formatted.includes('INVALID'));
  assert.ok(formatted.includes('fn1'));
  assert.ok(formatted.includes('orphan1'));
  assert.ok(formatted.includes('arity'));  // arity or mismatches
});

// ═══════════════════════════════════════════════════════════════════
// quickValidate tests
// ═══════════════════════════════════════════════════════════════════

test('quickValidate returns true for valid config', () => {
  const config = {
    function_registry: {
      test: { args: {}, returns: 'boolean' }
    }
  };
  
  const implementations = {
    test: () => true
  };
  
  assert.equal(quickValidate(config, implementations), true);
});

test('quickValidate returns false for invalid config', () => {
  const config = {
    function_registry: {
      test: { args: {}, returns: 'boolean' },
      missing: { args: {}, returns: 'number' }
    }
  };
  
  const implementations = {
    test: () => true
  };
  
  assert.equal(quickValidate(config, implementations), false);
});

// ═══════════════════════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════════════════════

test('validateFunctionContracts handles null registry', () => {
  const report = validateFunctionContracts(null, {});
  
  assert.equal(report.valid, true);
  assert.deepEqual(report.summary, { totalDeclared: 0, totalImplemented: 0, coverage: 0 });
});

test('validateFunctionContracts handles null implementations', () => {
  const registry = {
    fn: { args: {}, returns: 'boolean' }
  };
  
  const report = validateFunctionContracts(registry, null);
  
  assert.equal(report.valid, false);
  assert.equal(report.missing.length, 1);
});
