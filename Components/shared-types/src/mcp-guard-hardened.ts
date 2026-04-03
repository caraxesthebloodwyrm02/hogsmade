/**
 * Hardened MCP Merit Guard — Void-Pattern-Free Implementation
 *
 * Addresses findings:
 * 1. No silent catch blocks — all errors logged and handled
 * 2. Cache TTL properly enforced
 * 3. Circuit breaker for GRID API failures
 * 4. Input validation on all entry points
 * 5. Immutable audit logging (no silent failures)
 * 6. Rate limiting on permission checks
 * 7. No implicit returns — all paths explicit
 */

import {
  generateMcpIdentity,
  ActionClass,
  Badge,
  type PermissionCheckResult,
  type MeritAuditEntry,
  Scope,
} from "./merit-policy.js";
import { emitAudit } from "./audit-client.js";
import * as z from "zod";
import { randomUUID } from "crypto";

// Result type for explicit error handling
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E; code: string };

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function err<E extends Error>(error: E, code: string): Result<never, E> {
  return { ok: false, error, code };
}

// Minimal McpServer interface — permissive enough to accept the real SDK McpServer
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface McpServerShape {
  registerTool: (...args: any[]) => any;
}

/** Hardened configuration options */
export interface HardenedMeritGuardConfig {
  serverName: string;
  gridApiUrl?: string;
  /** Circuit breaker configuration */
  circuitBreaker?: {
    failureThreshold: number;
    resetTimeoutMs: number;
    halfOpenMaxCalls: number;
  };
  /** Cache TTL in milliseconds (default: 30000) */
  cacheTtlMs?: number;
  /** Rate limit: max calls per window (default: 100) */
  rateLimitMax?: number;
  /** Rate limit window in milliseconds (default: 60000) */
  rateLimitWindowMs?: number;
  /** Require explicit session_id validation */
  strictSessionValidation?: boolean;
  /** Log all permission checks (default: true) */
  auditAll?: boolean;
}

/** Cached permission result with timestamp */
interface CachedPermission {
  result: PermissionCheckResult;
  timestamp: number;
  ttl: number;
}

/** Circuit breaker states */
export enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

/** Guarded tool options */
export interface GuardedToolOptions {
  actionClass: ActionClass;
  requiredScope?: Scope;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema?: Record<string, unknown> | any;
  /** Custom rate limit for this tool */
  rateLimit?: {
    max: number;
    windowMs: number;
  };
}

/** Internal config with all required fields */
interface InternalConfig {
  serverName: string;
  gridApiUrl: string;
  circuitBreaker: {
    failureThreshold: number;
    resetTimeoutMs: number;
    halfOpenMaxCalls: number;
  };
  cacheTtlMs: number;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  strictSessionValidation: boolean;
  auditAll: boolean;
}

/**
 * Hardened MCP Merit Guard — Void-Pattern-Free Implementation
 */
export class HardenedMcpMeritGuard {
  private config: InternalConfig;
  private cache: Map<string, CachedPermission> = new Map();
  private rateLimitMap: Map<string, number[]> = new Map();
  private readonly fallbackSessionId: string = randomUUID();

  // Circuit breaker state
  private circuitState: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private halfOpenCalls = 0;

  // Metrics for observability
  private metrics = {
    totalChecks: 0,
    cacheHits: 0,
    cacheMisses: 0,
    apiFailures: 0,
    rateLimitHits: 0,
    circuitBreakerOpens: 0,
  };

  constructor(config: HardenedMeritGuardConfig) {
    // Validate required configuration first
    if (!config.serverName) {
      throw new TypeError("serverName is required");
    }

    // Build internal config with all required fields
    this.config = {
      serverName: config.serverName,
      gridApiUrl: config.gridApiUrl ?? "",
      circuitBreaker: {
        failureThreshold: 5,
        resetTimeoutMs: 30000,
        halfOpenMaxCalls: 2,
        ...config.circuitBreaker,
      },
      cacheTtlMs: config.cacheTtlMs ?? 30000,
      rateLimitMax: config.rateLimitMax ?? 100,
      rateLimitWindowMs: config.rateLimitWindowMs ?? 60000,
      strictSessionValidation: config.strictSessionValidation ?? true,
      auditAll: config.auditAll ?? true,
    };
  }

