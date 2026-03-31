/**
 * MCP Merit Guard — Centralized guard wrappers for MCP servers
 *
 * Provides merit-driven authentication for MCP tool calls using session-first identity.
 * All new entities start at B0_RESTRICTED with strict limited scopes.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  generateMcpIdentity,
  ActionClass,
  Badge,
  PermissionCheckResult,
  Scope,
  MeritAuditEntry,
} from "./merit-policy.js";
import { emitAudit } from "./audit-client.js";

// Local Logger interface for guard operations
interface Logger {
  debug: (msg: string, meta?: Record<string, unknown>) => void;
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
}

// Minimal McpServer interface — permissive enough to accept the real SDK McpServer
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface McpServerShape {
  registerTool: (...args: any[]) => any;
}

/** Configuration options for McpMeritGuard */
export interface MeritGuardConfig {
  serverName: string;
  /** Base GRID API URL for remote verification */
  gridApiUrl?: string;
  /** Enable local fallback if grid unavailable */
  fallbackLocal?: boolean;
  /** Default badge for new entities in fallback mode */
  fallbackBadge?: Badge;
}

export interface GuardedToolOptions {
  actionClass: ActionClass;
  requiredScope?: Scope;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema?: Record<string, unknown> | any;
}

/**
 * MCP Merit Guard — wraps MCP tools with merit-based access control
 */
export class McpMeritGuard {
  private config: MeritGuardConfig;
  private cache: Map<string, PermissionCheckResult> = new Map();
  private cacheTtlMs = 30000; // 30 second cache TTL

  constructor(config: MeritGuardConfig) {
    this.config = {
      fallbackLocal: true,
      fallbackBadge: Badge.B0_RESTRICTED,
      ...config,
    };
  }

  /**
   * Generate MCP session identity
   * Format: `mcp:{server}:{session_id}` (fallback deterministic)
   */
  private generateIdentity(sessionId?: string): string {
    return generateMcpIdentity(this.config.serverName, sessionId);
  }

