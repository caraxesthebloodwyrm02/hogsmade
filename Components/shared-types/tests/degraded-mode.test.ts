import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CircuitState, createHardenedMeritGuard } from "../src/mcp-guard-hardened.js";
import { ActionClass } from "../src/merit-policy.js";

describe("Degraded Mode — Local-Only Permission Path", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.GRID_API_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Layered validation helpers", () => {
    it("isApiConfigured() returns false when no GRID_API_URL", () => {
      const guard = createHardenedMeritGuard("test-server");
      expect(guard.isApiConfigured()).toBe(false);
    });

    it("isApiConfigured() returns true when GRID_API_URL is set", () => {
      const guard = createHardenedMeritGuard("test-server", "http://localhost:8080");
      expect(guard.isApiConfigured()).toBe(true);
    });

    it("isApiReachable() returns false when no API configured", () => {
      const guard = createHardenedMeritGuard("test-server");
      expect(guard.isApiReachable()).toBe(false);
    });

    it("isApiReachable() reflects circuit breaker state", () => {
      const guard = createHardenedMeritGuard("test-server", "http://localhost:8080");
      // When circuit is closed, API is reachable
      expect(guard.getCircuitState()).toBe(CircuitState.CLOSED);
      expect(guard.isApiReachable()).toBe(true);
    });

    it("getPermissionSemantic() returns 'local' when no API", () => {
      const guard = createHardenedMeritGuard("test-server");
      expect(guard.getPermissionSemantic()).toBe("local");
    });

    it("getPermissionSemantic() returns 'remote' when API configured and circuit closed", () => {
      const guard = createHardenedMeritGuard("test-server", "http://localhost:8080");
      expect(guard.getPermissionSemantic()).toBe("remote");
    });
  });

  describe("Local-only degraded mode — all action classes", () => {
    const actionClasses = [
      ActionClass.PUBLIC_BASIC,
      ActionClass.ANALYSIS_READ,
      ActionClass.ACTION_WRITE,
      ActionClass.CONTROL_ADMIN,
    ];

    for (const actionClass of actionClasses) {
      it(`allows ${actionClass} tools without GRID API`, async () => {
        const guard = createHardenedMeritGuard("test-server");

        // Use registerGuardedTool + invoke pattern to exercise the full path
        const mockServer = createMockServer();
        guard.registerGuardedTool(
          mockServer,
          `test_tool_${actionClass}`,
          {
            description: `Test tool for ${actionClass}`,
            actionClass,
          },
          async () => ({ status: "ok", actionClass }),
        );

        const handler = mockServer.getHandler(`test_tool_${actionClass}`);
        expect(handler).toBeDefined();

        const result = (await handler!({})) as {
          isError?: boolean;
          content?: Array<{ type: string; text?: string }>;
        };

        expect(result.isError).not.toBe(true);

        const payload = JSON.parse(result.content?.[0]?.text ?? "{}");
        expect(payload.result).toBeDefined();
        expect(payload.result.status).toBe("ok");
        expect(payload.result.actionClass).toBe(actionClass);
        expect(payload._meta).toBeDefined();
        expect(payload._meta.semantic).toBe("local");
        expect(payload._meta.action_class).toBe(actionClass);
      });
    }
  });

  describe("Metrics tracking", () => {
    it("increments localPermissions counter in degraded mode", async () => {
      const guard = createHardenedMeritGuard("test-server");
      const mockServer = createMockServer();

      guard.registerGuardedTool(
        mockServer,
        "metric_test",
        {
          description: "Metric test tool",
          actionClass: ActionClass.PUBLIC_BASIC,
        },
        async () => ({ ok: true }),
      );

      const handler = mockServer.getHandler("metric_test");
      await handler!({});
      await handler!({});

      const metrics = guard.getMetrics();
      expect(metrics.localPermissions).toBe(2);
      expect(metrics.remotePermissions).toBe(0);
    });
  });

  describe("Semantic boundary: API configured but unreachable", () => {
    it("returns remote semantic when API is configured", () => {
      const guard = createHardenedMeritGuard("test-server", "http://localhost:8080");
      expect(guard.getPermissionSemantic()).toBe("remote");
      expect(guard.isApiConfigured()).toBe(true);
    });
  });
});

/**
 * Minimal mock server that captures registered tool handlers.
 */
function createMockServer() {
  const tools = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>();

  return {
    registerTool(
      name: string,
      _options: unknown,
      handler: (args: Record<string, unknown>) => Promise<unknown>,
    ) {
      tools.set(name, handler);
    },
    getHandler(name: string) {
      return tools.get(name);
    },
  };
}