  /**
   * Generate MCP session identity with validation
   * Returns error result instead of silent failures
   */
  private generateIdentity(sessionId: unknown): Result<string> {
    if (sessionId === undefined || sessionId === null) {
      // Stable per-process fallback without requiring tool-input schema change
      return ok(generateMcpIdentity(this.config.serverName, this.fallbackSessionId));
    }

    if (typeof sessionId !== "string") {
      return err(
        new TypeError(`session_id must be string, got ${typeof sessionId}`),
        "INVALID_SESSION_TYPE",
      );
    }

    if (this.config.strictSessionValidation) {
      // Validate session_id format (alphanumeric, hyphens, underscores)
      const validPattern = /^[a-zA-Z0-9_-]{1,64}$/;
      if (!validPattern.test(sessionId)) {
        return err(new Error("session_id format invalid"), "INVALID_SESSION_FORMAT");
      }
    }

    return ok(generateMcpIdentity(this.config.serverName, sessionId));
  }

  /**
   * Check and enforce rate limits
   * Returns true if allowed, false if rate limited
   */
  private checkRateLimit(entityId: string, maxCalls: number, windowMs: number): boolean {
    const now = Date.now();
    const calls = this.rateLimitMap.get(entityId) || [];

    // Remove expired calls
    const validCalls = calls.filter((t) => now - t < windowMs);

    if (validCalls.length >= maxCalls) {
      this.metrics.rateLimitHits++;
      return false;
    }

    validCalls.push(now);
    this.rateLimitMap.set(entityId, validCalls);
    return true;
  }

