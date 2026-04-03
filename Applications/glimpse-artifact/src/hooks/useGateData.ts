import type { AuditEvent, WorkflowRun } from "@/components/phase4/types";
import { createDebugLogContext } from "@/lib/debugTime";
import { useDataSource } from "./useDataSource";

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
  retry: () => void;
  debugContext: ReturnType<typeof createDebugLogContext> | null;
}

export const GATE_STEPS = [
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

// ── API response types ──────────────────────────────────────────────

interface GateApiResponse {
  nonces: Array<{
    nonce: string;
    status: "active" | "consumed" | "expired";
    createdAt: string;
    burnedAt: string | null;
    envelopeId: string;
    source: string;
  }>;
  envelopes: Array<{
    id: string;
    passed: boolean;
    steps: Array<{ step: string; passed: boolean; details: string }>;
    durationMs: number;
    nonceBurned: boolean;
  }>;
  maxAgeSeconds: number;
}

interface GateSnapshot {
  verifications: WorkflowRun[];
  auditEvents: AuditEvent[];
  nonces: NonceEntry[];
  deployments: Deployment[];
  debugContext: ReturnType<typeof createDebugLogContext>;
}

function transformGateResponse(api: GateApiResponse): GateSnapshot {
  const debugContext = createDebugLogContext("gate-flow");

  const verifications: WorkflowRun[] = api.envelopes.map((env) => ({
    id: env.id,
    workflowName: `Envelope: ${env.id}`,
    status: env.passed ? ("completed" as const) : ("failed" as const),
    startedAt: new Date().toISOString(),
    elapsedMs: env.durationMs,
    steps: env.steps.map((s) => ({
      name: stepLabel(s.step),
      status: s.passed ? ("done" as const) : ("failed" as const),
      durationMs: Math.round((env.durationMs / env.steps.length) * 1000) / 1000,
    })),
  }));

  const auditEvents: AuditEvent[] = api.envelopes.map((env, i) => ({
    id: `gate-audit-${i}`,
    timestamp: new Date().toISOString(),
    tool: "validate_envelope",
    source: "grid-server",
    status: env.passed ? ("success" as const) : ("failure" as const),
    durationMs: env.durationMs,
    summary: `Envelope ${env.id} ${env.passed ? "passed" : "failed"} ${env.steps.length} checks in ${env.durationMs.toFixed(1)}ms`,
  }));

  const nonces: NonceEntry[] = api.nonces.map((n) => ({
    nonce: n.nonce,
    usedAt: n.burnedAt ?? n.createdAt,
    envelopeId: n.envelopeId.slice(0, 13),
    status: n.status,
  }));

  const deployments: Deployment[] = api.envelopes
    .filter((env) => env.passed)
    .map((env, i) => ({
      id: `dep-${i}`,
      envelopeName: env.id,
      deployedAt: new Date().toISOString(),
      riskScore: env.passed ? 5 : 80,
      result: env.passed ? ("success" as const) : ("failure" as const),
    }));

  return { verifications, auditEvents, nonces, deployments, debugContext };
}

// ── Mock fallback ───────────────────────────────────────────────────

const MOCK_GATE_DATA: GateSnapshot = (() => {
  const debugContext = createDebugLogContext("gate-flow");
  return {
    verifications: [
      {
        id: "envelope_GRID-main_fec6aa7f",
        workflowName: "GRID-main v2.6.1 — feature/search-service-guardrail",
        status: "completed" as const,
        startedAt: "2026-03-07T23:09:04.591Z",
        completedAt: "2026-03-07T23:09:09.191Z",
        elapsedMs: 5,
        steps: GATE_STEPS.map((s) => ({
          name: stepLabel(s),
          status: "done" as const,
          durationMs: 0.511,
        })),
      },
    ],
    auditEvents: [
      {
        id: "ga-real-1",
        timestamp: "2026-03-07T23:09:04.591Z",
        tool: "validate_envelope",
        source: "grid-server",
        status: "success" as const,
        durationMs: 5,
        summary: "Envelope passed all 9 checks in 4.6ms",
      },
    ],
    nonces: [
      {
        nonce: "c8409de9",
        usedAt: "2026-03-07T23:09:04.591Z",
        envelopeId: "edb45829-9ae6",
        status: "consumed" as const,
      },
    ],
    deployments: [
      {
        id: "dep-real-1",
        envelopeName: "GRID-main v2.6.1 (4ff0d47)",
        deployedAt: "2026-03-07T23:09:04.591Z",
        riskScore: 5,
        result: "success" as const,
      },
    ],
    debugContext,
  };
})();

// ── Deterministic snapshot factory (used by tests) ─────────────────

export function createGateSnapshot(clock: number | string | Date = Date.now()): GateSnapshot {
  const debugContext = createDebugLogContext("gate-flow", clock);

  const verifications: WorkflowRun[] = [
    {
      id: "envelope_GRID-main_fec6aa7f",
      workflowName: "GRID-main v2.6.1 — feature/search-service-guardrail",
      status: "completed" as const,
      startedAt: "2026-03-07T23:09:04.591Z",
      elapsedMs: 5,
      steps: GATE_STEPS.map((s) => ({
        name: stepLabel(s),
        status: "done" as const,
        durationMs: 0.511,
      })),
    },
    {
      id: "envelope_echoes_b3c7d2e1",
      workflowName: "echoes v1.3.0 — fix/audit-rotation",
      status: "completed" as const,
      startedAt: "2026-03-07T23:12:18.204Z",
      elapsedMs: 4,
      steps: GATE_STEPS.map((s) => ({
        name: stepLabel(s),
        status: "done" as const,
        durationMs: 0.444,
      })),
    },
  ];

  const auditEvents: AuditEvent[] = [
    {
      id: "ga-snap-1",
      timestamp: "2026-03-07T23:09:04.591Z",
      tool: "validate_envelope",
      source: "grid-server",
      status: "success" as const,
      durationMs: 5,
      summary: `Envelope passed all 9 checks in 4.6ms trace=${debugContext.traceId}`,
    },
    {
      id: "ga-snap-2",
      timestamp: "2026-03-07T23:12:18.204Z",
      tool: "validate_envelope",
      source: "echoes-server",
      status: "success" as const,
      durationMs: 4,
      summary: "Envelope passed all 9 checks in 3.8ms",
    },
    {
      id: "ga-snap-3",
      timestamp: "2026-03-07T23:15:00.000Z",
      tool: "nonce_audit",
      source: "grid-server",
      status: "success" as const,
      durationMs: 1,
      summary: `Nonce rotation completed span=${debugContext.spanId}`,
    },
  ];

  const nonces: NonceEntry[] = [
    {
      nonce: "c8409de9",
      usedAt: "2026-03-07T23:09:04.591Z",
      envelopeId: "edb45829-9ae6",
      status: "consumed" as const,
    },
  ];

  const deployments: Deployment[] = [
    {
      id: "dep-snap-1",
      envelopeName: "GRID-main v2.6.1 (4ff0d47)",
      deployedAt: "2026-03-07T23:09:04.591Z",
      riskScore: 5,
      result: "success" as const,
    },
  ];

  return { verifications, auditEvents, nonces, deployments, debugContext };
}

// ── Hook ────────────────────────────────────────────────────────────

export function useGateData(): UseGateDataResult {
  const { data, loading, error, retry } = useDataSource<GateSnapshot>({
    fetcher: async (signal) => {
      const res = await fetch("/api/gate/status", { signal });
      if (!res.ok) throw new Error(`GATE API error: ${res.status}`);
      const api = (await res.json()) as GateApiResponse;
      return transformGateResponse(api);
    },
    mock: MOCK_GATE_DATA,
    pollMs: 120_000,
  });

  return {
    verifications: data.verifications,
    auditEvents: data.auditEvents,
    nonces: data.nonces,
    deployments: data.deployments,
    loading,
    error,
    retry,
    debugContext: data.debugContext ?? null,
  };
}
