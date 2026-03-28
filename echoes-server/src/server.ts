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

import { AuditIntegrityGuard } from '@cascade/shared-types/security-policy';
import { generateId } from '@cascade/shared-types/id';
import { McpLogger } from '@cascade/shared-types/mcp-logger';
import { DEFAULT_COOLDOWN_MS, PRECEDENT_TRIGGER_STATUSES } from '@cascade/shared-types/precedent';
import type { RecurrenceCheckResult } from '@cascade/shared-types/precedent';
import { SessionRateLimiter } from '@cascade/shared-types/session-rate-limit';
import { PrecedentStore } from './precedent-store.js';
import { applySuccessDeescalation, applyTimeDecay, checkRecurrence } from './recurrence.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { promises as fs } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import * as z from 'zod';
import { getConfig } from './config.js';

// ── Constants ──

const SERVER_NAME = 'echoes-server';
const VERSION = '1.0.0';
const logger = new McpLogger(SERVER_NAME);
const config = getConfig();
const DATA_DIR = config.dataDir;
const AUDIT_LOG_PATH = config.auditLogPath;
const TELEMETRY_DIR = config.telemetryDir;

// ── Data Layer ──

interface AuditEntry {
  id: string;
  timestamp: string;
  source: string;
  tool: string;
  status: 'success' | 'failure' | 'blocked' | 'dry_run' | 'error';
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

interface TelemetrySnapshot {
  timestamp: string;
  workspace: string;
  projects: number;
  activeServers: string[];
  metrics: Record<string, number>;
}

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  await fs.mkdir(TELEMETRY_DIR, { recursive: true, mode: 0o700 });
  try {
    await fs.access(AUDIT_LOG_PATH);
  } catch {
    await fs.writeFile(AUDIT_LOG_PATH, '', { mode: 0o600 });
  }
}

/**
 * Sanitize values to prevent NDJSON injection — JSON-escapes control characters
 * in strings so each JSON.stringify produces exactly one line.
 * Uses JSON.stringify to properly escape \n, \r, \t, and other control chars
 * instead of stripping them, preserving data fidelity.
 */
function sanitizeForNdjson(value: unknown): unknown {
  if (typeof value === 'string') return JSON.stringify(value).slice(1, -1);
  if (Array.isArray(value)) return value.map(sanitizeForNdjson);
  if (value !== null && typeof value === 'object') {
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
      ? sanitizeForNdjson(entry.metadata) as Record<string, unknown>
      : undefined,
  };
  const line = JSON.stringify(sanitized) + '\n';
  // Post-write validation: verify the serialized line round-trips as valid JSON
  try {
    JSON.parse(line);
  } catch (err) {
    logger.error(`REFUSING to append malformed audit entry: ${err}`);
    return;
  }
  await fs.appendFile(AUDIT_LOG_PATH, line, 'utf-8');
}

function normalizeAuditStatus(status: unknown): AuditEntry['status'] | null {
  if (status === 'success' || status === 'blocked' || status === 'failure' || status === 'dry_run' || status === 'error') {
    return status;
  }
  return null;
}

const MAX_AUDIT_FILE_BYTES = 100 * 1024 * 1024; // 100 MB guard
const readLimiter = new SessionRateLimiter();
const precedentStore = new PrecedentStore();

async function readAuditLog(
  limit: number,
  filter?: { tool?: string; status?: string; since?: string },
  metadata?: { parseErrors?: number }
): Promise<AuditEntry[]> {
  let content: string;
  try {
    const stat = await fs.stat(AUDIT_LOG_PATH);
    if (stat.size > MAX_AUDIT_FILE_BYTES) {
      throw new Error(`Audit log too large (${Math.round(stat.size / (1024 * 1024))}MB) — refusing to load into memory`);
    }
    content = await fs.readFile(AUDIT_LOG_PATH, 'utf-8');
  } catch {
    return [];
  }

  const lines = content.trim().split('\n').filter(Boolean);
  let corruptLineCount = 0;
  let entries: AuditEntry[] = lines.map(line => {
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
  }).filter(Boolean) as AuditEntry[];
  if (corruptLineCount > 0) {
    logger.warn(`${corruptLineCount} corrupt/malformed lines skipped in audit log`);
  }

  if (filter?.tool) {
    entries = entries.filter(e => e.tool === filter.tool);
  }
  if (filter?.status) {
    const normalizedStatus = normalizeAuditStatus(filter.status);
    if (normalizedStatus) {
      entries = entries.filter(entry => {
        if (entry.status === normalizedStatus) {
          return true;
        }
        // Also match legacy entries where 'error' was stored but normalized on read
        if (filter.status === 'error' && (entry.status === 'error' || entry.status === 'failure')) {
          return true;
        }
        return false;
      });
    }
  }
  if (filter?.since) {
    const since = new Date(filter.since).getTime();
    entries = entries.filter(e => new Date(e.timestamp).getTime() >= since);
  }

  if (metadata) metadata.parseErrors = corruptLineCount;
  return entries.slice(-limit).reverse();
}

