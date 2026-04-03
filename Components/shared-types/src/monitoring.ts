/**
 * Merit Guard Monitoring Dashboard
 *
 * Real-time monitoring for CIRCUIT_OPEN and RATE_LIMITED events
 */

import { CircuitState } from "./mcp-guard-hardened.js";

/** Alert levels */
export type AlertLevel = "info" | "warning" | "critical";

/** Alert structure */
export interface Alert {
  timestamp: string;
  server: string;
  tool: string;
  level: AlertLevel;
  code: string;
  message: string;
  context?: Record<string, unknown>;
}

/** Monitoring configuration - all fields optional with defaults */
export interface MonitoringConfig {
  /** Alert webhook URL (optional) */
  webhookUrl?: string;
  /** Alert threshold: errors per minute before escalating (default: 10) */
  errorThreshold?: number;
  /** Circuit breaker alert threshold: consecutive failures (default: 3) */
  circuitBreakerThreshold?: number;
  /** Rate limit alert threshold: % of limit consumed (default: 80) */
  rateLimitThreshold?: number;
  /** Callback for custom alerting */
  onAlert?: (alert: Alert) => void | Promise<void>;
}

/** Internal monitoring config with defaults */
interface InternalMonitoringConfig {
  webhookUrl: string;
  errorThreshold: number;
  circuitBreakerThreshold: number;
  rateLimitThreshold: number;
  onAlert?: (alert: Alert) => void | Promise<void>;
}

/**
 * Merit Guard Monitor
 * Tracks circuit breaker and rate limit events
 */
export class MeritGuardMonitor {
  private config: InternalMonitoringConfig;
  private alerts: Alert[] = [];
  private eventCounts: Map<string, number> = new Map();
  private lastReset = Date.now();

  constructor(config: MonitoringConfig) {
    this.config = {
      webhookUrl: "",
      errorThreshold: config.errorThreshold ?? 10,
      circuitBreakerThreshold: config.circuitBreakerThreshold ?? 3,
      rateLimitThreshold: config.rateLimitThreshold ?? 80,
      onAlert: config.onAlert,
    };
  }

  /**
   * Track a circuit state change
   */
  trackCircuitState(server: string, state: CircuitState): void {
    if (state === CircuitState.OPEN) {
      const key = `circuit:${server}`;
      const count = (this.eventCounts.get(key) || 0) + 1;
      this.eventCounts.set(key, count);

      if (count >= this.config.circuitBreakerThreshold) {
        this._alert({
          timestamp: new Date().toISOString(),
          server,
          tool: "circuit-breaker",
          level: "critical",
          code: "CIRCUIT_OPEN_MULTIPLE",
          message: `Circuit breaker has opened ${count} times for ${server}`,
          context: { state, count },
        });
      } else {
        this._alert({
          timestamp: new Date().toISOString(),
          server,
          tool: "circuit-breaker",
          level: "warning",
          code: "CIRCUIT_OPEN",
          message: `Circuit breaker opened for ${server}`,
          context: { state },
        });
      }
    } else if (state === CircuitState.CLOSED) {
      // Clear circuit count when closed
      this.eventCounts.delete(`circuit:${server}`);
    }
  }

  /**
   * Track a rate limit event
   */
  trackRateLimit(server: string, tool: string, currentUsage: number, maxAllowed: number): void {
    const percentage = (currentUsage / maxAllowed) * 100;
    const key = `ratelimit:${server}:${tool}`;
    const count = (this.eventCounts.get(key) || 0) + 1;
    this.eventCounts.set(key, count);

    if (percentage >= this.config.rateLimitThreshold) {
      this._alert({
        timestamp: new Date().toISOString(),
        server,
        tool,
        level: percentage >= 95 ? "critical" : "warning",
        code: "RATE_LIMIT_HIGH",
        message: `Rate limit at ${percentage.toFixed(1)}% for ${tool} on ${server}`,
        context: { currentUsage, maxAllowed, percentage, consecutiveHits: count },
      });
    }
  }

