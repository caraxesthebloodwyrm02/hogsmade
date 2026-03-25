import { describe, it, expect } from 'vitest';
import { createPipeline, createAsyncPipeline } from '../src/pipeline.js';
import type { Pass, AsyncPass } from '../src/types.js';

interface CountState {
  value: number;
}

const incrementPass: Pass<CountState> = {
  id: 'increment',
  execute(input) {
    return {
      state: { value: input.state.value + 1 },
      deposit: { added: 1, fromValue: input.state.value },
    };
  },
};

const doublePass: Pass<CountState> = {
  id: 'double',
  execute(input) {
    return {
      state: { value: input.state.value * 2 },
      deposit: { multiplied: 2, fromValue: input.state.value },
    };
  },
};

describe('createPipeline', () => {
  it('executes passes in declared order', () => {
    const pipeline = createPipeline('test', [incrementPass, doublePass]);
    const result = pipeline.run({ value: 5 });
    // 5 → +1 = 6 → *2 = 12
    expect(result.state.value).toBe(12);
  });

  it('grows residue stack by 1 per pass', () => {
    const pipeline = createPipeline('test', [incrementPass, doublePass]);
    const result = pipeline.run({ value: 0 });
    expect(result.residue).toHaveLength(2);
    expect(result.residue[0].passId).toBe('increment');
    expect(result.residue[1].passId).toBe('double');
  });

  it('freezes residue — mutation attempt throws', () => {
    const pipeline = createPipeline('test', [incrementPass]);
    const result = pipeline.run({ value: 0 });
    expect(() => {
      (result.residue as unknown[]).push({ passId: 'rogue', timestamp: '', data: {} });
    }).toThrow();
    expect(() => {
      (result.residue[0].data as Record<string, unknown>)['injected'] = true;
    }).toThrow();
  });

  it('threads state modifications through passes', () => {
    const threePass = createPipeline('test', [incrementPass, incrementPass, doublePass]);
    const result = threePass.run({ value: 0 });
    // 0 → 1 → 2 → 4
    expect(result.state.value).toBe(4);
  });

  it('returns initial state and empty residue for zero passes', () => {
    const pipeline = createPipeline<CountState>('empty', []);
    const result = pipeline.run({ value: 42 });
    expect(result.state.value).toBe(42);
    expect(result.residue).toHaveLength(0);
    expect(result.passCount).toBe(0);
  });

  it('records pipeline metadata', () => {
    const pipeline = createPipeline('meta-test', [incrementPass]);
    const result = pipeline.run({ value: 0 });
    expect(result.pipelineId).toBe('meta-test');
    expect(result.passCount).toBe(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('passes can read prior residue', () => {
    const readerPass: Pass<CountState> = {
      id: 'reader',
      execute(input) {
        const priorDeposit = input.residue.find(r => r.passId === 'increment');
        return {
          state: input.state,
          deposit: { sawPrior: !!priorDeposit, priorData: priorDeposit?.data },
        };
      },
    };
    const pipeline = createPipeline('read-test', [incrementPass, readerPass]);
    const result = pipeline.run({ value: 10 });
    expect(result.residue[1].data['sawPrior']).toBe(true);
    expect((result.residue[1].data['priorData'] as Record<string, unknown>)?.['added']).toBe(1);
  });

  it('exposes passCount on the pipeline object', () => {
    const pipeline = createPipeline('count-test', [incrementPass, doublePass]);
    expect(pipeline.passCount).toBe(2);
  });
});

describe('createAsyncPipeline', () => {
  it('handles async passes', async () => {
    const asyncIncrement: AsyncPass<CountState> = {
      id: 'async-increment',
      async execute(input) {
        return {
          state: { value: input.state.value + 1 },
          deposit: { added: 1 },
        };
      },
    };
    const asyncDouble: AsyncPass<CountState> = {
      id: 'async-double',
      async execute(input) {
        return {
          state: { value: input.state.value * 2 },
          deposit: { multiplied: 2 },
        };
      },
    };

    const pipeline = createAsyncPipeline('async-test', [asyncIncrement, asyncDouble]);
    const result = await pipeline.run({ value: 3 });
    // 3 → 4 → 8
    expect(result.state.value).toBe(8);
    expect(result.residue).toHaveLength(2);
    expect(result.pipelineId).toBe('async-test');
  });

  it('returns initial state for zero async passes', async () => {
    const pipeline = createAsyncPipeline<CountState>('empty-async', []);
    const result = await pipeline.run({ value: 99 });
    expect(result.state.value).toBe(99);
    expect(result.residue).toHaveLength(0);
  });
});
