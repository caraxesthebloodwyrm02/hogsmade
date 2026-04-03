/**
 * Query helpers for reading the residue stack.
 */

import type { ResidueEntry, ResidueStack } from "./types.js";

/** Find the most recent deposit from a named pass. */
export function findResidue(stack: ResidueStack, passId: string): ResidueEntry | undefined {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].passId === passId) return stack[i];
  }
  return undefined;
}

/** Return the latest N deposits (most recent first). */
export function recentResidue(stack: ResidueStack, limit?: number): ResidueStack {
  const sliced = [...stack].reverse();
  return limit !== undefined ? sliced.slice(0, limit) : sliced;
}

/** Check whether a pass has already deposited into the stack. */
export function hasRun(stack: ResidueStack, passId: string): boolean {
  return stack.some((entry) => entry.passId === passId);
}

/** Extract a typed value from a specific pass's deposit. */
export function readDeposit<T>(stack: ResidueStack, passId: string, key: string): T | undefined {
  const entry = findResidue(stack, passId);
  if (!entry) return undefined;
  return entry.data[key] as T | undefined;
}
