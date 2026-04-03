import { HealthCheckConfig, HealthStatus } from "../types/index.js";

export type HealthCheckFunction = () => Promise<{
  healthy: boolean;
  details?: Record<string, unknown>;
}>;

export interface HealthCheckOptions extends HealthCheckConfig {
  check: HealthCheckFunction;
  onStatusChange?: (status: HealthStatus) => void;
}

export class HealthChecker {
  private status: HealthStatus = {
    status: "healthy",
    lastCheck: Date.now(),
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
  };
  private interval?: ReturnType<typeof setInterval>;

  constructor(
    serviceName: string,
    private readonly config: HealthCheckOptions,
  ) {
    // serviceName is reserved for future use (logging, metrics)
    void serviceName;
  }

  start(): void {
    if (this.interval) {
      return;
    }

    this.performCheck();
    this.interval = setInterval(() => this.performCheck(), this.config.intervalMs);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  async check(): Promise<HealthStatus> {
    return this.performCheck();
  }

  getStatus(): HealthStatus {
    return { ...this.status };
  }

  private consecutiveSuccesses = 0;
  private consecutiveFailures = 0;

  private async checkWithTimeout(): Promise<{
    healthy: boolean;
    details?: Record<string, unknown>;
  }> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error("Health check timeout")),
        this.config.timeoutMs,
      );
    });
    try {
      return await Promise.race([this.config.check(), timeoutPromise]);
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    }
  }

  private async performCheck(): Promise<HealthStatus> {
    try {
      const result = await this.checkWithTimeout();

      if (result.healthy) {
        this.consecutiveSuccesses++;
        this.consecutiveFailures = 0;

        const newStatus: HealthStatus = {
          status:
            this.consecutiveSuccesses >= this.config.healthyThreshold ? "healthy" : "degraded",
          lastCheck: Date.now(),
          consecutiveFailures: this.consecutiveFailures,
          consecutiveSuccesses: this.consecutiveSuccesses,
          details: result.details,
        };

        if (this.status.status !== newStatus.status) {
          this.config.onStatusChange?.(newStatus);
        }

        this.status = newStatus;
      } else {
        this.consecutiveFailures++;
        this.consecutiveSuccesses = 0;

        const newStatus: HealthStatus = {
          status:
            this.consecutiveFailures >= this.config.unhealthyThreshold ? "unhealthy" : "degraded",
          lastCheck: Date.now(),
          consecutiveFailures: this.consecutiveFailures,
          consecutiveSuccesses: this.consecutiveSuccesses,
          details: result.details,
        };

        if (this.status.status !== newStatus.status) {
          this.config.onStatusChange?.(newStatus);
        }

        this.status = newStatus;
      }
    } catch (error) {
      this.consecutiveFailures++;
      this.consecutiveSuccesses = 0;

      const newStatus: HealthStatus = {
        status:
          this.consecutiveFailures >= this.config.unhealthyThreshold ? "unhealthy" : "degraded",
        lastCheck: Date.now(),
        consecutiveFailures: this.consecutiveFailures,
        consecutiveSuccesses: this.consecutiveSuccesses,
        details: { error: (error as Error).message },
      };

      if (this.status.status !== newStatus.status) {
        this.config.onStatusChange?.(newStatus);
      }

      this.status = newStatus;
    }

    return this.status;
  }
}

export class HealthCheckRegistry {
  private checkers = new Map<string, HealthChecker>();

  register(serviceName: string, config: HealthCheckOptions): HealthChecker {
    const checker = new HealthChecker(serviceName, config);
    this.checkers.set(serviceName, checker);
    return checker;
  }

  get(serviceName: string): HealthChecker | undefined {
    return this.checkers.get(serviceName);
  }

  remove(serviceName: string): boolean {
    const checker = this.checkers.get(serviceName);
    if (checker) {
      checker.stop();
      return this.checkers.delete(serviceName);
    }
    return false;
  }

  startAll(): void {
    for (const checker of this.checkers.values()) {
      checker.start();
    }
  }

  stopAll(): void {
    for (const checker of this.checkers.values()) {
      checker.stop();
    }
  }

  async checkAll(): Promise<Record<string, HealthStatus>> {
    const results: Record<string, HealthStatus> = {};
    for (const [name, checker] of this.checkers) {
      results[name] = await checker.check();
    }
    return results;
  }

  getAllStatuses(): Record<string, HealthStatus> {
    const statuses: Record<string, HealthStatus> = {};
    for (const [name, checker] of this.checkers) {
      statuses[name] = checker.getStatus();
    }
    return statuses;
  }
}

export const globalHealthCheckRegistry = new HealthCheckRegistry();

export const defaultHealthCheckConfig: HealthCheckConfig = {
  intervalMs: 30000,
  timeoutMs: 5000,
  unhealthyThreshold: 3,
  healthyThreshold: 2,
};
