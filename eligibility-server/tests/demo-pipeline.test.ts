import { describe, expect, it, vi } from "vitest";

vi.mock("@cascade/shared-types/audit-client", () => ({
  emitAudit: () => Promise.resolve(true),
}));

import {
  DEFAULT_EXECUTE_SCENARIO,
  EligibilityRouter,
  getFixtureCandidateById,
} from "../src/index.js";

describe("demo execute pipeline", () => {
  it("returns runtime story, topology artifact, and support-balance assist from one execution", async () => {
    const router = new EligibilityRouter();
    const report = await router.execute({
      ...DEFAULT_EXECUTE_SCENARIO,
      id: "demo-test-execute",
      cycle: {
        ...DEFAULT_EXECUTE_SCENARIO.cycle,
        caseId: "demo-test-execute-cycle",
      },
    });

    expect(report.runtimeStory).toContain("[EXECUTE]");
    expect(report.topologyStory).toContain("[TOPOLOGY]");
    expect(report.runtimeHighlights.length).toBeGreaterThanOrEqual(6);
    expect(report.topologyArtifact.nodes.length).toBeGreaterThanOrEqual(6);
    expect(report.topologyArtifact.edges.length).toBeGreaterThanOrEqual(5);

    expect(report.supportBalanceAssist.supportScore).toBeGreaterThanOrEqual(0);
    expect(report.supportBalanceAssist.supportScore).toBeLessThanOrEqual(1);
    expect(report.supportBalanceAssist.balanceScore).toBeGreaterThanOrEqual(0);
    expect(report.supportBalanceAssist.balanceScore).toBeLessThanOrEqual(1);
    expect(report.supportBalanceAssist.guidance.length).toBeGreaterThan(0);

    expect(report.cycleSnapshots.promotion.gate.caseId).toBe("demo-test-execute-cycle");
    expect(report.cycleSnapshots.promotion.snapshot.caseRecord.currentBeat).toBeDefined();
  });

  it("keeps evaluate() as compatibility wrapper around execute()", async () => {
    const router = new EligibilityRouter();
    const candidate = getFixtureCandidateById("balanced-bridge");
    expect(candidate).toBeDefined();

    const report = await router.evaluate([candidate!], {
      governance: 1.2,
      usability: 1.1,
      integration: 1.2,
      observability: 1.1,
      operationalFit: 1,
      formTarget: "all",
      tableScope: "all",
      seed: "demo-compat-seed",
    });

    expect(report.scenario.id).toBe("compat-evaluate");
    expect(report.runtimeStory).toContain("Support-balance assist");
    expect(report.topologyArtifact.nodes.some((node) => node.id === "support-balance-assist")).toBe(true);
  });
});
