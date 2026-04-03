/**
 * Pipeline runners — synchronous and asynchronous.
 *
 * Each pass receives a frozen residue stack, executes, and deposits a new
 * ResidueEntry. State threads forward through each pass.
 */

import type {
  AsyncPass,
  Pass,
  PassInput,
  PipelineResult,
  ResidueEntry,
  ResidueStack,
} from "./types.js";

function freezeDeep<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") return obj;
  Object.freeze(obj);
  for (const value of Object.values(obj as Record<string, unknown>)) {
    if (value !== null && typeof value === "object") {
      freezeDeep(value);
    }
  }
  return obj;
}

function buildEntry(passId: string, deposit: Record<string, unknown>): ResidueEntry {
  return freezeDeep({
    passId,
    timestamp: new Date().toISOString(),
    data: { ...deposit },
  });
}

export interface Pipeline<TState> {
  readonly id: string;
  readonly passCount: number;
  run(initialState: TState): PipelineResult<TState>;
}

export interface AsyncPipeline<TState> {
  readonly id: string;
  readonly passCount: number;
  run(initialState: TState): Promise<PipelineResult<TState>>;
}

export function createPipeline<TState>(
  id: string,
  passes: ReadonlyArray<Pass<TState>>,
): Pipeline<TState> {
  return {
    id,
    passCount: passes.length,
    run(initialState: TState): PipelineResult<TState> {
      const start = performance.now();
      let state = initialState;
      const residue: ResidueEntry[] = [];

      for (let i = 0; i < passes.length; i++) {
        const pass = passes[i];
        const frozenResidue: ResidueStack = freezeDeep([...residue]);
        const input: PassInput<TState> = {
          state,
          residue: frozenResidue,
          passIndex: i,
          pipelineId: id,
        };

        const output = pass.execute(input);
        state = output.state;
        residue.push(buildEntry(pass.id, output.deposit));
      }

      return {
        pipelineId: id,
        state,
        residue: freezeDeep([...residue]),
        passCount: passes.length,
        durationMs: performance.now() - start,
      };
    },
  };
}

export function createAsyncPipeline<TState>(
  id: string,
  passes: ReadonlyArray<AsyncPass<TState>>,
): AsyncPipeline<TState> {
  return {
    id,
    passCount: passes.length,
    async run(initialState: TState): Promise<PipelineResult<TState>> {
      const start = performance.now();
      let state = initialState;
      const residue: ResidueEntry[] = [];

      for (let i = 0; i < passes.length; i++) {
        const pass = passes[i];
        const frozenResidue: ResidueStack = freezeDeep([...residue]);
        const input: PassInput<TState> = {
          state,
          residue: frozenResidue,
          passIndex: i,
          pipelineId: id,
        };

        const output = await pass.execute(input);
        state = output.state;
        residue.push(buildEntry(pass.id, output.deposit));
      }

      return {
        pipelineId: id,
        state,
        residue: freezeDeep([...residue]),
        passCount: passes.length,
        durationMs: performance.now() - start,
      };
    },
  };
}