  /**
   * Clean expired cache entries
   * Explicit void return - documented
   */
  private cleanExpiredCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache entry if valid
   * Returns null if expired or missing (never undefined)
   */
  private getValidCacheEntry(key: string): CachedPermission | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry;
  }

  /**
   * Circuit breaker: check if request should proceed
   */
  private canAttemptRequest(): boolean {
    switch (this.circuitState) {
      case CircuitState.CLOSED:
        return true;

      case CircuitState.OPEN:
        if (Date.now() - this.lastFailureTime > this.config.circuitBreaker.resetTimeoutMs) {
          this.circuitState = CircuitState.HALF_OPEN;
          this.halfOpenCalls = 0;
          return true;
        }
        return false;

      case CircuitState.HALF_OPEN:
        if (this.halfOpenCalls < this.config.circuitBreaker.halfOpenMaxCalls) {
          this.halfOpenCalls++;
          return true;
        }
        return false;
    }
  }

  /**
   * Record success for circuit breaker
   * Explicit void return - documented
   */
  private recordSuccess(): void {
    if (this.circuitState === CircuitState.HALF_OPEN) {
      this.circuitState = CircuitState.CLOSED;
      this.failureCount = 0;
      this.halfOpenCalls = 0;
    }
  }

  /**
   * Record failure for circuit breaker
   * Explicit void return - documented
   */
  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.config.circuitBreaker.failureThreshold) {
      this.circuitState = CircuitState.OPEN;
      this.metrics.circuitBreakerOpens++;
    }
  }

  /**
   * Check permission with the GRID merit engine
   * No silent failures - all paths return explicit Result
   */
  private async checkPermission(
    entityId: string,
    actionClass: ActionClass,
    requiredScope?: Scope,
  ): Promise<Result<PermissionCheckResult>> {
    this.metrics.totalChecks++;

    // Check rate limit
    const allowed = this.checkRateLimit(
      entityId,
      this.config.rateLimitMax,
      this.config.rateLimitWindowMs,
    );
    if (!allowed) {
      return err(new Error("Rate limit exceeded"), "RATE_LIMITED");
    }

    // Clean expired cache
    this.cleanExpiredCache();

    // Check cache
    const cacheKey = `${entityId}:${actionClass}:${requiredScope || "none"}`;
    const cached = this.getValidCacheEntry(cacheKey);
    if (cached) {
      this.metrics.cacheHits++;
      return ok(cached.result);
    }
    this.metrics.cacheMisses++;

    // Circuit breaker check
    if (!this.canAttemptRequest()) {
      return err(new Error("Circuit breaker open"), "CIRCUIT_OPEN");
    }

    // Attempt GRID API call
    if (this.config.gridApiUrl) {
      try {
        const response = await this.callGridApi(entityId, actionClass, requiredScope);

        if (response.ok) {
          const result = response.value;
          // Cache successful result
          this.cache.set(cacheKey, {
            result,
            timestamp: Date.now(),
            ttl: this.config.cacheTtlMs,
          });
          this.recordSuccess();
          return ok(result);
        } else {
          this.recordFailure();
          this.metrics.apiFailures++;
          return err(response.error, response.code);
        }
      } catch (error) {
        this.recordFailure();
        this.metrics.apiFailures++;
        // Explicit error handling - never silent
        const errorMsg = error instanceof Error ? error.message : String(error);
        return err(new Error(`GRID API error: ${errorMsg}`), "GRID_API_ERROR");
      }
    }

    // No GRID API configured - fail closed
    return err(new Error("GRID API URL not configured"), "NO_GRID_API");
  }

  /**
   * Call GRID API with proper error handling
   * Returns explicit Result - no void returns
   */
  private async callGridApi(
    entityId: string,
    actionClass: ActionClass,
    requiredScope?: Scope,
  ): Promise<Result<PermissionCheckResult>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const requestId = randomUUID();
      const response = await fetch(`${this.config.gridApiUrl}/admission/check-permission`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Request-ID": requestId,
          "X-Correlation-ID": requestId,
          // Admission Gate entity attribution (prevents ip:* fallback)
          "X-Entity-Id": entityId,
        },
        body: JSON.stringify({
          entity_id: entityId,
          action_class: actionClass,
          required_scope: requiredScope,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.status === 429) {
        return err(new Error("GRID rate limit"), "GRID_RATE_LIMITED");
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "unknown");
        return err(new Error(`GRID error ${response.status}: ${body}`), "GRID_ERROR");
      }

      const result = (await response.json()) as PermissionCheckResult;
      return ok(result);
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof Error && error.name === "AbortError") {
        return err(new Error("GRID timeout"), "GRID_TIMEOUT");
      }
      throw error; // Re-throw unexpected errors
    }
  }

  /**
   * Log merit decision to audit trail
   * Never fails silently - errors logged to stderr
   */
  private async logMeritDecision(
    entry: Omit<MeritAuditEntry, "timestamp" | "source">,
  ): Promise<void> {
    const auditEntry: MeritAuditEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
      source: "mcp",
    };

    try {
      const result = await emitAudit({
        source: `${this.config.serverName}-merit-guard`,
        tool: "merit_check",
        status: auditEntry.verdict === "allowed" ? "success" : "blocked",
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

      if (!result) {
        // Audit failed - this is critical, log to stderr
        console.error(
          `[CRITICAL] Merit audit failed for ${auditEntry.entity_id} - action: ${auditEntry.action_class}`,
        );
      }
    } catch (auditError) {
      // Audit threw - critical, log to stderr
      console.error(
        `[CRITICAL] Merit audit threw exception:`,
        auditError instanceof Error ? auditError.message : String(auditError),
      );
    }
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
   * Register a guarded tool with hardened error boundaries
   * All error paths explicit - no silent failures
   */
  registerGuardedTool(
    server: McpServerShape,
    name: string,
    options: GuardedToolOptions,
    handler: (args: Record<string, unknown>, sessionId?: string) => Promise<unknown>,
  ): void {
    server.registerTool(
      name,
      {
        description: `${options.description} [action_class: ${options.actionClass}]`,
        inputSchema: options.inputSchema || z.object({}),
      },
      async (args: Record<string, unknown>) => {
        const startTime = Date.now();

        // Extract and validate session_id
        const sessionIdRaw = args.session_id;
        const identityResult = this.generateIdentity(sessionIdRaw);

        if (!identityResult.ok) {
          await this.logMeritDecision({
            entity_id: "invalid",
            action_class: options.actionClass,
            required_badge: this.getRequiredBadge(options.actionClass),
            actual_badge: Badge.B0_RESTRICTED,
            verdict: "denied",
            penalty_delta: 0,
            roll_number: 0,
            score: 0,
            session_id: "invalid",
          });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error: "INVALID_IDENTITY",
                    message: identityResult.error.message,
                    code: identityResult.code,
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        const entityId = identityResult.value;
        // Extract resolved session ID from identity (mcp:{server}:{sessionId})
        const resolvedSessionId = entityId.split(":").pop() || this.fallbackSessionId;

        // Check permission
        const permissionResult = await this.checkPermission(
          entityId,
          options.actionClass,
          options.requiredScope,
        );

        if (!permissionResult.ok) {
          // Log the denial
          await this.logMeritDecision({
            entity_id: entityId,
            action_class: options.actionClass,
            required_badge: this.getRequiredBadge(options.actionClass),
            actual_badge: Badge.B0_RESTRICTED,
            verdict: "denied",
            penalty_delta: 0,
            roll_number: 0,
            score: 0,
            session_id: resolvedSessionId,
          });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error: "PERMISSION_CHECK_FAILED",
                    message: permissionResult.error.message,
                    code: permissionResult.code,
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        const permission = permissionResult.value;

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
          session_id: resolvedSessionId,
        });

        if (!permission.allowed) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error: "INSUFFICIENT_MERIT_STANDING",
                    entity_id: entityId,
                    required_badge: permission.required_badge,
                    actual_badge: permission.actual_badge,
                    required_scope: options.requiredScope,
                    message:
                      `Insufficient merit standing for ${options.actionClass}. ` +
                      `Required: ${permission.required_badge}, Current: ${permission.actual_badge}`,
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        // Execute handler with error boundary
        try {
          const result = await handler(args, resolvedSessionId);

          const duration = Date.now() - startTime;

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    result,
                    _meta: {
                      entity_id: entityId,
                      action_class: options.actionClass,
                      duration_ms: duration,
                    },
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (handlerError) {
          const errorMsg =
            handlerError instanceof Error ? handlerError.message : String(handlerError);

          // Log handler errors explicitly
          console.error(`[HANDLER_ERROR] Tool ${name} failed for ${entityId}:`, errorMsg);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error: "HANDLER_EXECUTION_FAILED",
                    message: errorMsg,
                    tool: name,
                    entity_id: entityId,
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );
  }

  /**
   * Get current metrics for monitoring
   */
  getMetrics(): Readonly<typeof this.metrics> {
    return { ...this.metrics };
  }

  /**
   * Get circuit breaker state
   */
  getCircuitState(): CircuitState {
    return this.circuitState;
  }

  /**
   * Reset circuit breaker (for testing/recovery)
   */
  resetCircuitBreaker(): void {
    this.circuitState = CircuitState.CLOSED;
    this.failureCount = 0;
    this.halfOpenCalls = 0;
  }
}

/**
 * Create a hardened merit guard for an MCP server
 */
export function createHardenedMeritGuard(
  serverName: string,
  gridApiUrl?: string,
): HardenedMcpMeritGuard {
  return new HardenedMcpMeritGuard({
    serverName,
    gridApiUrl: gridApiUrl || process.env.GRID_API_URL,
  });
}
