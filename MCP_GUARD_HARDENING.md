# MCP Guard Hardening Summary

## Void Pattern Bugs Identified and Fixed

### 1. Silent Catch Blocks (CRITICAL)
**Original Issue:**
```typescript
catch {
  // Fail closed or use fallback
}
```
**Fixed:** All catch blocks now explicitly log and handle errors:
```typescript
catch (error) {
  this.recordFailure();
  this.metrics.apiFailures++;
  const errorMsg = error instanceof Error ? error.message : String(error);
  return err(new Error(`GRID API error: ${errorMsg}`), "GRID_API_ERROR");
}
```

### 2. Missing Cache TTL Enforcement (HIGH)
**Original Issue:** Cache entries never expired, could grow unbounded
**Fixed:** 
- Added `cleanExpiredCache()` method called on every permission check
- Cache entries now stored with timestamp and TTL validation

### 3. Implicit Returns After Errors (HIGH)
**Original Issue:** `checkPermission` returned `undefined` in some error paths
**Fixed:**
- Introduced `Result<T, E>` type for explicit error handling
- All code paths return explicit `ok(value)` or `err(error, code)`

### 4. Silent Audit Failures (CRITICAL)
**Original Issue:** `emitAudit` failures were silently swallowed
**Fixed:**
```typescript
try {
  const result = await emitAudit({...});
  if (!result) {
    console.error(`[CRITICAL] Merit audit failed...`);
  }
} catch (auditError) {
  console.error(`[CRITICAL] Merit audit threw exception...`);
}
```

### 5. No Input Validation on Session ID (MEDIUM)
**Original Issue:** Session ID accepted any value without validation
**Fixed:**
- Added `strictSessionValidation` option (default: true)
- Validates session_id format: `^[a-zA-Z0-9_-]{1,64}$`
- Returns `Result<string>` with explicit error codes

### 6. Circuit Breaker Pattern Missing (HIGH)
**Original Issue:** Continuous failures to GRID API would cascade
**Fixed:**
- Implemented proper circuit breaker states: CLOSED, OPEN, HALF_OPEN
- Configurable thresholds (default: 5 failures, 30s timeout)
- Prevents thundering herd on degraded services

### 7. No Rate Limiting (MEDIUM)
**Original Issue:** No protection against abuse of permission checks
**Fixed:**
- Added per-entity rate limiting (default: 100 calls / 60s)
- Configurable per-tool limits
- Explicit `RATE_LIMITED` error code

### 8. Timeout on External Calls (MEDIUM)
**Original Issue:** No timeout on GRID API calls - could hang indefinitely
**Fixed:**
- Added AbortController with 5 second timeout
- Explicit `GRID_TIMEOUT` error code

## API Changes

### New Error Codes
- `INVALID_SESSION_TYPE` - session_id wrong type
- `INVALID_SESSION_FORMAT` - session_id format invalid
- `RATE_LIMITED` - Rate limit exceeded
- `CIRCUIT_OPEN` - Circuit breaker open
- `GRID_API_ERROR` - GRID API call failed
- `GRID_RATE_LIMITED` - GRID returned 429
- `GRID_TIMEOUT` - GRID API timeout
- `NO_GRID_API` - GRID URL not configured
- `GRID_ERROR` - GRID returned error status
- `PERMISSION_DENIED` - Insufficient merit standing
- `HANDLER_EXECUTION_FAILED` - Tool handler threw

### New Configuration Options
```typescript
interface HardenedMeritGuardConfig {
  serverName: string;
  gridApiUrl?: string;
  circuitBreaker?: {
    failureThreshold: number;  // default: 5
    resetTimeoutMs: number;    // default: 30000
    halfOpenMaxCalls: number;  // default: 2
  };
  cacheTtlMs?: number;         // default: 30000
  rateLimitMax?: number;       // default: 100
  rateLimitWindowMs?: number;  // default: 60000
  strictSessionValidation?: boolean; // default: true
  auditAll?: boolean;          // default: true
}
```

### Observability
- `getMetrics()` - Returns cache hits/misses, API failures, rate limit hits
- `getCircuitState()` - Current circuit breaker state
- `resetCircuitBreaker()` - Manual recovery

## Migration Guide

### From Original Guard

```typescript
// OLD
import { createMeritGuard } from "@cascade/shared-types";
const guard = createMeritGuard("my-server", gridApiUrl);

// NEW  
import { createHardenedMeritGuard } from "@cascade/shared-types";
const guard = createHardenedMeritGuard("my-server", gridApiUrl);

// Health check now includes circuit state
const health = await guard.getMetrics();
console.log(guard.getCircuitState()); // "CLOSED" | "OPEN" | "HALF_OPEN"
```

### Error Handling

```typescript
// Always check handler errors now
guard.registerGuardedTool(
  server,
  "my_tool",
  { actionClass: ActionClass.ACTION_WRITE, description: "..." },
  async (args) => {
    // Any thrown errors are caught and returned as structured error
    // No silent failures
    if (!args.valid) {
      throw new Error("Invalid input"); // This will be caught
    }
    return result;
  }
);
```

## Security Posture

### Before
- Silent failures in several code paths
- No rate limiting
- No circuit breaker
- Cache could grow unbounded
- Session ID injection possible
- Audit logging could fail silently

### After
- All error paths explicit and logged
- Rate limiting prevents abuse
- Circuit breaker prevents cascade failures
- Bounded cache with TTL
- Input validation on session_id
- Audit failures logged to stderr (visible)
- Timeout on all external calls

## Integration Scope Narrowing

### Reduced Scope
1. **Session IDs:** Now validated to 64 chars, alphanumeric only
2. **Cache keys:** Explicitly bounded and TTL-enforced
3. **Rate limits:** Per-entity and per-tool limits applied
4. **External calls:** 5s timeout, circuit breaker controlled
5. **Error propagation:** Structured errors, no silent None returns
6. **Audit surface:** All permission checks logged with context

### Fail-Closed Behavior
- No GRID URL configured → `NO_GRID_API` error
- Circuit breaker open → `CIRCUIT_OPEN` error  
- Rate limit exceeded → `RATE_LIMITED` error
- GRID timeout → `GRID_TIMEOUT` error
- Invalid session → `INVALID_SESSION_FORMAT` error
- Audit failure → Logged to stderr, operation continues (availability vs consistency trade-off)

### Fail-Open Removal
Previous implementation had silent fallbacks that could allow unauthorized access. All fallbacks now explicit and auditable.

## Testing Recommendations

1. **Circuit Breaker:** Test with 5 consecutive GRID failures
2. **Rate Limiting:** Test 101 calls in 60 seconds
3. **Cache TTL:** Verify entries expire after configured TTL
4. **Session Validation:** Test with invalid characters (`!@#$`)
5. **Timeout:** Test with delayed GRID response (>5s)
6. **Audit Failure:** Mock `emitAudit` failure, verify stderr logging
7. **Handler Errors:** Throw from handler, verify structured error response