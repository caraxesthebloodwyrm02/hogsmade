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

import { ResiliencePolicy } from "@cascade/shared-resilience";
import { emitAudit } from "@cascade/shared-types/audit-client";
import { McpLogger } from "@cascade/shared-types/mcp-logger";
import { GateSecurityPolicy } from "@cascade/shared-types/security-policy";
import { SessionRateLimiter } from "@cascade/shared-types/session-rate-limit";
<<<<<<< HEAD
import { ActionClass, createHardenedMeritGuard, HardenedMcpMeritGuard } from "@cascade/shared-types";
=======
import { ActionClass, createMeritGuard, McpMeritGuard } from "@cascade/shared-types";
>>>>>>> phase-3-packaging-foundation
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import crypto from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { pathToFileURL } from "url";
import * as z from "zod";
import { getConfig } from "./config.js";

// ── Constants ──

const SERVER_NAME = "grid-server";
const VERSION = "1.0.0";
const logger = new McpLogger(SERVER_NAME);
const config = getConfig();
const GATE_DIR = config.gateDir;
const INCOMING_DIR = path.join(GATE_DIR, "incoming");
const RESULTS_DIR = path.join(GATE_DIR, "results");
const AUDIT_PATH = path.join(GATE_DIR, "audit.ndjson");
const NONCE_REGISTRY_PATH = path.join(GATE_DIR, ".nonce_registry.json");
const TRUSTED_SOURCES = config.trustedSourcePartitions;

// Deployment targets from GATE/agent_schema.json
const DEPLOYMENT_TARGETS: Record<
  string,
  { path: string; port: number | null; permissions: string[] }
> = config.deploymentTargets;

const readLimiter = new SessionRateLimiter();

// ── Resilience ──

const gridApiPolicy = new ResiliencePolicy("grid-api", {
  circuitBreaker: {
    failureThreshold: 5,
    successThreshold: 2,
    timeoutMs: 30_000,
    halfOpenMaxCalls: 2,
  },
  retry: {
    maxAttempts: 2,
    initialDelayMs: 200,
    maxDelayMs: 2000,
    backoffMultiplier: 2,
  },
});

// ── Helpers ──

async function fileExists(filepath: string): Promise<boolean> {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}

function isPathWithin(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return (
    relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
  );
}

function parseEnvelopeTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
    }
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isRecognizedTarget(target: unknown): boolean {
  if (typeof target !== "string") {
    return false;
  }
  const normalized = target.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (
    normalized === "grid-server" ||
    normalized === "gate" ||
    normalized === "gate/incoming"
  ) {
    return true;
  }

  const resolved = path.resolve(target);
  const normalizedGateDir = path.resolve(GATE_DIR).toLowerCase();
  const normalizedIncomingDir = path.resolve(INCOMING_DIR).toLowerCase();
  const normalizedResolved = resolved.toLowerCase();
  return (
    normalizedResolved === normalizedGateDir ||
    normalizedResolved === normalizedIncomingDir ||
    isPathWithin(config.workspaceRoot, resolved)
  );
}

async function readJsonFile<T>(filepath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filepath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function readNdjsonFile(
  filepath: string,
  limit: number,
): Promise<Record<string, unknown>[]> {
  try {
    const content = await fs.readFile(filepath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    return lines
      .slice(-limit)
      .reverse()
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean) as Record<string, unknown>[];
  } catch {
    return [];
  }
}

function computeHash(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/** Recursively sort all object keys for deterministic JSON serialization. */
function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

/** HMAC-SHA256 of message with secret; matches create_test_envelope.py / debug_fingerprint.py. */
function computeUserFingerprint(
  secret: string,
  payloadHash: string,
  machineFingerprint: string,
  nonce: string,
): string {
  const message = `${payloadHash}:${machineFingerprint}:${nonce}`;
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}

type NonceRegistryEntry = {
  issued_at?: string;
  burned?: boolean;
  burned_at?: string | null;
};

async function readNonceRegistry(): Promise<
  Record<string, NonceRegistryEntry>
> {
  const data =
    await readJsonFile<Record<string, NonceRegistryEntry>>(NONCE_REGISTRY_PATH);
  return data ?? {};
}

/** Atomic write: write to .tmp then rename to prevent corruption. */
async function atomicWriteJson(filepath: string, data: unknown): Promise<void> {
  const tmpPath = filepath + `.tmp.${process.pid}`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmpPath, filepath);
}

async function writeNonceRegistry(
  registry: Record<string, NonceRegistryEntry>,
): Promise<void> {
  await atomicWriteJson(NONCE_REGISTRY_PATH, registry);
}

/** Best-effort append to GATE-local audit log (audit.ndjson). */
async function writeGateAudit(
  entry: Record<string, unknown>,
): Promise<void> {
  try {
    await fs.appendFile(AUDIT_PATH, JSON.stringify(entry) + "\n", "utf-8");
  } catch {
    // Best-effort — audit write failure must not break validation
  }
}

/** Allowed hosts for GRID_API_URL — prevents redirect to malicious servers. */
const ALLOWED_GRID_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const LOCAL_PROFIT_MASK_SIGNALS = [
  "cost_cutting",
  "cost_optimization",
  "efficiency_override",
  "budget_override",
  "maximize_throughput",
  "skip_validation",
  "bypass_safety",
  "fast_track",
  "bulk_override",
  "unlimited_quota",
] as const;

function validateGridApiUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    if (!ALLOWED_GRID_HOSTS.has(parsed.hostname)) {
      logger.warn(
        `GRID_API_URL host '${parsed.hostname}' not in allowlist — ignoring`,
      );
      return null;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      logger.warn(`GRID_API_URL protocol '${parsed.protocol}' not allowed`);
      return null;
    }
    return parsed.origin;
  } catch {
    logger.warn(`GRID_API_URL is not a valid URL: '${raw}'`);
    return null;
  }
}

