import { describe, expect, it, vi } from "vitest";

vi.mock("@cascade/shared-types/audit-client", () => ({
  emitAudit: () => Promise.resolve(true),
}));

import { buildServer } from "../src/server.js";

type ToolHandler = (args?: Record<string, unknown>) => Promise<unknown>;

function toolHandler(server: ReturnType<typeof buildServer>, name: string): ToolHandler {
  const reg = (server as unknown as { _registeredTools: Record<string, { handler: ToolHandler }> })
    ._registeredTools;
  const entry = reg[name];
  expect(entry, `tool ${name} registered`).toBeDefined();
  return entry.handler;
}

function parseToolJson(result: unknown): Record<string, unknown> {
  const r = result as { content: Array<{ type: string; text: string }> };
  expect(r.content[0]?.type).toBe("text");
  return JSON.parse(r.content[0].text) as Record<string, unknown>;
}

describe("MCP server tool wiring", () => {
  it("health_check returns ok payload with server metadata", async () => {
    const handler = toolHandler(buildServer(), "health_check");
    const payload = parseToolJson(await handler({}));
    expect(payload.status).toBe("ok");
    expect(payload.server).toBe("eligibility-server");
    expect(payload.version).toBe("1.0.0");
    expect(typeof payload.activeCycles).toBe("number");
    expect(typeof payload.timestamp).toBe("string");
  });

  it("check_the_line delegates to line audit and returns structured result", async () => {
    const handler = toolHandler(buildServer(), "check_the_line");
    const payload = parseToolJson(await handler({}));
    expect(payload).toHaveProperty("clean");
    expect(payload).toHaveProperty("findings");
    expect(payload).toHaveProperty("summary");
    expect(payload.clean).toBe(true);
  });

  it("hold_the_line delegates to holdTheLine", async () => {
    const handler = toolHandler(buildServer(), "hold_the_line");
    const payload = parseToolJson(await handler({}));
    expect(payload.clean).toBe(true);
    expect(payload.fixedCount).toBe(0);
  });

  it("list_active_cycles returns cases array", async () => {
    const handler = toolHandler(buildServer(), "list_active_cycles");
    const payload = parseToolJson(await handler({}));
    expect(payload).toHaveProperty("cases");
    expect(Array.isArray(payload.cases)).toBe(true);
  });

  it("evaluate_candidate accepts fixtureId and returns validation", async () => {
    const handler = toolHandler(buildServer(), "evaluate_candidate");
    const payload = parseToolJson(
      await handler({ fixtureId: "balanced-bridge" }),
    ) as { validation: { ok: boolean } };
    expect(payload.validation.ok).toBe(true);
  });
});
