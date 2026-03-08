<<<<<<< C:/Users/USER/CascadeProjects/glimpse-artifact/src/hooks/useGateData.ts
import { useEffect, useState } from 'react';
import type { AuditEvent, WorkflowRun } from '../components/phase4/types.ts';
import { createDebugLogContext, toUtcIsoString } from '../lib/debugTime.ts';
||||||| C:/Users/USER/.windsurf/worktrees/CascadeProjects/CascadeProjects-f61c48a1/glimpse-artifact/src/hooks/useGateData.ts.base
import { useState, useEffect } from 'react';
import type { AuditEvent, WorkflowRun } from '@/components/phase4/types';

// ── GATE-specific types ─────────────────────────────────────────────
=======
import type { AuditEvent, WorkflowRun } from "@/components/phase4/types";
import { useEffect, useState } from "react";

// ── GATE-specific types ─────────────────────────────────────────────
>>>>>>> C:/Users/USER/.windsurf/worktrees/CascadeProjects/CascadeProjects-f61c48a1/glimpse-artifact/src/hooks/useGateData.ts

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

<<<<<<< C:/Users/USER/CascadeProjects/glimpse-artifact/src/hooks/useGateData.ts
function offsetIso(baseMs: number, deltaMs: number): string {
  return toUtcIsoString(baseMs + deltaMs);
}

export function createGateSnapshot(now = Date.now()) {
  const debugContext = createDebugLogContext('gate-flow', now);

  const verifications: WorkflowRun[] = [
    {
      id: 'env-1',
      workflowName: 'GRID-main_2026-03-07_230319',
      status: 'completed',
      startedAt: offsetIso(now, -3600000),
      completedAt: offsetIso(now, -3540000),
      elapsedMs: 60000,
      steps: GATE_STEPS.map((name, index) => ({
        name: stepLabel(name),
        status: 'done' as const,
        durationMs: 80 + index * 45,
      })),
    },
    {
      id: 'env-2',
      workflowName: 'GRID-main_2026-03-08_041500',
      status: 'running',
      startedAt: offsetIso(now, -1800000),
      elapsedMs: 45000,
      steps: GATE_STEPS.map((name, index) => ({
        name: stepLabel(name),
        status: index < 5 ? ('done' as const) : index === 5 ? ('running' as const) : ('pending' as const),
        durationMs: index < 5 ? 120 + index * 30 : undefined,
      })),
    },
    {
      id: 'env-3',
      workflowName: 'GRID-main_2026-03-08_052600',
      status: 'pending',
      startedAt: offsetIso(now, 0),
      steps: GATE_STEPS.map((name) => ({
        name: stepLabel(name),
        status: 'pending' as const,
      })),
    },
  ];

  const auditEvents: AuditEvent[] = [
    {
      id: 'ga-1',
      timestamp: offsetIso(now, -3600000),
      tool: 'validate_envelope',
      source: 'grid-server',
      status: 'success',
      durationMs: 820,
      summary: `Envelope GRID-main_2026-03-07_230319 passed all 9 checks. trace=${debugContext.traceId}`,
    },
    {
      id: 'ga-2',
      timestamp: offsetIso(now, -3500000),
      tool: 'nonce_status',
      source: 'grid-server',
      status: 'success',
      durationMs: 12,
      summary: 'Nonce a1b2c3d4 consumed for env-1.',
    },
    {
      id: 'ga-3',
      timestamp: offsetIso(now, -1800000),
      tool: 'validate_envelope',
      source: 'grid-server',
      status: 'dry_run',
      durationMs: 450,
      summary: `Envelope GRID-main_2026-03-08_041500 in progress (step 6/9). span=${debugContext.spanId}`,
    },
    {
      id: 'ga-4',
      timestamp: offsetIso(now, 0),
      tool: 'check_permission',
      source: 'grid-server',
      status: 'blocked',
      summary: 'Envelope GRID-main_2026-03-08_052600 awaiting verification.',
    },
  ];

  const nonces: NonceEntry[] = [
    { nonce: 'a1b2c3d4', usedAt: offsetIso(now, -3600000), envelopeId: 'env-1', status: 'consumed' },
    { nonce: 'e5f6g7h8', usedAt: offsetIso(now, -1800000), envelopeId: 'env-2', status: 'active' },
    { nonce: 'i9j0k1l2', usedAt: offsetIso(now, 0), envelopeId: 'env-3', status: 'active' },
  ];

  const deployments: Deployment[] = [
    { id: 'dep-1', envelopeName: 'GRID-main_2026-03-06', deployedAt: offsetIso(now, -86400000), riskScore: 8, result: 'success' },
    { id: 'dep-2', envelopeName: 'GRID-main_2026-03-05', deployedAt: offsetIso(now, -172800000), riskScore: 15, result: 'success' },
    { id: 'dep-3', envelopeName: 'GRID-main_2026-03-04', deployedAt: offsetIso(now, -259200000), riskScore: 45, result: 'rollback' },
  ];

  return { verifications, auditEvents, nonces, deployments, debugContext };
}
||||||| C:/Users/USER/.windsurf/worktrees/CascadeProjects/CascadeProjects-f61c48a1/glimpse-artifact/src/hooks/useGateData.ts.base
// ── Mock data ───────────────────────────────────────────────────────

