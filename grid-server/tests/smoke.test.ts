import crypto from "crypto";
import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type TestServer = {
  _registeredTools: Record<
    string,
    { inputSchema?: unknown; handler: (...args: any[]) => unknown }
  >;
};

function getToolNames(server: TestServer): string[] {
  return Object.keys(server._registeredTools);
}

async function invokeTool(
  server: TestServer,
  name: string,
  args: Record<string, unknown> = {},
) {
  const tool = server._registeredTools[name];
  expect(tool).toBeDefined();
  return tool.inputSchema
    ? await tool.handler(args, {} as any)
    : await tool.handler({} as any);
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
    };
    const targets = (await invokeTool(server, "list_targets", {})) as {
      isError?: boolean;
    };
    expect(health.isError).not.toBe(true);
    expect(targets.isError).not.toBe(true);
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
        (c: { check: string; passed: boolean }) =>
          c.check === "nonce_registered" && c.passed,
      ),
    ).toBe(true);
    expect(
      parsed.checks.some(
        (c: { check: string; passed: boolean }) =>
          c.check === "nonce_not_reused" && c.passed,
      ),
    ).toBe(true);
    // Nonce should be burned after success
    const registryAfter = JSON.parse(readFileSync(nonceRegistryPath, "utf-8"));
    expect(registryAfter["test-nonce-1"].burned).toBe(true);
    expect(registryAfter["test-nonce-1"].burned_at).toBeDefined();
  });

  it("validate_envelope fails closed when GRID_API_URL is set but remote validation fails (grid_unavailable)", async () => {
    // Unreachable URL so remote validation fails; grid-server must fail closed (valid: false).
    process.env.GRID_API_URL = "http://127.0.0.1:99999";
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
    const isolatedRoot = mkdtempSync(
      path.join(os.tmpdir(), "grid-server-untrusted-"),
    );
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
    const envelopePath = path.join(
      isolatedGate,
      "incoming",
      "envelope_no_trust.json",
    );
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
    const { buildServer: isolatedBuildServer } = (await import(
      isolatedModulePath
    )) as unknown as { buildServer: () => TestServer };
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
        (c: { check: string; passed: boolean }) =>
          c.check === "trusted_source" && !c.passed,
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
    const envelopePath = path.join(
      incomingDir,
      "envelope_numeric_timestamp.json",
    );
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
        (c: { check: string; passed: boolean }) =>
          c.check === "timestamp_fresh" && c.passed,
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
