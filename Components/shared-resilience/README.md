# @cascade/shared-resilience

Shared resilience patterns for the CascadeProjects MCP server ecosystem.

## Patterns

| Pattern             | Module              | Description                                                          |
| ------------------- | ------------------- | -------------------------------------------------------------------- |
| **Circuit Breaker** | `./circuit-breaker` | Hystrix-style state machine (CLOSED → OPEN → HALF_OPEN)              |
| **Retry**           | `./retry`           | Exponential backoff with jitter, retryable/non-retryable error lists |
| **Rate Limit**      | `./rate-limit`      | Token Bucket algorithm with optional request queue                   |
| **Health Check**    | `./health-check`    | Periodic health probes with threshold-based status transitions       |

## Quick Start

```typescript
import { withResilience } from "@cascade/shared-resilience";

const result = await withResilience(
  "ollama",
  "chat.completion",
  {
    circuitBreaker: { failureThreshold: 5, successThreshold: 2, timeoutMs: 30000 },
    retry: { maxAttempts: 3, initialDelayMs: 100, maxDelayMs: 5000, backoffMultiplier: 2 },
    rateLimit: { tokensPerSecond: 10, burstSize: 20 },
  },
  async () => fetch("http://localhost:11434/api/chat", { method: "POST", body }),
);
```

## Standalone Usage

```typescript
// Circuit breaker only
import { CircuitBreaker } from "@cascade/shared-resilience/circuit-breaker";

const cb = new CircuitBreaker("my-service", {
  failureThreshold: 3,
  successThreshold: 2,
  timeoutMs: 10000,
});

const result = await cb.execute(async () => fetchData(), {
  serviceName: "my-service",
  operationName: "getData",
  startTime: Date.now(),
  attempt: 1,
});
```

```typescript
// Rate limiter only
import { TokenBucketRateLimiter } from "@cascade/shared-resilience/rate-limit";

const limiter = new TokenBucketRateLimiter("api", {
  tokensPerSecond: 5,
  burstSize: 10,
  maxQueueSize: 50,
});
```

## Build

```bash
npm install
npm run build      # Compile TypeScript
npm test           # Run tests (vitest)
npm run typecheck  # Type-check without emitting
npm run rebuild    # Clean + build
```

## Architecture

```
src/
├── types/           Core interfaces, enums, error classes
├── circuit-breaker/ CircuitBreaker, CircuitBreakerRegistry
├── retry/           RetryPolicy, RetryRegistry
├── rate-limit/      TokenBucketRateLimiter, RateLimitRegistry
├── health-check/    HealthChecker, HealthCheckRegistry
└── index.ts         ResiliencePolicy orchestrator + withResilience() helper
```

The orchestrator composes patterns in this order:
**Circuit Breaker → Retry → Rate Limit → Operation**

Each pattern can be used standalone via subpath exports or composed via `ResiliencePolicy`.

## Dependency

Depends on `@cascade/shared-types` (local workspace package at `../shared-types`).
