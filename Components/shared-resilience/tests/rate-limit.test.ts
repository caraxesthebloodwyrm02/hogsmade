import { describe, it, expect, afterEach } from 'vitest';
import {
  TokenBucketRateLimiter,
  RateLimitRegistry,
  RateLimitOptions,
  defaultRateLimitConfig,
} from '../src/rate-limit/index.js';
import { RateLimitExceededError } from '../src/types/index.js';

function makeContext(op = 'test') {
  return { serviceName: 'test-svc', operationName: op, startTime: Date.now(), attempt: 1 };
}

describe('TokenBucketRateLimiter', () => {
  let limiter: TokenBucketRateLimiter;
  const config: RateLimitOptions = {
    tokensPerSecond: 10,
    burstSize: 3,
    maxQueueSize: 0,
  };

  afterEach(() => {
    limiter?.destroy();
  });

  it('allows requests within burst size', async () => {
    limiter = new TokenBucketRateLimiter('test', config);
    const results: string[] = [];

    for (let i = 0; i < 3; i++) {
      const r = await limiter.execute(async () => `ok-${i}`, makeContext());
      results.push(r);
    }

    expect(results).toEqual(['ok-0', 'ok-1', 'ok-2']);
  });

  it('rejects when tokens exhausted and no queue', async () => {
    limiter = new TokenBucketRateLimiter('test', config);

    // Exhaust tokens
    for (let i = 0; i < 3; i++) {
      await limiter.execute(async () => 'ok', makeContext());
    }

    await expect(
      limiter.execute(async () => 'should-fail', makeContext())
    ).rejects.toThrow(RateLimitExceededError);
  });

  it('tracks metrics correctly', async () => {
    limiter = new TokenBucketRateLimiter('test', config);

    await limiter.execute(async () => 'ok', makeContext());
    await limiter.execute(async () => 'ok', makeContext());

    const metrics = limiter.getMetrics();
    expect(metrics.totalRequests).toBe(2);
    expect(metrics.tokensAvailable).toBeLessThanOrEqual(1);
  });

  it('refills tokens over time', async () => {
    limiter = new TokenBucketRateLimiter('test', {
      tokensPerSecond: 100,
      burstSize: 2,
      maxQueueSize: 0,
    });

    // Exhaust
    await limiter.execute(async () => 'ok', makeContext());
    await limiter.execute(async () => 'ok', makeContext());

    // Wait for refill
    await new Promise(r => setTimeout(r, 100));

    // Should have tokens now
    const result = await limiter.execute(async () => 'refilled', makeContext());
    expect(result).toBe('refilled');
  });

  it('queues requests when configured', async () => {
    limiter = new TokenBucketRateLimiter('test', {
      tokensPerSecond: 100,
      burstSize: 1,
      maxQueueSize: 5,
    });

    // First goes through immediately
    const r1 = await limiter.execute(async () => 'first', makeContext());
    expect(r1).toBe('first');

    // Second should queue and resolve after refill
    const r2Promise = limiter.execute(async () => 'second', makeContext());
    const r2 = await r2Promise;
    expect(r2).toBe('second');
  });
});

describe('RateLimitRegistry', () => {
  it('returns same limiter for same service', () => {
    const registry = new RateLimitRegistry();
    const a = registry.get('svc', defaultRateLimitConfig);
    const b = registry.get('svc', defaultRateLimitConfig);
    expect(a).toBe(b);
    registry.destroyAll();
  });

  it('getMetrics returns all limiter metrics', () => {
    const registry = new RateLimitRegistry();
    registry.get('a', defaultRateLimitConfig);
    registry.get('b', defaultRateLimitConfig);
    const metrics = registry.getMetrics();
    expect(Object.keys(metrics)).toEqual(['a', 'b']);
    registry.destroyAll();
  });
});
