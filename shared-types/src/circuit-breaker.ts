/**
 * Circuit Breaker for MCP Guard System
 *
 * Prevents cascade failures by opening the circuit after a threshold
 * of consecutive failures, with automatic recovery attempts.
 */

/** Circuit breaker states */
export enum CircuitState {
  /** Normal operation - requests pass through */
  CLOSED = "closed",
  /** Failing fast - requests rejected immediately */
  OPEN = "open",
  /** Testing recovery - limited requests allowed */
  HALF_OPEN = "half-open",
}

/** Circuit breaker configuration */
export interface CircuitBreakerConfig {
  /** Number of failures before opening the circuit */
  failureThreshold: number;
  /** Time in ms before attempting recovery */
  resetTimeoutMs: number;
  /** Max calls allowed in half-open state before deciding */
  halfOpenMaxCalls: number;
}

/** Default circuit breaker configuration */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30000, // 30 seconds
  halfOpenMaxCalls: 3,
};

/** Circuit breaker statistics */
export interface CircuitBreakerStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  consecutiveSuccesses: number;
  totalCalls: number;
  rejectedCalls: number;
}

/**
 * Guard Circuit Breaker - prevents cascade failures
 *
 * - CLOSED: Normal operation, requests execute
 * - OPEN: Fail fast after threshold exceeded
 * - HALF_OPEN: Test recovery with limited traffic
 */
export class GuardCircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private consecutiveSuccesses = 0;
  private halfOpenCalls = 0;
  private totalCalls = 0;
  private rejectedCalls = 0;

  constructor(
    private name: string,
    private config: CircuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG
  ) {}

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      consecutiveSuccesses: this.consecutiveSuccesses,
      totalCalls: this.totalCalls,
      rejectedCalls: this.rejectedCalls,
    };
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalCalls++;

    // Check if circuit is OPEN
    if (this.state === CircuitState.OPEN) {
      const timeSinceLastFailure = Date.now() - (this.lastFailureTime || 0);

      if (timeSinceLastFailure >= this.config.resetTimeoutMs) {
        // Transition to HALF_OPEN to test recovery
        this.state = CircuitState.HALF_OPEN;
        this.halfOpenCalls = 0;
        this.consecutiveSuccesses = 0;
      } else {
        // Still open, reject fast
        this.rejectedCalls++;
        throw new CircuitBreakerOpenError(
          this.name,
          this.config.resetTimeoutMs - timeSinceLastFailure
        );
      }
    }

    // In HALF_OPEN state, limit concurrent test calls
    if (this.state === CircuitState.HALF_OPEN) {
      if (this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
        this.rejectedCalls++;
        throw new CircuitBreakerOpenError(
          this.name,
          this.config.resetTimeoutMs
        );
      }
      this.halfOpenCalls++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.successCount++;
    this.lastSuccessTime = Date.now();
    this.consecutiveSuccesses++;

    if (this.state === CircuitState.HALF_OPEN) {
      // If we've seen enough consecutive successes, close the circuit
      if (this.consecutiveSuccesses >= this.config.halfOpenMaxCalls) {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.halfOpenCalls = 0;
        this.consecutiveSuccesses = 0;
      }
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.consecutiveSuccesses = 0;

    if (this.state === CircuitState.CLOSED) {
      if (this.failureCount >= this.config.failureThreshold) {
        this.state = CircuitState.OPEN;
      }
    } else if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open re-opens the circuit
      this.state = CircuitState.OPEN;
      this.halfOpenCalls = 0;
    }
  }

  /**
   * Force the circuit into a specific state (for testing/emergency)
   */
  forceState(state: CircuitState): void {
    this.state = state;
    if (state === CircuitState.CLOSED) {
      this.failureCount = 0;
      this.consecutiveSuccesses = 0;
      this.halfOpenCalls = 0;
    }
  }

  /**
   * Reset the circuit breaker to initial state
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.consecutiveSuccesses = 0;
    this.halfOpenCalls = 0;
    this.totalCalls = 0;
    this.rejectedCalls = 0;
    this.lastFailureTime = undefined;
    this.lastSuccessTime = undefined;
  }
}

/**
 * Error thrown when circuit breaker is open
 */
export class CircuitBreakerOpenError extends Error {
  constructor(
    public readonly circuitName: string,
    public readonly retryAfterMs: number
  ) {
    super(
      `Circuit breaker "${circuitName}" is OPEN. Retry after ${retryAfterMs}ms`
    );
    this.name = "CircuitBreakerOpenError";
  }
}

/**
 * Global circuit breaker registry for shared instances
 */
const circuitBreakerRegistry = new Map<string, GuardCircuitBreaker>();

/**
 * Get or create a named circuit breaker
 */
export function getCircuitBreaker(
  name: string,
  config?: Partial<CircuitBreakerConfig>
): GuardCircuitBreaker {
  if (!circuitBreakerRegistry.has(name)) {
    const fullConfig = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
    circuitBreakerRegistry.set(name, new GuardCircuitBreaker(name, fullConfig));
  }
  return circuitBreakerRegistry.get(name)!;
}

/**
 * Reset all circuit breakers (useful for testing)
 */
export function resetAllCircuitBreakers(): void {
  for (const cb of circuitBreakerRegistry.values()) {
    cb.reset();
  }
  circuitBreakerRegistry.clear();
}

/**
 * Get all registered circuit breaker stats
 */
export function getAllCircuitBreakerStats(): Record<string, CircuitBreakerStats> {
  const stats: Record<string, CircuitBreakerStats> = {};
  for (const [name, cb] of circuitBreakerRegistry.entries()) {
    stats[name] = cb.getStats();
  }
  return stats;
}
