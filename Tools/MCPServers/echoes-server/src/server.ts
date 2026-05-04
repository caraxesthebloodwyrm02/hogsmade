/**
 * Echoes Server — Persistent Audit & Analytics MCP Server
 *
 * Complements the main echoes pipeline (mcp-tool-experiment) by providing:
 * - Persistent audit log storage (NDJSON file-backed)
 * - Historical query across audit entries
 * - Workspace telemetry snapshots
 * - Cross-session analytics
 *
 * Port: 8000 (per GATE/agent_schema.json)
 */

import { generateId } from "@cascade/shared-types/id";
import { McpLogger } from "@cascade/shared-types/mcp-logger";
import type { RecurrenceCheckResult } from "@cascade/shared-types/precedent";
import { PRECEDENT_TRIGGER_STATUSES } from "@cascade/shared-types/precedent";
import { AuditIntegrityGuard } from "@cascade/shared-types/security-policy";
import { SessionRateLimiter } from "@cascade/shared-types/session-rate-limit";
import {
  type TraceContext,
  createChildSpan,
  createRootSpan,
  extractTrace,
} from "@cascade/shared-types/trace-context";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { promises as fs } from "fs";
import { homedir } from "os";
import path from "path";
import { pathToFileURL } from "url";
import { RetryExhaustedError, RetryPolicy } from "@cascade/shared-resilience";
import * as z from "zod";
import { CHARACTER_QUERY_CLUSTERS, findRelevantClusters } from "./character-clusters.js";
import { getConfig } from "./config.js";
import { PrecedentStore } from "./precedent-store.js";
import { applySuccessDeescalation, applyTimeDecay, checkRecurrence } from "./recurrence.js";

// ── Constants ──

const SERVER_NAME = "echoes-server";
const VERSION = "1.0.0";
const logger = new McpLogger(SERVER_NAME);
const config = getConfig();
const DATA_DIR = config.dataDir;
const AUDIT_LOG_PATH = config.auditLogPath;
const TELEMETRY_DIR = config.telemetryDir;
const CHARACTER_DIR = config.characterDir;
const CHARACTER_LOG_PATH = path.join(CHARACTER_DIR, "snapshots.ndjson");
const PRECEDENTS_DIR = config.precedentsDir;
const GRUFF_PROPORTIONS_PATH = path.join(DATA_DIR, "gruff-proportions.ndjson");

// ENOSPC intentionally excluded — disk-full is not transient and should fail fast.
const auditWriteRetry = new RetryPolicy("echoes-audit-write", {
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 1000,
  backoffMultiplier: 2,
  retryableErrors: ["EBUSY", "EAGAIN", "EMFILE", "EIO"],
});

// ── Data Layer ──

interface AuditEntry {
  id: string;
  timestamp: string;
  source: string;
  tool: string;
  status: "success" | "failure" | "blocked" | "dry_run" | "error";
  durationMs?: number;
  traceId?: string;
  spanId?: string;
  metadata?: Record<string, unknown>;
}

interface TelemetrySnapshot {
  timestamp: string;
  workspace: string;
  projects: number;
  activeServers: string[];
  metrics: Record<string, number>;
  characterState?: CharacterState;
}

// ── Atlas Character Module Types ──

interface CharacterState {
  mood: string;
  rulePack: string;
  gateConfidence: number;
  entityCount: number;
  dominantTraits: Record<string, number>;
  consentType?: string;
  provenanceId?: string;
}

interface CharacterSnapshot {
  id: string;
  timestamp: string;
  mood: string;
  traits: Record<string, number>;
  rulePack: string;
  gateVerdict: {
    allowed: boolean;
    reason: string;
    provenanceId: string;
    confidence: number;
  };
  entityCount: number;
  clusterNotes: Array<{
    id: string;
    phenomenonType: string;
    spikeValue: number;
    observation: string;
    retrievalKeys: string[];
  }>;
  metadata?: Record<string, unknown>;
}

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  await fs.mkdir(TELEMETRY_DIR, { recursive: true, mode: 0o700 });
  await fs.mkdir(CHARACTER_DIR, { recursive: true, mode: 0o700 });
  try {
    await fs.access(AUDIT_LOG_PATH);
  } catch {
    await fs.writeFile(AUDIT_LOG_PATH, "", { mode: 0o600 });
  }
  try {
    await fs.access(CHARACTER_LOG_PATH);
  } catch {
    await fs.writeFile(CHARACTER_LOG_PATH, "", { mode: 0o600 });
  }
}

/**
 * Sanitize values to prevent NDJSON injection — JSON-escapes control characters
 * in strings so each JSON.stringify produces exactly one line.
 * Uses JSON.stringify to properly escape \n, \r, \t, and other control chars
 * instead of stripping them, preserving data fidelity.
 */
function sanitizeForNdjson(value: unknown): unknown {
  if (typeof value === "string") return JSON.stringify(value).slice(1, -1);
  if (Array.isArray(value)) return value.map(sanitizeForNdjson);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[JSON.stringify(k).slice(1, -1)] = sanitizeForNdjson(v);
    }
    return out;
  }
  return value;
}

