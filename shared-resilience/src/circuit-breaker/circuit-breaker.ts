import {
  CircuitBreakerConfig,
  CircuitState,
  CircuitBreakerMetrics,
  CircuitBreakerOpenError,
  ResilienceContext,
  ResilientFunction
} from '../types/index.js';

export interface CircuitBreakerOptions extends CircuitBreakerConfig {
  onStateChange?: (state: CircuitState, metrics: CircuitBreakerMetrics) => void;
  onFailure?: (error: Error, metrics: CircuitBreakerMetrics) => void;
  onSuccess?: (metrics: CircuitBreakerMetrics) => void;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private successes = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private halfOpenCalls = 0;
  private nextAttempt?: number;

  constructor(
    private readonly serviceName: string,
    private readonly config: CircuitBreakerOptions
  ) {}

  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses
    };
  }

  getState(): CircuitState {
    return this.state;
  }

  async execute<T>(
    operation: ResilientFunction<T>,
    context: ResilienceContext
  ): Promise<T> {
    this.checkStateTransition();

    if (this.state === CircuitState.OPEN) {
      throw new CircuitBreakerOpenError(this.serviceName, context);
    }

    if (this.state === CircuitState.HALF_OPEN) {
      const maxCalls = this.config.halfOpenMaxCalls ?? 1;
      if (this.halfOpenCalls >= maxCalls) {
        throw new CircuitBreakerOpenError(this.serviceName, context);
      }
      this.halfOpenCalls++;
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  private checkStateTransition(): void {
    if (this.state === CircuitState.OPEN) {
      if (this.nextAttempt && Date.now() >= this.nextAttempt) {
        this.transitionTo(CircuitState.HALF_OPEN);
      }
    }
  }

  private transitionTo(newState: CircuitState): void {
    this.state = newState;

    if (newState === CircuitState.OPEN) {
      this.nextAttempt = Date.now() + this.config.timeoutMs;
      this.halfOpenCalls = 0;
    } else if (newState === CircuitState.CLOSED) {
      this.consecutiveFailures = 0;
      this.consecutiveSuccesses = 0;
      this.halfOpenCalls = 0;
      this.nextAttempt = undefined;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.halfOpenCalls = 0;
      this.nextAttempt = undefined;
    }

    this.config.onStateChange?.(newState, this.getMetrics());
  }

  private onSuccess(): void {
    this.successes++;
    this.lastSuccessTime = Date.now();
    this.consecutiveSuccesses++;
    this.consecutiveFailures = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.consecutiveSuccesses >= this.config.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
      }
    }

    this.config.onSuccess?.(this.getMetrics());
  }

  private onFailure(error: Error): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    this.consecutiveFailures++;
    this.consecutiveSuccesses = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.OPEN);
    } else if (this.state === CircuitState.CLOSED) {
      if (this.consecutiveFailures >= this.config.failureThreshold) {
        this.transitionTo(CircuitState.OPEN);
      }
    }

    this.config.onFailure?.(error, this.getMetrics());
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.halfOpenCalls = 0;
    this.nextAttempt = undefined;
    this.lastFailureTime = undefined;
    this.lastSuccessTime = undefined;
  }
}

export class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();

  get(serviceName: string, config: CircuitBreakerOptions): CircuitBreaker {
    if (!this.breakers.has(serviceName)) {
      this.breakers.set(serviceName, new CircuitBreaker(serviceName, config));
    }
    return this.breakers.get(serviceName)!;
  }

  remove(serviceName: string): boolean {
    return this.breakers.delete(serviceName);
  }

  getAll(): Map<string, CircuitBreaker> {
    return new Map(this.breakers);
  }

  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  getMetrics(): Record<string, CircuitBreakerMetrics> {
    const metrics: Record<string, CircuitBreakerMetrics> = {};
    for (const [name, breaker] of this.breakers) {
      metrics[name] = breaker.getMetrics();
    }
    return metrics;
  }
}

export const globalCircuitBreakerRegistry = new CircuitBreakerRegistry();
