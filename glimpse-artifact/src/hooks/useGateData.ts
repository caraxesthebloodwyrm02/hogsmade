import type { AuditEvent, WorkflowRun } from "@/components/phase4/types";
import { createDebugLogContext, toUtcIsoString } from "@/lib/debugTime";
import { useEffect, useState } from "react";

// ── GATE-specific types ─────────────────────────────────────────────

export interface NonceEntry {
  nonce: string;
  usedAt: string;
  envelopeId: string;
  status: "active" | "consumed" | "expired";
}

export interface Deployment {
  id: string;
  envelopeName: string;
  deployedAt: string;
  riskScore: number;
  result: "success" | "failure" | "rollback";
}

export interface UseGateDataResult {
  verifications: WorkflowRun[];
  auditEvents: AuditEvent[];
  nonces: NonceEntry[];
  deployments: Deployment[];
  loading: boolean;
  error: string | null;
  debugContext: ReturnType<typeof createDebugLogContext> | null;
}

const GATE_STEPS = [
  "envelope_exists",
  "payload_integrity",
  "fingerprint_match",
  "nonce_valid",
  "timestamp_fresh",
  "tests_verified",
  "scope_present",
  "deploy_within_scope",
  "audit_log",
] as const;

function stepLabel(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function offsetIso(baseMs: number, deltaMs: number): string {
  return toUtcIsoString(baseMs + deltaMs);
}

export function createGateSnapshot(now = Date.now()) {
  const debugContext = createDebugLogContext("gate-flow", now);

  // ── Real data: GATE/results/envelope_GRID-main_fec6aa7f.json ────────
  // Actual 9-step verification that passed on 2026-03-07, 4.6ms total
  const REAL_RESULT_STEPS: {
    step: string;
    passed: boolean;
    details: string;
  }[] = [
    {
      step: "envelope_exists",
      passed: true,
      details: "Envelope envelope_GRID-main_fec6aa7f loaded",
    },
    { step: "payload_integrity", passed: true, details: "Hash matches" },
    { step: "fingerprint_match", passed: true, details: "Fingerprint valid" },
    {
      step: "nonce_valid",
      passed: true,
      details: "Nonce is valid and unburned",
    },
    {
      step: "timestamp_fresh",
      passed: true,
      details: "Envelope age 14.1s < 600.0s",
    },
    { step: "tests_verified", passed: true, details: "tests_passed=True" },
    { step: "scope_present", passed: true, details: "Scope has 2 permissions" },
    {
      step: "deploy_within_scope",
      passed: true,
      details: "Action read_only permitted",
    },
    { step: "audit_log", passed: true, details: "Nonce burned=True" },
  ];

  // ── Real data: GATE/incoming/envelope_GRID-main_2026-03-07_230319.json
  const REAL_ENVELOPE_TS = "2026-03-07T23:09:04.591Z";
  const REAL_ENVELOPE_ID = "edb45829-9ae6-46b9-b48c-21f6ea7dae71";
  const REAL_NONCE = "c8409de95f794569842e081b626f6256";

  const verifications: WorkflowRun[] = [
    {
      id: "envelope_GRID-main_fec6aa7f",
      workflowName: "GRID-main v2.6.1 — feature/search-service-guardrail",
      status: "completed",
      startedAt: REAL_ENVELOPE_TS,
      completedAt: "2026-03-07T23:09:09.191Z",
      elapsedMs: 5,
      steps: REAL_RESULT_STEPS.map((s) => ({
        name: stepLabel(s.step),
        status: "done" as const,
        durationMs: Math.round((4.6 / 9) * 1000) / 1000,
      })),
    },
    {
      id: "env-transport-floor",
      workflowName: "Transport floor logic — data sorting validation",
      status: "running",
      startedAt: offsetIso(now, -300000),
      elapsedMs: 300000,
      steps: [
        {
          name: "Signal Signature Scan",
          status: "done" as const,
          durationMs: 120,
        },
        {
          name: "Growth Pattern Scan",
          status: "done" as const,
          durationMs: 95,
        },
        {
          name: "Temporal Distance Scan",
          status: "done" as const,
          durationMs: 88,
        },
        {
          name: "Influence Link Scan",
          status: "done" as const,
          durationMs: 74,
        },
        { name: "Semantic Proximity Scan", status: "running" as const },
        { name: "Floor Assignment", status: "pending" as const },
      ],
    },
  ];

  const auditEvents: AuditEvent[] = [
    {
      id: "ga-real-1",
      timestamp: REAL_ENVELOPE_TS,
      tool: "validate_envelope",
      source: "Seeds-Deploy.ps1",
      status: "success",
      durationMs: 5,
      summary: `Envelope ${REAL_ENVELOPE_ID} passed all 9 checks in 4.6ms. Commit 4ff0d47. trace=${debugContext.traceId}`,
    },
    {
      id: "ga-real-2",
      timestamp: REAL_ENVELOPE_TS,
      tool: "nonce_status",
      source: "Seeds-Deploy.ps1",
      status: "success",
      durationMs: 1,
      summary: `Nonce ${REAL_NONCE.slice(0, 8)}… burned for ${REAL_ENVELOPE_ID.slice(0, 8)}…`,
    },
    {
      id: "ga-real-3",
      timestamp: offsetIso(now, -300000),
      tool: "transport_evaluate",
      source: "transport-floor-logic",
      status: "dry_run",
      durationMs: 300000,
      summary: `Transport floor evaluation in progress — 4/5 conditions scored. span=${debugContext.spanId}`,
    },
  ];

  // ── Real data: GATE/.nonce_registry.json ─────────────────────────────
  const nonces: NonceEntry[] = [
    {
      nonce: REAL_NONCE.slice(0, 8),
      usedAt: REAL_ENVELOPE_TS,
      envelopeId: REAL_ENVELOPE_ID.slice(0, 13),
      status: "active", // Real registry shows burned=false
    },
  ];

  const deployments: Deployment[] = [
    {
      id: "dep-real-1",
      envelopeName: "GRID-main v2.6.1 (4ff0d47)",
      deployedAt: REAL_ENVELOPE_TS,
      riskScore: 5, // read_only scope, tests+lint passed → low risk
      result: "success",
    },
  ];

  return { verifications, auditEvents, nonces, deployments, debugContext };
}

// ── Hook ─────────────────────────────────────────────────────────────
// Currently returns mock data with simulated loading.
// When 4.3 polling lands, swap internals to read from grid-server API
// (GATE_DIR files: incoming/*.json, results/*.json, audit.ndjson,
//  .nonce_registry.json) without changing the return shape.

export function useGateData(): UseGateDataResult {
  const [verifications, setVerifications] = useState<WorkflowRun[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [nonces, setNonces] = useState<NonceEntry[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error] = useState<string | null>(null);
  const [debugContext, setDebugContext] = useState<ReturnType<
    typeof createDebugLogContext
  > | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const snapshot = createGateSnapshot();
      setVerifications(snapshot.verifications);
      setAuditEvents(snapshot.auditEvents);
      setNonces(snapshot.nonces);
      setDeployments(snapshot.deployments);
      setDebugContext(snapshot.debugContext);
      setLoading(false);
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  return {
    verifications,
    auditEvents,
    nonces,
    deployments,
    loading,
    error,
    debugContext,
  };
}
