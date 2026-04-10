import { describe, it, expect } from "vitest";
import { buildServer } from "../src/server.js";

describe("craft-server smoke", () => {
  it("builds without error", () => {
    const server = buildServer();
    expect(server).toBeDefined();
  });
});
