import { createReadStream, existsSync, mkdirSync, watch } from "node:fs";
import { stat } from "node:fs/promises";
import { dirname } from "node:path";
import * as readline from "node:readline";
import { z } from "zod";
import { appendNdjsonLine, ECHOES_AUDIT_PATH, sanitizeForNdjson } from "./audit-client.js";
import { generateId, isRunId } from "./id.js";

const POLL_MS = 1000;

export const NamespaceSchema = z.string().regex(/^[a-z][a-z0-9-]*$/);
export type Namespace = z.infer<typeof NamespaceSchema>;

export const CommandEnvelopeSchema = z.object({
  id: z.string(),
  runId: z.string(),
  ns: NamespaceSchema,
  source: z.string(),
  command: z.string(),
  payload: z.record(z.string(), z.unknown()),
  timestamp: z.string().datetime(),
});

export type CommandEnvelope = z.infer<typeof CommandEnvelopeSchema>;
export type CommandHandler = (envelope: CommandEnvelope) => void | Promise<void>;

export interface Subscription {
  unsubscribe(): void;
}

/**
 * Append a typed command envelope to the shared NDJSON audit file (same transport as {@link emitAudit}).
 */
export async function dispatch(
  envelope: Omit<CommandEnvelope, "id" | "timestamp"> & { id?: string },
): Promise<boolean> {
  if (!isRunId(envelope.runId)) {
    throw new Error(`[command-bus] invalid runId: ${envelope.runId}`);
  }

  const id = envelope.id ?? generateId("cmd");
  const timestamp = new Date().toISOString();
  const payload = sanitizeForNdjson(envelope.payload) as Record<string, unknown>;

  const full: CommandEnvelope = {
    id,
    runId: envelope.runId,
    ns: envelope.ns,
    source: envelope.source,
    command: envelope.command,
    payload,
    timestamp,
  };

  CommandEnvelopeSchema.parse(full);
  const line = JSON.stringify(full) + "\n";
  return appendNdjsonLine(line);
}

/**
 * Tail the shared audit file and invoke the handler for lines that parse as {@link CommandEnvelope}
 * with the given namespace.
 */
export function subscribe(ns: Namespace, handler: CommandHandler): Subscription {
  let cancelled = false;
  let fileOffset = 0;
  let watcher: any = null;
  let poll: NodeJS.Timeout | null = null;

  const auditPath = ECHOES_AUDIT_PATH;

  const handleLine = (line: string) => {
    if (cancelled || !line.trim()) return;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      return;
    }

    const parsed = CommandEnvelopeSchema.safeParse(obj);
    if (!parsed.success || parsed.data.ns !== ns) return;

    void Promise.resolve()
      .then(() => handler(parsed.data))
      .catch((err) => {
        process.stderr.write(
          `[command-bus] handler error: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      });
  };

  const syncTail = async () => {
    if (cancelled || !existsSync(auditPath)) return;

    try {
      const st = await stat(auditPath);
      if (st.size < fileOffset) {
        fileOffset = 0;
      }
      if (st.size <= fileOffset) return;

      const stream = createReadStream(auditPath, { start: fileOffset, encoding: "utf8" });
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

      for await (const line of rl) {
        if (cancelled) break;
        handleLine(line);
      }

      fileOffset = (await stat(auditPath)).size;
    } catch (err) {
      // File might have been rotated or deleted
    }
  };

  const run = async () => {
    try {
      const dir = dirname(auditPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      let waited = 0;
      while (!existsSync(auditPath) && !cancelled) {
        await new Promise((r) => setTimeout(r, 50));
        waited += 50;
        if (waited > 120_000) {
          process.stderr.write("[command-bus] audit file not found after 120s — subscribe idle\n");
          return;
        }
      }

      if (cancelled) return;

      // Initial sync
      fileOffset = (await stat(auditPath)).size;

      // Watch for changes
      watcher = watch(auditPath, (event) => {
        if (event === "change") {
          void syncTail();
        }
      });

      // Fallback poll for environments where watch is unreliable
      poll = setInterval(() => {
        void syncTail();
      }, POLL_MS);
    } catch (err) {
      process.stderr.write(
        `[command-bus] subscribe error: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  };

  void run();

  return {
    unsubscribe() {
      cancelled = true;
      if (watcher) watcher.close();
      if (poll) clearInterval(poll);
    },
  };
}
