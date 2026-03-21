import { AuditTimeline, WorkflowStatusCard } from "@/components/phase4";
import { useGateData } from "@/hooks/useGateData";
import type { NonceEntry, Deployment } from "@/hooks/useGateData";
import { formatDebugTimestamp } from "@/lib/debugTime";
import { useState } from "react";
import type { WorkflowRun } from "@/components/phase4/types";
import { X, Shield, Clock, CheckCircle, XCircle } from "lucide-react";

// ── Style helpers ───────────────────────────────────────────────────

const NONCE_STYLE: Record<NonceEntry["status"], { color: string; bg: string }> =
{
  active: { color: "var(--teal-500)", bg: "var(--teal-100)" },
  consumed: { color: "var(--ink-muted)", bg: "var(--surface-raised)" },
  expired: { color: "var(--rose-500)", bg: "var(--rose-100)" },
};

const RESULT_STYLE: Record<
  Deployment["result"],
  { label: string; color: string; bg: string }
> = {
  success: {
    label: "Deployed",
    color: "var(--emerald-500)",
    bg: "var(--emerald-100)",
  },
  failure: { label: "Failed", color: "var(--rose-500)", bg: "var(--rose-100)" },
  rollback: {
    label: "Rolled back",
    color: "var(--amber-400)",
    bg: "var(--amber-100)",
  },
};

function riskColor(score: number): string {
  if (score <= 20) return "var(--emerald-500)";
  if (score <= 40) return "var(--amber-400)";
  return "var(--rose-500)";
}

function formatDate(ts: string): string {
  return formatDebugTimestamp(ts);
}

// ── Envelope Detail Drawer (G4) ─────────────────────────────────────

function EnvelopeDrawer({ run, onClose }: { run: WorkflowRun; onClose: () => void }) {
  const passed = run.steps.filter((s) => s.status === "done").length;
  const failed = run.steps.filter((s) => s.status === "failed").length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-[var(--surface)] border-l border-border-color shadow-2xl overflow-y-auto animate-fade-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-[var(--glass-fill)] backdrop-blur-xl border-b border-border-color p-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-teal-500" />
            <h3 className="font-body text-[11px] font-medium uppercase tracking-[0.08em] text-ink">Envelope Detail</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-raised transition-colors">
            <X className="w-4 h-4 text-ink-muted" />
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* Summary */}
          <div className="space-y-2">
            <div className="text-xs text-ink-muted font-body uppercase tracking-wider">Envelope</div>
            <div className="font-mono text-sm text-ink break-all">{run.id}</div>
            <div className="font-body text-sm text-ink-muted">{run.workflowName}</div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border-color/50 bg-canvas-bg p-3 text-center">
              <div className="font-mono text-lg font-bold text-ink">{run.steps.length}</div>
              <div className="text-[10px] text-ink-muted">Steps</div>
            </div>
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
              <div className="font-mono text-lg font-bold text-emerald-500">{passed}</div>
              <div className="text-[10px] text-emerald-500/70">Passed</div>
            </div>
            <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3 text-center">
              <div className="font-mono text-lg font-bold text-rose-500">{failed}</div>
              <div className="text-[10px] text-rose-500/70">Failed</div>
            </div>
          </div>

          {/* Timing */}
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <Clock className="w-4 h-4" />
            <span className="font-mono">{run.elapsedMs?.toFixed(1) ?? "—"}ms</span>
            <span className="font-body">total</span>
          </div>

          {/* Step breakdown */}
          <div>
            <div className="text-xs text-ink-muted font-body uppercase tracking-wider mb-3">Step Breakdown</div>
            <div className="space-y-1.5">
              {run.steps.map((step, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-lg border border-border-color/30 bg-canvas-bg px-3 py-2"
                >
                  {step.status === "done" ? (
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : step.status === "failed" ? (
                    <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-gray-500/30 shrink-0" />
                  )}
                  <span className="text-sm text-ink flex-1 font-body">{step.name}</span>
                  {step.durationMs != null && (
                    <span className="text-[11px] font-mono text-ink-muted">{step.durationMs.toFixed(3)}ms</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Raw JSON */}
          <details className="group">
            <summary className="text-xs text-ink-muted font-body cursor-pointer hover:text-ink transition-colors">
              Raw envelope data
            </summary>
            <pre className="mt-2 text-[11px] font-mono text-ink-muted bg-canvas-bg rounded-lg border border-border-color/30 p-3 overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(run, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}

// ── GateView ────────────────────────────────────────────────────────

export function GateView() {
  const {
    verifications,
    auditEvents,
    nonces,
    deployments,
    loading,
    debugContext,
  } = useGateData();
  const [drawerRun, setDrawerRun] = useState<WorkflowRun | null>(null);

  return (
    <div className="h-full overflow-y-auto bg-canvas-bg dot-grid font-body">
      <header className="px-6 py-5 border-b border-border-color bg-[var(--glass-fill)] backdrop-blur-xl shadow-token-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-teal-500/50 to-transparent" />
        <div className="relative">
          <h1 className="font-heading text-xl font-bold text-ink" style={{ letterSpacing: '-0.02em' }}>
            GATE Pipeline
          </h1>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted mt-1">
            <span className="text-teal-500">⊞</span> Envelope verification, audit trail, nonce registry, and deployment
            history. Read-only.
          </p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-8">
        {debugContext && (
          <section
            aria-label="Debug trace context"
            className="glass-panel p-4"
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
            className="font-body text-xs font-medium uppercase tracking-[0.08em] text-ink mb-4"
          >
            Envelope verification
          </h2>
          <div className="space-y-4">
            {loading
              ? Array.from({ length: 3 }).map((_, i) => (
                <WorkflowStatusCard key={`loading-${i}`} loading />
              ))
              : verifications.map((run) => (
                <div key={run.id} onClick={() => setDrawerRun(run)} className="cursor-pointer">
                  <WorkflowStatusCard data={run} loading={false} />
                </div>
              ))}
          </div>
        </section>

        {/* ── Verification audit trail (uses AuditTimeline) ────────── */}
        <section aria-labelledby="audit-heading">
          <h2
            id="audit-heading"
            className="font-body text-xs font-medium uppercase tracking-[0.08em] text-ink mb-4"
          >
            Verification audit trail
          </h2>
          <div className="glass-panel p-4">
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
              className="font-body text-xs font-medium uppercase tracking-[0.08em] text-ink mb-4"
            >
              Nonce registry
            </h2>
            <div className="glass-panel overflow-hidden">
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
                          <td className="text-sm text-ink px-4 py-2 font-mono">
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
              className="font-body text-xs font-medium uppercase tracking-[0.08em] text-ink mb-4"
            >
              Deployment history
            </h2>
            <div className="space-y-3">
              {loading
                ? Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-16 rounded-lg skeleton-shimmer"
                  />
                ))
                : deployments.map((dep) => {
                  const rCfg = RESULT_STYLE[dep.result];
                  return (
                    <div
                      key={dep.id}
                      className="glass-panel p-3 flex items-center justify-between"
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

      {/* G4: Envelope detail drawer */}
      {drawerRun && <EnvelopeDrawer run={drawerRun} onClose={() => setDrawerRun(null)} />}
    </div>
  );
}
