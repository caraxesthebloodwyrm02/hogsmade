import { randomBytes } from "node:crypto";

/**
 * Generate a cryptographically secure unique ID with a prefix.
 * Uses node:crypto randomBytes instead of Math.random() for CSPRNG.
 */
export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomBytes(4).toString("hex")}`;
}
