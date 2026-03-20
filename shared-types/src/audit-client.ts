import { appendFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { homedir } from "os";
import type { AuditEvent } from "./audit.js";

const ECHOES_AUDIT_PATH = process.env.ECHOES_AUDIT_PATH
  || resolve(homedir(), ".echoes", "audit.ndjson");

let dirEnsured = false;

/**
 * Recursively sanitize values to prevent NDJSON injection.
 * Strips newlines/carriage returns from string values so a single
 * JSON.stringify() call always produces exactly one NDJSON line.
 */
function sanitizeForNdjson(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/[\n\r]/g, " ");
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeForNdjson);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k.replace(/[\n\r]/g, " ")] = sanitizeForNdjson(v);
    }
    return out;
  }
  return value;
}

export function emitAudit(event: Omit<AuditEvent, "timestamp">): void {
  if (!dirEnsured) {
    mkdirSync(dirname(ECHOES_AUDIT_PATH), { recursive: true });
    dirEnsured = true;
  }

  const record: AuditEvent = {
    ...event,
    metadata: event.metadata
      ? sanitizeForNdjson(event.metadata) as Record<string, unknown>
      : undefined,
    timestamp: new Date().toISOString(),
  };
  appendFileSync(ECHOES_AUDIT_PATH, JSON.stringify(record) + "\n");
}
