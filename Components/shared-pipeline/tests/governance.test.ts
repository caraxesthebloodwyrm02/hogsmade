import { describe, it, expect } from "vitest";
import { createGovernancePipeline } from "../src/examples/governance.js";
import type { GovernanceState } from "../src/examples/governance.js";
import { findResidue, readDeposit } from "../src/residue.js";

describe("governance pipeline", () => {
  it("classifies security context and escalates", () => {
    const pipeline = createGovernancePipeline();
    const result = pipeline.run({
      requestType: "change",
      context: "Modifying auth security middleware",
    });

    expect(result.state.classification).toBe("security");
    expect(result.state.riskLevel).toBe("high");
    expect(result.state.verdict).toBe("escalate");
    expect(result.residue).toHaveLength(4);
  });

  it("classifies data governance context", () => {
    const pipeline = createGovernancePipeline();
    const result = pipeline.run({
      requestType: "review",
      context: "Data retention privacy policy update",
    });

    expect(result.state.classification).toBe("data-governance");
    expect(result.state.riskLevel).toBe("medium");
    expect(result.state.verdict).toBe("review");
  });

  it("classifies release gate context", () => {
    const pipeline = createGovernancePipeline();
    const result = pipeline.run({
      requestType: "gate",
      context: "Deploy release v2.8.0 to production",
    });

    expect(result.state.classification).toBe("release-gate");
    expect(result.state.verdict).toBe("allow");
  });

  it("defaults to general classification", () => {
    const pipeline = createGovernancePipeline();
    const result = pipeline.run({
      requestType: "inquiry",
      context: "What is the status of the project?",
    });

    expect(result.state.classification).toBe("general");
    expect(result.state.riskLevel).toBe("low");
  });

  it("produces summary with full residue trail", () => {
    const pipeline = createGovernancePipeline();
    const result = pipeline.run({
      requestType: "change",
      context: "Security audit of auth module",
    });

    expect(result.state.summary).toContain("3 prior passes");
    expect(result.state.summary).toContain("security");
    expect(result.state.summary).toContain("escalate");

    const summaryDeposit = findResidue(result.residue, "governance:summary");
    const priorPasses = summaryDeposit?.data["priorPasses"] as string[];
    expect(priorPasses).toEqual([
      "builtin:timestamp",
      "governance:classify",
      "governance:evaluate",
    ]);
  });

  it("residue entries have timestamps", () => {
    const pipeline = createGovernancePipeline();
    const result = pipeline.run({ requestType: "test", context: "general query" });
    for (const entry of result.residue) {
      expect(entry.timestamp).toBeDefined();
      expect(new Date(entry.timestamp).getTime()).not.toBeNaN();
    }
  });

  it("timestamp pass deposits startedAt", () => {
    const pipeline = createGovernancePipeline();
    const result = pipeline.run({ requestType: "test", context: "anything" });
    const started = readDeposit<string>(result.residue, "builtin:timestamp", "startedAt");
    expect(started).toBeDefined();
  });
});
