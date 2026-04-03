import { describe, expect, it, vi } from "vitest";

const auditEvents: unknown[] = [];

vi.mock("@cascade/shared-types/audit-client", () => ({
  emitAudit: (event: unknown) => {
    auditEvents.push(event);
    return Promise.resolve(true);
  },
}));

import {
  emitEligibilityAudit,
  emitCaseOpenedSignal,
  emitSignalRecordedSignal,
  emitHandoffRecordedSignal,
  emitEndpointUpsertedSignal,
  emitBeatAdvancedSignal,
  emitPromotionGateEvaluatedSignal,
  withAudit,
  listAttributeCatalogHandler,
  evaluateCandidateHandler,
  compileFormsHandler,
  collectTableHandler,
  explainHierarchyHandler,
} from "../src/index.js";

describe("routing audit hooks", () => {
  it("emitEligibilityAudit writes source and tool to the audit trail", async () => {
    auditEvents.length = 0;
    await emitEligibilityAudit("test_tool", "success", { caseId: "test-1" });
    expect(auditEvents).toHaveLength(1);
    const event = auditEvents[0] as Record<string, unknown>;
    expect(event).toMatchObject({
      source: "eligibility-server",
      tool: "test_tool",
      status: "success",
    });
    expect((event["metadata"] as Record<string, unknown>)?.["caseId"]).toBe("test-1");
  });

  it("signal-specific hooks emit correct targetType metadata", async () => {
    auditEvents.length = 0;

    await emitCaseOpenedSignal("case-a", "Label A");
    await emitSignalRecordedSignal("case-a", "test_passed", 0.8);
    await emitHandoffRecordedSignal("case-a", "mapper", "operator", "accepted");
    await emitEndpointUpsertedSignal("case-a", "ep-1", "Endpoint 1", "ready");
    await emitBeatAdvancedSignal("case-a", "forward", "balance");
    await emitPromotionGateEvaluatedSignal("case-a", "allow_promotion", 0.72);

    expect(auditEvents).toHaveLength(6);
    const targetTypes = auditEvents.map(
      (e) =>
        ((e as Record<string, unknown>)["metadata"] as Record<string, unknown>)?.["targetType"],
    );
    expect(targetTypes).toEqual([
      "evolution_case",
      "cycle_signal",
      "handoff",
      "endpoint_spec",
      "beat_advance",
      "promotion_gate",
    ]);
  });

  it("withAudit wraps a handler and emits success audit", async () => {
    auditEvents.length = 0;
    const handler = vi.fn(() => ({ result: "ok" }));
    const wrapped = withAudit("wrapped_tool", handler);
    const result = await wrapped({ caseId: "wrap-test" });

    expect(handler).toHaveBeenCalledOnce();
    expect(result).toEqual({ result: "ok" });
    expect(auditEvents.length).toBeGreaterThanOrEqual(1);
    const event = auditEvents[auditEvents.length - 1] as Record<string, unknown>;
    expect(event).toMatchObject({ tool: "wrapped_tool", status: "success" });
  });

  it("withAudit emits failure audit on error and rethrows", async () => {
    auditEvents.length = 0;
    const handler = vi.fn(() => {
      throw new Error("boom");
    });
    const wrapped = withAudit("error_tool", handler);

    await expect(wrapped({})).rejects.toThrow("boom");
    const event = auditEvents[auditEvents.length - 1] as Record<string, unknown>;
    expect(event).toMatchObject({ tool: "error_tool", status: "failure" });
    expect((event["metadata"] as Record<string, unknown>)?.["error"]).toBe("boom");
  });
});

describe("read-only handler audit coverage", () => {
  it("listAttributeCatalogHandler emits audit", () => {
    auditEvents.length = 0;
    const result = listAttributeCatalogHandler();
    expect(result.attributes.length).toBeGreaterThan(0);
    // audit is fire-and-forget (void), check it was queued
    const auditForTool = auditEvents.filter(
      (e) => (e as Record<string, unknown>)["tool"] === "list_attribute_catalog",
    );
    expect(auditForTool.length).toBeGreaterThanOrEqual(1);
  });

  it("evaluateCandidateHandler emits audit on success and failure", () => {
    auditEvents.length = 0;
    const success = evaluateCandidateHandler({ fixtureId: "balanced-bridge" });
    expect(success.validation.ok).toBe(true);

    const failure = evaluateCandidateHandler({});
    expect(failure.validation.ok).toBe(false);

    const successAudit = auditEvents.filter(
      (e) =>
        (e as Record<string, unknown>)["tool"] === "evaluate_candidate" &&
        (e as Record<string, unknown>)["status"] === "success",
    );
    const failureAudit = auditEvents.filter(
      (e) =>
        (e as Record<string, unknown>)["tool"] === "evaluate_candidate" &&
        (e as Record<string, unknown>)["status"] === "failure",
    );
    expect(successAudit.length).toBeGreaterThanOrEqual(1);
    expect(failureAudit.length).toBeGreaterThanOrEqual(1);
  });

  it("compileFormsHandler emits audit", () => {
    auditEvents.length = 0;
    compileFormsHandler({
      fixtureId: "balanced-bridge",
      args: { formTarget: "all", tableScope: "all" },
    });
    const audit = auditEvents.filter(
      (e) => (e as Record<string, unknown>)["tool"] === "compile_forms",
    );
    expect(audit.length).toBeGreaterThanOrEqual(1);
  });

  it("collectTableHandler emits audit", () => {
    auditEvents.length = 0;
    collectTableHandler({
      fixtureId: "balanced-bridge",
      args: { formTarget: "all", tableScope: "all" },
    });
    const audit = auditEvents.filter(
      (e) => (e as Record<string, unknown>)["tool"] === "collect_table",
    );
    expect(audit.length).toBeGreaterThanOrEqual(1);
  });

  it("explainHierarchyHandler emits audit", () => {
    auditEvents.length = 0;
    explainHierarchyHandler({
      fixtureId: "balanced-bridge",
      args: { formTarget: "all", tableScope: "all" },
    });
    const audit = auditEvents.filter(
      (e) => (e as Record<string, unknown>)["tool"] === "explain_hierarchy",
    );
    expect(audit.length).toBeGreaterThanOrEqual(1);
  });
});
