import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  loadRuntimeConfig,
  validateRuntimeConfig,
  createScopedConfig,
  DEFAULT_RUNTIME_CONFIG,
  MITIGATION_SCOPES,
} from "../src/guard-config.js";

describe("Guard Runtime Configuration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.GUARD_ENABLED;
    delete process.env.GUARD_SCOPE;
    delete process.env.GUARD_PRINT_TARGET;
    delete process.env.GUARD_VERBOSITY;
    delete process.env.GUARD_FEATURES;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("loadRuntimeConfig", () => {
    it("should load default config when no env vars set", () => {
      const config = loadRuntimeConfig();
      expect(config.enabled).toBe(true);
      expect(config.defaultScope).toBe("STANDARD");
      expect(config.printTarget).toBe("console");
      expect(config.verbosity).toBe(2);
    });

    it("should respect GUARD_ENABLED=false", () => {
      process.env.GUARD_ENABLED = "false";
      const config = loadRuntimeConfig();
      expect(config.enabled).toBe(false);
    });

    it("should respect GUARD_SCOPE", () => {
      process.env.GUARD_SCOPE = "SECURITY";
      const config = loadRuntimeConfig();
      expect(config.defaultScope).toBe("SECURITY");
    });

    it("should fall back to STANDARD for invalid scope", () => {
      process.env.GUARD_SCOPE = "INVALID";
      const config = loadRuntimeConfig();
      expect(config.defaultScope).toBe("STANDARD");
    });

    it("should respect GUARD_PRINT_TARGET", () => {
      process.env.GUARD_PRINT_TARGET = "json";
      const config = loadRuntimeConfig();
      expect(config.printTarget).toBe("json");
    });

    it("should respect GUARD_VERBOSITY", () => {
      process.env.GUARD_VERBOSITY = "4";
      const config = loadRuntimeConfig();
      expect(config.verbosity).toBe(4);
    });

    it("should clamp invalid verbosity", () => {
      process.env.GUARD_VERBOSITY = "invalid";
      const config = loadRuntimeConfig();
      expect(config.verbosity).toBe(2);
    });

    it("should include serverName", () => {
      const config = loadRuntimeConfig("test-server");
      expect(config.serverName).toBe("test-server");
    });
  });

  describe("validateRuntimeConfig", () => {
    it("should validate valid config", () => {
      const result = validateRuntimeConfig(DEFAULT_RUNTIME_CONFIG);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should error on file target without log path", () => {
      const config = {
        ...DEFAULT_RUNTIME_CONFIG,
        printTarget: "file" as const,
        logPath: undefined,
      };
      const result = validateRuntimeConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should warn on short circuit timeout", () => {
      const config = {
        ...DEFAULT_RUNTIME_CONFIG,
        circuitBreaker: {
          ...DEFAULT_RUNTIME_CONFIG.circuitBreaker,
          resetTimeoutMs: 100,
        },
      };
      const result = validateRuntimeConfig(config);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("should error on invalid circuit threshold", () => {
      const config = {
        ...DEFAULT_RUNTIME_CONFIG,
        circuitBreaker: {
          ...DEFAULT_RUNTIME_CONFIG.circuitBreaker,
          failureThreshold: 0,
        },
      };
      const result = validateRuntimeConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("createScopedConfig", () => {
    it("should apply SECURITY scope settings", () => {
      const config = createScopedConfig(DEFAULT_RUNTIME_CONFIG, "SECURITY");
      expect(config.features.failClosedOnAudit).toBe(true);
      expect(config.features.verifyWrites).toBe(true);
    });

    it("should apply AUDIT scope settings", () => {
      const config = createScopedConfig(DEFAULT_RUNTIME_CONFIG, "AUDIT");
      expect(config.features.failClosedOnAudit).toBe(false);
      expect(config.features.verifyWrites).toBe(false);
    });

    it("should apply PERSISTENCE scope settings", () => {
      const config = createScopedConfig(DEFAULT_RUNTIME_CONFIG, "PERSISTENCE");
      expect(config.features.verifyWrites).toBe(true);
    });
  });

  describe("MITIGATION_SCOPES", () => {
    it("should have correct SECURITY settings", () => {
      expect(MITIGATION_SCOPES.SECURITY.failClosedOnAudit).toBe(true);
      expect(MITIGATION_SCOPES.SECURITY.maxRetries).toBe(3);
      expect(MITIGATION_SCOPES.SECURITY.verifyWrites).toBe(true);
    });

    it("should have correct AUDIT settings", () => {
      expect(MITIGATION_SCOPES.AUDIT.failClosedOnAudit).toBe(false);
      expect(MITIGATION_SCOPES.AUDIT.maxRetries).toBe(3);
      expect(MITIGATION_SCOPES.AUDIT.verifyWrites).toBe(false);
    });

    it("should have correct PERSISTENCE settings", () => {
      expect(MITIGATION_SCOPES.PERSISTENCE.failClosedOnAudit).toBe(false);
      expect(MITIGATION_SCOPES.PERSISTENCE.maxRetries).toBe(2);
      expect(MITIGATION_SCOPES.PERSISTENCE.verifyWrites).toBe(true);
    });

    it("should have correct STANDARD settings", () => {
      expect(MITIGATION_SCOPES.STANDARD.failClosedOnAudit).toBe(false);
      expect(MITIGATION_SCOPES.STANDARD.maxRetries).toBe(1);
      expect(MITIGATION_SCOPES.STANDARD.verifyWrites).toBe(false);
    });
  });
});
