import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server.ts";

describe("glimpse-server smoke", () => {
  it("builds an MCP server instance", () => {
    const s = buildServer();
    expect(s).toBeDefined();
  });
});
