/**
 * Grid Server — GATE Envelope Verification Proxy MCP Server
 *
 * Provides tools for the GATE transition pipeline:
 * - Envelope validation (parse, integrity, freshness)
 * - Nonce registry management
 * - Audit log queries
 * - Deployment target status
 * - Dry-run verification
 *
 * Port: 8080 (per GATE/agent_schema.json)
 */

import { GateSecurityPolicy } from '@cascade/shared-types/security-policy';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pathToFileURL } from 'url';
import { getConfig } from './config.js';

// ── Constants ──

const SERVER_NAME = 'grid-server';
const VERSION = '1.0.0';
const config = getConfig();
const GATE_DIR = config.gateDir;
const INCOMING_DIR = path.join(GATE_DIR, 'incoming');
const RESULTS_DIR = path.join(GATE_DIR, 'results');
const AUDIT_PATH = path.join(GATE_DIR, 'audit.ndjson');
const NONCE_REGISTRY_PATH = path.join(GATE_DIR, '.nonce_registry.json');
const TRUSTED_SOURCES = config.trustedSourcePartitions;

// Deployment targets from GATE/agent_schema.json
const DEPLOYMENT_TARGETS: Record<string, { path: string; port: number | null; permissions: string[] }> = config.deploymentTargets;

// ── Helpers ──

async function fileExists(filepath: string): Promise<boolean> {
  try { await fs.access(filepath); return true; } catch { return false; }
}

async function readJsonFile<T>(filepath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filepath, 'utf-8');
    return JSON.parse(content) as T;
  } catch { return null; }
}

async function readNdjsonFile(filepath: string, limit: number): Promise<Record<string, unknown>[]> {
  try {
    const content = await fs.readFile(filepath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    return lines.slice(-limit).reverse().map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean) as Record<string, unknown>[];
  } catch { return []; }
}

function computeHash(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/** HMAC-SHA256 of message with secret; matches create_test_envelope.py / debug_fingerprint.py. */
function computeUserFingerprint(secret: string, payloadHash: string, machineFingerprint: string, nonce: string): string {
  const message = `${payloadHash}:${machineFingerprint}:${nonce}`;
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

type NonceRegistryEntry = { issued_at?: string; burned?: boolean; burned_at?: string | null };

async function readNonceRegistry(): Promise<Record<string, NonceRegistryEntry>> {
  const data = await readJsonFile<Record<string, NonceRegistryEntry>>(NONCE_REGISTRY_PATH);
  return data ?? {};
}

/** Atomic write: write to .tmp then rename to prevent corruption. */
async function atomicWriteJson(filepath: string, data: unknown): Promise<void> {
  const tmpPath = filepath + `.tmp.${process.pid}`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tmpPath, filepath);
}

async function writeNonceRegistry(registry: Record<string, NonceRegistryEntry>): Promise<void> {
  await atomicWriteJson(NONCE_REGISTRY_PATH, registry);
}

/** Allowed hosts for GRID_API_URL — prevents redirect to malicious servers. */
const ALLOWED_GRID_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function validateGridApiUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    if (!ALLOWED_GRID_HOSTS.has(parsed.hostname)) {
      console.error(`[${SERVER_NAME}] GRID_API_URL host '${parsed.hostname}' not in allowlist — ignoring`);
      return null;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      console.error(`[${SERVER_NAME}] GRID_API_URL protocol '${parsed.protocol}' not allowed`);
      return null;
    }
    return parsed.origin;
  } catch {
    console.error(`[${SERVER_NAME}] GRID_API_URL is not a valid URL: '${raw}'`);
    return null;
  }
}

