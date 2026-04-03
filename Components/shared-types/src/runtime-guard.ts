/**
 * Runtime Void Pattern Protection
 *
 * Wraps critical functions with monitoring to detect silent failures.
 * Adds to the hardened merit guard for comprehensive runtime safety.
 */

import type { AuditEvent } from "./audit.js";
import { emitAudit } from "./audit-client.js";

/** Metrics tracked at runtime */
interface RuntimeMetrics {
  totalCalls: number;
  successCount: number;
  errorCount: number;
  voidReturns: number;
  nullReturns: number;
  emptyArrayReturns: number;
  exceptionCount: number;
  circuitBreakerOpens: number;
  rateLimitHits: number;
}

/** Runtime guard configuration */
interface RuntimeGuardConfig {
  /** Server name for identification */
  serverName: string;
  /** Alert on void/undefined returns */
  alertOnVoid?: boolean;
  /** Alert on null returns */
  alertOnNull?: boolean;
  /** Alert on empty array returns */
  alertOnEmptyArray?: boolean;
  /** Alert threshold for errors (errors per minute) */
  errorThreshold?: number;
  /** Callback for custom error handling */
  onError?: (error: Error, context: string) => void | Promise<void>;
}

/** Internal config with defaults applied */
interface InternalRuntimeConfig {
  serverName: string;
  alertOnVoid: boolean;
  alertOnNull: boolean;
  alertOnEmptyArray: boolean;
  errorThreshold: number;
  onError?: (error: Error, context: string) => void | Promise<void>;
}

/**
 * Runtime Error Boundary for MCP Tools
 * Wraps handlers with comprehensive monitoring
 */
export class RuntimeErrorBoundary {
  private config: InternalRuntimeConfig;
  private metrics: RuntimeMetrics;
  private errorWindow: number[] = [];
  private lastCleanup = Date.now();

  constructor(config: RuntimeGuardConfig) {
    this.config = {
      alertOnVoid: true,
      alertOnNull: true,
      alertOnEmptyArray: false,
      errorThreshold: 10,
      ...config,
    };
    this.metrics = {
      totalCalls: 0,
      successCount: 0,
      errorCount: 0,
      voidReturns: 0,
      nullReturns: 0,
      emptyArrayReturns: 0,
      exceptionCount: 0,
      circuitBreakerOpens: 0,
      rateLimitHits: 0,
    };
  }

  /**
   * Wrap a function with runtime protection
   */
  wrap<TArgs extends Record<string, unknown>, TResult>(
    name: string,
    handler: (args: TArgs) => Promise<TResult>,
  ): (args: TArgs) => Promise<TResult> {
    return async (args: TArgs): Promise<TResult> => {
      this.metrics.totalCalls++;
      const startTime = Date.now();

      try {
        const result = await handler(args);

        // Analyze return value
        this._analyzeReturn(name, result);

        this.metrics.successCount++;

        // Log successful call for audit
        await this._logSuccess(name, args, startTime);

        return result;
      } catch (error) {
        this.metrics.exceptionCount++;

        const errorMsg = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;

        // Log to stderr for immediate visibility
        console.error(
          `[RUNTIME_ERROR] ${this.config.serverName}.${name}: ${errorMsg}\n${errorStack || ""}`,
        );

        // Track error rate
        this._trackError();

        // Custom error handler
        if (this.config.onError) {
          try {
            await this.config.onError(
              error instanceof Error ? error : new Error(String(error)),
              `${this.config.serverName}.${name}`,
            );
          } catch (handlerError) {
            console.error(`[CRITICAL] Error handler failed: ${handlerError}`);
          }
        }

        // Audit log the error
        await this._logError(name, args, error, startTime);

        // Re-throw to maintain original behavior
        throw error;
      }
    };
  }

  /**
   * Analyze return value for void patterns
   */
  private _analyzeReturn(name: string, result: unknown): void {
    if (result === undefined) {
      this.metrics.voidReturns++;
      if (this.config.alertOnVoid) {
        console.warn(`[VOID_PATTERN] ${this.config.serverName}.${name} returned undefined`);
      }
    } else if (result === null) {
      this.metrics.nullReturns++;
      if (this.config.alertOnNull) {
        console.warn(`[VOID_PATTERN] ${this.config.serverName}.${name} returned null`);
      }
    } else if (Array.isArray(result) && result.length === 0) {
      this.metrics.emptyArrayReturns++;
      if (this.config.alertOnEmptyArray) {
        console.warn(`[VOID_PATTERN] ${this.config.serverName}.${name} returned empty array`);
      }
    }
  }

  /**
   * Track error rate and check threshold
   */
  private _trackError(): void {
    const now = Date.now();
    this.errorWindow.push(now);

    // Clean old entries (older than 1 minute)
    this.errorWindow = this.errorWindow.filter((t) => now - t < 60000);

    // Check threshold
    if (this.errorWindow.length > this.config.errorThreshold) {
      console.error(
        `[ALERT] ${this.config.serverName}: Error rate exceeded threshold ` +
          `(${this.errorWindow.length} errors/min > ${this.config.errorThreshold})`,
      );
    }
  }

  /**
   * Log successful call for audit
   */
  private async _logSuccess(
    name: string,
    args: Record<string, unknown>,
    startTime: number,
  ): Promise<void> {
    const duration = Date.now() - startTime;
    try {
      await emitAudit({
        source: `${this.config.serverName}-runtime`,
        tool: name,
        status: "success",
        durationMs: duration,
        metadata: {
          argsCount: Object.keys(args).length,
        },
      });
    } catch {
      // Audit failure should not break the call
      console.error(`[AUDIT_FAIL] Failed to log success for ${name}`);
    }
  }

  /**
   * Log error for audit
   */
  private async _logError(
    name: string,
    args: Record<string, unknown>,
    error: unknown,
    startTime: number,
  ): Promise<void> {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    try {
      await emitAudit({
        source: `${this.config.serverName}-runtime`,
        tool: name,
        status: "error",
        durationMs: duration,
        metadata: {
          argsCount: Object.keys(args).length,
          error: errorMsg,
        },
      });
    } catch {
      // Audit failure should not break error handling
      console.error(`[AUDIT_FAIL] Failed to log error for ${name}`);
    }
  }

  /**
   * Get current metrics snapshot
   */
  getMetrics(): RuntimeMetrics {
    return { ...this.metrics };
  }

  /**
   * Get error rate (errors per minute)
   */
  getErrorRate(): number {
    const now = Date.now();
    this.errorWindow = this.errorWindow.filter((t) => now - t < 60000);
    return this.errorWindow.length;
  }

  /**
   * Reset all metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalCalls: 0,
      successCount: 0,
      errorCount: 0,
      voidReturns: 0,
      nullReturns: 0,
      emptyArrayReturns: 0,
      exceptionCount: 0,
      circuitBreakerOpens: 0,
      rateLimitHits: 0,
    };
    this.errorWindow = [];
  }
}

/**
 * Create a runtime error boundary
 */
export function createRuntimeBoundary(
  serverName: string,
  options?: Omit<RuntimeGuardConfig, "serverName">,
): RuntimeErrorBoundary {
  return new RuntimeErrorBoundary({
    serverName,
    ...options,
  });
}
