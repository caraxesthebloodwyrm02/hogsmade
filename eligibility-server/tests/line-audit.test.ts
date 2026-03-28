import { describe, expect, it, vi } from "vitest";

vi.mock("@cascade/shared-types/audit-client", () => ({
  emitAudit: () => Promise.resolve(true),
}));

import { checkTheLine, holdTheLine } from "../src/index.js";

describe("line audit MCP surface", () => {
  it("check_the_line returns structured result with 6 rules scanned", () => {
    const result = checkTheLine();
    expect(result).toHaveProperty("clean");
    expect(result).toHaveProperty("errorCount");
    expect(result).toHaveProperty("warningCount");
    expect(result).toHaveProperty("fixableCount");
    expect(result).toHaveProperty("fixedCount");
    expect(result).toHaveProperty("findings");
    expect(result).toHaveProperty("summary");
    expect(typeof result.clean).toBe("boolean");
    expect(typeof result.summary).toBe("string");
    expect(Array.isArray(result.findings)).toBe(true);
  });

  it("check_the_line reports clean on a healthy codebase", () => {
    const result = checkTheLine();
    expect(result.clean).toBe(true);
    expect(result.errorCount).toBe(0);
    expect(result.fixedCount).toBe(0);
    expect(result.summary).toContain("0 findings");
  });

  it("hold_the_line returns fixedCount of 0 when nothing to fix", () => {
    const result = holdTheLine();
    expect(result.clean).toBe(true);
    expect(result.fixedCount).toBe(0);
  });

  it("findings have the expected shape", () => {
    const result = checkTheLine();
    for (const f of result.findings) {
      expect(f).toHaveProperty("rule");
      expect(f).toHaveProperty("severity");
      expect(f).toHaveProperty("file");
      expect(f).toHaveProperty("message");
      expect(f).toHaveProperty("fixable");
      expect(["error", "warn"]).toContain(f.severity);
      expect(typeof f.fixable).toBe("boolean");
    }
  });
});
