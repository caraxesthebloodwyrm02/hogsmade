import { describe, it, expect } from 'vitest';
import { timestampPass, auditMarkPass, confidencePass } from '../src/passes.js';
import type { PassInput } from '../src/types.js';

interface TestState {
  name: string;
  score: number;
}

function makeInput(state: TestState): PassInput<TestState> {
  return { state, residue: [], passIndex: 0, pipelineId: 'test' };
}

describe('timestampPass', () => {
  it('deposits startedAt without mutating state', () => {
    const pass = timestampPass<TestState>();
    const input = makeInput({ name: 'foo', score: 0 });
    const output = pass.execute(input);
    expect(output.state).toEqual({ name: 'foo', score: 0 });
    expect(output.deposit['startedAt']).toBeDefined();
    expect(typeof output.deposit['startedAt']).toBe('string');
  });

  it('has correct id', () => {
    expect(timestampPass().id).toBe('builtin:timestamp');
  });
});

describe('auditMarkPass', () => {
  it('deposits source, markedAt, and stateKeys', () => {
    const pass = auditMarkPass<TestState>('test-source');
    const output = pass.execute(makeInput({ name: 'bar', score: 42 }));
    expect(output.deposit['source']).toBe('test-source');
    expect(output.deposit['markedAt']).toBeDefined();
    expect(output.deposit['stateKeys']).toEqual(['name', 'score']);
  });

  it('does not mutate state', () => {
    const pass = auditMarkPass<TestState>('src');
    const state = { name: 'x', score: 1 };
    const output = pass.execute(makeInput(state));
    expect(output.state).toEqual(state);
  });
});

describe('confidencePass', () => {
  it('deposits confidence from scorer function', () => {
    const pass = confidencePass<TestState>(s => s.score / 100);
    const output = pass.execute(makeInput({ name: 'test', score: 75 }));
    expect(output.deposit['confidence']).toBe(0.75);
    expect(output.deposit['basis']).toBe('computed');
  });

  it('does not mutate state', () => {
    const pass = confidencePass<TestState>(() => 0.5);
    const state = { name: 'y', score: 50 };
    const output = pass.execute(makeInput(state));
    expect(output.state).toEqual(state);
  });
});
