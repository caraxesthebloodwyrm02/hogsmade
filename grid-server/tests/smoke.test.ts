import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import crypto from "crypto";
import os from "os";
import path from "path";

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
    ({ buildServer } = await import("../src/server.ts"));
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
    expect(getToolNames(server)).toEqual(expect.arrayContaining([
      "health_check",
      "list_targets",
      "validate_envelope",
      "gate_audit",
      "nonce_status",
      "check_permission",
    ]));

    const health = await invokeTool(server, "health_check");
    const targets = await invokeTool(server, "list_targets", {});
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
        "test-nonce-1": { issued_at: new Date().toISOString(), burned: false, burned_at: null },
      }),
      "utf-8"
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
    const result = await invokeTool(server, "validate_envelope", { envelopePath });
    expect(result.isError).not.toBe(true);
    const text = (result as { content?: Array<{ type: string; text?: string }> }).content?.[0]?.text;
    expect(text).toBeDefined();
    const parsed = JSON.parse(text as string);
    expect(parsed.valid).toBe(true);
    expect(parsed.enhancedValidation).toBeNull();
    expect(parsed.checks.some((c: { check: string }) => c.check === "nonce_registered" && c.passed)).toBe(true);
    expect(parsed.checks.some((c: { check: string }) => c.check === "nonce_not_reused" && c.passed)).toBe(true);
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
        "test-nonce-2": { issued_at: new Date().toISOString(), burned: false, burned_at: null },
      }),
      "utf-8"
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
    const result = await invokeTool(server, "validate_envelope", { envelopePath });
    expect(result.isError).not.toBe(true);
    const text = (result as { content?: Array<{ type: string; text?: string }> }).content?.[0]?.text;
    const parsed = JSON.parse(text as string);
    expect(parsed.valid).toBe(false);
    expect(parsed.enhancedValidation?.flags).toContain("grid_unavailable");
    expect(parsed.enhancedValidation?.approved).toBe(false);
  });
});
