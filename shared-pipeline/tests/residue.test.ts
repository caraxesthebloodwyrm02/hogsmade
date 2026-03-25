import { describe, it, expect } from 'vitest';
import { findResidue, recentResidue, hasRun, readDeposit } from '../src/residue.js';
import type { ResidueStack } from '../src/types.js';

const stack: ResidueStack = [
  { passId: 'alpha', timestamp: '2026-01-01T00:00:00Z', data: { score: 0.8, label: 'high' } },
  { passId: 'beta', timestamp: '2026-01-01T00:00:01Z', data: { count: 3 } },
  { passId: 'alpha', timestamp: '2026-01-01T00:00:02Z', data: { score: 0.95, label: 'very-high' } },
];

describe('findResidue', () => {
  it('returns most recent deposit for a given passId', () => {
    const entry = findResidue(stack, 'alpha');
    expect(entry?.data['score']).toBe(0.95);
  });

  it('returns undefined for unknown passId', () => {
    expect(findResidue(stack, 'gamma')).toBeUndefined();
  });
});

describe('recentResidue', () => {
  it('returns all entries in reverse order without limit', () => {
    const recent = recentResidue(stack);
    expect(recent).toHaveLength(3);
    expect(recent[0].passId).toBe('alpha');
    expect(recent[0].data['score']).toBe(0.95);
  });

  it('respects limit parameter', () => {
    const recent = recentResidue(stack, 2);
    expect(recent).toHaveLength(2);
  });
});

describe('hasRun', () => {
  it('returns true for passes that deposited', () => {
    expect(hasRun(stack, 'alpha')).toBe(true);
    expect(hasRun(stack, 'beta')).toBe(true);
  });

  it('returns false for passes that did not deposit', () => {
    expect(hasRun(stack, 'gamma')).toBe(false);
  });
});

describe('readDeposit', () => {
  it('extracts typed value from a pass deposit', () => {
    const score = readDeposit<number>(stack, 'alpha', 'score');
    expect(score).toBe(0.95);
  });

  it('returns undefined for missing key', () => {
    expect(readDeposit<string>(stack, 'beta', 'missing')).toBeUndefined();
  });

  it('returns undefined for missing pass', () => {
    expect(readDeposit<number>(stack, 'gamma', 'score')).toBeUndefined();
  });
});