const MOCK_VERIFICATIONS: WorkflowRun[] = [
  {
    id: 'env-1',
    workflowName: 'GRID-main_2026-03-07_230319',
    status: 'completed',
    startedAt: new Date(Date.now() - 3600000).toISOString(),
    completedAt: new Date(Date.now() - 3540000).toISOString(),
    elapsedMs: 60000,
    steps: GATE_STEPS.map((name) => ({
      name: stepLabel(name),
      status: 'done' as const,
      durationMs: Math.floor(Math.random() * 500) + 50,
    })),
  },
  {
    id: 'env-2',
    workflowName: 'GRID-main_2026-03-08_041500',
    status: 'running',
    startedAt: new Date(Date.now() - 1800000).toISOString(),
    elapsedMs: 45000,
    steps: GATE_STEPS.map((name, i) => ({
      name: stepLabel(name),
      status: i < 5 ? ('done' as const) : i === 5 ? ('running' as const) : ('pending' as const),
      durationMs: i < 5 ? Math.floor(Math.random() * 500) + 50 : undefined,
    })),
  },
  {
    id: 'env-3',
    workflowName: 'GRID-main_2026-03-08_052600',
    status: 'pending',
    startedAt: new Date().toISOString(),
    steps: GATE_STEPS.map((name) => ({
      name: stepLabel(name),
      status: 'pending' as const,
    })),
  },
];

const MOCK_GATE_AUDIT: AuditEvent[] = [
  {
    id: 'ga-1',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    tool: 'validate_envelope',
    source: 'grid-server',
    status: 'success',
    durationMs: 820,
    summary: 'Envelope GRID-main_2026-03-07_230319 passed all 9 checks.',
  },
  {
    id: 'ga-2',
    timestamp: new Date(Date.now() - 3500000).toISOString(),
    tool: 'nonce_status',
    source: 'grid-server',
    status: 'success',
    durationMs: 12,
    summary: 'Nonce a1b2c3d4 consumed for env-1.',
  },
  {
    id: 'ga-3',
    timestamp: new Date(Date.now() - 1800000).toISOString(),
    tool: 'validate_envelope',
    source: 'grid-server',
    status: 'dry_run',
    durationMs: 450,
    summary: 'Envelope GRID-main_2026-03-08_041500 in progress (step 6/9).',
  },
  {
    id: 'ga-4',
    timestamp: new Date().toISOString(),
    tool: 'check_permission',
    source: 'grid-server',
    status: 'blocked',
    summary: 'Envelope GRID-main_2026-03-08_052600 awaiting verification.',
  },
];

const MOCK_NONCES: NonceEntry[] = [
  { nonce: 'a1b2c3d4', usedAt: new Date(Date.now() - 3600000).toISOString(), envelopeId: 'env-1', status: 'consumed' },
  { nonce: 'e5f6g7h8', usedAt: new Date(Date.now() - 1800000).toISOString(), envelopeId: 'env-2', status: 'active' },
  { nonce: 'i9j0k1l2', usedAt: new Date().toISOString(), envelopeId: 'env-3', status: 'active' },
];

const MOCK_DEPLOYMENTS: Deployment[] = [
  { id: 'dep-1', envelopeName: 'GRID-main_2026-03-06', deployedAt: new Date(Date.now() - 86400000).toISOString(), riskScore: 8, result: 'success' },
  { id: 'dep-2', envelopeName: 'GRID-main_2026-03-05', deployedAt: new Date(Date.now() - 172800000).toISOString(), riskScore: 15, result: 'success' },
  { id: 'dep-3', envelopeName: 'GRID-main_2026-03-04', deployedAt: new Date(Date.now() - 259200000).toISOString(), riskScore: 45, result: 'rollback' },
];

// ── Hook ─────────────────────────────────────────────────────────────
// Currently returns mock data with simulated loading.
// When 4.3 polling lands, swap internals to read from grid-server API
// (GATE_DIR files: incoming/*.json, results/*.json, audit.ndjson,
//  .nonce_registry.json) without changing the return shape.
=======
// ── Mock data ───────────────────────────────────────────────────────
// Pre-generate random values to ensure consistency across renders
const generateMockVerifications = (): WorkflowRun[] => [
  {
    id: "env-1",
    workflowName: "GRID-main_2026-03-07_230319",
    status: "completed",
    startedAt: new Date(Date.now() - 3600000).toISOString(),
    completedAt: new Date(Date.now() - 3540000).toISOString(),
    elapsedMs: 60000,
    steps: GATE_STEPS.map((name) => ({
      name: stepLabel(name),
      status: "done" as const,
      durationMs: Math.floor(Math.random() * 500) + 50,
    })),
  },
  {
    id: "env-2",
    workflowName: "GRID-main_2026-03-08_041500",
    status: "running",
    startedAt: new Date(Date.now() - 1800000).toISOString(),
    elapsedMs: 45000,
    steps: GATE_STEPS.map((name, i) => ({
      name: stepLabel(name),
      status:
        i < 5
          ? ("done" as const)
          : i === 5
            ? ("running" as const)
            : ("pending" as const),
      durationMs: i < 5 ? Math.floor(Math.random() * 500) + 50 : undefined,
    })),
  },
  {
    id: "env-3",
    workflowName: "GRID-main_2026-03-08_052600",
    status: "pending",
    startedAt: new Date().toISOString(),
    steps: GATE_STEPS.map((name) => ({
      name: stepLabel(name),
      status: "pending" as const,
    })),
  },
];

