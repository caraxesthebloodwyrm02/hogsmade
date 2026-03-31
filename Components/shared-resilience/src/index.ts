export * from './types/index.js';
export * from './circuit-breaker/index.js';
export * from './retry/index.js';
export * from './rate-limit/index.js';
export * from './health-check/index.js';

import type { CircuitBreakerOptions } from './circuit-breaker/index.js';
import type { RetryOptions } from './retry/index.js';
import type { RateLimitOptions } from './rate-limit/index.js';
import type { HealthCheckOptions } from './health-check/index.js';
import type {
  ResilienceConfig,
  ResilienceContext,
  ResilientFunction,
  CircuitBreakerMetrics,
  HealthStatus,
  RateLimitMetrics,
} from './types/index.js';
import { CircuitBreaker, globalCircuitBreakerRegistry } from './circuit-breaker/index.js';
import { RetryPolicy, globalRetryRegistry } from './retry/index.js';
import { TokenBucketRateLimiter, globalRateLimitRegistry } from './rate-limit/index.js';
import { HealthChecker, globalHealthCheckRegistry } from './health-check/index.js';

export interface ResiliencePolicyConfig {
  circuitBreaker?: CircuitBreakerOptions;
  retry?: RetryOptions;
  rateLimit?: RateLimitOptions;
  healthCheck?: HealthCheckOptions;
}

export class ResiliencePolicy {
  private circuitBreaker?: CircuitBreaker;
  private retryPolicy?: RetryPolicy;
  private rateLimiter?: TokenBucketRateLimiter;
  private healthChecker?: HealthChecker;

  constructor(
    private readonly serviceName: string,
    config: ResiliencePolicyConfig
  ) {
    if (config.circuitBreaker) {
      this.circuitBreaker = globalCircuitBreakerRegistry.get(
        serviceName,
        config.circuitBreaker
      );
    }

    if (config.retry) {
      this.retryPolicy = globalRetryRegistry.get(serviceName, config.retry);
    }

    if (config.rateLimit) {
      this.rateLimiter = globalRateLimitRegistry.get(serviceName, config.rateLimit);
    }

    if (config.healthCheck) {
      this.healthChecker = globalHealthCheckRegistry.register(
        serviceName,
        config.healthCheck
      );
      this.healthChecker.start();
    }
  }

  async execute<T>(
    operationName: string,
    operation: ResilientFunction<T>,
    ...args: unknown[]
  ): Promise<T> {
    const context: ResilienceContext = {
      serviceName: this.serviceName,
      operationName,
      startTime: Date.now(),
      attempt: 1,
    };

    const wrappedOperation = async (): Promise<T> => {
      if (this.rateLimiter) {
        return this.rateLimiter.execute(
          () => operation(...args),
          context
        );
      }
      return operation(...args);
    };

    const retryableOperation = async (): Promise<T> => {
      if (this.retryPolicy) {
        return this.retryPolicy.execute(wrappedOperation, context);
      }
      return wrappedOperation();
    };

    if (this.circuitBreaker) {
      return this.circuitBreaker.execute(retryableOperation, context);
    }

    return retryableOperation();
  }

  getHealthStatus(): HealthStatus | undefined {
    return this.healthChecker?.getStatus();
  }

  getCircuitBreakerMetrics(): CircuitBreakerMetrics | undefined {
    return this.circuitBreaker?.getMetrics();
  }

  getRateLimitMetrics(): RateLimitMetrics | undefined {
    return this.rateLimiter?.getMetrics();
  }

  destroy(): void {
    if (this.healthChecker) {
      this.healthChecker.stop();
      globalHealthCheckRegistry.remove(this.serviceName);
    }
    if (this.rateLimiter) {
      globalRateLimitRegistry.remove(this.serviceName);
    }
    if (this.circuitBreaker) {
      globalCircuitBreakerRegistry.remove(this.serviceName);
    }
    if (this.retryPolicy) {
      globalRetryRegistry.remove(this.serviceName);
    }
  }
}

export interface PolicyMetricsSnapshot {
  health: HealthStatus | undefined;
  circuitBreaker: CircuitBreakerMetrics | undefined;
  rateLimit: RateLimitMetrics | undefined;
}

export class ResiliencePolicyRegistry {
  private policies = new Map<string, ResiliencePolicy>();

  create(serviceName: string, config: ResiliencePolicyConfig): ResiliencePolicy {
    const policy = new ResiliencePolicy(serviceName, config);
    this.policies.set(serviceName, policy);
    return policy;
  }

  get(serviceName: string): ResiliencePolicy | undefined {
    return this.policies.get(serviceName);
  }

  remove(serviceName: string): boolean {
    const policy = this.policies.get(serviceName);
    if (policy) {
      policy.destroy();
      return this.policies.delete(serviceName);
    }
    return false;
  }

  destroyAll(): void {
    for (const policy of this.policies.values()) {
      policy.destroy();
    }
    this.policies.clear();
  }

  getAllMetrics(): Record<string, PolicyMetricsSnapshot> {
    const metrics: Record<string, PolicyMetricsSnapshot> = {};
    for (const [name, policy] of this.policies) {
      metrics[name] = {
        health: policy.getHealthStatus(),
        circuitBreaker: policy.getCircuitBreakerMetrics(),
        rateLimit: policy.getRateLimitMetrics(),
      };
    }
    return metrics;
  }
}

export const globalResiliencePolicyRegistry = new ResiliencePolicyRegistry();

export function withResilience<T>(
  serviceName: string,
  operationName: string,
  config: ResiliencePolicyConfig,
  operation: ResilientFunction<T>,
  ...args: unknown[]
): Promise<T> {
  let policy = globalResiliencePolicyRegistry.get(serviceName);
  if (!policy) {
    policy = globalResiliencePolicyRegistry.create(serviceName, config);
  }
  return policy.execute(operationName, operation, ...args);
}

export const defaultResilienceConfig: ResilienceConfig = {
  serviceName: 'default',
  timeout: 30000,
  retry: {
    maxAttempts: 3,
    initialDelayMs: 100,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
  },
  circuitBreaker: {
    failureThreshold: 5,
    successThreshold: 3,
    timeoutMs: 60000,
    halfOpenMaxCalls: 3,
  },
  rateLimit: {
    tokensPerSecond: 10,
    burstSize: 20,
    maxQueueSize: 100,
  },
};