async function appendAuditEntry(entry: AuditEntry): Promise<void> {
  const sanitized = {
    ...entry,
    metadata: entry.metadata
      ? (sanitizeForNdjson(entry.metadata) as Record<string, unknown>)
      : undefined,
  };
  const line = JSON.stringify(sanitized) + "\n";
  // Post-write validation: verify the serialized line round-trips as valid JSON
  try {
    JSON.parse(line);
  } catch (err) {
    logger.error(`REFUSING to append malformed audit entry: ${err}`);
    return;
  }
  try {
    await auditWriteRetry.execute(() => fs.appendFile(AUDIT_LOG_PATH, line, "utf-8"), {
      serviceName: "echoes-audit-write",
      operationName: "appendFile",
      startTime: Date.now(),
    });
  } catch (err) {
    process.stderr.write(
      `[echoes-server] audit write exhausted after retries: ${
        err instanceof RetryExhaustedError ? err.message : String(err)
      }\n`,
    );
    throw err;
  }
}

function normalizeAuditStatus(status: unknown): AuditEntry["status"] | null {
  if (
    status === "success" ||
    status === "blocked" ||
    status === "failure" ||
    status === "dry_run" ||
    status === "error"
  ) {
    return status;
  }
  return null;
}

const MAX_AUDIT_FILE_BYTES = 100 * 1024 * 1024; // 100 MB guard
const readLimiter = new SessionRateLimiter();
const precedentStore = new PrecedentStore(PRECEDENTS_DIR);
const RUN_MODES = ["live", "sandbox", "edge"] as const;
type RunMode = (typeof RUN_MODES)[number];
const runModeSchema = z
  .enum(RUN_MODES)
  .describe("Execution mode: live allows normal writes; sandbox/edge block writes under $HOME");

function pathIsInside(targetPath: string, rootPath: string): boolean {
  const target = path.resolve(targetPath);
  const root = path.resolve(rootPath);
  if (target === root) return true;
  const rel = path.relative(root, target);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function assertMutablePathsAllowed(runMode: RunMode, paths: string[]): void {
  if (runMode === "live") return;
  const home = homedir();
  const blocked = paths.filter((p) => pathIsInside(p, home));
  if (blocked.length > 0) {
    throw new Error(`runMode=${runMode} blocked write under HOME: ${blocked.join(", ")}`);
  }
}

async function readAuditLog(
  limit: number,
  filter?: { tool?: string; status?: string; since?: string },
  metadata?: { parseErrors?: number },
): Promise<AuditEntry[]> {
  let content: string;
  try {
    const stat = await fs.stat(AUDIT_LOG_PATH);
    if (stat.size > MAX_AUDIT_FILE_BYTES) {
      throw new Error(
        `Audit log too large (${Math.round(
          stat.size / (1024 * 1024),
        )}MB) — refusing to load into memory`,
      );
    }
    content = await fs.readFile(AUDIT_LOG_PATH, "utf-8");
  } catch {
    return [];
  }

  const lines = content.trim().split("\n").filter(Boolean);
  let corruptLineCount = 0;
  let entries: AuditEntry[] = lines
    .map((line) => {
      try {
        const parsed = JSON.parse(line) as Partial<AuditEntry>;
        const status = normalizeAuditStatus(parsed.status);
        if (!status || !parsed.timestamp || !parsed.source || !parsed.tool) {
          corruptLineCount++;
          return null;
        }
        return {
          ...parsed,
          id: parsed.id ?? `synth-${parsed.timestamp}`,
          status,
        } as AuditEntry;
      } catch {
        corruptLineCount++;
        return null;
      }
    })
    .filter(Boolean) as AuditEntry[];
  if (corruptLineCount > 0) {
    logger.warn(`${corruptLineCount} corrupt/malformed lines skipped in audit log`);
  }

  if (filter?.tool) {
    entries = entries.filter((e) => e.tool === filter.tool);
  }
  if (filter?.status) {
    const normalizedStatus = normalizeAuditStatus(filter.status);
    if (normalizedStatus) {
      entries = entries.filter((entry) => entry.status === normalizedStatus);
    }
  }
  if (filter?.since) {
    const since = new Date(filter.since).getTime();
    entries = entries.filter((e) => new Date(e.timestamp).getTime() >= since);
  }

  if (metadata) metadata.parseErrors = corruptLineCount;
  return entries.slice(-limit).reverse();
}

/** Atomic write: write to .tmp then rename to prevent corruption on crash/concurrent access. */
async function atomicWriteJson(filepath: string, data: unknown): Promise<void> {
  const tmpPath = filepath + `.tmp.${process.pid}`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmpPath, filepath);
}

async function saveTelemetrySnapshot(snapshot: TelemetrySnapshot): Promise<string> {
  const filename = `snapshot-${Date.now()}.json`;
  const filepath = path.join(TELEMETRY_DIR, filename);
  await atomicWriteJson(filepath, snapshot);
  return filepath;
}

