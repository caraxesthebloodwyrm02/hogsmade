/**
 * Core types for resilience patterns
 */

export interface ResilienceConfig {
  serviceName: string;
  timeout?: number;
  retry?: RetryConfig;
  circuitBreaker?: CircuitBreakerConfig;
  rateLimit?: RateLimitConfig;
}

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors?: string[];
  nonRetryableErrors?: string[];
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeoutMs: number;
  halfOpenMaxCalls?: number;
}

export interface RateLimitConfig {
  tokensPerSecond: number;
  burstSize: number;
  maxQueueSize?: number;
}

export interface HealthCheckConfig {
  intervalMs: number;
  timeoutMs: number;
  unhealthyThreshold: number;
  healthyThreshold: number;
}

export enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
}

export interface RetryMetrics {
  attempts: number;
  totalDelayMs: number;
  lastError?: Error;
}

export interface RateLimitMetrics {
  tokensAvailable: number;
  queueSize: number;
  totalRequests: number;
  throttledRequests: number;
}

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  lastCheck: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  details?: Record<string, unknown>;
}

export type ResilientFunction<T> = (...args: unknown[]) => Promise<T>;

export interface ResilienceContext {
  serviceName: string;
  operationName: string;
  startTime: number;
  attempt?: number;
  /** W3C trace-id for cross-service correlation (optional). */
  traceId?: string;
  /** W3C span-id for cross-service correlation (optional). */
  spanId?: string;
}

export class ResilienceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: ResilienceContext,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "ResilienceError";
  }
}

export class CircuitBreakerOpenError extends ResilienceError {
  constructor(serviceName: string, context?: ResilienceContext) {
    super(`Circuit breaker is OPEN for service: ${serviceName}`, "CIRCUIT_BREAKER_OPEN", context);
    this.name = "CircuitBreakerOpenError";
  }
}

export class RateLimitExceededError extends ResilienceError {
  constructor(serviceName: string, context?: ResilienceContext) {
    super(`Rate limit exceeded for service: ${serviceName}`, "RATE_LIMIT_EXCEEDED", context);
    this.name = "RateLimitExceededError";
  }
}

export class RetryExhaustedError extends ResilienceError {
  constructor(
    serviceName: string,
    attempts: number,
    lastError: Error,
    context?: ResilienceContext,
  ) {
    super(
      `Retry exhausted after ${attempts} attempts for service: ${serviceName}`,
      "RETRY_EXHAUSTED",
      context,
      lastError,
    );
    this.name = "RetryExhaustedError";
  }
}
