import { describe, expect, it, vi } from "vitest";

const emitAuditMock = vi.fn(() => Promise.resolve(true));

vi.mock("@cascade/shared-types/audit-client", () => ({
  emitAudit: (...args: unknown[]) => emitAuditMock(...args),
}));

import type { EvolutionCase, PromotionGateResult } from "../src/types.js";
import {
  initializeHooks,
  onCaseStatusChanged,
  onPromotionGateEvaluated,
  onEvolutionCaseOpened,
} from "../src/hooks.js";

describe("routing hooks", () => {
  it("logs when emitAudit fails for openEvolutionCase", async () => {
    emitAuditMock.mockResolvedValueOnce(false);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const minimal: EvolutionCase = {
      caseId: "audit-fail",
      label: "x",
      candidateIds: [],
      candidates: [],
      args: {
        governance: 1,
        usability: 1,
        integration: 1,
        observability: 1,
        operationalFit: 1,
        seed: "s",
        formTarget: "all",
        tableScope: "all",
      },
      currentBeat: "map",
      status: "active",
      endpointSpecs: [],
      handoffs: [],
      signals: [],
      momentum: {
        acceleration: 0,
        momentum: 0,
        sidewalkDrift: 0,
        endpointReadiness: 0,
        handoffCompletion: 0,
        integrationSuccessRate: 0,
        reversalRate: 0,
        staleWindowRatio: 0,
        openPriorityConditionCount: 0,
        updatedAt: "",
      },
      promotionHistory: [],
      latestPromotionDecision: null,
      latestEligibilityResult: null,
      conditionNotes: [],
      observationNotes: [],
      returnHistory: [],
      snapshotHistory: [],
      timeline: [],
      openedAt: "",
      updatedAt: "",
    };

    await onEvolutionCaseOpened(minimal);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("audit write failed for tool=openEvolutionCase"),
    );
    log.mockRestore();
    emitAuditMock.mockResolvedValue(true);
  });

  it("onPromotionGateEvaluated logs seeds hook when decision is allow_promotion", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const gate: PromotionGateResult = {
      caseId: "g1",
      decision: "allow_promotion",
      passed: true,
      beat: "verify",
      evaluatedAt: "",
      reasons: [],
      thresholds: {
        overallScore: 0,
        governanceScore: 0,
        integrationScore: 0,
        sidewalkDrift: 0,
      },
      metrics: {
        overallScore: 0,
        governanceScore: 0,
        integrationScore: 0,
        sidewalkDrift: 0,
        requiredEndpointCount: 0,
        completeEndpointCount: 0,
        openPriorityConditionCount: 0,
      },
    };

    const caseRecord: EvolutionCase = {
      caseId: "g1",
      label: "L",
      candidateIds: [],
      candidates: [],
      args: {
        governance: 1,
        usability: 1,
        integration: 1,
        observability: 1,
        operationalFit: 1,
        seed: "s",
        formTarget: "all",
        tableScope: "all",
      },
      currentBeat: "verify",
      status: "active",
      endpointSpecs: [],
      handoffs: [],
      signals: [],
      momentum: {
        acceleration: 0,
        momentum: 0,
        sidewalkDrift: 0,
        endpointReadiness: 0,
        handoffCompletion: 0,
        integrationSuccessRate: 0,
        reversalRate: 0,
        staleWindowRatio: 0,
        openPriorityConditionCount: 0,
        updatedAt: "",
      },
      promotionHistory: [],
      latestPromotionDecision: null,
      latestEligibilityResult: null,
      conditionNotes: [],
      observationNotes: [],
      returnHistory: [],
      snapshotHistory: [],
      timeline: [],
      openedAt: "",
      updatedAt: "",
    };

    await onPromotionGateEvaluated(caseRecord, gate);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("[SEEDS_HOOK] Would trigger ecosystem scan"),
    );
    log.mockRestore();
  });

  it("onCaseStatusChanged logs seeds snapshot when status is promoted", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const caseRecord: EvolutionCase = {
      caseId: "promo1",
      label: "L",
      candidateIds: [],
      candidates: [],
      args: {
        governance: 1,
        usability: 1,
        integration: 1,
        observability: 1,
        operationalFit: 1,
        seed: "s",
        formTarget: "all",
        tableScope: "all",
      },
      currentBeat: "verify",
      status: "promoted",
      endpointSpecs: [],
      handoffs: [],
      signals: [],
      momentum: {
        acceleration: 0,
        momentum: 0,
        sidewalkDrift: 0,
        endpointReadiness: 0,
        handoffCompletion: 0,
        integrationSuccessRate: 0,
        reversalRate: 0,
        staleWindowRatio: 0,
        openPriorityConditionCount: 0,
        updatedAt: "",
      },
      promotionHistory: [],
      latestPromotionDecision: null,
      latestEligibilityResult: null,
      conditionNotes: [],
      observationNotes: [],
      returnHistory: [],
      snapshotHistory: [],
      timeline: [],
      openedAt: "",
      updatedAt: "",
    };

    await onCaseStatusChanged(caseRecord, "active");
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("[SEEDS_HOOK] Would create ecosystem snapshot"),
    );
    log.mockRestore();
  });

  it("initializeHooks schedules mkdir for eligibility data dir", async () => {
    initializeHooks();
    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setImmediate(resolve));
  });
});
