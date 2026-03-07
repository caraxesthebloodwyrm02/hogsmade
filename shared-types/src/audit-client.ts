import { appendFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { homedir } from "os";
import type { AuditEvent } from "./audit.js";

const ECHOES_AUDIT_PATH = process.env.ECHOES_AUDIT_PATH
  || resolve(homedir(), ".echoes", "audit.ndjson");

let dirEnsured = false;

export function emitAudit(event: Omit<AuditEvent, "timestamp">): void {
  if (!dirEnsured) {
    mkdirSync(dirname(ECHOES_AUDIT_PATH), { recursive: true });
    dirEnsured = true;
  }

  const record: AuditEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };
  appendFileSync(ECHOES_AUDIT_PATH, JSON.stringify(record) + "\n");
}