async function getEnhancedValidation(envelope: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const rawUrl = process.env.GRID_API_URL?.trim() || config.gridApiUrl || "";
  if (!rawUrl) {
    return null;
  }

  const gridApiUrl = validateGridApiUrl(rawUrl);
  if (!gridApiUrl) {
    return {
      consulted: true,
      approved: false,
      flags: ['grid_url_invalid'],
      reasoning: 'GRID_API_URL failed host allowlist validation',
    };
  }

  try {
    const response = await fetch(`${gridApiUrl}/api/v1/gate/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_agent: envelope['source_partition'],
        target: envelope['target_partition'],
        action: envelope['scope'],
        payload_hash: envelope['payload_hash'],
        test_status: envelope['tests_passed'] === true ? 'passing' : 'failing',
      }),
    });

    if (!response.ok) {
      throw new Error(`GRID-main responded with ${response.status}`);
    }

    const payload = await response.json() as Record<string, unknown>;
    return {
      consulted: true,
      ...payload,
    };
  } catch (error) {
    // Fail closed: when remote validation is requested but GRID is unavailable, do not approve.
    return {
      consulted: true,
      approved: false,
      flags: ['grid_unavailable'],
      reasoning: 'Remote validation unavailable',
    };
  }
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
  { description: 'Check grid-server health, GATE directory status, and deployment targets' },
  async () => {
    const gateExists = await fileExists(GATE_DIR);
    const incomingExists = await fileExists(INCOMING_DIR);
    const auditExists = await fileExists(AUDIT_PATH);
    const nonceExists = await fileExists(NONCE_REGISTRY_PATH);

    let pendingEnvelopes = 0;
    if (incomingExists) {
      const files = await fs.readdir(INCOMING_DIR);
      pendingEnvelopes = files.filter((f: string) => f.endsWith('.json')).length;
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          status: gateExists ? 'ok' : 'gate_dir_missing',
          server: SERVER_NAME,
          version: VERSION,
          gate: {
            directory: gateExists,
            incoming: incomingExists,
            auditLog: auditExists,
            nonceRegistry: nonceExists,
            pendingEnvelopes,
          },
          deploymentTargets: Object.keys(DEPLOYMENT_TARGETS),
          timestamp: new Date().toISOString(),
        }, null, 2),
      }],
    };
  }
);

// List deployment targets
server.registerTool(
  'list_targets',
  {
    description: 'List all GATE deployment targets with their status and permissions',
    inputSchema: z.object({}),
  },
  async () => {
    const results: Record<string, unknown>[] = [];
    for (const [name, target] of Object.entries(DEPLOYMENT_TARGETS)) {
      const exists = await fileExists(target.path);
      let hasPackageJson = false;
      if (exists) {
        hasPackageJson = await fileExists(path.join(target.path, 'package.json'));
      }
      results.push({
        name,
        path: target.path,
        port: target.port,
        permissions: target.permissions,
        exists,
        hasPackageJson,
      });
    }
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }],
    };
  }
);

// Validate envelope structure (dry-run step 1)
server.registerTool(
  'validate_envelope',
  {
    description: 'Validate a GATE envelope: required fields, trusted source, payload hash, user_fingerprint (HMAC when GATE_USER_SECRET set), nonce registered and not reused; burns nonce on success; remote validation fails closed when GRID unavailable.',
    inputSchema: z.object({
      envelopePath: z.string().optional().describe('Path to envelope JSON file. If omitted, scans incoming/ directory.'),
    }),
  },
  async (args: { envelopePath?: string }) => {
    const requiredFields = [
      'envelope_id', 'payload', 'payload_hash', 'nonce', 'timestamp',
      'user_fingerprint', 'machine_fingerprint', 'scope',
      'source_partition', 'target_partition', 'tests_passed', 'lint_passed',
    ];
    let envelopePath = args.envelopePath;

    // Auto-discover from incoming
    if (!envelopePath) {
      if (!(await fileExists(INCOMING_DIR))) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ valid: false, error: 'incoming/ directory not found' }) }] };
      }
      const files = await fs.readdir(INCOMING_DIR);
      const envelopes = files.filter((f: string) => f.endsWith('.json'));
      if (envelopes.length === 0) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ valid: false, error: 'No envelopes in incoming/' }) }] };
      }
      envelopePath = path.join(INCOMING_DIR, envelopes[0]);
    }

    const envelope = await readJsonFile<Record<string, unknown>>(envelopePath);
    if (!envelope) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ valid: false, error: 'Failed to parse envelope JSON' }) }] };
    }

    const checks: { check: string; passed: boolean; detail?: string }[] = [];

    // Required fields
    const missing = requiredFields.filter(f => !(f in envelope));
    checks.push({
      check: 'required_fields',
      passed: missing.length === 0,
      detail: missing.length > 0 ? `Missing: ${missing.join(', ')}` : 'All fields present',
    });

    // Trusted source
    const source = envelope['source_partition'] as string | undefined;
    checks.push({
      check: 'trusted_source',
      passed: source != null && TRUSTED_SOURCES.includes(source),
      detail: `Source: ${source ?? 'undefined'}`,
    });

    // Payload hash integrity
    if (envelope['payload'] && envelope['payload_hash']) {
      const canonical = JSON.stringify(envelope['payload'], Object.keys(envelope['payload'] as object).sort());
      const computed = computeHash(canonical);
      const declared = envelope['payload_hash'] as string;
      checks.push({
        check: 'payload_integrity',
        passed: crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(declared, 'hex')),
        detail: `Computed: ${computed.slice(0, 16)}...`,
      });
    } else {
      checks.push({ check: 'payload_integrity', passed: false, detail: 'Missing payload or payload_hash' });
    }

    // Timestamp freshness (600s)
    if (envelope['timestamp']) {
      const age = Date.now() - new Date(envelope['timestamp'] as string).getTime();
      checks.push({
        check: 'timestamp_fresh',
        passed: age < 600_000,
        detail: `Age: ${Math.round(age / 1000)}s`,
      });
    }

    // Tests passed
    checks.push({
      check: 'tests_passed',
      passed: envelope['tests_passed'] === true,
      detail: `tests_passed=${envelope['tests_passed']}`,
    });

    // user_fingerprint: HMAC-SHA256(secret, payload_hash:machine_fingerprint:nonce) when GATE_USER_SECRET is set
    const payloadHash = envelope['payload_hash'] as string | undefined;
    const machineFp = envelope['machine_fingerprint'] as string | undefined;
    const nonceVal = envelope['nonce'] as string | undefined;
    const userFp = envelope['user_fingerprint'] as string | undefined;
    if (config.gateUserSecret) {
      const expected =
        payloadHash != null && machineFp != null && nonceVal != null
          ? computeUserFingerprint(config.gateUserSecret, payloadHash, machineFp, nonceVal)
          : '';
      const bufDeclared = typeof userFp === 'string' && /^[a-f0-9]+$/i.test(userFp) ? Buffer.from(userFp, 'hex') : null;
      const bufExpected = expected.length > 0 ? Buffer.from(expected, 'hex') : null;
      const passed = bufDeclared != null && bufExpected != null && bufDeclared.length === bufExpected.length && crypto.timingSafeEqual(bufDeclared, bufExpected);
      checks.push({
        check: 'user_fingerprint_verified',
        passed,
        detail: passed ? 'HMAC verified' : (userFp ? 'HMAC mismatch or missing fields' : 'user_fingerprint missing'),
      });
    } else {
      checks.push({ check: 'user_fingerprint_verified', passed: true, detail: 'skipped (GATE_USER_SECRET not set)' });
    }

    // Nonce: must be registered and not already burned (replay protection)
    // Uses GateSecurityPolicy from shared-types for standardized validation
    const nonceRegistry = await readNonceRegistry();
    const noncePolicy = GateSecurityPolicy.validateNonce(nonceVal, nonceRegistry);
    const nonceEntry = nonceVal != null ? nonceRegistry[nonceVal] : undefined;
    const nonceRegistered = nonceVal != null && nonceEntry != null;
    const nonceNotReused = nonceRegistered && nonceEntry.burned !== true;
    checks.push({
      check: 'nonce_registered',
      passed: nonceRegistered,
      detail: nonceRegistered ? 'nonce in registry' : (nonceVal ? 'nonce not in registry' : 'nonce missing'),
    });
    checks.push({
      check: 'nonce_not_reused',
      passed: nonceNotReused,
      detail: nonceNotReused ? 'nonce not burned' : (nonceEntry?.burned === true ? 'nonce already burned' : 'nonce not registered'),
    });
    // Policy engine cross-check
    if (noncePolicy.verdict === 'deny') {
      checks.push({
        check: 'nonce_policy',
        passed: false,
        detail: `${noncePolicy.policyId}: ${noncePolicy.reason}`,
      });
    }

    const allPassed = checks.every(c => c.passed);
    const enhancedValidation = allPassed ? await getEnhancedValidation(envelope) : null;
    // P-INT-005: Fail closed when remote validation unavailable for production targets
    const targetPartition = envelope['target_partition'] as string | undefined;
    if (enhancedValidation && enhancedValidation['approved'] === false) {
      const failClosedPolicy = GateSecurityPolicy.failClosedPolicy(
        !enhancedValidation['flags']?.toString().includes('grid_unavailable'),
        targetPartition ?? '',
      );
      if (failClosedPolicy.verdict === 'deny') {
        checks.push({
          check: 'fail_closed_policy',
          passed: false,
          detail: `${failClosedPolicy.policyId}: ${failClosedPolicy.reason}`,
        });
      }
    }
    const enhancedApproved = enhancedValidation == null
      || enhancedValidation['approved'] !== false;

    const valid = allPassed && enhancedApproved;

    // On success, burn the nonce so it cannot be reused (replay protection).
    if (valid && nonceVal != null && nonceRegistry[nonceVal]) {
      const updated = { ...nonceRegistry };
      updated[nonceVal] = {
        ...updated[nonceVal],
        burned: true,
        burned_at: new Date().toISOString(),
      };
      await writeNonceRegistry(updated).catch(() => {
        // Best-effort; validation result already computed
      });
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          valid,
          file: envelopePath,
          checks,
          enhancedValidation,
        }, null, 2),
      }],
    };
  }
);

// Query GATE audit log
server.registerTool(
  'gate_audit',
  {
    description: 'Query the GATE audit log (audit.ndjson) for verification events',
    inputSchema: z.object({
      limit: z.number().min(1).max(200).optional().default(20).describe('Max entries to return'),
    }),
  },
  async (args: { limit?: number }) => {
    const entries = await readNdjsonFile(AUDIT_PATH, args.limit ?? 20);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ count: entries.length, entries }, null, 2) }],
    };
  }
);

// Nonce registry status
server.registerTool(
  'nonce_status',
  {
    description: 'Check the GATE nonce registry — list burned nonces and registry health',
    inputSchema: z.object({}),
  },
  async () => {
    const registry = await readJsonFile<Record<string, unknown>>(NONCE_REGISTRY_PATH);
    if (!registry) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Nonce registry not found or unreadable' }) }] };
    }
    const entries = Object.entries(registry);
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          total: entries.length,
          registry: entries.slice(-20).map(([nonce, meta]) => ({ nonce: nonce.slice(0, 12) + '...', meta })),
        }, null, 2),
      }],
    };
  }
);

// Check target permissions
server.registerTool(
  'check_permission',
  {
    description: 'Check if a specific action is permitted on a deployment target',
    inputSchema: z.object({
      target: z.string().min(1).describe('Deployment target name (e.g. "grid-server", "echoes-server")'),
      action: z.string().min(1).describe('Action to check (e.g. "deploy", "run_tests", "start_server")'),
    }),
  },
  async (args: { target: string; action: string }) => {
    const t = DEPLOYMENT_TARGETS[args.target];
    if (!t) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ allowed: false, reason: `Unknown target: ${args.target}` }) }] };
    }
    const allowed = t.permissions.includes(args.action);
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          target: args.target,
          action: args.action,
          allowed,
          availablePermissions: t.permissions,
        }, null, 2),
      }],
    };
  }
);

// ── Start ──

return server;
}

export async function startServer(): Promise<McpServer> {
  console.error(`[${SERVER_NAME}] v${VERSION} starting — GATE: ${GATE_DIR}`);
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
