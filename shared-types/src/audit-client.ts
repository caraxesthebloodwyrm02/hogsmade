import { appendFileSync, mkdirSync, existsSync, writeFileSync, renameSync, unlinkSync } from "fs";
import { dirname, resolve } from "path";
import { homedir } from "os";
import { randomBytes } from "crypto";
import type { AuditEvent } from "./audit.js";

const ECHOES_AUDIT_PATH = process.env.ECHOES_AUDIT_PATH
  || resolve(homedir(), ".echoes", "audit.ndjson");

let dirEnsured = false;
let writeQueue: Array<{ event: string; resolve: (value: boolean) => void }> = [];
let isWriting = false;

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

async function processWriteQueue(): Promise<void> {
  if (isWriting || writeQueue.length === 0) return;
  
  isWriting = true;
  const { event, resolve } = writeQueue.shift()!;
  
  const lockFile = `${ECHOES_AUDIT_PATH}.lock`;
  
  try {
    // Simple lock mechanism with timeout
    let retries = 0;
    const maxRetries = 10;
    
    while (existsSync(lockFile) && retries < maxRetries) {
      await new Promise(r => setTimeout(r, 50)); // 50ms wait
      retries++;
    }
    
    if (existsSync(lockFile)) {
      // Lock timeout - skip this write
      resolve(false);
      isWriting = false;
      setTimeout(processWriteQueue, 0);
      return;
    }
    
    // Create lock
    writeFileSync(lockFile, process.pid.toString());
    
    // Simple append with proper newline
    appendFileSync(ECHOES_AUDIT_PATH, event);
    
    // Release lock
    try {
      unlinkSync(lockFile);
    } catch {
      // Lock may have been cleaned up
    }
    
    resolve(true);
  } catch (err) {
    // Cleanup on error
    try {
      if (existsSync(lockFile)) unlinkSync(lockFile);
    } catch {
      // Ignore cleanup errors
    }
    
    process.stderr.write(
      `[audit-client] write failed: ${err instanceof Error ? err.message : String(err)}\n`
    );
    resolve(false);
  } finally {
    isWriting = false;
    // Process next item in queue
    setTimeout(processWriteQueue, 0);
  }
}

export function emitAudit(event: Omit<AuditEvent, "timestamp">): Promise<boolean> {
  return new Promise((resolve) => {
    if (!dirEnsured) {
      try {
        mkdirSync(dirname(ECHOES_AUDIT_PATH), { recursive: true });
        dirEnsured = true;
      } catch (err) {
        process.stderr.write(
          `[audit-client] mkdir failed: ${err instanceof Error ? err.message : String(err)}\n`
        );
        resolve(false);
        return;
      }
    }

    const record: AuditEvent = {
      ...event,
      metadata: event.metadata
        ? sanitizeForNdjson(event.metadata) as Record<string, unknown>
        : undefined,
      timestamp: new Date().toISOString(),
    };

    const eventString = JSON.stringify(record) + "\n";
    
    // Add to write queue
    writeQueue.push({ event: eventString, resolve });
    
    // Trigger queue processing
    processWriteQueue();
  });
}
