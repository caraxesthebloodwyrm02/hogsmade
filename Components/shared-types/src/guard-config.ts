/**
 * Guard Runtime Configuration
 *
 * Centralized configuration system for MCP guard behavior.
 * Supports environment variable-based configuration with sensible defaults.
 */

import type { CircuitBreakerConfig } from "./circuit-breaker.js";

/** Mitigation scope levels for selective guard application */
export type MitigationScope = "SECURITY" | "AUDIT" | "PERSISTENCE" | "STANDARD";

/** Print target for guard output */
export type PrintTarget = "console" | "json" | "file" | "silent";

/** Guard feature flags */
export interface GuardFeatures {
  /** Enable retry with exponential backoff */
  retryWithBackoff: boolean;
  /** Enable write verification after file operations */
  verifyWrites: boolean;
  /** Fail closed on audit failures */
  failClosedOnAudit: boolean;
  /** Exit process on startup failure */
  exitOnStartupFailure: boolean;
  /** Enable circuit breaker protection */
  circuitBreaker: boolean;
}

/** Runtime configuration for MCP guards */
export interface GuardRuntimeConfig {
  /** Enable/disable guards at runtime */
  enabled: boolean;
  /** Default mitigation scope */
  defaultScope: MitigationScope;
  /** Print target for output */
  printTarget: PrintTarget;
  /** Log file path (when printTarget is 'file') */
  logPath?: string;
  /** Verbosity level: 0=silent, 1=error, 2=warn, 3=info, 4=debug */
  verbosity: number;
  /** Feature flags */
  features: GuardFeatures;
  /** Circuit breaker configuration */
  circuitBreaker: CircuitBreakerConfig;
  /** Server name for identification */
  serverName?: string;
}

/** Scope-specific configuration presets */
export const MITIGATION_SCOPES: Record<
  MitigationScope,
  {
    failClosedOnAudit: boolean;
    maxRetries: number;
    verifyWrites: boolean;
    verbosity: number;
  }
> = {
  SECURITY: {
    failClosedOnAudit: true,
    maxRetries: 3,
    verifyWrites: true,
    verbosity: 1, // Only errors
  },
  AUDIT: {
    failClosedOnAudit: false,
    maxRetries: 3,
    verifyWrites: false,
    verbosity: 2, // Errors + warnings
  },
  PERSISTENCE: {
    failClosedOnAudit: false,
    maxRetries: 2,
    verifyWrites: true,
    verbosity: 3, // Above + info
  },
  STANDARD: {
    failClosedOnAudit: false,
    maxRetries: 1,
    verifyWrites: false,
    verbosity: 4, // Debug level
  },
};

