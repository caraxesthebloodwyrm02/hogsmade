import {
  RateLimitConfig,
  RateLimitMetrics,
  RateLimitExceededError,
  ResilienceContext,
} from "../types/index.js";

export interface RateLimitOptions extends RateLimitConfig {
  onTokenConsumed?: (tokensRemaining: number) => void;
  onThrottled?: (queueSize: number) => void;
}

interface QueuedRequest<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  operation: () => Promise<T>;
  context: ResilienceContext;
}

export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefillTime: number;
  private queue: Array<QueuedRequest<unknown>> = [];
  private metrics: RateLimitMetrics;
  private refillInterval?: ReturnType<typeof setInterval>;

  constructor(
    private readonly serviceName: string,
    private readonly config: RateLimitOptions,
  ) {
    this.tokens = config.burstSize;
    this.lastRefillTime = Date.now();
    this.metrics = {
      tokensAvailable: this.tokens,
      queueSize: 0,
      totalRequests: 0,
      throttledRequests: 0,
    };
    this.startRefillTimer();
  }

  private startRefillTimer(): void {
    const intervalMs = 1000 / this.config.tokensPerSecond;
    this.refillInterval = setInterval(() => this.refill(), intervalMs);
  }

  private refill(): void {
    const now = Date.now();
    const timePassed = (now - this.lastRefillTime) / 1000;
    const tokensToAdd = timePassed * this.config.tokensPerSecond;

    this.tokens = Math.min(this.tokens + tokensToAdd, this.config.burstSize);
    this.lastRefillTime = now;
    this.metrics.tokensAvailable = Math.floor(this.tokens);

    this.processQueue();
  }

  private processQueue(): void {
    const maxQueueSize = this.config.maxQueueSize ?? 100;

    while (this.queue.length > 0 && this.tokens >= 1) {
      if (this.queue.length > maxQueueSize) {
        const dropped = this.queue.shift()!;
        this.metrics.throttledRequests++;
        dropped.reject(new RateLimitExceededError(this.serviceName, dropped.context));
        continue;
      }

      const request = this.queue.shift()!;
      this.tokens -= 1;
      this.metrics.tokensAvailable = Math.floor(this.tokens);
      this.config.onTokenConsumed?.(this.tokens);

      request.operation().then(request.resolve).catch(request.reject);
    }

    this.metrics.queueSize = this.queue.length;
  }

  async execute<T>(operation: () => Promise<T>, context: ResilienceContext): Promise<T> {
    this.metrics.totalRequests++;

    if (this.tokens >= 1) {
      this.tokens -= 1;
      this.metrics.tokensAvailable = Math.floor(this.tokens);
      this.config.onTokenConsumed?.(this.tokens);
      return operation();
    }

    const maxQueueSize = this.config.maxQueueSize ?? 100;
    if (this.queue.length >= maxQueueSize) {
      this.metrics.throttledRequests++;
      throw new RateLimitExceededError(this.serviceName, context);
    }

    this.config.onThrottled?.(this.queue.length);

    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        resolve: resolve as (value: unknown) => void,
        reject,
        operation,
        context,
      });
      this.metrics.queueSize = this.queue.length;
    });
  }

  getMetrics(): RateLimitMetrics {
    return { ...this.metrics };
  }

  getTokensAvailable(): number {
    return Math.floor(this.tokens);
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  destroy(): void {
    if (this.refillInterval) {
      clearInterval(this.refillInterval);
    }

    for (const request of this.queue) {
      request.reject(new Error("Rate limiter destroyed"));
    }
    this.queue = [];
  }
}

export class RateLimitRegistry {
  private limiters = new Map<string, TokenBucketRateLimiter>();

  get(serviceName: string, config: RateLimitOptions): TokenBucketRateLimiter {
    if (!this.limiters.has(serviceName)) {
      this.limiters.set(serviceName, new TokenBucketRateLimiter(serviceName, config));
    }
    return this.limiters.get(serviceName)!;
  }

  remove(serviceName: string): boolean {
    const limiter = this.limiters.get(serviceName);
    if (limiter) {
      limiter.destroy();
      return this.limiters.delete(serviceName);
    }
    return false;
  }

  getAll(): Map<string, TokenBucketRateLimiter> {
    return new Map(this.limiters);
  }

  destroyAll(): void {
    for (const limiter of this.limiters.values()) {
      limiter.destroy();
    }
    this.limiters.clear();
  }

  getMetrics(): Record<string, RateLimitMetrics> {
    const metrics: Record<string, RateLimitMetrics> = {};
    for (const [name, limiter] of this.limiters) {
      metrics[name] = limiter.getMetrics();
    }
    return metrics;
  }
}

export const globalRateLimitRegistry = new RateLimitRegistry();

export const defaultRateLimitConfig: RateLimitConfig = {
  tokensPerSecond: 10,
  burstSize: 20,
  maxQueueSize: 100,
};