/** Atomic write: write to .tmp then rename to prevent corruption on crash/concurrent access. */
async function atomicWriteJson(filepath: string, data: unknown): Promise<void> {
  const tmpPath = filepath + `.tmp.${process.pid}`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tmpPath, filepath);
}

async function saveTelemetrySnapshot(snapshot: TelemetrySnapshot): Promise<string> {
  const filename = `snapshot-${Date.now()}.json`;
  const filepath = path.join(TELEMETRY_DIR, filename);
  await atomicWriteJson(filepath, snapshot);
  return filepath;
}

async function listTelemetrySnapshots(limit: number): Promise<TelemetrySnapshot[]> {
  let files: string[];
  try {
    files = await fs.readdir(TELEMETRY_DIR);
  } catch {
    return [];
  }

  const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse().slice(0, limit);
  const snapshots: TelemetrySnapshot[] = [];

  for (const file of jsonFiles) {
    try {
      const content = await fs.readFile(path.join(TELEMETRY_DIR, file), 'utf-8');
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

  const avgDuration = entries
    .filter(e => e.durationMs != null)
    .reduce((sum, e) => sum + (e.durationMs ?? 0), 0) / (entries.filter(e => e.durationMs != null).length || 1);

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

  // Health check
  server.registerTool(
    'health_check',
    { description: 'Check echoes-server health and data store status' },
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
          const raw = await fs.readFile(AUDIT_LOG_PATH, 'utf-8');
          const lines = raw.trim().split('\n').filter(Boolean);
          auditLineCount = lines.length;
          for (const line of lines) {
            try { JSON.parse(line); } catch { auditCorruptLines++; }
          }
        }
      } catch { /* no file yet */ }
      try {
        const files = await fs.readdir(TELEMETRY_DIR);
        telemetryCount = files.filter(f => f.endsWith('.json')).length;
      } catch { /* no dir yet */ }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            status: auditCorruptLines > 0 ? 'degraded' : 'ok',
            server: SERVER_NAME,
            version: VERSION,
            dataDir: DATA_DIR,
            auditLogBytes: auditSize,
            auditLogSizeMB: Math.round(auditSize / (1024 * 1024)),
            auditLineCount,
            auditCorruptLines,
            auditIntegrityWarning: auditCorruptLines > 0
              ? `${auditCorruptLines} corrupt lines detected — audit integrity degraded`
              : null,
            telemetrySnapshots: telemetryCount,
            timestamp: new Date().toISOString(),
          }, null, 2),
        }],
      };
    }
  );

  // Record audit entry
  server.registerTool(
    'record_audit',
    {
      description: 'Record an audit entry from any MCP server pipeline execution',
      inputSchema: z.object({
        source: z.string().min(1).describe('Source server name (e.g. "echoes", "grid-rag")'),
        tool: z.string().min(1).describe('Tool name that was called'),
        status: z.enum(['success', 'failure', 'blocked', 'dry_run', 'error']).describe('Execution result status'),
        durationMs: z.number().optional().describe('Execution duration in milliseconds'),
        metadata: z.record(z.unknown()).optional().describe('Additional context'),
      }),
    },
    async (args) => {
      await ensureDataDir();
      const now = new Date().toISOString();

      // P-INT-001 + P-INT-002: Validate source and timestamp integrity
      const integrityCheck = AuditIntegrityGuard.validateEntry(args.source, now);
      if (integrityCheck.verdict === 'deny') {
        return {
          content: [{
            type: 'text' as const, text: JSON.stringify({
              recorded: false,
              error: integrityCheck.reason,
              policyId: integrityCheck.policyId,
            })
          }],
        };
      }

      const entry: AuditEntry = {
        id: generateId("aud"),
        timestamp: now,
        source: args.source,
        tool: args.tool,
        status: normalizeAuditStatus(args.status) ?? 'failure',
        durationMs: args.durationMs,
        metadata: args.metadata as Record<string, unknown> | undefined,
      };
      await appendAuditEntry(entry);

      // Feed recurrence detector for failure/blocked/error events
      let recurrence: RecurrenceCheckResult | null = null;
      if (PRECEDENT_TRIGGER_STATUSES.has(entry.status)) {
        recurrence = checkRecurrence(precedentStore, {
          source: entry.source,
          tool: entry.tool,
          status: entry.status,
          metadata: entry.metadata,
        });
      } else if (entry.status === 'success') {
        precedentStore.recordSuccess(entry.source, entry.tool);
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            recorded: true,
            id: entry.id,
            ...(recurrence ? { recurrence } : {}),
          }),
        }],
      };
    }
  );

  // Query audit log
  server.registerTool(
    'query_audit',
    {
      description: 'Query the persistent audit log with optional filters',
      inputSchema: z.object({
        limit: z.number().min(1).max(500).optional().default(20).describe('Max entries to return'),
        tool: z.string().optional().describe('Filter by tool name'),
        status: z.enum(['success', 'failure', 'blocked', 'dry_run', 'error']).optional().describe('Filter by status'),
        since: z.string().optional().describe('ISO timestamp — only return entries after this time'),
      }),
    },
    async (args) => {
      const rlMsg = readLimiter.check('query_audit');
      if (rlMsg) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: rlMsg }) }], isError: true };
      await ensureDataDir();
      const metadata: { parseErrors?: number } = {};
      const entries = await readAuditLog(args.limit ?? 20, {
        tool: args.tool,
        status: args.status,
        since: args.since,
      }, metadata);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ count: entries.length, entries, parseErrors: metadata.parseErrors ?? 0 }, null, 2) }],
      };
    }
  );

  // Audit statistics
  server.registerTool(
    'audit_stats',
    {
      description: 'Get aggregate statistics from the audit log — counts by tool, status, source, and average duration',
      inputSchema: z.object({}),
    },
    async () => {
      const rlMsg = readLimiter.check('audit_stats');
      if (rlMsg) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: rlMsg }) }], isError: true };
      await ensureDataDir();
      const stats = await getAuditStats();
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(stats, null, 2) }],
      };
    }
  );

  // Save telemetry snapshot
  server.registerTool(
    'save_telemetry',
    {
      description: 'Save a workspace telemetry snapshot for longitudinal tracking',
      inputSchema: z.object({
        workspace: z.string().min(1).describe('Workspace name or path'),
        projects: z.number().describe('Number of projects scanned'),
        activeServers: z.array(z.string()).describe('List of active MCP server names'),
        metrics: z.record(z.number()).describe('Key-value numeric metrics (e.g. healthScore, commitCount)'),
      }),
    },
    async (args) => {
      await ensureDataDir();
      const snapshot: TelemetrySnapshot = {
        timestamp: new Date().toISOString(),
        workspace: args.workspace,
        projects: args.projects,
        activeServers: args.activeServers,
        metrics: args.metrics,
      };
      const filepath = await saveTelemetrySnapshot(snapshot);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ saved: true, path: filepath }) }],
      };
    }
  );

  // List telemetry snapshots
  server.registerTool(
    'list_telemetry',
    {
      description: 'List recent telemetry snapshots for trend analysis',
      inputSchema: z.object({
        limit: z.number().min(1).max(100).optional().default(10).describe('Max snapshots to return'),
      }),
    },
    async (args) => {
      const rlMsg = readLimiter.check('list_telemetry');
      if (rlMsg) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: rlMsg }) }], isError: true };
      await ensureDataDir();
      const snapshots = await listTelemetrySnapshots(args.limit ?? 10);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ count: snapshots.length, snapshots }, null, 2) }],
      };
    }
  );

  // ── Precedent Enforcement ──

  server.registerTool(
    'check_recurrence',
    {
      description: 'Check if a tool+source+status pattern would be a recurrence and what enforcement level it would trigger. Read-only — does not record.',
      inputSchema: z.object({
        source: z.string().min(1).describe('Server name'),
        tool: z.string().min(1).describe('Tool name'),
        status: z.enum(['success', 'failure', 'blocked', 'dry_run', 'error']).describe('Status to check'),
        metadata: z.record(z.unknown()).optional().describe('Metadata for fingerprint matching'),
        isMutating: z.boolean().optional().default(false).describe('Whether the tool is mutating (affects block vs restrict)'),
      }),
    },
    async (args) => {
      const result = checkRecurrence(precedentStore, {
        source: args.source,
        tool: args.tool,
        status: args.status,
        metadata: args.metadata as Record<string, unknown> | undefined,
      }, args.isMutating ?? false);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    'query_precedents',
    {
      description: 'Query active precedents with optional filters by escalation level, source, or tool.',
      inputSchema: z.object({
        level: z.enum(['observed', 'flagged', 'restricted', 'blocked']).optional().describe('Filter by escalation level'),
        source: z.string().optional().describe('Filter by source server'),
        tool: z.string().optional().describe('Filter by tool name'),
        limit: z.number().min(1).max(100).optional().default(20).describe('Max records to return'),
      }),
    },
    async (args) => {
      const rlMsg = readLimiter.check('query_precedents');
      if (rlMsg) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: rlMsg }) }], isError: true };

      let records = args.level
        ? precedentStore.listByLevel(args.level)
        : precedentStore.listActive(args.limit ?? 20);

      if (args.source) {
        records = records.filter(r => r.fingerprint.source === args.source);
      }
      if (args.tool) {
        records = records.filter(r => r.fingerprint.tool === args.tool);
      }

      records = records.slice(0, args.limit ?? 20);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            count: records.length,
            precedents: records.map(r => ({
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
          }, null, 2),
        }],
      };
    }
  );

  server.registerTool(
    'resolve_precedent',
    {
      description: 'Mark a precedent as resolved. Resets escalation to observed and starts a 7-day cooldown. If the pattern recurs during cooldown, escalation resumes.',
      inputSchema: z.object({
        precedentId: z.string().min(1).describe('Precedent ID to resolve'),
        action: z.string().min(1).describe('What was done to fix the root cause'),
        resolvedBy: z.string().optional().default('manual').describe('Who resolved it (session ID, "auto", or label)'),
        cooldownDays: z.number().min(1).max(30).optional().default(7).describe('Days before escalation fully resets'),
      }),
    },
    async (args) => {
      const cooldownMs = (args.cooldownDays ?? 7) * 24 * 60 * 60 * 1000;
      const resolution = {
        resolvedAt: new Date().toISOString(),
        resolvedBy: args.resolvedBy ?? 'manual',
        action: args.action,
        cooldownUntil: new Date(Date.now() + cooldownMs).toISOString(),
      };
      const record = precedentStore.resolve(args.precedentId, resolution);
      if (!record) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: `Precedent ${args.precedentId} not found` }) }],
          isError: true,
        };
      }
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            resolved: true,
            id: record.id,
            source: record.fingerprint.source,
            tool: record.fingerprint.tool,
            previousOccurrences: record.occurrenceCount,
            cooldownUntil: resolution.cooldownUntil,
          }, null, 2),
        }],
      };
    }
  );

  server.registerTool(
    'enforcement_status',
    {
      description: 'Get a summary of the precedent enforcement system — active counts by level, recent escalations, and decay/de-escalation status.',
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

      const recent = active.slice(0, 5).map(r => ({
        id: r.id,
        source: r.fingerprint.source,
        tool: r.fingerprint.tool,
        category: r.fingerprint.category,
        occurrences: r.occurrenceCount,
        level: r.escalationLevel,
        lastSeen: r.lastSeen,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            status: byLevel.blocked > 0 ? 'enforcing' : byLevel.restricted > 0 ? 'elevated' : 'normal',
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
          }, null, 2),
        }],
      };
    }
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

const isEntrypoint = process.argv[1] != null
  && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isEntrypoint) {
  void startServer().catch((error) => {
    logger.error(`failed to start`, { error: String(error) });
    process.exitCode = 1;
  });
}
