/**
 * Eligibility Routing Hooks — Infrastructure Integration Layer
 *
 * Connects eligibility cycle events to the broader MCP ecosystem:
 * - Echoes audit trail (persistent event log)
 * - Pulse signals (developer dashboard state)
 * - Seeds health (ecosystem status)
 *
 * Follows the same patterns as grid-server, lots-server, maintain-server.
 */

import type { AuditEvent } from "@cascade/shared-types";
import { emitAudit } from "@cascade/shared-types/audit-client";
import { MAX_METADATA_VALUE_LENGTH, sanitizeAuditMetadata } from "./sanitize.js";

// ── Constants ──

const SERVER_NAME = "eligibility-server";

// ── Types ──

export interface EligibilityAuditMetadata {
  caseId?: string;
  signalType?: string;
  handoffFrom?: string;
  handoffTo?: string;
  endpointId?: string;
  direction?: string;
  gateDecision?: string;
  gatePassed?: boolean;
  score?: number;
  label?: string;
  source?: string;
  status?: string;
  reason?: string;
  currentBeat?: string;
  candidateCount?: number;
  created?: boolean;
  weight?: number;
  durationMs?: number;
  error?: string;
}

// ── Audit Helpers ──

/**
 * Emit an audit event for an eligibility operation.
 * Uses the shared audit client to append to the NDJSON audit log.
 */
export async function emitEligibilityAudit(
  tool: string,
  status: AuditEvent["status"],
  metadata?: EligibilityAuditMetadata,
): Promise<void> {
  const event: Omit<AuditEvent, "timestamp"> = {
    source: SERVER_NAME,
    tool,
    status,
    metadata: metadata as Record<string, unknown> | undefined,
  };
  await emitAudit(event);
}

// ── Hook Wrappers ──

/**
 * Wrap a server tool handler to emit audit events before/after execution.
 * Usage: server.tool("tool_name", desc, schema, withAudit("tool_name", handler))
 */
export function withAudit(
  toolName: string,
  handler: (...args: unknown[]) => unknown,
): (...args: unknown[]) => Promise<unknown> {
  return async (...args: unknown[]) => {
    const startTime = Date.now();
    try {
      const result = await handler(...args);
      const durationMs = Date.now() - startTime;
      const rawMetadata = args[0] as Record<string, unknown> | undefined;
      const metadata = sanitizeAuditMetadata(rawMetadata);
      await emitEligibilityAudit(toolName, "success", {
        ...(metadata ?? {}),
        durationMs,
      });
      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const rawMetadata = args[0] as Record<string, unknown> | undefined;
      const metadata = sanitizeAuditMetadata(rawMetadata);
      await emitEligibilityAudit(toolName, "failure", {
        ...(metadata ?? {}),
        durationMs,
        error: error instanceof Error ? error.message : String(error).slice(0, MAX_METADATA_VALUE_LENGTH),
      });
      throw error;
    }
  };
}

// ── Signal-Specific Hooks ──

/**
 * Emit a pulse signal when an evolution case opens.
 * Pulse can use this to update the developer dashboard.
 */
export async function emitCaseOpenedSignal(caseId: string, label: string): Promise<void> {
  await emitAudit({
    source: SERVER_NAME,
    tool: "case_opened",
    status: "success",
    metadata: {
      caseId,
      label,
      targetType: "evolution_case",
    },
  });
}

/**
 * Emit a pulse signal when a cycle signal is recorded.
 * Pulse can use this to update the control room visualization.
 */
export async function emitSignalRecordedSignal(
  caseId: string,
  signalType: string,
  weight: number,
): Promise<void> {
  await emitAudit({
    source: SERVER_NAME,
    tool: "signal_recorded",
    status: "success",
    metadata: {
      caseId,
      signalType,
      weight,
      targetType: "cycle_signal",
    },
  });
}

/**
 * Emit a pulse signal when a handoff is recorded.
 * Pulse can use this to update the handoff timeline.
 */
export async function emitHandoffRecordedSignal(
  caseId: string,
  from: string,
  to: string,
  status: string,
): Promise<void> {
  await emitAudit({
    source: SERVER_NAME,
    tool: "handoff_recorded",
    status: "success",
    metadata: {
      caseId,
      from,
      to,
      status,
      targetType: "handoff",
    },
  });
}

/**
 * Emit a pulse signal when an endpoint spec is upserted.
 * Pulse can use this to update the endpoint readiness dashboard.
 */
export async function emitEndpointUpsertedSignal(
  caseId: string,
  endpointId: string,
  label: string,
  status: string,
): Promise<void> {
  await emitAudit({
    source: SERVER_NAME,
    tool: "endpoint_upserted",
    status: "success",
    metadata: {
      caseId,
      endpointId,
      label,
      status,
      targetType: "endpoint_spec",
    },
  });
}

/**
 * Emit a pulse signal when a cycle advances.
 * Pulse can use this to update the beat rail visualization.
 */
export async function emitBeatAdvancedSignal(
  caseId: string,
  direction: string,
  currentBeat: string,
): Promise<void> {
  await emitAudit({
    source: SERVER_NAME,
    tool: "beat_advanced",
    status: "success",
    metadata: {
      caseId,
      direction,
      currentBeat,
      targetType: "beat_advance",
    },
  });
}

/**
 * Emit a pulse signal when a promotion gate is evaluated.
 * Pulse can use this to update the promotion status.
 */
export async function emitPromotionGateEvaluatedSignal(
  caseId: string,
  gateDecision: string,
  score: number,
): Promise<void> {
  await emitAudit({
    source: SERVER_NAME,
    tool: "promotion_gate_evaluated",
    status: "success",
    metadata: {
      caseId,
      gateDecision,
      score,
      targetType: "promotion_gate",
    },
  });
}
