import { describe, it, expect, afterEach } from "vitest";
import {
  HealthChecker,
  HealthCheckOptions,
  HealthCheckRegistry,
  defaultHealthCheckConfig,
} from "../src/health-check/index.js";

describe("HealthChecker", () => {
  let checker: HealthChecker;

  afterEach(() => {
    checker?.stop();
  });

  it("reports healthy on successful check", async () => {
    const config: HealthCheckOptions = {
      ...defaultHealthCheckConfig,
      intervalMs: 60000,
      check: async () => ({ healthy: true }),
    };
    checker = new HealthChecker("test", config);

    const status = await checker.check();
    expect(status.status).toBe("degraded"); // first success → degraded (needs healthyThreshold=2)

    const status2 = await checker.check();
    expect(status2.status).toBe("healthy");
  });

  it("reports unhealthy after failure threshold", async () => {
    const config: HealthCheckOptions = {
      ...defaultHealthCheckConfig,
      unhealthyThreshold: 2,
      intervalMs: 60000,
      check: async () => ({ healthy: false }),
    };
    checker = new HealthChecker("test", config);

    await checker.check(); // 1st failure → degraded
    expect(checker.getStatus().status).toBe("degraded");

    await checker.check(); // 2nd failure → unhealthy
    expect(checker.getStatus().status).toBe("unhealthy");
  });

  it("handles check timeouts", async () => {
    const config: HealthCheckOptions = {
      ...defaultHealthCheckConfig,
      timeoutMs: 50,
      unhealthyThreshold: 1,
      intervalMs: 60000,
      check: async () => {
        await new Promise((r) => setTimeout(r, 200));
        return { healthy: true };
      },
    };
    checker = new HealthChecker("test", config);

    const status = await checker.check();
    expect(status.status).toBe("unhealthy");
    expect(status.details?.error).toContain("timeout");
  });

  it("fires onStatusChange callback", async () => {
    const changes: string[] = [];
    const config: HealthCheckOptions = {
      ...defaultHealthCheckConfig,
      unhealthyThreshold: 1,
      intervalMs: 60000,
      check: async () => ({ healthy: false }),
      onStatusChange: (status) => changes.push(status.status),
    };
    checker = new HealthChecker("test", config);

    await checker.check();
    expect(changes).toContain("unhealthy");
  });

  it("recovers from unhealthy to healthy", async () => {
    let healthy = false;
    const config: HealthCheckOptions = {
      ...defaultHealthCheckConfig,
      unhealthyThreshold: 1,
      healthyThreshold: 2,
      intervalMs: 60000,
      check: async () => ({ healthy }),
    };
    checker = new HealthChecker("test", config);

    await checker.check();
    expect(checker.getStatus().status).toBe("unhealthy");

    healthy = true;
    await checker.check(); // 1st success → degraded
    expect(checker.getStatus().status).toBe("degraded");

    await checker.check(); // 2nd success → healthy
    expect(checker.getStatus().status).toBe("healthy");
  });
});

describe("HealthCheckRegistry", () => {
  it("registers and retrieves checkers", () => {
    const registry = new HealthCheckRegistry();
    const config: HealthCheckOptions = {
      ...defaultHealthCheckConfig,
      intervalMs: 60000,
      check: async () => ({ healthy: true }),
    };
    registry.register("svc-a", config);
    expect(registry.get("svc-a")).toBeDefined();
    registry.stopAll();
  });

  it("checkAll returns statuses for all services", async () => {
    const registry = new HealthCheckRegistry();
    const config: HealthCheckOptions = {
      ...defaultHealthCheckConfig,
      intervalMs: 60000,
      check: async () => ({ healthy: true }),
    };
    registry.register("a", config);
    registry.register("b", config);

    const statuses = await registry.checkAll();
    expect(Object.keys(statuses)).toEqual(["a", "b"]);
    registry.stopAll();
  });
});
