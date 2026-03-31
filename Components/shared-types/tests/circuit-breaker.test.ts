import { describe, it, expect, beforeEach } from "vitest";
import {
  CircuitState,
  GuardCircuitBreaker,
  CircuitBreakerOpenError,
  getCircuitBreaker,
  resetAllCircuitBreakers,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from "../src/circuit-breaker.js";

describe("Circuit Breaker", () => {
  beforeEach(() => {
    resetAllCircuitBreakers();
  });

  describe("Basic Operation", () => {
    it("should start in CLOSED state", () => {
      const cb = new GuardCircuitBreaker("test");
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });

    it("should return successful results when closed", async () => {
      const cb = new GuardCircuitBreaker("test");
      const result = await cb.execute(() => Promise.resolve("success"));
      expect(result).toBe("success");
    });

    it("should track success count", async () => {
      const cb = new GuardCircuitBreaker("test");
      await cb.execute(() => Promise.resolve("success"));
      expect(cb.getStats().successCount).toBe(1);
    });
  });

  describe("Circuit Opening", () => {
    it("should open after failure threshold", async () => {
      const cb = new GuardCircuitBreaker("test", {
        failureThreshold: 3,
        resetTimeoutMs: 30000,
        halfOpenMaxCalls: 3,
      });

      // 3 failures should open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await cb.execute(() => Promise.reject(new Error("fail")));
        } catch {
          /* expected */
        }
      }

      expect(cb.getState()).toBe(CircuitState.OPEN);
    });

    it("should throw CircuitBreakerOpenError when open", async () => {
      const cb = new GuardCircuitBreaker("test", {
        failureThreshold: 1,
        resetTimeoutMs: 30000,
        halfOpenMaxCalls: 3,
      });

      // 1 failure opens circuit
      try {
        await cb.execute(() => Promise.reject(new Error("fail")));
      } catch {
        /* expected */
      }

      await expect(cb.execute(() => Promise.resolve("success"))).rejects.toThrow(
        CircuitBreakerOpenError
      );
    });

    it("should track failure count", async () => {
      const cb = new GuardCircuitBreaker("test");
      try {
        await cb.execute(() => Promise.reject(new Error("fail")));
      } catch {
        /* expected */
      }
      expect(cb.getStats().failureCount).toBe(1);
    });
  });

  describe("Circuit Recovery", () => {
    it("should transition to HALF_OPEN after timeout", async () => {
      const cb = new GuardCircuitBreaker("test", {
        failureThreshold: 1,
        resetTimeoutMs: 10, // Very short timeout
        halfOpenMaxCalls: 3,
      });

      // Open the circuit
      try {
        await cb.execute(() => Promise.reject(new Error("fail")));
      } catch {
        /* expected */
      }

      expect(cb.getState()).toBe(CircuitState.OPEN);

      // Wait for timeout
      await new Promise((r) => setTimeout(r, 20));

      // Next call should try (will fail, but circuit should be HALF_OPEN)
      try {
        await cb.execute(() => Promise.reject(new Error("fail")));
      } catch {
        /* expected */
      }

      // Circuit should have been HALF_OPEN, then back to OPEN
      expect(cb.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe("Global Registry", () => {
    it("should reuse named circuit breakers", () => {
      const cb1 = getCircuitBreaker("shared");
      const cb2 = getCircuitBreaker("shared");
      expect(cb1).toBe(cb2);
    });

    it("should reset all circuit breakers", async () => {
      const cb1 = getCircuitBreaker("cb1");
      const cb2 = getCircuitBreaker("cb2");

      try {
        await cb1.execute(() => Promise.reject(new Error("fail")));
      } catch {
        /* expected */
      }

      resetAllCircuitBreakers();

      const cb1New = getCircuitBreaker("cb1");
      expect(cb1New.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe("Statistics", () => {
    it("should report total calls", async () => {
      const cb = new GuardCircuitBreaker("test");
      await cb.execute(() => Promise.resolve("success"));
      expect(cb.getStats().totalCalls).toBe(1);
    });

    it("should report rejected calls", async () => {
      const cb = new GuardCircuitBreaker("test", {
        failureThreshold: 1,
        resetTimeoutMs: 30000,
        halfOpenMaxCalls: 3,
      });

      try {
        await cb.execute(() => Promise.reject(new Error("fail")));
      } catch {
        /* expected */
      }

      // Try again while open
      try {
        await cb.execute(() => Promise.resolve("success"));
      } catch {
        /* expected */
      }

      expect(cb.getStats().rejectedCalls).toBe(1);
    });
  });

  describe("Force State", () => {
    it("should allow forcing state", () => {
      const cb = new GuardCircuitBreaker("test");
      cb.forceState(CircuitState.OPEN);
      expect(cb.getState()).toBe(CircuitState.OPEN);
    });

    it("should reset stats when forced to CLOSED", async () => {
      const cb = new GuardCircuitBreaker("test");
      try {
        await cb.execute(() => Promise.reject(new Error("fail")));
      } catch {
        /* expected */
      }

      cb.forceState(CircuitState.CLOSED);
      expect(cb.getStats().failureCount).toBe(0);
    });
  });
});
