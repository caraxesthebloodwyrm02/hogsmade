/**
 * Session-level sliding-window rate limiter for MCP server read operations.
 *
 * Lightweight in-memory limiter scoped to the process lifetime (one MCP
 * stdio session = one process). Tracks call timestamps in a sliding window
 * and rejects when the window is full.
 */

export interface SessionRateLimitConfig {
  /** Maximum number of calls allowed within the window. */
  maxCalls: number;
  /** Window duration in milliseconds. */
  windowMs: number;
}

export const DEFAULT_READ_RATE_LIMIT: SessionRateLimitConfig = {
  maxCalls: 60,
  windowMs: 60_000,
};

export class SessionRateLimiter {
  private timestamps: number[] = [];

  constructor(private readonly config: SessionRateLimitConfig = DEFAULT_READ_RATE_LIMIT) {}

  /**
   * Check whether a call is allowed. Returns `null` if allowed (and records
   * the call), or a human-readable error string if rate-limited.
   */
  check(operationName: string): string | null {
    const now = Date.now();
    const cutoff = now - this.config.windowMs;
    this.timestamps = this.timestamps.filter((t) => t > cutoff);

    if (this.timestamps.length >= this.config.maxCalls) {
      const oldest = this.timestamps[0];
      const retrySec = Math.ceil((this.config.windowMs - (now - oldest)) / 1000);
      return `Rate limited: ${operationName} — ${
        this.timestamps.length
      } read operations in the last ${Math.round(this.config.windowMs / 1000)}s (max ${
        this.config.maxCalls
      }). Retry in ${retrySec}s.`;
    }

    this.timestamps.push(now);
    return null;
  }

  /** Current number of calls within the active window. */
  get currentCount(): number {
    const cutoff = Date.now() - this.config.windowMs;
    this.timestamps = this.timestamps.filter((t) => t > cutoff);
    return this.timestamps.length;
  }

  /** Reset the limiter state. */
  reset(): void {
    this.timestamps = [];
  }
}