// ── Character State Layer ──

const MAX_CHARACTER_FILE_BYTES = 50 * 1024 * 1024; // 50 MB guard

async function appendCharacterSnapshot(snapshot: CharacterSnapshot): Promise<void> {
  const sanitized = {
    ...snapshot,
    metadata: snapshot.metadata
      ? (sanitizeForNdjson(snapshot.metadata) as Record<string, unknown>)
      : undefined,
  };
  const line = JSON.stringify(sanitized) + "\n";
  try {
    JSON.parse(line);
  } catch (err) {
    logger.error(`REFUSING to append malformed character snapshot: ${err}`);
    return;
  }
  await fs.appendFile(CHARACTER_LOG_PATH, line, "utf-8");
}

async function readCharacterLog(
  limit: number,
  filter?: { mood?: string; rulePack?: string; since?: string },
): Promise<CharacterSnapshot[]> {
  let content: string;
  try {
    const stat = await fs.stat(CHARACTER_LOG_PATH);
    if (stat.size > MAX_CHARACTER_FILE_BYTES) {
      throw new Error(`Character log too large (${Math.round(stat.size / (1024 * 1024))}MB)`);
    }
    content = await fs.readFile(CHARACTER_LOG_PATH, "utf-8");
  } catch {
    return [];
  }

  const lines = content.trim().split("\n").filter(Boolean);
  let entries: CharacterSnapshot[] = lines
    .map((line) => {
      try {
        return JSON.parse(line) as CharacterSnapshot;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as CharacterSnapshot[];

  if (filter?.mood) {
    entries = entries.filter((e) => e.mood === filter.mood);
  }
  if (filter?.rulePack) {
    entries = entries.filter((e) => e.rulePack === filter.rulePack);
  }
  if (filter?.since) {
    const since = new Date(filter.since).getTime();
    entries = entries.filter((e) => new Date(e.timestamp).getTime() >= since);
  }

  return entries.slice(-limit).reverse();
}

async function listTelemetrySnapshots(limit: number): Promise<TelemetrySnapshot[]> {
  let files: string[];
  try {
    files = await fs.readdir(TELEMETRY_DIR);
  } catch {
    return [];
  }

  const jsonFiles = files
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, limit);
  const snapshots: TelemetrySnapshot[] = [];

  for (const file of jsonFiles) {
    try {
      const content = await fs.readFile(path.join(TELEMETRY_DIR, file), "utf-8");
      snapshots.push(JSON.parse(content));
    } catch {
      // skip corrupt files
    }
  }

  return snapshots;
}

async function getAuditStats(): Promise<Record<string, unknown>> {
  const entries = await readAuditLog(10000);
  const total = entries.length;
  const byStatus: Record<string, number> = {};
  const byTool: Record<string, number> = {};
  const bySource: Record<string, number> = {};

  for (const e of entries) {
    byStatus[e.status] = (byStatus[e.status] || 0) + 1;
    byTool[e.tool] = (byTool[e.tool] || 0) + 1;
    bySource[e.source] = (bySource[e.source] || 0) + 1;
  }

  const avgDuration =
    entries.filter((e) => e.durationMs != null).reduce((sum, e) => sum + (e.durationMs ?? 0), 0) /
    (entries.filter((e) => e.durationMs != null).length || 1);

  return {
    total,
    byStatus,
    byTool,
    bySource,
    avgDurationMs: Math.round(avgDuration),
    oldestEntry: entries[entries.length - 1]?.timestamp ?? null,
    newestEntry: entries[0]?.timestamp ?? null,
  };
}

// ── Server ──

export function buildServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: VERSION,
  });
  // SDK generic inference can explode on deep Zod schemas; use a widened call signature.
  const registerTool = server.registerTool.bind(server) as any;

  // Health check
  registerTool(
    "health_check",
    { description: "Check echoes-server health and data store status" },
    async () => {
      let auditSize = 0;
      let auditLineCount = 0;
      let auditCorruptLines = 0;
      let telemetryCount = 0;
      try {
        const stat = await fs.stat(AUDIT_LOG_PATH);
        auditSize = stat.size;
        // Quick corruption check — count lines vs parseable entries
        if (stat.size <= MAX_AUDIT_FILE_BYTES) {
          const raw = await fs.readFile(AUDIT_LOG_PATH, "utf-8");
          const lines = raw.trim().split("\n").filter(Boolean);
          auditLineCount = lines.length;
          for (const line of lines) {
            try {
              JSON.parse(line);
            } catch {
              auditCorruptLines++;
            }
          }
        }
      } catch {
        /* no file yet */
      }
      try {
        const files = await fs.readdir(TELEMETRY_DIR);
        telemetryCount = files.filter((f) => f.endsWith(".json")).length;
      } catch {
        /* no dir yet */
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                status: auditCorruptLines > 0 ? "degraded" : "ok",
                server: SERVER_NAME,
                version: VERSION,
                dataDir: DATA_DIR,
                auditLogBytes: auditSize,
                auditLogSizeMB: Math.round(auditSize / (1024 * 1024)),
                auditLineCount,
                auditCorruptLines,
                auditIntegrityWarning:
                  auditCorruptLines > 0
                    ? `${auditCorruptLines} corrupt lines detected — audit integrity degraded`
                    : null,
                telemetrySnapshots: telemetryCount,
                timestamp: new Date().toISOString(),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // NEXT: AuditEvent → anticipation_signal attribution chain

  // Record audit entry
  registerTool(
    "record_audit",
    {
      description: "Record an audit entry from any MCP server pipeline execution",
      inputSchema: z.object({
        source: z.string().min(1).describe('Source server name (e.g. "echoes", "grid-rag")'),
        tool: z.string().min(1).describe("Tool name that was called"),
        status: z
          .enum(["success", "failure", "blocked", "dry_run", "error"])
          .describe("Execution result status"),
        durationMs: z.number().optional().describe("Execution duration in milliseconds"),
        metadata: z.record(z.string(), z.unknown()).optional().describe("Additional context"),
        runMode: runModeSchema,
      }),
    },
    async (args: any) => {
      await ensureDataDir();
      assertMutablePathsAllowed(args.runMode as RunMode, [
        AUDIT_LOG_PATH,
        precedentStore.storePath,
      ]);
      const now = new Date().toISOString();

      // Extract W3C trace context from _trace arg (if provided by caller)
      const incomingTrace: TraceContext | null = extractTrace(args);
      const span = incomingTrace ? createChildSpan(incomingTrace) : createRootSpan();

      // P-INT-001 + P-INT-002: Validate source and timestamp integrity
      const integrityCheck = AuditIntegrityGuard.validateEntry(args.source, now);
      if (integrityCheck.verdict === "deny") {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                recorded: false,
                error: integrityCheck.reason,
                policyId: integrityCheck.policyId,
              }),
            },
          ],
        };
      }

      const entry: AuditEntry = {
        id: generateId("aud"),
        timestamp: now,
        source: args.source,
        tool: args.tool,
        status: normalizeAuditStatus(args.status) ?? "failure",
        durationMs: args.durationMs,
        traceId: span.traceId,
        spanId: span.spanId,
        metadata: args.metadata as Record<string, unknown> | undefined,
      };
      try {
        await appendAuditEntry(entry);
      } catch {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                recorded: false,
                id: entry.id,
                error: "audit write failed after retries — check server stderr",
              }),
            },
          ],
          isError: true,
        };
      }

      // Feed recurrence detector for failure/blocked/error events
      let recurrence: RecurrenceCheckResult | null = null;
      if (PRECEDENT_TRIGGER_STATUSES.has(entry.status)) {
        recurrence = checkRecurrence(
          precedentStore,
          {
            source: entry.source,
            tool: entry.tool,
            status: entry.status,
            metadata: entry.metadata,
          },
          false,
          true,
        );
      } else if (entry.status === "success") {
        precedentStore.recordSuccess(entry.source, entry.tool);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              recorded: true,
              id: entry.id,
              ...(recurrence ? { recurrence } : {}),
            }),
          },
        ],
      };
    },
  );

  // Record a Glimpse preflight result — mandatory safety check before message commit.
  // Writes a structured audit entry so graph_compiler can compile PREFLIGHT entities.
  registerTool(
    "record_glimpse_preflight",
    {
      description:
        "Record a Glimpse preflight alignment result from canopy/echoes. " +
        "Preflight checks are mandatory (the rearview mirror before merging to the highway). " +
        "Results are written to the audit log so graph_compiler can compile them as PREFLIGHT entities.",
      inputSchema: z.object({
        source: z
          .string()
          .min(1)
          .default("echoes-canopy")
          .describe('Source identifier (e.g. "echoes-canopy")'),
        session_id: z.string().describe("EchoesAssistantV2 session_id"),
        aligned: z.boolean().describe("Whether the preflight alignment check passed"),
        status: z.string().describe('Glimpse status string (e.g. "aligned", "misaligned")'),
        sample: z.string().optional().describe("Sample text from Glimpse result"),
        essence: z.string().optional().describe("Essence summary from Glimpse engine"),
        delta: z.number().optional().describe("Trajectory delta from Glimpse result"),
        attempt: z.number().optional().describe("Attempt number from Glimpse engine"),
        stale: z.boolean().optional().describe("Whether the Glimpse result is stale"),
        probability_score: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe("Probability score from preflight trajectory analysis (0–1)"),
        trajectory_delta: z
          .number()
          .optional()
          .describe("Trajectory delta between current and prior alignment"),
        runMode: runModeSchema,
      }),
    },
    async (args: any) => {
      await ensureDataDir();
      assertMutablePathsAllowed(args.runMode as RunMode, [AUDIT_LOG_PATH]);
      const now = new Date().toISOString();

      const integrityCheck = AuditIntegrityGuard.validateEntry(args.source, now);
      if (integrityCheck.verdict === "deny") {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                recorded: false,
                error: integrityCheck.reason,
                policyId: integrityCheck.policyId,
              }),
            },
          ],
        };
      }

      const entry: AuditEntry = {
        id: generateId("aud"),
        timestamp: now,
        source: args.source ?? "echoes-canopy",
        tool: "glimpse_preflight",
        status: args.aligned ? "success" : "failure",
        metadata: {
          session_id: args.session_id,
          aligned: args.aligned,
          glimpse_status: args.status,
          sample: args.sample,
          essence: args.essence,
          delta: args.delta,
          attempt: args.attempt,
          stale: args.stale,
          probability_score: args.probability_score,
          trajectory_delta: args.trajectory_delta,
        },
      };
      await appendAuditEntry(entry);

      // Feed recurrence detector on misalignment
      let recurrence: RecurrenceCheckResult | null = null;
      if (!args.aligned) {
        recurrence = checkRecurrence(
          precedentStore,
          {
            source: entry.source,
            tool: entry.tool,
            status: entry.status,
            metadata: entry.metadata,
          },
          false,
          true,
        );
      } else {
        precedentStore.recordSuccess(entry.source, entry.tool);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              recorded: true,
              id: entry.id,
              aligned: args.aligned,
              ...(recurrence ? { recurrence } : {}),
            }),
          },
        ],
      };
    },
  );

  // Query audit log
  registerTool(
    "query_audit",
    {
      description: "Query the persistent audit log with optional filters",
      inputSchema: z.object({
        limit: z.number().min(1).max(500).optional().default(20).describe("Max entries to return"),
        tool: z.string().optional().describe("Filter by tool name"),
        status: z
          .enum(["success", "failure", "blocked", "dry_run", "error"])
          .optional()
          .describe("Filter by status"),
        since: z
          .string()
          .optional()
          .describe("ISO timestamp — only return entries after this time"),
      }),
    },
    async (args: any) => {
      const rlMsg = readLimiter.check("query_audit");
      if (rlMsg)
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rlMsg }) }],
          isError: true,
        };
      await ensureDataDir();
      const metadata: { parseErrors?: number } = {};
      const entries = await readAuditLog(
        args.limit ?? 20,
        {
          tool: args.tool,
          status: args.status,
          since: args.since,
        },
        metadata,
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                count: entries.length,
                entries,
                parseErrors: metadata.parseErrors ?? 0,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // Audit statistics
  registerTool(
    "audit_stats",
    {
      description:
        "Get aggregate statistics from the audit log — counts by tool, status, source, and average duration",
      inputSchema: z.object({}),
    },
    async () => {
      const rlMsg = readLimiter.check("audit_stats");
      if (rlMsg)
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rlMsg }) }],
          isError: true,
        };
      await ensureDataDir();
      const stats = await getAuditStats();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(stats, null, 2) }],
      };
    },
  );

  // Save telemetry snapshot
  registerTool(
    "save_telemetry",
    {
      description: "Save a workspace telemetry snapshot for longitudinal tracking",
      inputSchema: z.object({
        workspace: z.string().min(1).describe("Workspace name or path"),
        projects: z.number().describe("Number of projects scanned"),
        activeServers: z.array(z.string()).describe("List of active MCP server names"),
        metrics: z
          .record(z.string(), z.number())
          .describe("Key-value numeric metrics (e.g. healthScore, commitCount)"),
        characterState: z
          .object({
            mood: z.string().describe("Current mood from PersonalityEngine"),
            rulePack: z.string().describe("Active rule-pack"),
            gateConfidence: z.number().min(0).max(1).describe("Last GateVerdict confidence"),
            entityCount: z.number().min(0).describe("Compiled entity count"),
            dominantTraits: z
              .record(z.string(), z.number())
              .describe("Top personality trait levels"),
            consentType: z.string().optional().describe("Active consent type"),
            provenanceId: z.string().optional().describe("Latest provenance chain ID"),
          })
          .optional()
          .describe("Atlas character module state — mood, traits, governance, graph stats"),
        runMode: runModeSchema,
      }),
    },
    async (args: any) => {
      await ensureDataDir();
      assertMutablePathsAllowed(args.runMode as RunMode, [TELEMETRY_DIR]);
      const snapshot: TelemetrySnapshot = {
        timestamp: new Date().toISOString(),
        workspace: args.workspace,
        projects: args.projects,
        activeServers: args.activeServers,
        metrics: args.metrics,
        characterState: args.characterState as CharacterState | undefined,
      };
      const filepath = await saveTelemetrySnapshot(snapshot);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ saved: true, path: filepath }),
          },
        ],
      };
    },
  );

  // List telemetry snapshots
  registerTool(
    "list_telemetry",
    {
      description: "List recent telemetry snapshots for trend analysis",
      inputSchema: z.object({
        limit: z
          .number()
          .min(1)
          .max(100)
          .optional()
          .default(10)
          .describe("Max snapshots to return"),
      }),
    },
    async (args: any) => {
      const rlMsg = readLimiter.check("list_telemetry");
      if (rlMsg)
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rlMsg }) }],
          isError: true,
        };
      await ensureDataDir();
      const snapshots = await listTelemetrySnapshots(args.limit ?? 10);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ count: snapshots.length, snapshots }, null, 2),
          },
        ],
      };
    },
  );

  // ── Atlas Character State ──

  registerTool(
    "save_character_snapshot",
    {
      description:
        "Persist an Atlas character module state snapshot — mood, traits, rule-pack, gate verdict, compiled entity count, and cluster notes. Appends to character NDJSON log for longitudinal tracking.",
      inputSchema: z.object({
        mood: z
          .enum(["enthusiastic", "curious", "supportive", "playful", "focused", "calm", "creative"])
          .describe("Current Mood enum value from PersonalityEngine"),
        traits: z
          .record(z.string(), z.number().min(0).max(1))
          .describe("PersonalityTrait levels (0.0–1.0), keyed by trait name"),
        rulePack: z
          .enum(["base", "exploratory", "restricted"])
          .describe("Active rule-pack from select_rule_pack()"),
        gateVerdict: z
          .object({
            allowed: z.boolean(),
            reason: z.string(),
            provenanceId: z.string(),
            confidence: z.number().min(0).max(1),
          })
          .describe("GateVerdict from governance_gates.check()"),
        entityCount: z.number().min(0).describe("Number of entities from graph_compiler"),
        clusterNotes: z
          .array(
            z.object({
              id: z.string(),
              phenomenonType: z.enum(["event", "density", "sparsity"]),
              spikeValue: z.number(),
              observation: z.string(),
              retrievalKeys: z.array(z.string()),
            }),
          )
          .optional()
          .default([])
          .describe("ClusterNote observations from knowledge_graph"),
        metadata: z.record(z.string(), z.unknown()).optional().describe("Additional context"),
        runMode: runModeSchema,
      }),
    },
    async (args: any) => {
      await ensureDataDir();
      assertMutablePathsAllowed(args.runMode as RunMode, [CHARACTER_LOG_PATH]);

      const snapshot: CharacterSnapshot = {
        id: generateId("chr"),
        timestamp: new Date().toISOString(),
        mood: args.mood,
        traits: args.traits,
        rulePack: args.rulePack,
        gateVerdict: args.gateVerdict,
        entityCount: args.entityCount,
        clusterNotes: args.clusterNotes ?? [],
        metadata: args.metadata as Record<string, unknown> | undefined,
      };
      await appendCharacterSnapshot(snapshot);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              saved: true,
              id: snapshot.id,
              mood: snapshot.mood,
              rulePack: snapshot.rulePack,
              gateAllowed: snapshot.gateVerdict.allowed,
              entityCount: snapshot.entityCount,
              clusterNoteCount: snapshot.clusterNotes.length,
            }),
          },
        ],
      };
    },
  );

  registerTool(
    "query_character_state",
    {
      description:
        "Query character state history — mood transitions, trait drift, governance verdicts, and cluster note trends. Supports filtering by mood, rule-pack, and time range.",
      inputSchema: z.object({
        limit: z
          .number()
          .min(1)
          .max(200)
          .optional()
          .default(20)
          .describe("Max snapshots to return"),
        mood: z
          .enum(["enthusiastic", "curious", "supportive", "playful", "focused", "calm", "creative"])
          .optional()
          .describe("Filter by mood state"),
        rulePack: z
          .enum(["base", "exploratory", "restricted"])
          .optional()
          .describe("Filter by rule-pack"),
        since: z
          .string()
          .optional()
          .describe("ISO timestamp — only return snapshots after this time"),
      }),
    },
    async (args: any) => {
      const rlMsg = readLimiter.check("query_character_state");
      if (rlMsg)
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rlMsg }) }],
          isError: true,
        };
      await ensureDataDir();
      const snapshots = await readCharacterLog(args.limit ?? 20, {
        mood: args.mood,
        rulePack: args.rulePack,
        since: args.since,
      });

      // Derive summary statistics from returned window
      const moodCounts: Record<string, number> = {};
      const rulePackCounts: Record<string, number> = {};
      let gateAllowedCount = 0;
      let gateDeniedCount = 0;
      let totalConfidence = 0;
      let totalEntities = 0;
      let totalClusterNotes = 0;

      for (const s of snapshots) {
        moodCounts[s.mood] = (moodCounts[s.mood] || 0) + 1;
        rulePackCounts[s.rulePack] = (rulePackCounts[s.rulePack] || 0) + 1;
        if (s.gateVerdict.allowed) gateAllowedCount++;
        else gateDeniedCount++;
        totalConfidence += s.gateVerdict.confidence;
        totalEntities += s.entityCount;
        totalClusterNotes += s.clusterNotes.length;
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                count: snapshots.length,
                summary: {
                  moodDistribution: moodCounts,
                  rulePackDistribution: rulePackCounts,
                  gateVerdicts: { allowed: gateAllowedCount, denied: gateDeniedCount },
                  avgConfidence:
                    snapshots.length > 0
                      ? Math.round((totalConfidence / snapshots.length) * 1000) / 1000
                      : 0,
                  totalEntities,
                  totalClusterNotes,
                },
                snapshots,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── Query Clusters ──

  registerTool(
    "query_character_clusters",
    {
      description:
        "Find relevant query clusters and discussion topics for the Atlas character module. Returns matching axes, probable queries, discussion seeds, and telemetry keys to watch. Use to keep runtime telemetry focused and surface next-step investigations.",
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe(
            "Free-text query to match against cluster content. Omit to return all clusters.",
          ),
        axis: z
          .enum(["mood", "governance", "personality", "graph", "cluster", "coherence"])
          .optional()
          .describe("Filter to a specific character module axis"),
      }),
    },
    async (args: any) => {
      let clusters = CHARACTER_QUERY_CLUSTERS;

      if (args.axis) {
        clusters = clusters.filter((c) => c.axis === args.axis);
      }
      if (args.query) {
        const matched = findRelevantClusters(args.query);
        const matchedAxes = new Set(matched.map((m) => m.axis));
        clusters = clusters.filter((c) => matchedAxes.has(c.axis));
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                count: clusters.length,
                clusters: clusters.map((c) => ({
                  axis: c.axis,
                  queryCount: c.queries.length,
                  topicCount: c.topics.length,
                  queries: c.queries,
                  topics: c.topics,
                  telemetryKeys: c.telemetryKeys,
                })),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── Precedent Enforcement ──

  registerTool(
    "check_recurrence",
    {
      description:
        "Check if a tool+source+status pattern would be a recurrence and what enforcement level it would trigger. Read-only — does not record.",
      inputSchema: z.object({
        source: z.string().min(1).describe("Server name"),
        tool: z.string().min(1).describe("Tool name"),
        status: z
          .enum(["success", "failure", "blocked", "dry_run", "error"])
          .describe("Status to check"),
        metadata: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Metadata for fingerprint matching"),
        isMutating: z
          .boolean()
          .optional()
          .default(false)
          .describe("Whether the tool is mutating (affects block vs restrict)"),
        runMode: runModeSchema
          .optional()
          .default("sandbox")
          .describe("Use sandbox/edge for simulation; live is allowed but still read-only"),
      }),
    },
    async (args: any) => {
      const result = checkRecurrence(
        precedentStore,
        {
          source: args.source,
          tool: args.tool,
          status: args.status,
          metadata: args.metadata as Record<string, unknown> | undefined,
        },
        args.isMutating ?? false,
        false,
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  registerTool(
    "query_precedents",
    {
      description:
        "Query active precedents with optional filters by escalation level, source, or tool.",
      inputSchema: z.object({
        level: z
          .enum(["observed", "flagged", "restricted", "blocked"])
          .optional()
          .describe("Filter by escalation level"),
        source: z.string().optional().describe("Filter by source server"),
        tool: z.string().optional().describe("Filter by tool name"),
        limit: z.number().min(1).max(100).optional().default(20).describe("Max records to return"),
      }),
    },
    async (args: any) => {
      const rlMsg = readLimiter.check("query_precedents");
      if (rlMsg)
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: rlMsg }) }],
          isError: true,
        };

      let records = args.level
        ? precedentStore.listByLevel(args.level)
        : precedentStore.listActive(args.limit ?? 20);

      if (args.source) {
        records = records.filter((r) => r.fingerprint.source === args.source);
      }
      if (args.tool) {
        records = records.filter((r) => r.fingerprint.tool === args.tool);
      }

      records = records.slice(0, args.limit ?? 20);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                count: records.length,
                precedents: records.map((r) => ({
                  id: r.id,
                  source: r.fingerprint.source,
                  tool: r.fingerprint.tool,
                  category: r.fingerprint.category,
                  status: r.fingerprint.status,
                  occurrenceCount: r.occurrenceCount,
                  escalationLevel: r.escalationLevel,
                  firstSeen: r.firstSeen,
                  lastSeen: r.lastSeen,
                  consecutiveSuccesses: r.consecutiveSuccesses,
                  resolved: !!r.resolution,
                })),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  registerTool(
    "resolve_precedent",
    {
      description:
        "Mark a precedent as resolved. Resets escalation to observed and starts a 7-day cooldown. If the pattern recurs during cooldown, escalation resumes.",
      inputSchema: z.object({
        precedentId: z.string().min(1).describe("Precedent ID to resolve"),
        action: z.string().min(1).describe("What was done to fix the root cause"),
        resolvedBy: z
          .string()
          .optional()
          .default("manual")
          .describe('Who resolved it (session ID, "auto", or label)'),
        cooldownDays: z
          .number()
          .min(1)
          .max(30)
          .optional()
          .default(7)
          .describe("Days before escalation fully resets"),
        runMode: runModeSchema,
      }),
    },
    async (args: any) => {
      assertMutablePathsAllowed(args.runMode as RunMode, [precedentStore.storePath]);
      const cooldownMs = (args.cooldownDays ?? 7) * 24 * 60 * 60 * 1000;
      const resolution = {
        resolvedAt: new Date().toISOString(),
        resolvedBy: args.resolvedBy ?? "manual",
        action: args.action,
        cooldownUntil: new Date(Date.now() + cooldownMs).toISOString(),
      };
      const record = precedentStore.resolve(args.precedentId, resolution);
      if (!record) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `Precedent ${args.precedentId} not found`,
              }),
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                resolved: true,
                id: record.id,
                source: record.fingerprint.source,
                tool: record.fingerprint.tool,
                previousOccurrences: record.occurrenceCount,
                cooldownUntil: resolution.cooldownUntil,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  registerTool(
    "enforcement_status",
    {
      description:
        "Get a summary of the precedent enforcement system — active counts by level, recent escalations, and decay/de-escalation status.",
      inputSchema: z.object({}),
    },
    async () => {
      // Apply decay and de-escalation on read
      const decayed = applyTimeDecay(precedentStore);
      const deescalated = applySuccessDeescalation(precedentStore);
      const pruned = precedentStore.prune();

      const active = precedentStore.listActive(1000);
      const byLevel = {
        observed: 0,
        flagged: 0,
        restricted: 0,
        blocked: 0,
      };
      for (const r of active) {
        byLevel[r.escalationLevel]++;
      }

      const recent = active.slice(0, 5).map((r) => ({
        id: r.id,
        source: r.fingerprint.source,
        tool: r.fingerprint.tool,
        category: r.fingerprint.category,
        occurrences: r.occurrenceCount,
        level: r.escalationLevel,
        lastSeen: r.lastSeen,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                status:
                  byLevel.blocked > 0
                    ? "enforcing"
                    : byLevel.restricted > 0
                      ? "elevated"
                      : "normal",
                totalActive: active.length,
                byLevel,
                maintenance: {
                  decayed,
                  deescalated,
                  pruned,
                },
                recentPrecedents: recent,
                storePath: precedentStore.storePath,
                timestamp: new Date().toISOString(),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── Gruff Bridge ──

  const gruffWeightsSchema = z.object({
    sound: z.number().min(0).max(1),
    gesture: z.number().min(0).max(1),
    calculation: z.number().min(0).max(1),
  });

  const gruffSequenceSchema = z.object({
    stepName: z.string().min(1),
    stepIndex: z.number().int().min(0),
  });

  const gruffProportionSchema = z.object({
    schemaVersion: z.literal("gruff-proportion-v1"),
    generatedAt: z.string(),
    audioDrive: z.number().min(0).max(1),
    theta: z.number().min(0).max(1),
    weights: gruffWeightsSchema,
    sequence: gruffSequenceSchema,
    manifest: z
      .object({
        notebookId: z.string(),
        revisionId: z.string().nullable(),
        blockCount: z.number().int().min(0),
      })
      .passthrough(),
    compass: z.record(z.string(), z.unknown()),
    provenance: z
      .object({
        boardTitle: z.string(),
        schemaVersion: z.string(),
        renderedAt: z.string(),
      })
      .passthrough(),
  });

  registerTool(
    "record_gruff_proportion",
    {
      description:
        "Record a gruff-proportion-v1 payload emitted by the gruff Python runtime (compass render bridge). " +
        "Appends to gruff-proportions.ndjson and writes a corresponding audit entry.",
      inputSchema: z.object({
        payload: gruffProportionSchema.describe("Full gruff-proportion-v1 object"),
        runMode: runModeSchema,
      }),
    },
    async (args: any) => {
      await ensureDataDir();
      assertMutablePathsAllowed(args.runMode as RunMode, [GRUFF_PROPORTIONS_PATH, AUDIT_LOG_PATH]);

      const now = new Date().toISOString();
      const id = generateId("gruff");
      const record = { id, receivedAt: now, ...args.payload };

      await fs.appendFile(GRUFF_PROPORTIONS_PATH, JSON.stringify(record) + "\n", "utf-8");

      const auditEntry: AuditEntry = {
        id: generateId("aud"),
        timestamp: now,
        source: "gruff",
        tool: "proportion",
        status: "success",
        metadata: {
          proportionId: id,
          notebookId: args.payload?.manifest?.notebookId,
          revisionId: args.payload?.manifest?.revisionId,
          audioDrive: args.payload?.audioDrive,
          theta: args.payload?.theta,
        },
      };
      await appendAuditEntry(auditEntry);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ recorded: true, id, receivedAt: now }, null, 2),
          },
        ],
      };
    },
  );

  // ── Start ──

  return server;
}

export async function startServer(): Promise<McpServer> {
  await ensureDataDir();
  logger.info(`v${VERSION} starting — data: ${DATA_DIR}`);
  const server = buildServer();
  await server.connect(new StdioServerTransport());
  return server;
}

const isEntrypoint =
  process.argv[1] != null && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isEntrypoint) {
  async function main() {
    try {
      await startServer();
    } catch (error) {
      logger.error(`failed to start`, { error: String(error) });
      process.exit(1);
    }
  }

  void main();
}