/** Default runtime configuration */
export const DEFAULT_RUNTIME_CONFIG: GuardRuntimeConfig = {
  enabled: true,
  defaultScope: "STANDARD",
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

/**
 * Parse comma-separated feature flags from environment
 */
function parseFeatureFlags(flags?: string): Partial<GuardFeatures> {
  const features: Partial<GuardFeatures> = {};
  if (!flags) return features;

  const enabled = new Set(flags.split(",").map((f) => f.trim()));

  if (enabled.has("retryWithBackoff")) features.retryWithBackoff = true;
  if (enabled.has("verifyWrites")) features.verifyWrites = true;
  if (enabled.has("failClosedOnAudit")) features.failClosedOnAudit = true;
  if (enabled.has("exitOnStartupFailure")) features.exitOnStartupFailure = true;
  if (enabled.has("circuitBreaker")) features.circuitBreaker = true;

  // Handle negation with "no" prefix
  if (enabled.has("noRetryWithBackoff")) features.retryWithBackoff = false;
  if (enabled.has("noVerifyWrites")) features.verifyWrites = false;
  if (enabled.has("noFailClosedOnAudit")) features.failClosedOnAudit = false;
  if (enabled.has("noExitOnStartupFailure")) features.exitOnStartupFailure = false;
  if (enabled.has("noCircuitBreaker")) features.circuitBreaker = false;

  return features;
}

/**
 * Load runtime configuration from environment variables
 *
 * Environment variables:
 * - GUARD_ENABLED: 'true' | 'false' (default: 'true')
 * - GUARD_SCOPE: 'SECURITY' | 'AUDIT' | 'PERSISTENCE' | 'STANDARD' (default: 'STANDARD')
 * - GUARD_PRINT_TARGET: 'console' | 'json' | 'file' | 'silent' (default: 'console')
 * - GUARD_LOG_PATH: path to log file (required if printTarget is 'file')
 * - GUARD_VERBOSITY: 0-4 (default: 2)
 * - GUARD_FEATURES: comma-separated list (e.g., 'retryWithBackoff,verifyWrites')
 * - GUARD_CIRCUIT_THRESHOLD: number of failures before opening (default: 5)
 * - GUARD_CIRCUIT_TIMEOUT_MS: milliseconds before recovery attempt (default: 30000)
 */
export function loadRuntimeConfig(serverName?: string): GuardRuntimeConfig {
  const enabled = process.env.GUARD_ENABLED !== "false";

  const scope = (process.env.GUARD_SCOPE as MitigationScope) || "STANDARD";
  const validScope: MitigationScope = MITIGATION_SCOPES[scope] ? scope : "STANDARD";

  const printTarget = (process.env.GUARD_PRINT_TARGET as PrintTarget) || "console";
  const validPrintTarget: PrintTarget = ["console", "json", "file", "silent"].includes(printTarget)
    ? printTarget
    : "console";

  const logPath = process.env.GUARD_LOG_PATH;

  let verbosity = parseInt(process.env.GUARD_VERBOSITY || "2", 10);
  if (isNaN(verbosity) || verbosity < 0 || verbosity > 4) {
    verbosity = 2;
  }

  const featureFlags = parseFeatureFlags(process.env.GUARD_FEATURES);

  const circuitThreshold = parseInt(process.env.GUARD_CIRCUIT_THRESHOLD || "5", 10);
  const circuitTimeout = parseInt(process.env.GUARD_CIRCUIT_TIMEOUT_MS || "30000", 10);

  return {
    enabled,
    defaultScope: validScope,
    printTarget: validPrintTarget,
    logPath: validPrintTarget === "file" ? logPath : undefined,
    verbosity,
    features: {
      ...DEFAULT_RUNTIME_CONFIG.features,
      ...featureFlags,
    },
    circuitBreaker: {
      failureThreshold: isNaN(circuitThreshold) ? 5 : circuitThreshold,
      resetTimeoutMs: isNaN(circuitTimeout) ? 30000 : circuitTimeout,
      halfOpenMaxCalls: 3,
    },
    serverName,
  };
}

/**
 * Validate runtime configuration
 * Returns validation result with any errors
 */
export function validateRuntimeConfig(config: GuardRuntimeConfig): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check log file configuration if file target
  if (config.printTarget === "file") {
    if (!config.logPath) {
      errors.push("Log path is required when printTarget is 'file'");
    } else {
      // Note: Actual file check is async, this is structural validation
      if (config.logPath.includes("~")) {
        warnings.push("Log path contains ~ which may not expand correctly");
      }
      if (!config.logPath.endsWith(".log") && !config.logPath.endsWith(".ndjson")) {
        warnings.push("Log path should use .log or .ndjson extension");
      }
    }
  }

  // Validate scope
  if (!MITIGATION_SCOPES[config.defaultScope]) {
    errors.push(`Invalid scope: ${config.defaultScope}`);
  }

  // Validate print target
  if (!["console", "json", "file", "silent"].includes(config.printTarget)) {
    errors.push(`Invalid print target: ${config.printTarget}`);
  }

  // Validate verbosity
  if (config.verbosity < 0 || config.verbosity > 4) {
    warnings.push(`Verbosity ${config.verbosity} out of range (0-4), clamping`);
  }

  // Validate circuit breaker config
  if (config.circuitBreaker.failureThreshold < 1) {
    errors.push("Circuit breaker failure threshold must be at least 1");
  }
  if (config.circuitBreaker.resetTimeoutMs < 1000) {
    warnings.push("Circuit breaker reset timeout is very short (<1s)");
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Create a configuration with scope-specific overrides
 */
export function createScopedConfig(
  baseConfig: GuardRuntimeConfig,
  scope: MitigationScope,
): GuardRuntimeConfig {
  const scopeConfig = MITIGATION_SCOPES[scope];
  return {
    ...baseConfig,
    defaultScope: scope,
    features: {
      ...baseConfig.features,
      failClosedOnAudit: scopeConfig.failClosedOnAudit,
      verifyWrites: scopeConfig.verifyWrites,
    },
    verbosity: scopeConfig.verbosity,
  };
}

/**
 * Configuration helper for server startup validation
 */
export async function validateGuardStartup(
  config: GuardRuntimeConfig,
): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
  const validation = validateRuntimeConfig(config);

  // Additional async validations could go here
  // e.g., checking log directory writability

  return validation;
}
