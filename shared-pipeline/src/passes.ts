/**
 * Built-in utility passes — reusable across any domain.
 */

import type { Pass, PassInput, PassOutput } from './types.js';

/** Deposits a timestamp marker. Zero state mutation. */
export function timestampPass<TState>(): Pass<TState> {
  return {
    id: 'builtin:timestamp',
    description: 'Deposits entry timestamp',
    execute(input: PassInput<TState>): PassOutput<TState> {
      return {
        state: input.state,
        deposit: { startedAt: new Date().toISOString() },
      };
    },
  };
}

/** Deposits an audit marker with source identity and current state shape. */
export function auditMarkPass<TState>(source: string): Pass<TState> {
  return {
    id: 'builtin:audit-mark',
    description: `Deposits audit marker for ${source}`,
    execute(input: PassInput<TState>): PassOutput<TState> {
      const stateKeys = input.state !== null && typeof input.state === 'object'
        ? Object.keys(input.state as Record<string, unknown>)
        : [];
      return {
        state: input.state,
        deposit: { source, markedAt: new Date().toISOString(), stateKeys },
      };
    },
  };
}

/** Deposits a confidence score computed by the provided scorer function. */
export function confidencePass<TState>(
  scorer: (state: TState) => number,
): Pass<TState> {
  return {
    id: 'builtin:confidence',
    description: 'Computes and deposits confidence score',
    execute(input: PassInput<TState>): PassOutput<TState> {
      return {
        state: input.state,
        deposit: { confidence: scorer(input.state), basis: 'computed' },
      };
    },
  };
}