const MOCK_VERIFICATIONS = generateMockVerifications();

const MOCK_GATE_AUDIT: AuditEvent[] = [
  {
    id: "ga-1",
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    tool: "validate_envelope",
    source: "grid-server",
    status: "success",
    durationMs: 820,
    summary: "Envelope GRID-main_2026-03-07_230319 passed all 9 checks.",
  },
  {
    id: "ga-2",
    timestamp: new Date(Date.now() - 3500000).toISOString(),
    tool: "nonce_status",
    source: "grid-server",
    status: "success",
    durationMs: 12,
    summary: "Nonce a1b2c3d4 consumed for env-1.",
  },
  {
    id: "ga-3",
    timestamp: new Date(Date.now() - 1800000).toISOString(),
    tool: "validate_envelope",
    source: "grid-server",
    status: "dry_run",
    durationMs: 450,
    summary: "Envelope GRID-main_2026-03-08_041500 in progress (step 6/9).",
  },
  {
    id: "ga-4",
    timestamp: new Date().toISOString(),
    tool: "check_permission",
    source: "grid-server",
    status: "blocked",
    summary: "Envelope GRID-main_2026-03-08_052600 awaiting verification.",
  },
];

const MOCK_NONCES: NonceEntry[] = [
  {
    nonce: "a1b2c3d4",
    usedAt: new Date(Date.now() - 3600000).toISOString(),
    envelopeId: "env-1",
    status: "consumed",
  },
  {
    nonce: "e5f6g7h8",
    usedAt: new Date(Date.now() - 1800000).toISOString(),
    envelopeId: "env-2",
    status: "active",
  },
  {
    nonce: "i9j0k1l2",
    usedAt: new Date().toISOString(),
    envelopeId: "env-3",
    status: "active",
  },
];

const MOCK_DEPLOYMENTS: Deployment[] = [
  {
    id: "dep-1",
    envelopeName: "GRID-main_2026-03-06",
    deployedAt: new Date(Date.now() - 86400000).toISOString(),
    riskScore: 8,
    result: "success",
  },
  {
    id: "dep-2",
    envelopeName: "GRID-main_2026-03-05",
    deployedAt: new Date(Date.now() - 172800000).toISOString(),
    riskScore: 15,
    result: "success",
  },
  {
    id: "dep-3",
    envelopeName: "GRID-main_2026-03-04",
    deployedAt: new Date(Date.now() - 259200000).toISOString(),
    riskScore: 45,
    result: "rollback",
  },
];

// ── Hook ─────────────────────────────────────────────────────────────
// Currently returns mock data with simulated loading.
// When 4.3 polling lands, swap internals to read from grid-server API
// (GATE_DIR files: incoming/*.json, results/*.json, audit.ndjson,
//  .nonce_registry.json) without changing the return shape.
>>>>>>> C:/Users/USER/.windsurf/worktrees/CascadeProjects/CascadeProjects-f61c48a1/glimpse-artifact/src/hooks/useGateData.ts

export function useGateData(): UseGateDataResult {
  const [verifications, setVerifications] = useState<WorkflowRun[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [nonces, setNonces] = useState<NonceEntry[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error] = useState<string | null>(null);
  const [debugContext, setDebugContext] = useState<ReturnType<typeof createDebugLogContext> | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const snapshot = createGateSnapshot();
      setVerifications(snapshot.verifications);
      setAuditEvents(snapshot.auditEvents);
      setNonces(snapshot.nonces);
      setDeployments(snapshot.deployments);
      setDebugContext(snapshot.debugContext);
      setLoading(false);
<<<<<<< C:/Users/USER/CascadeProjects/glimpse-artifact/src/hooks/useGateData.ts
      console.info('gate.debug.snapshot_loaded', snapshot.debugContext);
    }, 600);

||||||| C:/Users/USER/.windsurf/worktrees/CascadeProjects/CascadeProjects-f61c48a1/glimpse-artifact/src/hooks/useGateData.ts.base
    }, 600);
=======
    }, 200); // Reduced from 600ms for better UX
>>>>>>> C:/Users/USER/.windsurf/worktrees/CascadeProjects/CascadeProjects-f61c48a1/glimpse-artifact/src/hooks/useGateData.ts
    return () => clearTimeout(timer);
  }, []);

  return { verifications, auditEvents, nonces, deployments, loading, error, debugContext };
}