type BackendProbeResult = {
  reachable: boolean;
  endpoint: string | null;
  status: number | null;
  error: string | null;
};

export async function probeGridBackend(
  gridApiUrl: string,
  timeoutMs = 5000,
): Promise<BackendProbeResult> {
  const endpoints = ["/health", "/api/v1/health"];
  let lastEndpoint: string | null = null;
  let lastStatus: number | null = null;
  let lastError: string | null = null;

  for (const endpoint of endpoints) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const resp = await fetch(`${gridApiUrl}${endpoint}`, {
        signal: ctrl.signal,
      });
      if (resp.ok) {
        return {
          reachable: true,
          endpoint,
          status: resp.status,
          error: null,
        };
      }
      lastEndpoint = endpoint;
      lastStatus = resp.status;
      lastError = `HTTP ${resp.status}`;
    } catch (error) {
      lastEndpoint = endpoint;
      lastStatus = null;
      lastError = error instanceof Error ? error.message : String(error);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    reachable: false,
    endpoint: lastEndpoint,
    status: lastStatus,
    error: lastError,
  };
}

async function getEnhancedValidation(
  envelope: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const rawUrl = process.env.GRID_API_URL?.trim() || config.gridApiUrl || "";
  if (!rawUrl) {
    return null;
  }

  const gridApiUrl = validateGridApiUrl(rawUrl);
  if (!gridApiUrl) {
    return {
      consulted: true,
      approved: false,
      flags: ["grid_url_invalid"],
      reasoning: "GRID_API_URL failed host allowlist validation",
    };
  }

  try {
    const payload = await gridApiPolicy.execute<Record<string, unknown>>(
      "validate",
      async () => {
        const response = await fetch(`${gridApiUrl}/api/v1/gate/validate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source_agent: envelope["source_partition"],
            target: envelope["target_partition"],
            action: envelope["scope"],
            payload_hash: envelope["payload_hash"],
            test_status:
              envelope["tests_passed"] === true ? "passing" : "failing",
          }),
        });

        if (!response.ok) {
          throw new Error(`GRID-main responded with ${response.status}`);
        }

        return (await response.json()) as Record<string, unknown>;
      },
    );

    const approved = payload["approved"] === true;
    return {
      consulted: true,
      approved,
      ...payload,
    };
  } catch (error) {
    // Fail closed: when remote validation is requested but GRID is unavailable, do not approve.
    return {
      consulted: true,
      approved: false,
      flags: ["grid_unavailable"],
      reasoning: "Remote validation unavailable",
    };
  }
}

// ── Server ──

export function buildServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: VERSION,
  });

<<<<<<< HEAD
  // Initialize hardened merit guard for session-first identity enforcement
  const meritGuard = createHardenedMeritGuard(
=======
  // Initialize merit guard for session-first identity enforcement
  const meritGuard = createMeritGuard(
>>>>>>> phase-3-packaging-foundation
    SERVER_NAME,
    process.env.GRID_API_URL || config.gridApiUrl,
  );

<<<<<<< HEAD
  // Health check - use merit guard's registerGuardedTool with PUBLIC_BASIC
  meritGuard.registerGuardedTool(
    server,
=======
  // Health check - public_basic action class
  server.registerTool(
>>>>>>> phase-3-packaging-foundation
    "health_check",
    {
      actionClass: ActionClass.PUBLIC_BASIC,
      description: "Check grid-server health, GATE directory status, and deployment targets",
    },
    async () => {
      const gateExists = await fileExists(GATE_DIR);
      const incomingExists = await fileExists(INCOMING_DIR);
      const auditExists = await fileExists(AUDIT_PATH);
      const nonceExists = await fileExists(NONCE_REGISTRY_PATH);

      let pendingEnvelopes = 0;
      if (incomingExists) {
        const files = await fs.readdir(INCOMING_DIR);
        pendingEnvelopes = files.filter((f: string) =>
          f.endsWith(".json"),
        ).length;
      }

      return {
        status: gateExists ? "ok" : "gate_dir_missing",
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
        circuitState: meritGuard.getCircuitState(),
        metrics: meritGuard.getMetrics(),
      };
    },
  );

  // List deployment targets (wrapped with merit guard - ANALYSIS_READ required)
  meritGuard.registerGuardedTool(
    server,
    "list_targets",
    {
      actionClass: ActionClass.ANALYSIS_READ,
      description:
        "List all GATE deployment targets with their status and permissions",
      inputSchema: z.object({}),
    },
    async () => {
      const rlMsg = readLimiter.check("list_targets");
      if (rlMsg)
        return {
          error: rlMsg,
        };
      const results: Record<string, unknown>[] = [];
      for (const [name, target] of Object.entries(DEPLOYMENT_TARGETS)) {
        const exists = await fileExists(target.path);
        let hasPackageJson = false;
        if (exists) {
          hasPackageJson = await fileExists(
            path.join(target.path, "package.json"),
          );
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
      return results;
    },
  );

  // Validate envelope structure (dry-run step 1)
  server.registerTool(
    "validate_envelope",
    {
      description:
        "Validate a GATE envelope: required fields, trusted source, payload hash, user_fingerprint (HMAC when GATE_USER_SECRET set), nonce registered and not reused; burns nonce on success; remote validation fails closed when GRID unavailable.",
      inputSchema: z.object({
        envelopePath: z
          .string()
          .optional()
          .describe(
            "Path to envelope JSON file. If omitted, scans incoming/ directory.",
          ),
      }),
    },
    async (args: { envelopePath?: string }) => {
      const requiredFields = [
        "envelope_id",
        "payload",
        "payload_hash",
        "nonce",
        "timestamp",
        "user_fingerprint",
        "machine_fingerprint",
        "scope",
        "source_partition",
        "target_partition",
        "tests_passed",
        "lint_passed",
      ];
      let envelopePath = args.envelopePath;

      // Auto-discover from incoming
      if (!envelopePath) {
        if (!(await fileExists(INCOMING_DIR))) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  valid: false,
                  error: "incoming/ directory not found",
                }),
              },
            ],
          };
        }
        const files = await fs.readdir(INCOMING_DIR);
        const envelopes = files.filter((f: string) => f.endsWith(".json"));
        if (envelopes.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  valid: false,
                  error: "No envelopes in incoming/",
                }),
              },
            ],
          };
        }
        envelopePath = path.join(INCOMING_DIR, envelopes[0]);
      }

      envelopePath = path.resolve(envelopePath);
      if (
        !envelopePath.toLowerCase().endsWith(".json") ||
        !isPathWithin(INCOMING_DIR, envelopePath)
      ) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                valid: false,
                error:
                  "Envelope path must reference a JSON file under GATE/incoming/",
              }),
            },
          ],
        };
      }

      const envelope =
        await readJsonFile<Record<string, unknown>>(envelopePath);
      if (!envelope) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                valid: false,
                error: "Failed to parse envelope JSON",
              }),
            },
          ],
        };
      }

      const checks: { check: string; passed: boolean; detail?: string }[] = [];

      // Required fields
      const missing = requiredFields.filter((f) => !(f in envelope));
      checks.push({
        check: "required_fields",
        passed: missing.length === 0,
        detail:
          missing.length > 0
            ? `Missing: ${missing.join(", ")}`
            : "All fields present",
      });

      // Trusted source
      const source = envelope["source_partition"] as string | undefined;
      checks.push({
        check: "trusted_source",
        passed:
          TRUSTED_SOURCES.length > 0 &&
          source != null &&
          TRUSTED_SOURCES.includes(source),
        detail:
          TRUSTED_SOURCES.length > 0
            ? `Source: ${source ?? "undefined"}`
            : "No trusted sources configured",
      });
      checks.push({
        check: "target_partition_recognized",
        passed: isRecognizedTarget(envelope["target_partition"]),
        detail: `Target: ${String(envelope["target_partition"] ?? "undefined")}`,
      });

      // Payload hash integrity
      if (envelope["payload"] && envelope["payload_hash"]) {
        const canonical = JSON.stringify(canonicalize(envelope["payload"]));
        const computed = computeHash(canonical);
        const declared =
          typeof envelope["payload_hash"] === "string"
            ? envelope["payload_hash"].trim()
            : "";
        const computedBuffer = Buffer.from(computed, "hex");
        const declaredBuffer = /^[a-f0-9]{64}$/i.test(declared)
          ? Buffer.from(declared, "hex")
          : null;
        checks.push({
          check: "payload_integrity",
          passed:
            declaredBuffer != null &&
            declaredBuffer.length === computedBuffer.length &&
            crypto.timingSafeEqual(computedBuffer, declaredBuffer),
          detail: `Computed: ${computed.slice(0, 16)}...`,
        });
      } else {
        checks.push({
          check: "payload_integrity",
          passed: false,
          detail: "Missing payload or payload_hash",
        });
      }

      // Timestamp freshness (600s)
      const parsedTimestampMs = parseEnvelopeTimestamp(envelope["timestamp"]);
      if (parsedTimestampMs != null) {
        const age = Date.now() - parsedTimestampMs;
        checks.push({
          check: "timestamp_fresh",
          passed: age >= 0 && age < 600_000,
          detail: `Age: ${Math.round(age / 1000)}s`,
        });
      } else {
        checks.push({
          check: "timestamp_fresh",
          passed: false,
          detail: "Invalid or missing timestamp",
        });
      }

      // Tests passed
      checks.push({
        check: "tests_passed",
        passed: envelope["tests_passed"] === true,
        detail: `tests_passed=${envelope["tests_passed"]}`,
      });
      checks.push({
        check: "lint_passed",
        passed: envelope["lint_passed"] === true,
        detail: `lint_passed=${envelope["lint_passed"]}`,
      });

      // user_fingerprint: HMAC-SHA256(secret, payload_hash:machine_fingerprint:nonce) when GATE_USER_SECRET is set
      const payloadHash = envelope["payload_hash"] as string | undefined;
      const machineFp = envelope["machine_fingerprint"] as string | undefined;
      const nonceVal = envelope["nonce"] as string | undefined;
      const userFp = envelope["user_fingerprint"] as string | undefined;
      if (config.gateUserSecret) {
        const expected =
          payloadHash != null && machineFp != null && nonceVal != null
            ? computeUserFingerprint(
                config.gateUserSecret,
                payloadHash,
                machineFp,
                nonceVal,
              )
            : "";
        const bufDeclared =
          typeof userFp === "string" && /^[a-f0-9]+$/i.test(userFp)
            ? Buffer.from(userFp, "hex")
            : null;
        const bufExpected =
          expected.length > 0 ? Buffer.from(expected, "hex") : null;
        const passed =
          bufDeclared != null &&
          bufExpected != null &&
          bufDeclared.length === bufExpected.length &&
          crypto.timingSafeEqual(bufDeclared, bufExpected);
        checks.push({
          check: "user_fingerprint_verified",
          passed,
          detail: passed
            ? "HMAC verified"
            : userFp
              ? "HMAC mismatch or missing fields"
              : "user_fingerprint missing",
        });
      } else {
        checks.push({
          check: "user_fingerprint_verified",
          passed: true,
          detail: "skipped (GATE_USER_SECRET not set)",
        });
      }

      // Nonce: must be registered and not already burned (replay protection)
      const nonceRegistry = await readNonceRegistry();
      const noncePolicy = GateSecurityPolicy.validateNonce(
        nonceVal,
        nonceRegistry,
      );
      const nonceEntry = nonceVal != null ? nonceRegistry[nonceVal] : undefined;
      const nonceRegistered = nonceVal != null && nonceEntry != null;
      const nonceNotReused = nonceRegistered && nonceEntry.burned !== true;
      checks.push({
        check: "nonce_registered",
        passed: nonceRegistered,
        detail: nonceRegistered
          ? "nonce in registry"
          : nonceVal
            ? "nonce not in registry"
            : "nonce missing",
      });
      checks.push({
        check: "nonce_not_reused",
        passed: nonceNotReused,
        detail: nonceNotReused
          ? "nonce not burned"
          : nonceEntry?.burned === true
            ? "nonce already burned"
            : "nonce not registered",
      });
      // Policy engine cross-check
      if (noncePolicy.verdict === "deny") {
        checks.push({
          check: "nonce_policy",
          passed: false,
          detail: `${noncePolicy.policyId}: ${noncePolicy.reason}`,
        });
      }

      const allPassed = checks.every((c) => c.passed);
      const enhancedValidation = allPassed
        ? await getEnhancedValidation(envelope)
        : null;
      // P-INT-005: Fail closed when remote validation unavailable for production targets
      const targetPartition = envelope["target_partition"] as
        | string
        | undefined;
      if (enhancedValidation && enhancedValidation["approved"] === false) {
        const failClosedPolicy = GateSecurityPolicy.failClosedPolicy(
          !enhancedValidation["flags"]?.toString().includes("grid_unavailable"),
          targetPartition ?? "",
        );
        if (failClosedPolicy.verdict === "deny") {
          checks.push({
            check: "fail_closed_policy",
            passed: false,
            detail: `${failClosedPolicy.policyId}: ${failClosedPolicy.reason}`,
          });
        }
      }
      const enhancedApproved =
        enhancedValidation == null || enhancedValidation["approved"] !== false;

      const valid = allPassed && enhancedApproved;

      emitAudit({
        source: SERVER_NAME,
        tool: "validate_envelope",
        status: valid ? "success" : "failure",
        metadata: {
          envelopePath,
          checksRun: checks.length,
          checksFailed: checks.filter((c) => !c.passed).map((c) => c.check),
          enhancedConsulted: enhancedValidation != null,
        },
      });

      try {
        await writeGateAudit({
          timestamp: new Date().toISOString(),
          envelope_id: envelope.envelope_id,
          valid,
          checksRun: checks.length,
          checksFailed: checks.filter((c) => !c.passed).map((c) => c.check),
          enhancedConsulted: enhancedValidation != null,
        });
      } catch (auditErr) {
        logger.error("GATE audit write failed", { error: String(auditErr) });
        // Continue but log - audit failure should not block validation
      }

      // On success, burn the nonce so it cannot be reused (replay protection).
      if (valid && nonceVal != null && nonceRegistry[nonceVal]) {
        const updated = { ...nonceRegistry };
        updated[nonceVal] = {
          ...updated[nonceVal],
          burned: true,
          burned_at: new Date().toISOString(),
        };
        try {
          await writeNonceRegistry(updated);
        } catch (nonceErr) {
          logger.error("Nonce registry write failed", { error: String(nonceErr) });
          // Continue but log - nonce burn failure is serious but validation already succeeded
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                valid,
                file: envelopePath,
                checks,
                enhancedValidation,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // Query GATE audit log
  server.registerTool(
    "gate_audit",
    {
      description:
        "Query the GATE audit log (audit.ndjson) for verification events",
      inputSchema: z.object({
        limit: z
          .number()
          .min(1)
          .max(200)
          .optional()
          .default(20)
          .describe("Max entries to return"),
      }),
    },
    async (args: { limit?: number }) => {
      const rlMsg = readLimiter.check("gate_audit");
      if (rlMsg)
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ error: rlMsg }) },
          ],
          isError: true,
        };
      const entries = await readNdjsonFile(AUDIT_PATH, args.limit ?? 20);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ count: entries.length, entries }, null, 2),
          },
        ],
      };
    },
  );

  // Nonce registry status
  server.registerTool(
    "nonce_status",
    {
      description:
        "Check the GATE nonce registry — list burned nonces and registry health",
      inputSchema: z.object({}),
    },
    async () => {
      const rlMsg = readLimiter.check("nonce_status");
      if (rlMsg)
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ error: rlMsg }) },
          ],
          isError: true,
        };
      const registry =
        await readJsonFile<Record<string, unknown>>(NONCE_REGISTRY_PATH);
      if (!registry) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Nonce registry not found or unreadable",
              }),
            },
          ],
        };
      }
      const entries = Object.entries(registry);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                total: entries.length,
                registry: entries.slice(-20).map(([nonce, meta]) => ({
                  nonce: nonce.slice(0, 12) + "...",
                  meta,
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

  // Check target permissions
  server.registerTool(
    "check_permission",
    {
      description:
        "Check if a specific action is permitted on a deployment target",
      inputSchema: z.object({
        target: z
          .string()
          .min(1)
          .describe(
            'Deployment target name (e.g. "grid-server", "echoes-server")',
          ),
        action: z
          .string()
          .min(1)
          .describe(
            'Action to check (e.g. "deploy", "run_tests", "start_server")',
          ),
      }),
    },
    async (args: { target: string; action: string }) => {
      const rlMsg = readLimiter.check("check_permission");
      if (rlMsg)
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ error: rlMsg }) },
          ],
          isError: true,
        };
      const t = DEPLOYMENT_TARGETS[args.target];
      if (!t) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                allowed: false,
                reason: `Unknown target: ${args.target}`,
              }),
            },
          ],
        };
      }
      const allowed = t.permissions.includes(args.action);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                target: args.target,
                action: args.action,
                allowed,
                availablePermissions: t.permissions,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── Admission Gate Enforcement Tools ──
  // These proxy to the Mothership /admission/* endpoints, making penalty
  // enforcement and policy compliance checking available as MCP tool calls.

  /**
   * Helper: call a Mothership /admission/* endpoint via the GRID API.
   * Fails closed — returns error result if GRID backend is unreachable.
   */
  async function callAdmission<T>(
    method: "GET" | "POST",
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const rawUrl = process.env.GRID_API_URL?.trim() || config.gridApiUrl || "";
    const gridApiUrl = rawUrl ? validateGridApiUrl(rawUrl) : null;
    if (!gridApiUrl) {
      throw new Error(
        "GRID_API_URL not configured or invalid — admission tools unavailable",
      );
    }

    const result = await gridApiPolicy.execute<T>("admission", async () => {
      const opts: RequestInit = {
        method,
        headers: { "Content-Type": "application/json" },
      };
      if (body) opts.body = JSON.stringify(body);

      const resp = await fetch(`${gridApiUrl}${path}`, opts);
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`Mothership ${path} responded ${resp.status}: ${text}`);
      }
      return (await resp.json()) as T;
    });

    return result;
  }

  function findProfitMaskSignals(
    payload: Record<string, unknown>,
    headers: Record<string, string> = {},
  ): string[] {
    const searchSpace = JSON.stringify({ payload, headers }).toLowerCase();
    return LOCAL_PROFIT_MASK_SIGNALS.filter((signal) =>
      searchSpace.includes(signal),
    );
  }

  async function buildLocalComplianceFallback(args: {
    payload: Record<string, unknown>;
    headers?: Record<string, string>;
    entity_id?: string;
    target_path?: string;
  }): Promise<Record<string, unknown>> {
    const targetPath = args.target_path ?? "/api/v1/intelligence/process";
    const payload = args.payload;
    const headers = args.headers ?? {};
    const profitMaskSignals = findProfitMaskSignals(payload, headers);
    const violations: string[] = [];

    if (profitMaskSignals.length > 0) {
      violations.push(`profit_masking: ${profitMaskSignals.join(", ")}`);
    }

    const payloadBytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
    const estimatedTokens = Math.floor(payloadBytes / 4);
    const contextCeiling = 25_000;
    const contextCeilingExceeded = estimatedTokens > contextCeiling;
    if (contextCeilingExceeded) {
      violations.push(
        `context_overflow: ${estimatedTokens} tokens > ceiling ${contextCeiling}`,
      );
    }

    let hasRequiredStructure = true;
    if (targetPath.includes("/intelligence/") && !("data" in payload)) {
      hasRequiredStructure = false;
      violations.push("missing_structure: 'data' key required for intelligence paths");
    }

    let entityPenaltyPoints = 0;
    let entityBannered = false;
    if (args.entity_id) {
      try {
        const entityReport = await callAdmission<Record<string, unknown>>(
          "GET",
          `/admission/entity/${encodeURIComponent(args.entity_id)}`,
        );
        entityPenaltyPoints = Number(entityReport["total_penalty_points"] ?? 0);
        entityBannered = entityReport["bannered"] === true;
        if (entityBannered) {
          const bannerReason =
            typeof entityReport["banner_reason"] === "string"
              ? entityReport["banner_reason"]
              : "entity is bannered";
          violations.push(`entity_bannered: ${bannerReason}`);
        }
      } catch {
        // Keep the fallback best-effort; entity context is optional.
      }
    }

    let policy: Record<string, unknown> = {};
    try {
      policy = await callAdmission<Record<string, unknown>>(
        "GET",
        "/admission/policy",
      );
    } catch {
      // Leave policy empty when the backend is broadly unavailable.
    }

    return {
      compliant: violations.length === 0,
      violations,
      profit_mask_signals: profitMaskSignals,
      estimated_tokens: estimatedTokens,
      context_ceiling_exceeded: contextCeilingExceeded,
      has_required_structure: hasRequiredStructure,
      entity_penalty_points: entityPenaltyPoints,
      entity_bannered: entityBannered,
      policy,
      timestamp: new Date().toISOString(),
      fallback_used: true,
      fallback_reason: "remote compliance check unavailable; local dry-run heuristics applied",
      backend_status: "degraded",
    };
  }

  // admission_policy — Get the current policy billboard
  server.registerTool(
    "admission_policy",
    {
      description:
        "Get the GRID admission gate policy billboard — ethical participation contract, " +
        "penalty tiers, dos/don'ts, and zero-tolerance caution. Every entity sees this " +
        "before entering the pipeline.",
      inputSchema: z.object({}),
    },
    async () => {
      const rlMsg = readLimiter.check("admission_policy");
      if (rlMsg)
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ error: rlMsg }) },
          ],
          isError: true,
        };

      try {
        const result = await callAdmission<Record<string, unknown>>(
          "GET",
          "/admission/policy",
        );

        emitAudit({
          source: SERVER_NAME,
          tool: "admission_policy",
          status: "success",
          metadata: { billboard_version: result["billboard_version"] },
        });

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        emitAudit({
          source: SERVER_NAME,
          tool: "admission_policy",
          status: "failure",
          metadata: { error: String(error) },
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: false, error: String(error) }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // admission_entity_report — Get entity violation history and penalty tier
  server.registerTool(
    "admission_entity_report",
    {
      description:
        "Get the full report for an entity in the admission gate — violation history, " +
        "accumulated penalty points, banner status, and classified penalty tier " +
        "(runtime_mistake / environment_pollution / intentional_scheming).",
      inputSchema: z.object({
        entity_id: z
          .string()
          .min(1)
          .describe(
            "Entity identifier (X-Entity-Id header value, api:key prefix, or ip:address)",
          ),
      }),
    },
    async (args: { entity_id: string }) => {
      const rlMsg = readLimiter.check("admission_entity_report");
      if (rlMsg)
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ error: rlMsg }) },
          ],
          isError: true,
        };

      try {
        const result = await callAdmission<Record<string, unknown>>(
          "GET",
          `/admission/entity/${encodeURIComponent(args.entity_id)}`,
        );

        emitAudit({
          source: SERVER_NAME,
          tool: "admission_entity_report",
          status: "success",
          metadata: {
            entity_id: args.entity_id,
            found: result["found"],
            bannered: result["bannered"],
          },
        });

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        emitAudit({
          source: SERVER_NAME,
          tool: "admission_entity_report",
          status: "failure",
          metadata: { entity_id: args.entity_id, error: String(error) },
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: false, error: String(error) }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // admission_compliance_check — Dry-run payload compliance check
  server.registerTool(
    "admission_compliance_check",
    {
      description:
        "Dry-run a payload against the admission policy without sending it through " +
        "the pipeline. Reports profit-mask signals, context token estimate, structural " +
        "conformance, and entity penalty context. Use before submission to pre-validate.",
      inputSchema: z.object({
        payload: z
          .record(z.unknown())
          .describe("Request payload body to check"),
        headers: z
          .record(z.string())
          .optional()
          .describe("Request headers to scan for profit-mask signals"),
        entity_id: z
          .string()
          .optional()
          .describe("Entity ID for penalty context lookup"),
        target_path: z
          .string()
          .optional()
          .default("/api/v1/intelligence/process")
          .describe("Simulated request path for structure checks"),
      }),
    },
    async (args: {
      payload: Record<string, unknown>;
      headers?: Record<string, string>;
      entity_id?: string;
      target_path?: string;
    }) => {
      const rlMsg = readLimiter.check("admission_compliance_check");
      if (rlMsg)
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ error: rlMsg }) },
          ],
          isError: true,
        };

      try {
        const result = await callAdmission<Record<string, unknown>>(
          "POST",
          "/admission/compliance/check",
          {
            payload: args.payload,
            headers: args.headers ?? {},
            entity_id: args.entity_id ?? null,
            target_path: args.target_path ?? "/api/v1/intelligence/process",
          },
        );

        emitAudit({
          source: SERVER_NAME,
          tool: "admission_compliance_check",
          status: "success",
          metadata: {
            compliant: result["compliant"],
            violations: result["violations"],
            entity_id: args.entity_id,
          },
        });

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        const errorMessage = String(error);
        if (errorMessage.includes("SAFETY_UNAVAILABLE")) {
          const fallback = await buildLocalComplianceFallback(args);

          emitAudit({
            source: SERVER_NAME,
            tool: "admission_compliance_check",
            status: "success",
            metadata: {
              fallback_used: true,
              compliant: fallback["compliant"],
              violations: fallback["violations"],
              entity_id: args.entity_id,
              upstream_error: errorMessage,
            },
          });

          return {
            content: [
              { type: "text" as const, text: JSON.stringify(fallback, null, 2) },
            ],
          };
        }

        emitAudit({
          source: SERVER_NAME,
          tool: "admission_compliance_check",
          status: "failure",
          metadata: { error: errorMessage },
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: false, error: errorMessage }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // admission_apply_penalty — Manually apply penalty to entity
  server.registerTool(
    "admission_apply_penalty",
    {
      description:
        "Apply a penalty to an entity in the admission gate. For out-of-band enforcement " +
        "when violations are detected by external systems. Set profit_masked=true for " +
        "the 3x accelerated multiplier. Violation types: budget_exceeded, origin_denied, " +
        "context_overflow, invalid_body, missing_structure, profit_masking.",
      inputSchema: z.object({
        entity_id: z.string().min(1).describe("Entity to penalize"),
        violation_type: z
          .enum([
            "budget_exceeded",
            "origin_denied",
            "context_overflow",
            "invalid_body",
            "missing_structure",
            "profit_masking",
          ])
          .describe("Type of violation"),
        profit_masked: z
          .boolean()
          .optional()
          .default(false)
          .describe("Apply 3x penalty multiplier for profit-masking"),
        reason: z
          .string()
          .optional()
          .default("mcp_enforcement")
          .describe("Human-readable reason for the penalty"),
        metadata: z
          .record(z.unknown())
          .optional()
          .describe("Additional context metadata"),
      }),
    },
    async (args: {
      entity_id: string;
      violation_type: string;
      profit_masked?: boolean;
      reason?: string;
      metadata?: Record<string, unknown>;
    }) => {
      const rlMsg = readLimiter.check("admission_apply_penalty");
      if (rlMsg)
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ error: rlMsg }) },
          ],
          isError: true,
        };

      try {
        const result = await callAdmission<Record<string, unknown>>(
          "POST",
          "/admission/penalty/apply",
          {
            entity_id: args.entity_id,
            violation_type: args.violation_type,
            profit_masked: args.profit_masked ?? false,
            reason: args.reason ?? "mcp_enforcement",
            metadata: args.metadata ?? {},
          },
        );

        emitAudit({
          source: SERVER_NAME,
          tool: "admission_apply_penalty",
          status: "success",
          metadata: {
            entity_id: args.entity_id,
            violation_type: args.violation_type,
            profit_masked: args.profit_masked,
            penalty_applied: result["penalty_points_applied"],
            total: result["total_penalty_points"],
            bannered: result["bannered"],
          },
        });

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        emitAudit({
          source: SERVER_NAME,
          tool: "admission_apply_penalty",
          status: "failure",
          metadata: { entity_id: args.entity_id, error: String(error) },
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: false, error: String(error) }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // admission_bannered_entities — List all bannered entities
  server.registerTool(
    "admission_bannered_entities",
    {
      description:
        "List all entities currently bannered (hard-blocked) by the admission gate. " +
        "Returns full violation history, penalty points, and tier classification for each.",
      inputSchema: z.object({}),
    },
    async () => {
      const rlMsg = readLimiter.check("admission_bannered_entities");
      if (rlMsg)
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ error: rlMsg }) },
          ],
          isError: true,
        };

      try {
        const result = await callAdmission<Record<string, unknown>>(
          "GET",
          "/admission/entities/bannered",
        );

        emitAudit({
          source: SERVER_NAME,
          tool: "admission_bannered_entities",
          status: "success",
          metadata: { count: result["count"] },
        });

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        emitAudit({
          source: SERVER_NAME,
          tool: "admission_bannered_entities",
          status: "failure",
          metadata: { error: String(error) },
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: false, error: String(error) }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // admission_stats — Get gate operational statistics
  server.registerTool(
    "admission_stats",
    {
      description:
        "Get admission gate operational statistics — total admitted/rejected, " +
        "rejection reason breakdown, tracked entity count, and bannered entity count.",
      inputSchema: z.object({}),
    },
    async () => {
      const rlMsg = readLimiter.check("admission_stats");
      if (rlMsg)
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ error: rlMsg }) },
          ],
          isError: true,
        };

      try {
        const result = await callAdmission<Record<string, unknown>>(
          "GET",
          "/admission/stats",
        );

        emitAudit({
          source: SERVER_NAME,
          tool: "admission_stats",
          status: "success",
          metadata: {
            admitted: result["total_admitted"],
            rejected: result["total_rejected"],
          },
        });

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        emitAudit({
          source: SERVER_NAME,
          tool: "admission_stats",
          status: "failure",
          metadata: { error: String(error) },
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: false, error: String(error) }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // ── Start ──

  return server;
}

export async function startServer(): Promise<McpServer> {
  logger.info(`v${VERSION} starting — GATE: ${GATE_DIR}`);

  // Startup health probe for GRID backend API
  const rawUrl = process.env.GRID_API_URL?.trim() || config.gridApiUrl || "";
  if (rawUrl) {
    const gridApiUrl = validateGridApiUrl(rawUrl);
    if (gridApiUrl) {
      try {
        const probe = await probeGridBackend(gridApiUrl, 5000);
        if (probe.reachable) {
          logger.info(
            `GRID backend reachable at ${gridApiUrl}${probe.endpoint} (status=${probe.status})`,
          );
        } else {
          logger.warn(
            `GRID backend at ${gridApiUrl} is NOT reachable ` +
              `(lastEndpoint=${probe.endpoint ?? "none"}, status=${probe.status ?? "unreachable"}, error=${probe.error ?? "unknown"}). ` +
              `Remote gate validation will fail-closed (approved=false) until backend is restored.`,
          );
        }
      } catch {
        logger.warn(
          `GRID backend probe failed for ${gridApiUrl}. ` +
            `Remote gate validation will fail-closed.`,
        );
      }
    } else {
      logger.warn(
        `GRID_API_URL configured but invalid — remote validation disabled.`,
      );
    }
  } else {
    logger.info(
      `GRID_API_URL not set — remote gate validation disabled (local-only mode).`,
    );
  }

  const server = buildServer();
  await server.connect(new StdioServerTransport());
  return server;
}

const isEntrypoint =
  process.argv[1] != null &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isEntrypoint) {
  async function main() {
    try {
      await startServer();
    } catch (error) {
      logger.error(`failed to start`, { error: String(error) });
      process.exit(1);
    }
  }

  main();
}