  /**
   * Check permission with the GRID merit engine
   */
  private async checkPermission(
    entityId: string,
    actionClass: ActionClass,
    requiredScope?: Scope
  ): Promise<PermissionCheckResult> {
    // Check cache first
    const cacheKey = `${entityId}:${actionClass}:${requiredScope || "none"}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Try to verify with GRID Mothership
    if (this.config.gridApiUrl) {
      try {
        const response = await fetch(
          `${this.config.gridApiUrl}/admission/check-permission`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              entity_id: entityId,
              action_class: actionClass,
              required_scope: requiredScope,
            }),
          }
        );

        if (response.ok) {
          const result = (await response.json()) as PermissionCheckResult;
          this.cache.set(cacheKey, result);
          return result;
        }
      } catch {
        // Fail closed or use fallback
      }
    }

    // Fallback: local evaluation
    if (this.config.fallbackLocal) {
      // Local evaluation based on action class requirements
      const requiredBadge = this.getRequiredBadge(actionClass);
      const entityBadge = this.config.fallbackBadge!;
      const hasBadge = this.badgeRank(entityBadge) >= this.badgeRank(requiredBadge);

      const result: PermissionCheckResult = {
        allowed: hasBadge,
        entity_id: entityId,
        action_class: actionClass,
        required_badge: requiredBadge,
        actual_badge: entityBadge,
        has_badge: hasBadge,
        required_scopes: this.getRequiredScopes(actionClass),
        eligible_scopes: [],
        has_scopes: false,
        has_specific_scope: false,
        score: 45,
        roll_number: 0,
      };

      this.cache.set(cacheKey, result);
      return result;
    }

    // Fail closed
    return {
      allowed: false,
      entity_id: entityId,
      action_class: actionClass,
      required_badge: this.getRequiredBadge(actionClass),
      actual_badge: Badge.B0_RESTRICTED,
      has_badge: false,
      required_scopes: this.getRequiredScopes(actionClass),
      eligible_scopes: [],
      has_scopes: false,
      has_specific_scope: false,
      score: 0,
      roll_number: 0,
    };
  }

  /**
   * Get required badge for action class
   */
  private getRequiredBadge(actionClass: ActionClass): Badge {
    const mapping: Record<ActionClass, Badge> = {
      [ActionClass.PUBLIC_BASIC]: Badge.B0_RESTRICTED,
      [ActionClass.ANALYSIS_READ]: Badge.B1_TRUSTED,
      [ActionClass.ACTION_WRITE]: Badge.B2_VERIFIED,
      [ActionClass.CONTROL_ADMIN]: Badge.B3_PRIVILEGED,
    };
    return mapping[actionClass];
  }

  /**
   * Get required scopes for action class
   */
  private getRequiredScopes(actionClass: ActionClass): Scope[] {
    const mapping: Record<ActionClass, Scope[]> = {
      [ActionClass.PUBLIC_BASIC]: [],
      [ActionClass.ANALYSIS_READ]: [Scope.READ],
      [ActionClass.ACTION_WRITE]: [Scope.READ, Scope.WRITE],
      [ActionClass.CONTROL_ADMIN]: [Scope.READ, Scope.WRITE, Scope.ADMIN],
    };
    return mapping[actionClass];
  }

  /**
   * Get badge rank for comparison
   */
  private badgeRank(badge: Badge): number {
    const ranks: Record<Badge, number> = {
      [Badge.B0_RESTRICTED]: 0,
      [Badge.B1_TRUSTED]: 1,
      [Badge.B2_VERIFIED]: 2,
      [Badge.B3_PRIVILEGED]: 3,
    };
    return ranks[badge];
  }

  /**
   * Log merit decision to audit trail
   */
  private async logMeritDecision(
    entry: Omit<MeritAuditEntry, "timestamp" | "source">
  ): Promise<void> {
    const auditEntry: MeritAuditEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
      source: "mcp",
    };

    // Pass the audit fields excluding timestamp (emitAudit adds it)
    await emitAudit({
      source: `${this.config.serverName}-merit-guard`,
      tool: "merit_check",
      status: auditEntry.verdict === "allowed" ? "success" : "failure",
      metadata: {
        entity_id: auditEntry.entity_id,
        action_class: auditEntry.action_class,
        required_badge: auditEntry.required_badge,
        actual_badge: auditEntry.actual_badge,
        verdict: auditEntry.verdict,
        penalty_delta: auditEntry.penalty_delta,
        roll_number: auditEntry.roll_number,
        score: auditEntry.score,
        session_id: auditEntry.session_id,
      },
    });
  }

  /**
   * Register a guarded tool with merit checking
   */
  registerGuardedTool<TArgs extends Record<string, unknown>, TResult>(
    server: McpServerShape,
    name: string,
    options: GuardedToolOptions,
    handler: (args: TArgs, sessionId?: string) => Promise<TResult>
  ): void {
    server.registerTool(
      name,
      {
        description: `${options.description} [Requires: ${options.actionClass}]`,
        inputSchema: options.inputSchema || { type: "object", properties: {} },
      },
      async (args: TArgs) => {
        const sessionId = (args as { session_id?: string }).session_id;
        const entityId = this.generateIdentity(sessionId);

        // Check permission
        const permission = await this.checkPermission(
          entityId,
          options.actionClass,
          options.requiredScope
        );

        // Log the decision
        await this.logMeritDecision({
          entity_id: entityId,
          action_class: options.actionClass,
          required_badge: permission.required_badge,
          actual_badge: permission.actual_badge,
          verdict: permission.allowed ? "allowed" : "denied",
          penalty_delta: 0,
          roll_number: permission.roll_number,
          score: permission.score,
          session_id: sessionId,
        });

        if (!permission.allowed) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: "INSUFFICIENT_MERIT_STANDING",
                  entity_id: entityId,
                  required_badge: permission.required_badge,
                  actual_badge: permission.actual_badge,
                  required_scope: options.requiredScope,
                  message: `Insufficient merit standing for ${options.actionClass}. ` +
                    `Required: ${permission.required_badge}, Current: ${permission.actual_badge}`,
                }, null, 2),
              },
            ],
            isError: true,
          };
        }

        // Execute the handler
        const result = await handler(args, sessionId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }
    );
  }

  /**
   * Wrap an entire McpServer with merit guards
   *
   * This wraps all tools with a baseline check and allows individual tools
   * to have their own action_class metadata.
   */
  wrapServer(server: McpServerShape, defaultActionClass: ActionClass = ActionClass.PUBLIC_BASIC): void {
    // Note: This is a simplified wrapper. In production, you would
    // use a more sophisticated approach that preserves individual tool metadata.

    // Store reference to the original registerTool
    const originalRegisterTool = server.registerTool.bind(server);

    // Replace with a wrapped version
    server.registerTool = (
      name: string,
      config: { description: string; inputSchema?: Record<string, unknown> },
      handler: (args: Record<string, unknown>) => Promise<unknown>
    ) => {
      // Extract action_class from description if present
      const actionMatch = config.description.match(/\[action_class:\s*(\w+)\]/);
      const actionClass = actionMatch
        ? (actionMatch[1] as ActionClass)
        : defaultActionClass;

      this.registerGuardedTool(server, name, {
        actionClass,
        description: config.description,
        inputSchema: config.inputSchema,
      }, handler);
    };
  }
}

/**
 * Convenience function to create a merit guard for an MCP server
 */
export function createMeritGuard(
  serverName: string,
  gridApiUrl?: string
): McpMeritGuard {
  return new McpMeritGuard({
    serverName,
    gridApiUrl: gridApiUrl || process.env.GRID_API_URL,
  });
}


// ═══════════════════════════════════════════════════════════════════
// VOID PATTERN MITIGATION - Focused, Tailored Custom Guards
// ═══════════════════════════════════════════════════════════════════

export interface GuardConfig {
  serverName: string;
  logger: Logger;
  failClosedOnAudit?: boolean;
  maxRetries?: number;
  verifyWrites?: boolean;
}

export interface OperationResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  durationMs: number;
  retryCount: number;
}

/**
 * Guarded async operation - mitigates void + .catch() silent failures
 * aggressively retries with exponential backoff
 */
export async function guardedOperation<T>(
  operation: () => Promise<T>,
  config: GuardConfig,
  context: string
): Promise<OperationResult<T>> {
  const startTime = Date.now();
  let retryCount = 0;
  const maxRetries = config.maxRetries ?? 1;

  while (retryCount < maxRetries) {
    try {
      const data = await operation();
      return {
        success: true,
        data,
        durationMs: Date.now() - startTime,
        retryCount,
      };
    } catch (error) {
      retryCount++;
      config.logger.error(`[${config.serverName}] ${context} failed (${retryCount}/${maxRetries})`, {
        error: error instanceof Error ? error.message : String(error),
      });

      if (retryCount >= maxRetries) {
        return {
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
          durationMs: Date.now() - startTime,
          retryCount,
        };
      }

      await new Promise((r) => setTimeout(r, 100 * Math.pow(2, retryCount - 1)));
    }
  }

  return {
    success: false,
    error: new Error(`Max retries exceeded for ${context}`),
    durationMs: Date.now() - startTime,
    retryCount,
  };
}

/**
 * Guarded audit emit - mitigates fire-and-forget audit failures
 * fails closed on security-critical operations
 */
export async function guardedAuditEmit(
  serverName: string,
  tool: string,
  status: "success" | "failure" | "blocked",
  config: { failClosed?: boolean; logger: Logger },
  metadata?: Record<string, unknown>
): Promise<boolean> {
  const result = await guardedOperation(
    () => emitAudit({ source: serverName, tool, status, metadata }),
    {
      serverName,
      logger: config.logger,
      maxRetries: 3,
    },
    `audit:${tool}`
  );

  if (!result.success && config.failClosed) {
    config.logger.error(`[${serverName}] CRITICAL: Audit write failed, entering degraded mode`);
    throw new Error(`Audit write failed for ${tool}: ${result.error?.message}`);
  }

  return result.success;
}

/**
 * Guarded file write - mitigates silent file write failures
 * optional read-back verification
 */
export async function guardedFileWrite<T>(
  writeFn: () => Promise<void>,
  readBackFn: (() => Promise<T>) | null,
  config: GuardConfig,
  filePath: string
): Promise<OperationResult<T | void>> {
  const writeResult = await guardedOperation(writeFn, config, `write:${filePath}`);

  if (!writeResult.success) {
    return writeResult as OperationResult<T | void>;
  }

  if (readBackFn && config.verifyWrites) {
    const verifyResult = await guardedOperation(readBackFn, { ...config, maxRetries: 1 }, `verify:${filePath}`);

    if (!verifyResult.success) {
      return {
        success: false,
        error: new Error(`Write succeeded but verification failed for ${filePath}`),
        durationMs: writeResult.durationMs + verifyResult.durationMs,
        retryCount: writeResult.retryCount + verifyResult.retryCount,
      };
    }

    return {
      success: true,
      data: verifyResult.data,
      durationMs: writeResult.durationMs + verifyResult.durationMs,
      retryCount: writeResult.retryCount + verifyResult.retryCount,
    };
  }

  return {
    success: true,
    data: undefined,
    durationMs: writeResult.durationMs,
    retryCount: writeResult.retryCount,
  };
}

/**
 * Server startup guard - mitigates void startServer().catch() pattern
 * exits process immediately on failure
 */
export async function guardedServerStartup<T>(
  startFn: () => Promise<T>,
  serverName: string,
  logger: Logger
): Promise<T> {
  const result = await guardedOperation(
    startFn,
    { serverName, logger, maxRetries: 1 },
    "server-startup"
  );

  if (!result.success) {
    logger.error(`[${serverName}] Server startup failed`, { error: result.error?.message });
    process.exit(1);
  }

  logger.info(`[${serverName}] Server started`, { durationMs: result.durationMs });
  return result.data!;
}

/**
 * Selective scope definitions for aggressive mitigation
 */
export const MITIGATION_SCOPES = {
  /** Critical security operations - fail closed, max retries */
  SECURITY: { failClosedOnAudit: true, maxRetries: 3, verifyWrites: true },
  /** Audit trail operations - retry aggressively */
  AUDIT: { failClosedOnAudit: false, maxRetries: 3, verifyWrites: false },
  /** File persistence - verify with read-back */
  PERSISTENCE: { failClosedOnAudit: false, maxRetries: 2, verifyWrites: true },
  /** Standard operations - minimal guarding */
  STANDARD: { failClosedOnAudit: false, maxRetries: 1, verifyWrites: false },
} as const;

export type MitigationScope = keyof typeof MITIGATION_SCOPES;

/**
 * Create guard config from scope
 */
export function createGuardConfig(
  serverName: string,
  logger: Logger,
  scope: MitigationScope
): GuardConfig {
  return { serverName, logger, ...MITIGATION_SCOPES[scope] };
}
