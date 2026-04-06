import crypto from "crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

type TestServer = {
  _registeredTools: Record<string, { inputSchema?: unknown; handler: (...args: any[]) => unknown }>;
};

function getToolNames(server: TestServer): string[] {
  return Object.keys(server._registeredTools);
}

async function invokeTool(server: TestServer, name: string, args: Record<string, unknown> = {}) {
  const tool = server._registeredTools[name];
  expect(tool).toBeDefined();
  return tool.inputSchema ? await tool.handler(args, {} as any) : await tool.handler({} as any);
}

describe("grid-server smoke", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "grid-server-"));
  let buildServer: () => TestServer;
  let getConfig: () => { gateDir: string; workspaceRoot: string };

  beforeAll(async () => {
    process.env.CASCADE_WORKSPACE_ROOT = tempRoot;
    process.env.GATE_DIR = path.join(tempRoot, "GATE");
    process.env.GATE_TRUSTED_SOURCE_PARTITIONS = "test-agent";
    mkdirSync(process.env.GATE_DIR, { recursive: true });
    const serverModule = (await import("../src/server.ts")) as unknown as {
      buildServer: () => TestServer;
    };
    ({ buildServer } = serverModule);
    ({ getConfig } = await import("../src/config.ts"));
  });

  afterAll(() => {
    delete process.env.CASCADE_WORKSPACE_ROOT;
    delete process.env.GATE_DIR;
    delete process.env.GRID_API_URL;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("requires machine-specific env vars", () => {
    const originalGateDir = process.env.GATE_DIR;
    delete process.env.GATE_DIR;
    expect(() => getConfig()).toThrow(/GATE_DIR/);
    process.env.GATE_DIR = originalGateDir;
  });

  it("registers expected tools and runs list_targets", async () => {
    delete process.env.GRID_API_URL;
    const server = buildServer();
    expect(getToolNames(server)).toEqual(
      expect.arrayContaining([
        "health_check",
        "list_targets",
        "validate_envelope",
        "gate_audit",
        "nonce_status",
        "check_permission",
      ]),
    );

    const health = (await invokeTool(server, "health_check")) as {
      isError?: boolean;
      content?: Array<{ type: string; text?: string }>;
    };
    const targets = (await invokeTool(server, "list_targets", {})) as {
      isError?: boolean;
      content?: Array<{ type: string; text?: string }>;
    };
    expect(health.isError).toBe(true);
    expect(targets.isError).toBe(true);
    const healthPayload = JSON.parse(health.content?.[0]?.text ?? "{}");
    const targetsPayload = JSON.parse(targets.content?.[0]?.text ?? "{}");
    expect(healthPayload.code).toBe("NO_GRID_API");
    expect(targetsPayload.code).toBe("NO_GRID_API");
  });

  it("admission_compliance_check falls back locally on SAFETY_UNAVAILABLE", async () => {
    process.env.GRID_API_URL = "http://127.0.0.1:8080";
    const originalFetch = globalThis.fetch;

    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/admission/compliance/check")) {
        return new Response(
          JSON.stringify({
            refused: true,
            reason_code: "SAFETY_UNAVAILABLE",
            explanation: "request denied",
            support_ticket_id: "audit-test",
          }),
          {
            status: 503,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.endsWith("/admission/entity/ip%3A127.0.0.1")) {
        return new Response(
          JSON.stringify({
            entity_id: "ip:127.0.0.1",
            total_penalty_points: 3,
            bannered: false,
            banner_reason: "",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.endsWith("/admission/policy")) {
        return new Response(JSON.stringify({ billboard_version: "1.0.0" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    try {
      const server = buildServer();
      const result = (await invokeTool(server, "admission_compliance_check", {
        payload: { strategy: "cost_cutting" },
        entity_id: "ip:127.0.0.1",
        target_path: "/api/v1/intelligence/process",
      })) as {
        isError?: boolean;
        content?: Array<{ type: string; text?: string }>;
      };

      expect(result.isError).not.toBe(true);
      const text = result.content?.[0]?.text;
      expect(text).toBeDefined();
      const parsed = JSON.parse(text as string);
      expect(parsed.fallback_used).toBe(true);
      expect(parsed.backend_status).toBe("degraded");
      expect(parsed.compliant).toBe(false);
      expect(parsed.profit_mask_signals).toContain("cost_cutting");
      expect(parsed.entity_penalty_points).toBe(3);
      expect(parsed.policy.billboard_version).toBe("1.0.0");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("admission status tools return degraded payloads when GRID backend fetch fails", async () => {
    process.env.GRID_API_URL = "http://127.0.0.1:8080";
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const server = buildServer();
      const bannered = (await invokeTool(server, "admission_bannered_entities", {})) as {
        isError?: boolean;
        content?: Array<{ type: string; text?: string }>;
      };
      const stats = (await invokeTool(server, "admission_stats", {})) as {
        isError?: boolean;
        content?: Array<{ type: string; text?: string }>;
      };

      expect(bannered.isError).not.toBe(true);
      expect(stats.isError).not.toBe(true);

      const banneredPayload = JSON.parse(bannered.content?.[0]?.text ?? "{}");
      const statsPayload = JSON.parse(stats.content?.[0]?.text ?? "{}");

      expect(banneredPayload.degraded).toBe(true);
      expect(banneredPayload.available).toBe(false);
      expect(banneredPayload.reason_code).toBe("GRID_BACKEND_UNAVAILABLE");
      expect(banneredPayload.count).toBe(0);
      expect(banneredPayload.entities).toEqual([]);

      expect(statsPayload.degraded).toBe(true);
      expect(statsPayload.available).toBe(false);
      expect(statsPayload.reason_code).toBe("GRID_BACKEND_UNAVAILABLE");
      expect(statsPayload.total_admitted).toBe(0);
      expect(statsPayload.total_rejected).toBe(0);
      expect(statsPayload.rejection_reasons).toEqual({});
      expect(statsPayload.tracked_entities).toBe(0);
      expect(statsPayload.bannered_entities).toBe(0);
      expect(fetchMock).toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("validate_envelope succeeds with local checks when GRID_API_URL is unset and nonce is registered", async () => {
    delete process.env.GRID_API_URL;
    delete process.env.GATE_USER_SECRET;
    const gateDir = process.env.GATE_DIR!;
    const incomingDir = path.join(gateDir, "incoming");
    mkdirSync(incomingDir, { recursive: true });
    // Nonce must be in registry and not burned for validation to pass.
    const nonceRegistryPath = path.join(gateDir, ".nonce_registry.json");
    writeFileSync(
      nonceRegistryPath,
      JSON.stringify({
        "test-nonce-1": {
          issued_at: new Date().toISOString(),
          burned: false,
          burned_at: null,
        },
      }),
      "utf-8",
    );
    const payload = {};
    const payloadHash = crypto.createHash("sha256").update("{}").digest("hex");
    const envelope = {
      envelope_id: "test-env-1",
      payload,
      payload_hash: payloadHash,
      nonce: "test-nonce-1",
      timestamp: new Date().toISOString(),
      user_fingerprint: "test-user",
      machine_fingerprint: "test-machine",
      scope: "deploy",
      source_partition: "test-agent",
      target_partition: "grid-server",
      tests_passed: true,
      lint_passed: true,
    };
    const envelopePath = path.join(incomingDir, "envelope_test.json");
    writeFileSync(envelopePath, JSON.stringify(envelope), "utf-8");

    const server = buildServer();
    const result = (await invokeTool(server, "validate_envelope", {
      envelopePath,
    })) as {
      isError?: boolean;
      content?: Array<{ type: string; text?: string }>;
    };
    expect(result.isError).not.toBe(true);
    const text = result.content?.[0]?.text;
    expect(text).toBeDefined();
    const parsed = JSON.parse(text as string);
    expect(parsed.valid).toBe(true);
    expect(parsed.enhancedValidation).toBeNull();
    expect(
      parsed.checks.some(
        (c: { check: string; passed: boolean }) => c.check === "nonce_registered" && c.passed,
      ),
    ).toBe(true);
    expect(
      parsed.checks.some(
        (c: { check: string; passed: boolean }) => c.check === "nonce_not_reused" && c.passed,
      ),
    ).toBe(true);
    // Nonce should be burned after success
    const registryAfter = JSON.parse(readFileSync(nonceRegistryPath, "utf-8"));
    expect(registryAfter["test-nonce-1"].burned).toBe(true);
    expect(registryAfter["test-nonce-1"].burned_at).toBeDefined();
  });

  it("validate_envelope fails closed when GRID_API_URL is set but remote validation fails (grid_unavailable)", async () => {
    // Unreachable URL so remote validation fails; grid-server must fail closed (valid: false).
    process.env.GRID_API_URL = "http://127.0.0.1:65535";
    delete process.env.GATE_USER_SECRET;
    const gateDir = process.env.GATE_DIR!;
    const incomingDir = path.join(gateDir, "incoming");
    mkdirSync(incomingDir, { recursive: true });
    const nonceRegistryPath = path.join(gateDir, ".nonce_registry.json");
    writeFileSync(
      nonceRegistryPath,
      JSON.stringify({
        "test-nonce-2": {
          issued_at: new Date().toISOString(),
          burned: false,
          burned_at: null,
        },
      }),
      "utf-8",
    );
    const payload = {};
    const payloadHash = crypto.createHash("sha256").update("{}").digest("hex");
    const envelope = {
      envelope_id: "test-env-2",
      payload,
      payload_hash: payloadHash,
      nonce: "test-nonce-2",
      timestamp: new Date().toISOString(),
      user_fingerprint: "any",
      machine_fingerprint: "any",
      scope: "deploy",
      source_partition: "test-agent",
      target_partition: "grid-server",
      tests_passed: true,
      lint_passed: true,
    };
    const envelopePath = path.join(incomingDir, "envelope_failclosed.json");
    writeFileSync(envelopePath, JSON.stringify(envelope), "utf-8");

    const server = buildServer();
    const result = (await invokeTool(server, "validate_envelope", {
      envelopePath,
    })) as {
      isError?: boolean;
      content?: Array<{ type: string; text?: string }>;
    };
    expect(result.isError).not.toBe(true);
    const text = result.content?.[0]?.text;
    const parsed = JSON.parse(text as string);
    expect(parsed.valid).toBe(false);
    expect(parsed.enhancedValidation?.flags).toContain("grid_unavailable");
    expect(parsed.enhancedValidation?.approved).toBe(false);
  });

  it("validate_envelope fails when trusted sources are not explicitly configured", async () => {
    const isolatedRoot = mkdtempSync(path.join(os.tmpdir(), "grid-server-untrusted-"));
    const isolatedGate = path.join(isolatedRoot, "GATE");
    mkdirSync(path.join(isolatedGate, "incoming"), { recursive: true });
    writeFileSync(
      path.join(isolatedGate, ".nonce_registry.json"),
      JSON.stringify({
        "test-nonce-3": {
          issued_at: new Date().toISOString(),
          burned: false,
          burned_at: null,
        },
      }),
      "utf-8",
    );

    process.env.CASCADE_WORKSPACE_ROOT = isolatedRoot;
    process.env.GATE_DIR = isolatedGate;
    delete process.env.GATE_TRUSTED_SOURCE_PARTITIONS;
    delete process.env.GRID_API_URL;

    const payloadHash = crypto.createHash("sha256").update("{}").digest("hex");
    const envelopePath = path.join(isolatedGate, "incoming", "envelope_no_trust.json");
    writeFileSync(
      envelopePath,
      JSON.stringify({
        envelope_id: "test-env-3",
        payload: {},
        payload_hash: payloadHash,
        nonce: "test-nonce-3",
        timestamp: new Date().toISOString(),
        user_fingerprint: "any",
        machine_fingerprint: "any",
        scope: "deploy",
        source_partition: "test-agent",
        target_partition: "grid-server",
        tests_passed: true,
        lint_passed: true,
      }),
      "utf-8",
    );

    const isolatedModulePath = "../src/server.ts?trusted-sources-missing";
    const { buildServer: isolatedBuildServer } = (await import(isolatedModulePath)) as unknown as {
      buildServer: () => TestServer;
    };
    const server = isolatedBuildServer() as TestServer;
    const result = (await invokeTool(server, "validate_envelope", {
      envelopePath,
    })) as {
      content?: Array<{ text?: string }>;
    };
    const parsed = JSON.parse(result.content?.[0]?.text as string);
    expect(parsed.valid).toBe(false);
    expect(
      parsed.checks.some(
        (c: { check: string; passed: boolean }) => c.check === "trusted_source" && !c.passed,
      ),
    ).toBe(true);

    rmSync(isolatedRoot, { recursive: true, force: true });
    process.env.CASCADE_WORKSPACE_ROOT = tempRoot;
    process.env.GATE_DIR = path.join(tempRoot, "GATE");
    process.env.GATE_TRUSTED_SOURCE_PARTITIONS = "test-agent";
  });

  it("validate_envelope accepts fresh numeric second timestamps", async () => {
    delete process.env.GRID_API_URL;
    process.env.GATE_TRUSTED_SOURCE_PARTITIONS = "test-agent";
    const gateDir = process.env.GATE_DIR!;
    const incomingDir = path.join(gateDir, "incoming");
    mkdirSync(incomingDir, { recursive: true });
    writeFileSync(
      path.join(gateDir, ".nonce_registry.json"),
      JSON.stringify({
        "test-nonce-4": {
          issued_at: new Date().toISOString(),
          burned: false,
          burned_at: null,
        },
      }),
      "utf-8",
    );

    const payloadHash = crypto.createHash("sha256").update("{}").digest("hex");
    const envelopePath = path.join(incomingDir, "envelope_numeric_timestamp.json");
    writeFileSync(
      envelopePath,
      JSON.stringify({
        envelope_id: "test-env-4",
        payload: {},
        payload_hash: payloadHash,
        nonce: "test-nonce-4",
        timestamp: Math.floor(Date.now() / 1000),
        user_fingerprint: "any",
        machine_fingerprint: "any",
        scope: "deploy",
        source_partition: "test-agent",
        target_partition: "grid-server",
        tests_passed: true,
        lint_passed: true,
      }),
      "utf-8",
    );

    const server = buildServer();
    const result = (await invokeTool(server, "validate_envelope", {
      envelopePath,
    })) as {
      content?: Array<{ text?: string }>;
    };
    const parsed = JSON.parse(result.content?.[0]?.text as string);
    expect(parsed.valid).toBe(true);
    expect(
      parsed.checks.some(
        (c: { check: string; passed: boolean }) => c.check === "timestamp_fresh" && c.passed,
      ),
    ).toBe(true);
  });

  it("validate_envelope rejects unrecognized target partitions", async () => {
    delete process.env.GRID_API_URL;
    process.env.GATE_TRUSTED_SOURCE_PARTITIONS = "test-agent";
    const gateDir = process.env.GATE_DIR!;
    const incomingDir = path.join(gateDir, "incoming");
    mkdirSync(incomingDir, { recursive: true });
    writeFileSync(
      path.join(gateDir, ".nonce_registry.json"),
      JSON.stringify({
        "test-nonce-5": {
          issued_at: new Date().toISOString(),
          burned: false,
          burned_at: null,
        },
      }),
      "utf-8",
    );

    const payloadHash = crypto.createHash("sha256").update("{}").digest("hex");
    const envelopePath = path.join(incomingDir, "envelope_bad_target.json");
    writeFileSync(
      envelopePath,
      JSON.stringify({
        envelope_id: "test-env-5",
        payload: {},
        payload_hash: payloadHash,
        nonce: "test-nonce-5",
        timestamp: new Date().toISOString(),
        user_fingerprint: "any",
        machine_fingerprint: "any",
        scope: "deploy",
        source_partition: "test-agent",
        target_partition: "Z:\\outside\\unknown-target",
        tests_passed: true,
        lint_passed: true,
      }),
      "utf-8",
    );

    const server = buildServer();
    const result = (await invokeTool(server, "validate_envelope", {
      envelopePath,
    })) as {
      content?: Array<{ text?: string }>;
    };
    const parsed = JSON.parse(result.content?.[0]?.text as string);
    expect(parsed.valid).toBe(false);
    expect(
      parsed.checks.some(
        (c: { check: string; passed: boolean }) =>
          c.check === "target_partition_recognized" && !c.passed,
      ),
    ).toBe(true);
  });
});
