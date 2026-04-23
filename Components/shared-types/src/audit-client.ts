import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  statSync,
  unlinkSync,
} from "fs";
import { constants } from "fs";
import { homedir } from "os";
import { dirname, resolve } from "path";
import type { AuditEvent } from "./audit.js";

export type { AuditEvent } from "./audit.js";

const ECHOES_AUDIT_PATH =
  process.env.ECHOES_AUDIT_PATH || resolve(homedir(), ".echoes", "audit.ndjson");

/** Maximum number of pending write entries. Oldest entries are dropped when exceeded. */
const MAX_QUEUE_SIZE = 500;

/** Lock files older than this (ms) are considered stale from a crashed process. */
const STALE_LOCK_AGE_MS = 30_000;

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
    // Atomic lock acquisition via O_CREAT | O_EXCL — prevents TOCTOU race
    // between checking lock existence and creating it.
    let retries = 0;
    const maxRetries = 10;
    let lockFd: number | null = null;

    while (retries < maxRetries) {
      try {
        lockFd = openSync(lockFile, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY);
        closeSync(lockFd);
        break;
      } catch (e: unknown) {
        if ((e as NodeJS.ErrnoException).code === "EEXIST") {
          // Check for stale lock left by a crashed process
          try {
            const stat = statSync(lockFile);
            if (Date.now() - stat.mtimeMs > STALE_LOCK_AGE_MS) {
              unlinkSync(lockFile);
              // Loop again to acquire fresh lock
              continue;
            }
          } catch {
            // Lock vanished between stat and now — loop again
          }
          await new Promise((r) => setTimeout(r, 50));
          retries++;
        } else {
          throw e;
        }
      }
    }

    if (lockFd === null) {
      // Lock timeout — skip this write to avoid blocking indefinitely
      resolve(false);
      isWriting = false;
      setTimeout(processWriteQueue, 0);
      return;
    }

    // Append with proper newline
    appendFileSync(ECHOES_AUDIT_PATH, event);

    // Release lock
    try {
      unlinkSync(lockFile);
    } catch {
      // Lock may have been cleaned up concurrently
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
      `[audit-client] write failed: ${err instanceof Error ? err.message : String(err)}\n`,
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
          `[audit-client] mkdir failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        resolve(false);
        return;
      }
    }

    const record: AuditEvent = {
      ...event,
      metadata: event.metadata
        ? (sanitizeForNdjson(event.metadata) as Record<string, unknown>)
        : undefined,
      timestamp: new Date().toISOString(),
    };

    const eventString = JSON.stringify(record) + "\n";

    // Enforce queue depth ceiling — shed oldest entry to make room.
    // This prevents unbounded memory growth if disk I/O stalls.
    if (writeQueue.length >= MAX_QUEUE_SIZE) {
      const dropped = writeQueue.shift();
      if (dropped) {
        dropped.resolve(false);
        process.stderr.write("[audit-client] write queue at capacity — oldest entry dropped\n");
      }
    }

    writeQueue.push({ event: eventString, resolve });

    // Trigger queue processing
    processWriteQueue();
  });
}
