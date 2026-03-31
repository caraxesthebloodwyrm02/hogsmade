/**
 * Guard Logger - Structured output with multiple print targets
 *
 * Supports console, JSON, file, and silent output modes with
 * verbosity control and scope-aware filtering.
 */

import { appendFileSync, mkdirSync, existsSync } from "fs";
import { dirname } from "path";
import { homedir } from "os";
import type { MitigationScope, GuardRuntimeConfig } from "./guard-config.js";

/** Print verbosity levels */
export enum PrintLevel {
  SILENT = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
}

/** Guard print event structure */
export interface GuardPrintEvent {
  timestamp: string;
  server: string;
  scope: MitigationScope;
  level: "debug" | "info" | "warn" | "error";
  operation: string;
  context: string;
  durationMs?: number;
  retryCount?: number;
  error?: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

/** Logger interface compatible with guard system */
export interface GuardLogger {
  debug: (msg: string, meta?: Record<string, unknown>) => void;
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
}

/** Scope minimum print levels */
const SCOPE_MIN_LEVEL: Record<MitigationScope, PrintLevel> = {
  SECURITY: PrintLevel.ERROR, // Always print security issues
  AUDIT: PrintLevel.WARN,
  PERSISTENCE: PrintLevel.INFO,
  STANDARD: PrintLevel.DEBUG,
};

/** ANSI color codes for console output */
const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

/**
 * Determine if a message should be printed based on level and scope
 */
export function shouldPrint(
  level: PrintLevel,
  scope: MitigationScope,
  verbosity: number
): boolean {
  const minLevel = SCOPE_MIN_LEVEL[scope];
  return level <= verbosity && level >= minLevel;
}

/**
 * Format print event for console output
 */
function formatConsole(event: GuardPrintEvent, useColors = true): string {
  const timestamp = event.timestamp;
  const levelColor =
    {
      error: COLORS.red,
      warn: COLORS.yellow,
      info: COLORS.green,
      debug: COLORS.dim,
    }[event.level] || "";

  const levelLabel = event.level.toUpperCase().padStart(5);
  const scopeLabel = `[${event.scope}]`.padEnd(12);

  let formatted = useColors
    ? `${COLORS.dim}${timestamp}${COLORS.reset} [${event.server}] ${scopeLabel} ${levelColor}${levelLabel}${COLORS.reset} ${event.operation}: ${event.context}`
    : `${timestamp} [${event.server}] ${scopeLabel} ${levelLabel} ${event.operation}: ${event.context}`;

  if (event.durationMs !== undefined) {
    formatted += ` (${event.durationMs}ms)`;
  }
  if (event.retryCount !== undefined && event.retryCount > 0) {
    formatted += ` retry:${event.retryCount}`;
  }
  if (event.error) {
    formatted += useColors
      ? ` ${COLORS.red}error:${event.error}${COLORS.reset}`
      : ` error:${event.error}`;
  }
  if (event.correlationId) {
    formatted += useColors
      ? ` ${COLORS.cyan}#${event.correlationId.slice(-6)}${COLORS.reset}`
      : ` #${event.correlationId.slice(-6)}`;
  }

  return formatted;
}

/**
 * Format print event for JSON output (NDJSON compatible)
 */
function formatJson(event: GuardPrintEvent): string {
  return JSON.stringify(event);
}

/**
 * Format print event for file output
 */
function formatFile(event: GuardPrintEvent): string {
  return JSON.stringify(event) + "\n";
}

/**
 * Create a correlation ID for tracing operations
 */
export function createCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Guard logger implementation with multiple output targets
 */
export class GuardLogWriter {
  private logPath?: string;
  private logDirEnsured = false;

  constructor(private config: GuardRuntimeConfig) {
    this.logPath = config.logPath;
  }

  /**
   * Write a print event to the configured target
   */
  write(event: GuardPrintEvent): void {
    if (!this.shouldLogEvent(event)) {
      return;
    }

    switch (this.config.printTarget) {
      case "console":
        this.writeConsole(event);
        break;
      case "json":
        this.writeJson(event);
        break;
      case "file":
        this.writeFile(event);
        break;
      case "silent":
        // No output
        break;
    }
  }

