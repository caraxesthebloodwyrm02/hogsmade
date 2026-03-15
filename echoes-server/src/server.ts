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

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod';
import { promises as fs } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { getConfig } from './config.js';

// ── Constants ──

const SERVER_NAME = 'echoes-server';
const VERSION = '1.0.0';
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
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(TELEMETRY_DIR, { recursive: true });
  try {
    await fs.access(AUDIT_LOG_PATH);
  } catch {
    await fs.writeFile(AUDIT_LOG_PATH, '');
  }
}

async function appendAuditEntry(entry: AuditEntry): Promise<void> {
  const line = JSON.stringify(entry) + '\n';
  await fs.appendFile(AUDIT_LOG_PATH, line, 'utf-8');
}

function normalizeAuditStatus(status: unknown): AuditEntry['status'] | null {
  if (status === 'success' || status === 'blocked' || status === 'failure' || status === 'dry_run' || status === 'error') {
    return status;
  }
  return null;
}

async function readAuditLog(limit: number, filter?: { tool?: string; status?: string; since?: string }, metadata?: { parseErrors?: number }): Promise<AuditEntry[]> {
  let content: string;
  try {
    content = await fs.readFile(AUDIT_LOG_PATH, 'utf-8');
  } catch {
    return [];
  }

  const lines = content.trim().split('\n').filter(Boolean);
  let parseErrors = 0;
  let entries: AuditEntry[] = lines.map(line => {
    try {
      const parsed = JSON.parse(line) as Partial<AuditEntry>;
      const status = normalizeAuditStatus(parsed.status);
      if (!status || !parsed.id || !parsed.timestamp || !parsed.source || !parsed.tool) {
        parseErrors++;
        return null;
      }
      return {
        ...parsed,
        status,
      } as AuditEntry;
    } catch {
      parseErrors++;
      return null;
    }
  }).filter(Boolean) as AuditEntry[];

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

  if (metadata) metadata.parseErrors = parseErrors;
  return entries.slice(-limit).reverse();
}

async function saveTelemetrySnapshot(snapshot: TelemetrySnapshot): Promise<string> {
  const filename = `snapshot-${Date.now()}.json`;
  const filepath = path.join(TELEMETRY_DIR, filename);
  await fs.writeFile(filepath, JSON.stringify(snapshot, null, 2), 'utf-8');
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
    let telemetryCount = 0;
    try {
      const stat = await fs.stat(AUDIT_LOG_PATH);
      auditSize = stat.size;
    } catch { /* no file yet */ }
    try {
      const files = await fs.readdir(TELEMETRY_DIR);
      telemetryCount = files.filter(f => f.endsWith('.json')).length;
    } catch { /* no dir yet */ }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          status: 'ok',
          server: SERVER_NAME,
          version: VERSION,
          dataDir: DATA_DIR,
          auditLogBytes: auditSize,
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
    const entry: AuditEntry = {
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      source: args.source,
      tool: args.tool,
      status: normalizeAuditStatus(args.status) ?? 'failure',
      durationMs: args.durationMs,
      metadata: args.metadata as Record<string, unknown> | undefined,
    };
    await appendAuditEntry(entry);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ recorded: true, id: entry.id }) }],
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
    await ensureDataDir();
    const snapshots = await listTelemetrySnapshots(args.limit ?? 10);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ count: snapshots.length, snapshots }, null, 2) }],
    };
  }
);

// ── Start ──

return server;
}

export async function startServer(): Promise<McpServer> {
  await ensureDataDir();
  console.error(`[${SERVER_NAME}] v${VERSION} starting — data: ${DATA_DIR}`);
  const server = buildServer();
  await server.connect(new StdioServerTransport());
  return server;
}

const isEntrypoint = process.argv[1] != null
  && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isEntrypoint) {
  void startServer().catch((error) => {
    console.error(`[${SERVER_NAME}] failed to start`, error);
    process.exitCode = 1;
  });
}