  /**
   * Track permission denial
   */
  trackPermissionDenied(
    server: string,
    tool: string,
    entityId: string,
    requiredBadge: string,
    actualBadge: string,
  ): void {
    const key = `denied:${server}:${tool}`;
    const count = (this.eventCounts.get(key) || 0) + 1;
    this.eventCounts.set(key, count);

    // Alert on repeated denials
    if (count >= 5) {
      this._alert({
        timestamp: new Date().toISOString(),
        server,
        tool,
        level: "warning",
        code: "PERMISSION_DENIED_REPEATED",
        message: `Repeated permission denials for ${tool} (${count} times)`,
        context: {
          entityId,
          requiredBadge,
          actualBadge,
          denialCount: count,
        },
      });

      // Reset after alerting
      this.eventCounts.set(key, 0);
    }
  }

  /**
   * Track authentication failure
   */
  trackAuthFailure(server: string, tool: string, errorCode: string, errorMessage: string): void {
    this._alert({
      timestamp: new Date().toISOString(),
      server,
      tool,
      level: "warning",
      code: `AUTH_FAIL_${errorCode}`,
      message: errorMessage,
      context: { server, tool },
    });
  }

  /**
   * Internal alert handler
   */
  private async _alert(alert: Alert): Promise<void> {
    this.alerts.push(alert);

    // Log to console
    const consoleMethod =
      alert.level === "critical"
        ? console.error
        : alert.level === "warning"
          ? console.warn
          : console.log;
    consoleMethod(`[MONITOR:${alert.level.toUpperCase()}] ${alert.code}: ${alert.message}`);

    // Custom callback
    if (this.config.onAlert) {
      try {
        await this.config.onAlert(alert);
      } catch (e) {
        console.error("Alert callback failed:", e);
      }
    }

    // Webhook
    if (this.config.webhookUrl) {
      try {
        await fetch(this.config.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(alert),
        });
      } catch (e) {
        console.error("Webhook alert failed:", e);
      }
    }
  }

  /**
   * Get current alert count
   */
  getAlertCount(): number {
    return this.alerts.length;
  }

  /**
   * Get alerts, optionally filtered by level
   */
  getAlerts(level?: AlertLevel): Alert[] {
    if (level) {
      return this.alerts.filter((a) => a.level === level);
    }
    return [...this.alerts];
  }

  /**
   * Get event counts
   */
  getEventCounts(): Record<string, number> {
    return Object.fromEntries(this.eventCounts);
  }

  /**
   * Clear old alerts
   */
  clearOldAlerts(maxAgeMs: number = 3600000): void {
    const cutoff = Date.now() - maxAgeMs;
    this.alerts = this.alerts.filter((a) => new Date(a.timestamp).getTime() > cutoff);
  }

  /**
   * Reset event counts
   */
  resetCounts(): void {
    this.eventCounts.clear();
    this.lastReset = Date.now();
  }

  /**
   * Generate health report
   */
  getHealthReport(): {
    status: "healthy" | "degraded" | "critical";
    alertCount: number;
    criticalCount: number;
    warningCount: number;
    eventCounts: Record<string, number>;
    minutesSinceReset: number;
  } {
    const criticalCount = this.alerts.filter((a) => a.level === "critical").length;
    const warningCount = this.alerts.filter((a) => a.level === "warning").length;
    const minutesSinceReset = Math.floor((Date.now() - this.lastReset) / 60000);

    let status: "healthy" | "degraded" | "critical" = "healthy";
    if (criticalCount > 0) {
      status = "critical";
    } else if (warningCount > 5) {
      status = "degraded";
    }

    return {
      status,
      alertCount: this.alerts.length,
      criticalCount,
      warningCount,
      eventCounts: this.getEventCounts(),
      minutesSinceReset,
    };
  }
}

/**
 * Create a merit guard monitor
 */
export function createMeritGuardMonitor(
  options?: Omit<MonitoringConfig, "serverName">,
): MeritGuardMonitor {
  return new MeritGuardMonitor({
    errorThreshold: 10,
    circuitBreakerThreshold: 3,
    rateLimitThreshold: 80,
    ...options,
  });
}

// Global monitor instance for convenience
let globalMonitor: MeritGuardMonitor | null = null;

/**
 * Get or create global monitor
 */
export function getGlobalMonitor(config?: MonitoringConfig): MeritGuardMonitor {
  if (!globalMonitor) {
    globalMonitor = createMeritGuardMonitor(config);
  }
  return globalMonitor;
}

/**
 * Reset global monitor
 */
export function resetGlobalMonitor(): void {
  globalMonitor = null;
}