  /**
   * Check if event should be logged based on level and scope
   */
  private shouldLogEvent(event: GuardPrintEvent): boolean {
    const levelMap: Record<string, PrintLevel> = {
      error: PrintLevel.ERROR,
      warn: PrintLevel.WARN,
      info: PrintLevel.INFO,
      debug: PrintLevel.DEBUG,
    };
    const level = levelMap[event.level] || PrintLevel.INFO;
    return shouldPrint(level, event.scope, this.config.verbosity);
  }

  /**
   * Write to console (stderr for errors/warnings, stdout for info/debug)
   */
  private writeConsole(event: GuardPrintEvent): void {
    const formatted = formatConsole(event, true);
    if (event.level === "error" || event.level === "warn") {
      process.stderr.write(formatted + "\n");
    } else {
      process.stdout.write(formatted + "\n");
    }
  }

  /**
   * Write JSON to stderr
   */
  private writeJson(event: GuardPrintEvent): void {
    process.stderr.write(formatJson(event) + "\n");
  }

  /**
   * Write to log file
   */
  private writeFile(event: GuardPrintEvent): void {
    if (!this.logPath) return;

    // Ensure log directory exists (once)
    if (!this.logDirEnsured) {
      try {
        const logDir = dirname(this.logPath);
        if (!existsSync(logDir)) {
          mkdirSync(logDir, { recursive: true });
        }
        this.logDirEnsured = true;
      } catch {
        // Silent fail - can't write to file anyway
        return;
      }
    }

    try {
      appendFileSync(this.logPath, formatFile(event));
    } catch {
      // Silent fail for file writes to avoid infinite loops
    }
  }
}

/**
 * Create a guard logger compatible with the guard system
 */
export function createGuardLogger(
  serverName: string,
  scope: MitigationScope,
  config: GuardRuntimeConfig,
  correlationId?: string
): GuardLogger {
  const writer = new GuardLogWriter(config);

  function createEvent(
    level: GuardPrintEvent["level"],
    msg: string,
    meta?: Record<string, unknown>
  ): GuardPrintEvent {
    return {
      timestamp: new Date().toISOString(),
      server: serverName,
      scope,
      level,
      operation: "guard",
      context: msg,
      correlationId,
      metadata: meta,
    };
  }

  return {
    debug: (msg: string, meta?: Record<string, unknown>) => {
      writer.write(createEvent("debug", msg, meta));
    },
    info: (msg: string, meta?: Record<string, unknown>) => {
      writer.write(createEvent("info", msg, meta));
    },
    warn: (msg: string, meta?: Record<string, unknown>) => {
      writer.write(createEvent("warn", msg, meta));
    },
    error: (msg: string, meta?: Record<string, unknown>) => {
      writer.write(createEvent("error", msg, meta));
    },
  };
}

/**
 * Simple console fallback logger
 */
export function createConsoleLogger(serverName: string): GuardLogger {
  return {
    debug: (msg: string, meta?: Record<string, unknown>) => {
      console.debug(`[${serverName}] ${msg}`, meta || "");
    },
    info: (msg: string, meta?: Record<string, unknown>) => {
      console.info(`[${serverName}] ${msg}`, meta || "");
    },
    warn: (msg: string, meta?: Record<string, unknown>) => {
      console.warn(`[${serverName}] ${msg}`, meta || "");
    },
    error: (msg: string, meta?: Record<string, unknown>) => {
      console.error(`[${serverName}] ${msg}`, meta || "");
    },
  };
}

/**
 * No-op logger for silent mode
 */
export function createSilentLogger(): GuardLogger {
  const noop = () => {};
  return {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
  };
}

/**
 * Create appropriate logger based on runtime configuration
 */
export function createLogger(
  serverName: string,
  scope: MitigationScope = "STANDARD",
  config?: GuardRuntimeConfig
): GuardLogger {
  const runtimeConfig = config || {
    enabled: true,
    defaultScope: scope,
    printTarget: "console",
    verbosity: 2,
    features: {
      retryWithBackoff: true,
      verifyWrites: false,
      failClosedOnAudit: false,
      exitOnStartupFailure: true,
      circuitBreaker: true,
    },
    circuitBreaker: {
      failureThreshold: 5,
      resetTimeoutMs: 30000,
      halfOpenMaxCalls: 3,
    },
  };

  if (runtimeConfig.printTarget === "silent") {
    return createSilentLogger();
  }

  return createGuardLogger(serverName, scope, runtimeConfig);
}
