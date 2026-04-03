import {
  RetryConfig,
  RetryMetrics,
  RetryExhaustedError,
  ResilienceContext,
  ResilientFunction,
} from "../types/index.js";

export interface RetryOptions extends RetryConfig {
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
  onSuccess?: (metrics: RetryMetrics) => void;
  onExhausted?: (metrics: RetryMetrics) => void;
}

export class RetryPolicy {
  constructor(
    private readonly serviceName: string,
    private readonly config: RetryOptions,
  ) {}

  async execute<T>(operation: ResilientFunction<T>, context: ResilienceContext): Promise<T> {
    const metrics: RetryMetrics = {
      attempts: 0,
      totalDelayMs: 0,
    };

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      metrics.attempts = attempt;
      context.attempt = attempt;

      try {
        const result = await operation();
        this.config.onSuccess?.(metrics);
        return result;
      } catch (error) {
        lastError = error as Error;
        metrics.lastError = lastError;

        if (!this.shouldRetry(error as Error, attempt)) {
          throw error;
        }

        if (attempt < this.config.maxAttempts) {
          const delayMs = this.calculateDelay(attempt);
          metrics.totalDelayMs += delayMs;
          this.config.onRetry?.(attempt, lastError, delayMs);
          await this.sleep(delayMs);
        }
      }
    }

    this.config.onExhausted?.(metrics);
    throw new RetryExhaustedError(this.serviceName, metrics.attempts, lastError!, context);
  }

  private shouldRetry(error: Error, attempt: number): boolean {
    if (attempt >= this.config.maxAttempts) {
      return false;
    }

    const errorName = error.name;
    const errorMessage = error.message.toLowerCase();

    if (this.config.nonRetryableErrors) {
      for (const nonRetryable of this.config.nonRetryableErrors) {
        if (errorName.includes(nonRetryable) || errorMessage.includes(nonRetryable.toLowerCase())) {
          return false;
        }
      }
    }

    if (this.config.retryableErrors) {
      let isRetryable = false;
      for (const retryable of this.config.retryableErrors) {
        if (errorName.includes(retryable) || errorMessage.includes(retryable.toLowerCase())) {
          isRetryable = true;
          break;
        }
      }
      return isRetryable;
    }

    const defaultRetryableErrors = [
      "timeout",
      "connection",
      "econnrefused",
      "econnreset",
      "etimedout",
      "enotfound",
      "network",
      "aborted",
      "503",
      "502",
      "504",
      "429",
    ];

    return defaultRetryableErrors.some(
      (e) => errorMessage.includes(e) || errorName.toLowerCase().includes(e),
    );
  }

  private calculateDelay(attempt: number): number {
    const exponentialDelay =
      this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, attempt - 1);

    const jitter = Math.random() * 0.1 * exponentialDelay;
    const delay = Math.min(exponentialDelay + jitter, this.config.maxDelayMs);

    return Math.floor(delay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export class RetryRegistry {
  private policies = new Map<string, RetryPolicy>();

  get(serviceName: string, config: RetryOptions): RetryPolicy {
    if (!this.policies.has(serviceName)) {
      this.policies.set(serviceName, new RetryPolicy(serviceName, config));
    }
    return this.policies.get(serviceName)!;
  }

  remove(serviceName: string): boolean {
    return this.policies.delete(serviceName);
  }

  getAll(): Map<string, RetryPolicy> {
    return new Map(this.policies);
  }
}

export const globalRetryRegistry = new RetryRegistry();

export const defaultRetryConfig: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableErrors: [
    "TimeoutError",
    "ConnectionError",
    "NetworkError",
    "ServiceUnavailable",
    "TooManyRequests",
  ],
};
