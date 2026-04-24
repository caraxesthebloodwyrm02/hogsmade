import { randomBytes } from "node:crypto";

/**
 * Generate a cryptographically secure unique ID with a prefix.
 * Uses node:crypto randomBytes instead of Math.random() for CSPRNG.
 */
export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomBytes(4).toString("hex")}`;
}

/**
 * Generate a run ID (e.g. run-1713945600000-abcd1234)
 */
export function generateRunId(): string {
  return generateId("run");
}

/**
 * Check if a string is a valid run ID.
 */
export function isRunId(id: string): boolean {
  return id.startsWith("run-");
}

/**
 * Parse a run ID into its components.
 */
export function parseRunId(id: string): { timestamp: number; hash: string } {
  const parts = id.split("-");
  return {
    timestamp: parseInt(parts[1], 10),
    hash: parts[2],
  };
}
