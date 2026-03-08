import { AuditTimeline, WorkflowStatusCard } from "@/components/phase4";
<<<<<<< C:/Users/USER/CascadeProjects/glimpse-artifact/src/views/GateView.tsx
import { useGateData } from "@/hooks/useGateData";
import type { NonceEntry, Deployment } from "@/hooks/useGateData";
import { formatDebugTimestamp } from "@/lib/debugTime";
||||||| C:/Users/USER/.windsurf/worktrees/CascadeProjects/CascadeProjects-f61c48a1/glimpse-artifact/src/views/GateView.tsx.base
import { AuditTimeline, WorkflowStatusCard } from '@/components/phase4';
import { useGateData } from '@/hooks/useGateData';
import type { NonceEntry, Deployment } from '@/hooks/useGateData';
=======
import type { Deployment, NonceEntry } from "@/hooks/useGateData";
import { useGateData } from "@/hooks/useGateData";
>>>>>>> C:/Users/USER/.windsurf/worktrees/CascadeProjects/CascadeProjects-f61c48a1/glimpse-artifact/src/views/GateView.tsx

// ── Style helpers ───────────────────────────────────────────────────

const NONCE_STYLE: Record<NonceEntry["status"], { color: string; bg: string }> =
  {
    active: { color: "var(--teal-600)", bg: "var(--teal-100)" },
    consumed: { color: "var(--ink-muted)", bg: "var(--surface-raised)" },
    expired: { color: "var(--rose-600)", bg: "var(--rose-100)" },
  };

const RESULT_STYLE: Record<
  Deployment["result"],
  { label: string; color: string; bg: string }
> = {
  success: {
    label: "Deployed",
    color: "var(--emerald-600)",
    bg: "var(--emerald-100)",
  },
  failure: { label: "Failed", color: "var(--rose-600)", bg: "var(--rose-100)" },
  rollback: {
    label: "Rolled back",
    color: "var(--amber-600)",
    bg: "var(--amber-100)",
  },
};

function riskColor(score: number): string {
  if (score <= 20) return "var(--emerald-500)";
  if (score <= 40) return "var(--amber-400)";
  return "var(--rose-500)";
}

function formatDate(ts: string): string {
<<<<<<< C:/Users/USER/CascadeProjects/glimpse-artifact/src/views/GateView.tsx
  return formatDebugTimestamp(ts);
||||||| C:/Users/USER/.windsurf/worktrees/CascadeProjects/CascadeProjects-f61c48a1/glimpse-artifact/src/views/GateView.tsx.base
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return ts; }
=======
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
>>>>>>> C:/Users/USER/.windsurf/worktrees/CascadeProjects/CascadeProjects-f61c48a1/glimpse-artifact/src/views/GateView.tsx
}

// ── GateView ────────────────────────────────────────────────────────

