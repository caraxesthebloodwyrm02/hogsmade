import { afterEach, describe, expect, it, vi } from "vitest";

const originalFetch = globalThis.fetch;

describe("probeGridBackend", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  it("uses /api/v1/health when /health fails", async () => {
    process.env.CASCADE_WORKSPACE_ROOT = process.cwd();
    process.env.GATE_DIR = `${process.cwd()}/GATE`;
    process.env.GATE_TRUSTED_SOURCE_PARTITIONS = "test-agent";

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { probeGridBackend } = await import("../src/server.ts");
    const result = await probeGridBackend("http://localhost:8080", 1000);

    expect(result.reachable).toBe(true);
    expect(result.endpoint).toBe("/api/v1/health");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns failure details when both endpoints fail", async () => {
    process.env.CASCADE_WORKSPACE_ROOT = process.cwd();
    process.env.GATE_DIR = `${process.cwd()}/GATE`;
    process.env.GATE_TRUSTED_SOURCE_PARTITIONS = "test-agent";

    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("connect ECONNREFUSED"))
      .mockResolvedValueOnce({ ok: false, status: 503 });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { probeGridBackend } = await import("../src/server.ts");
    const result = await probeGridBackend("http://localhost:8080", 1000);

    expect(result.reachable).toBe(false);
    expect(result.endpoint).toBe("/api/v1/health");
    expect(result.status).toBe(503);
    expect(result.error).toBe("HTTP 503");
  });
});
