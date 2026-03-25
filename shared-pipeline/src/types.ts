/**
 * Core types for the shader-pass pipeline primitive.
 *
 * Data flows through staged passes, each depositing residue that later passes
 * can read. Later passes become naturally more observant (rich context) and
 * less acting (heavy lifting already done).
 */

export interface ResidueEntry {
  readonly passId: string;
  readonly timestamp: string;
  readonly data: Readonly<Record<string, unknown>>;
}

export type ResidueStack = ReadonlyArray<Readonly<ResidueEntry>>;

export interface PassInput<TState> {
  readonly state: TState;
  readonly residue: ResidueStack;
  readonly passIndex: number;
  readonly pipelineId: string;
}

export interface PassOutput<TState> {
  state: TState;
  deposit: Record<string, unknown>;
}

export interface Pass<TState> {
  readonly id: string;
  readonly description?: string;
  execute(input: PassInput<TState>): PassOutput<TState>;
}

export interface AsyncPass<TState> {
  readonly id: string;
  readonly description?: string;
  execute(input: PassInput<TState>): Promise<PassOutput<TState>>;
}

export interface PipelineResult<TState> {
  readonly pipelineId: string;
  readonly state: TState;
  readonly residue: ResidueStack;
  readonly passCount: number;
  readonly durationMs: number;
}