export function GateView() {
<<<<<<< C:/Users/USER/CascadeProjects/glimpse-artifact/src/views/GateView.tsx
  const {
    verifications,
    auditEvents,
    nonces,
    deployments,
    loading,
    debugContext,
  } = useGateData();
||||||| C:/Users/USER/.windsurf/worktrees/CascadeProjects/CascadeProjects-f61c48a1/glimpse-artifact/src/views/GateView.tsx.base
  const { verifications, auditEvents, nonces, deployments, loading } = useGateData();
=======
  const { verifications, auditEvents, nonces, deployments, loading } =
    useGateData();
>>>>>>> C:/Users/USER/.windsurf/worktrees/CascadeProjects/CascadeProjects-f61c48a1/glimpse-artifact/src/views/GateView.tsx

  return (
    <div className="h-full overflow-y-auto bg-canvas-bg font-body">
      <header className="px-6 py-5 border-b border-border-color bg-canvas-surface">
        <h1 className="font-heading text-xl font-bold text-ink">
          GATE Pipeline
        </h1>
        <p className="font-body text-sm text-ink-muted mt-1">
          Envelope verification, audit trail, nonce registry, and deployment
          history. Read-only.
        </p>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-8">
        {debugContext && (
          <section
            aria-label="Debug trace context"
            className="rounded-lg border border-border-color bg-canvas-surface p-4"
          >
            <div className="flex flex-wrap gap-x-4 gap-y-2 font-body text-xs text-ink-muted">
              <span>trace {debugContext.traceId}</span>
              <span>span {debugContext.spanId}</span>
              <span>utc {debugContext.timestampUtc}</span>
              <span>local {debugContext.timestampLocal}</span>
            </div>
          </section>
        )}

        {/* ── Envelope verification (uses WorkflowStatusCard) ──────── */}
        <section aria-labelledby="flow-heading">
          <h2
            id="flow-heading"
            className="font-heading text-lg font-bold text-ink mb-4"
          >
            Envelope verification
          </h2>
          <div className="space-y-4">
            {loading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <WorkflowStatusCard key={`loading-${i}`} loading />
                ))
              : verifications.map((run) => (
                  <WorkflowStatusCard key={run.id} data={run} loading={false} />
                ))}
          </div>
        </section>

        {/* ── Verification audit trail (uses AuditTimeline) ────────── */}
        <section aria-labelledby="audit-heading">
          <h2
            id="audit-heading"
            className="font-heading text-lg font-bold text-ink mb-4"
          >
            Verification audit trail
          </h2>
          <div className="rounded-lg border border-border-color bg-canvas-surface p-4">
            <AuditTimeline
              events={loading ? [] : auditEvents}
              loading={loading}
              pageSize={5}
            />
          </div>
        </section>

        {/* ── Two-column: Nonce registry + Deployment history ──────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Nonce registry */}
          <section aria-labelledby="nonce-heading">
            <h2
              id="nonce-heading"
              className="font-heading text-lg font-bold text-ink mb-4"
            >
              Nonce registry
            </h2>
            <div className="rounded-lg border border-border-color bg-canvas-surface overflow-hidden">
              <table className="w-full text-left" role="table">
                <thead>
                  <tr className="border-b border-border-color bg-surface-raised">
                    <th className="font-body text-xs font-medium text-ink-muted px-4 py-2">
                      Nonce
                    </th>
                    <th className="font-body text-xs font-medium text-ink-muted px-4 py-2">
                      Status
                    </th>
                    <th className="font-body text-xs font-medium text-ink-muted px-4 py-2">
                      Used
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-4 py-6 text-center text-ink-muted"
                      >
                        Loading...
                      </td>
                    </tr>
                  ) : (
                    nonces.map((n) => {
                      const nCfg = NONCE_STYLE[n.status];
                      return (
                        <tr
                          key={n.nonce}
                          className="border-b border-border-color last:border-0"
                        >
                          <td className="font-body text-sm text-ink px-4 py-2 font-mono">
                            {n.nonce}
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className="font-body text-xs font-medium px-2 py-0.5 rounded-full"
                              style={{
                                color: nCfg.color,
                                backgroundColor: nCfg.bg,
                              }}
                            >
                              {n.status}
                            </span>
                          </td>
                          <td className="font-body text-xs text-ink-muted px-4 py-2">
                            {formatDate(n.usedAt)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Deployment history */}
          <section aria-labelledby="deploy-heading">
            <h2
              id="deploy-heading"
              className="font-heading text-lg font-bold text-ink mb-4"
            >
              Deployment history
            </h2>
            <div className="space-y-3">
              {loading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-16 rounded-lg bg-surface-raised animate-pulse"
                    />
                  ))
                : deployments.map((dep) => {
                    const rCfg = RESULT_STYLE[dep.result];
                    return (
                      <div
                        key={dep.id}
                        className="rounded-lg border border-border-color bg-canvas-surface p-3 shadow-token-sm flex items-center justify-between"
                        role="article"
                        aria-label={`Deployment ${dep.envelopeName}, result: ${rCfg.label}`}
                      >
                        <div>
                          <span className="font-body text-sm font-medium text-ink">
                            {dep.envelopeName}
                          </span>
                          <br />
                          <span className="font-body text-xs text-ink-muted">
                            {formatDate(dep.deployedAt)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className="font-body text-xs font-medium px-2 py-1 rounded-full"
                            style={{
                              color: riskColor(dep.riskScore),
                              backgroundColor: `${riskColor(dep.riskScore)}18`,
                            }}
                          >
                            Risk {dep.riskScore}
                          </span>
                          <span
                            className="font-body text-xs font-medium px-2 py-1 rounded-full"
                            style={{
                              color: rCfg.color,
                              backgroundColor: rCfg.bg,
                            }}
                          >
                            {rCfg.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
