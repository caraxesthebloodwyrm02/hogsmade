import { describe, it, expect, beforeEach } from "vitest";
import {
  CircuitBreaker,
  CircuitBreakerRegistry,
  CircuitBreakerOptions,
} from "../src/circuit-breaker/index.js";
import { CircuitState, CircuitBreakerOpenError } from "../src/types/index.js";

function makeContext(op = "test") {
  return { serviceName: "test-svc", operationName: op, startTime: Date.now(), attempt: 1 };
}

describe("CircuitBreaker", () => {
  let cb: CircuitBreaker;
  const defaultConfig: CircuitBreakerOptions = {
    failureThreshold: 3,
    successThreshold: 2,
    timeoutMs: 100,
    halfOpenMaxCalls: 1,
  };

  beforeEach(() => {
    cb = new CircuitBreaker("test-svc", defaultConfig);
  });

  it("starts in CLOSED state", () => {
    expect(cb.getState()).toBe(CircuitState.CLOSED);
  });

  it("stays CLOSED on success", async () => {
    await cb.execute(async () => "ok", makeContext());
    expect(cb.getState()).toBe(CircuitState.CLOSED);
    expect(cb.getMetrics().successes).toBe(1);
  });

  it("opens after reaching failure threshold", async () => {
    const fail = async () => {
      throw new Error("fail");
    };

    for (let i = 0; i < 3; i++) {
      await cb.execute(fail, makeContext()).catch(() => {});
    }

    expect(cb.getState()).toBe(CircuitState.OPEN);
  });

  it("rejects calls when OPEN", async () => {
    const fail = async () => {
      throw new Error("fail");
    };
    for (let i = 0; i < 3; i++) {
      await cb.execute(fail, makeContext()).catch(() => {});
    }

    await expect(cb.execute(async () => "ok", makeContext())).rejects.toThrow(
      CircuitBreakerOpenError,
    );
  });

  it("transitions to HALF_OPEN after timeout", async () => {
    const fail = async () => {
      throw new Error("fail");
    };
    for (let i = 0; i < 3; i++) {
      await cb.execute(fail, makeContext()).catch(() => {});
    }

    expect(cb.getState()).toBe(CircuitState.OPEN);

    await new Promise((r) => setTimeout(r, 150));

    await cb.execute(async () => "recovered", makeContext());
    expect(cb.getState()).toBe(CircuitState.HALF_OPEN);
  });

  it("closes after success threshold in HALF_OPEN", async () => {
    const fail = async () => {
      throw new Error("fail");
    };
    for (let i = 0; i < 3; i++) {
      await cb.execute(fail, makeContext()).catch(() => {});
    }

    await new Promise((r) => setTimeout(r, 150));

    const config2: CircuitBreakerOptions = {
      failureThreshold: 3,
      successThreshold: 2,
      timeoutMs: 100,
      halfOpenMaxCalls: 5,
    };
    const cb2 = new CircuitBreaker("test-svc-2", config2);
    // Force open
    for (let i = 0; i < 3; i++) {
      await cb2.execute(fail, makeContext()).catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 150));

    // Two successes should close it
    await cb2.execute(async () => "ok", makeContext());
    await cb2.execute(async () => "ok", makeContext());
    expect(cb2.getState()).toBe(CircuitState.CLOSED);
  });

  it("reset clears all state", async () => {
    const fail = async () => {
      throw new Error("fail");
    };
    for (let i = 0; i < 3; i++) {
      await cb.execute(fail, makeContext()).catch(() => {});
    }
    cb.reset();
    expect(cb.getState()).toBe(CircuitState.CLOSED);
    expect(cb.getMetrics().failures).toBe(0);
  });

  it("fires onStateChange callback", async () => {
    const states: CircuitState[] = [];
    const tracked = new CircuitBreaker("tracked", {
      ...defaultConfig,
      onStateChange: (state) => states.push(state),
    });
    const fail = async () => {
      throw new Error("fail");
    };
    for (let i = 0; i < 3; i++) {
      await tracked.execute(fail, makeContext()).catch(() => {});
    }
    expect(states).toContain(CircuitState.OPEN);
  });
});

describe("CircuitBreakerRegistry", () => {
  it("returns same breaker for same service", () => {
    const registry = new CircuitBreakerRegistry();
    const config: CircuitBreakerOptions = {
      failureThreshold: 3,
      successThreshold: 2,
      timeoutMs: 1000,
    };
    const a = registry.get("svc", config);
    const b = registry.get("svc", config);
    expect(a).toBe(b);
  });

  it("getMetrics returns all breaker metrics", () => {
    const registry = new CircuitBreakerRegistry();
    const config: CircuitBreakerOptions = {
      failureThreshold: 3,
      successThreshold: 2,
      timeoutMs: 1000,
    };
    registry.get("a", config);
    registry.get("b", config);
    const metrics = registry.getMetrics();
    expect(Object.keys(metrics)).toEqual(["a", "b"]);
  });
});
