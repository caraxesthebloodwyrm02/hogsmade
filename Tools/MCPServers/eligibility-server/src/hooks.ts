/**
 * Trigger routing hooks for eligibility-server
 *
 * Routes eligibility cycle events to the broader MCP ecosystem:
 * - echoes: audit trail
 * - pulse: focus sessions and journal entries
 * - seeds: repo health bookmarks and snapshots
 */

import { emitAudit } from "@cascade/shared-types/audit-client";
import os from "os";
import path from "path";
import { sanitizeAuditMetadata, sanitizeLogValue } from "./sanitize.js";
import type { CycleSignal, EvolutionCase, PromotionGateResult } from "./types.js";

const ELIGIBILITY_DATA_DIR =
  process.env.ELIGIBILITY_DATA_DIR || path.join(os.homedir(), ".eligibility-server");

/**
 * Hook: when an evolution case is opened
 */
export async function onEvolutionCaseOpened(caseRecord: EvolutionCase): Promise<void> {
  const timestamp = new Date().toISOString();

  // Echoes audit
  const auditMetadata = sanitizeAuditMetadata({
    caseId: caseRecord.caseId,
    label: caseRecord.label,
    owner: caseRecord.owner,
    candidateCount: caseRecord.candidates.length,
    currentBeat: caseRecord.currentBeat,
    timestamp,
  });
  const ok = await emitAudit({
    source: "eligibility-server",
    tool: "openEvolutionCase",
    status: "success",
    durationMs: 0,
    metadata: auditMetadata,
  });
  if (!ok) {
    console.error(`[eligibility-server] audit write failed for tool=openEvolutionCase`);
  }

  // Seeds bookmark for tracking
  // Note: In real implementation, this would call seeds-server MCP tool
  const safeCaseId1 = sanitizeLogValue(caseRecord.caseId);
  console.error(
    `[SEEDS_HOOK] Would bookmark evolution case ${safeCaseId1} in repo: eligibility-server`,
  );
}

/**
 * Hook: when a cycle signal is recorded
 */
export async function onCycleSignalRecorded(caseId: string, signal: CycleSignal): Promise<void> {
  const timestamp = new Date().toISOString();

  // Echoes audit
  const signalMetadata = sanitizeAuditMetadata({
    caseId,
    signalType: signal.type,
    signalSource: signal.source,
    timestamp,
  });
  const ok = await emitAudit({
    source: "eligibility-server",
    tool: "recordCycleSignal",
    status: "success",
    durationMs: 0,
    metadata: signalMetadata,
  });
  if (!ok) {
    console.error(`[eligibility-server] audit write failed for tool=recordCycleSignal`);
  }

  // Pulse journal for significant signals
  if (signal.type === "condition_escalated" || signal.type === "integration_call_failed") {
    // Note: In real implementation, this would call pulse-server MCP tool
    const safeNote = sanitizeLogValue(signal.note);
    const safeCaseId = sanitizeLogValue(caseId);
    console.error(
      `[PULSE_HOOK] Would journal ${signal.type} signal for case ${safeCaseId}: ${safeNote}`,
    );
  }
}

/**
 * Hook: when promotion gate is evaluated
 */
export async function onPromotionGateEvaluated(
  caseRecord: EvolutionCase,
  gate: PromotionGateResult,
): Promise<void> {
  const timestamp = new Date().toISOString();
  const decision = gate.decision;

  // Echoes audit (already emitted in evolution.ts, but we add context)
  const gateMetadata = sanitizeAuditMetadata({
    caseId: caseRecord.caseId,
    decision,
    passed: gate.passed,
    reasons: gate.reasons,
    metrics: gate.metrics,
    thresholds: gate.thresholds,
    timestamp,
  });
  const ok = await emitAudit({
    source: "eligibility-server",
    tool: "promotionGateHook",
    status: "success",
    durationMs: 0,
    metadata: gateMetadata,
  });
  if (!ok) {
    console.error(`[eligibility-server] audit write failed for tool=promotionGateHook`);
  }

  // Pulse focus session tracking for blocked promotions
  if (decision === "hold_for_tighten" || decision === "return_to_balance") {
    // Note: In real implementation, this would call pulse-server MCP tool
    const safeCaseId2 = sanitizeLogValue(caseRecord.caseId);
    console.error(
      `[PULSE_HOOK] Would start focus session for blocked promotion case ${safeCaseId2}`,
    );
  }

  // Seeds ecosystem scan trigger for major decisions
  if (decision === "allow_promotion") {
    // Note: In real implementation, this would call seeds-server MCP tool
    const safeCaseId3 = sanitizeLogValue(caseRecord.caseId);
    console.error(
      `[SEEDS_HOOK] Would trigger ecosystem scan after promotion of case ${safeCaseId3}`,
    );
  }
}

/**
 * Hook: when case is promoted or returned
 */
export async function onCaseStatusChanged(
  caseRecord: EvolutionCase,
  previousStatus: string,
): Promise<void> {
  const timestamp = new Date().toISOString();

  // Echoes audit
  const statusMetadata = sanitizeAuditMetadata({
    caseId: caseRecord.caseId,
    previousStatus,
    currentStatus: caseRecord.status,
    currentBeat: caseRecord.currentBeat,
    timestamp,
  });
  const ok = await emitAudit({
    source: "eligibility-server",
    tool: "caseStatusChanged",
    status: "success",
    durationMs: 0,
    metadata: statusMetadata,
  });
  if (!ok) {
    console.error(`[eligibility-server] audit write failed for tool=caseStatusChanged`);
  }

  // Seeds snapshot for major transitions
  if (caseRecord.status === "promoted") {
    // Note: In real implementation, this would call seeds-server MCP tool
    const safeCaseId4 = sanitizeLogValue(caseRecord.caseId);
    console.error(`[SEEDS_HOOK] Would create ecosystem snapshot for promoted case ${safeCaseId4}`);
  }
}

/**
 * Initialize hooks by ensuring data directory exists
 */
export function initializeHooks(): void {
  import("node:fs").then(({ mkdirSync }) => {
    try {
      mkdirSync(ELIGIBILITY_DATA_DIR, { recursive: true });
    } catch (error) {
      // Directory might already exist
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        console.error("Failed to create eligibility data directory:", error);
      }
    }
  });
}
