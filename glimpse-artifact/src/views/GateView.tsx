import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface Envelope {
  id: string;
  name: string;
  submittedAt: string;
  status: 'submitted' | 'validated' | 'approved' | 'rejected';
  riskScore?: number;
}

interface NonceEntry {
  nonce: string;
  usedAt: string;
  envelopeId: string;
  status: 'active' | 'consumed' | 'expired';
}

interface Deployment {
  id: string;
  envelopeName: string;
  deployedAt: string;
  riskScore: number;
  result: 'success' | 'failure' | 'rollback';
}

const MOCK_ENVELOPES: Envelope[] = [
  { id: 'env-1', name: 'GRID-main_2026-03-07_230319', submittedAt: new Date(Date.now() - 3600000).toISOString(), status: 'approved', riskScore: 12 },
  { id: 'env-2', name: 'GRID-main_2026-03-08_041500', submittedAt: new Date(Date.now() - 1800000).toISOString(), status: 'validated', riskScore: 28 },
  { id: 'env-3', name: 'GRID-main_2026-03-08_052600', submittedAt: new Date().toISOString(), status: 'submitted' },
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

const STATUS_PIPELINE: Envelope['status'][] = ['submitted', 'validated', 'approved'];

const STATUS_STYLE: Record<Envelope['status'], { label: string; color: string; bg: string }> = {
  submitted: { label: 'Submitted', color: 'var(--ink-muted)', bg: 'var(--surface-raised)' },
  validated: { label: 'Validated', color: 'var(--teal-600)', bg: 'var(--teal-100)' },
  approved:  { label: 'Approved',  color: 'var(--emerald-600)', bg: 'var(--emerald-100)' },
  rejected:  { label: 'Rejected',  color: 'var(--rose-600)', bg: 'var(--rose-100)' },
};

const NONCE_STYLE: Record<NonceEntry['status'], { color: string; bg: string }> = {
  active:   { color: 'var(--teal-600)', bg: 'var(--teal-100)' },
  consumed: { color: 'var(--ink-muted)', bg: 'var(--surface-raised)' },
  expired:  { color: 'var(--rose-600)', bg: 'var(--rose-100)' },
};

const RESULT_STYLE: Record<Deployment['result'], { label: string; color: string; bg: string }> = {
  success:  { label: 'Deployed', color: 'var(--emerald-600)', bg: 'var(--emerald-100)' },
  failure:  { label: 'Failed',   color: 'var(--rose-600)', bg: 'var(--rose-100)' },
  rollback: { label: 'Rolled back', color: 'var(--amber-600)', bg: 'var(--amber-100)' },
};

function riskColor(score: number): string {
  if (score <= 20) return 'var(--emerald-500)';
  if (score <= 40) return 'var(--amber-400)';
  return 'var(--rose-500)';
}

function formatDate(ts: string): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return ts; }
}

export function GateView() {
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [nonces, setNonces] = useState<NonceEntry[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setEnvelopes(MOCK_ENVELOPES);
      setNonces(MOCK_NONCES);
      setDeployments(MOCK_DEPLOYMENTS);
      setLoading(false);
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-canvas-bg font-body">
      <header className="px-6 py-5 border-b border-border-color bg-canvas-surface">
        <h1 className="font-heading text-xl font-bold text-ink">
          GATE Pipeline
        </h1>
        <p className="font-body text-sm text-ink-muted mt-1">
          Envelope flow, nonce registry, and deployment history. Read-only.
        </p>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-8">
        {/* Envelope flow */}
        <section aria-labelledby="flow-heading">
          <h2 id="flow-heading" className="font-heading text-lg font-bold text-ink mb-4">
            Envelope flow
          </h2>

          {loading ? (
            <div className="space-y-3" aria-busy="true">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-20 rounded-lg bg-surface-raised animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {envelopes.map((env) => {
                const stCfg = STATUS_STYLE[env.status];
                const pipelineIndex = STATUS_PIPELINE.indexOf(env.status);
                const isRejected = env.status === 'rejected';

                return (
                  <div
                    key={env.id}
                    className="rounded-lg border border-border-color bg-canvas-surface p-4 shadow-token-sm"
                    role="article"
                    aria-label={`Envelope ${env.name}, status: ${stCfg.label}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <h3 className="font-heading text-base font-bold text-ink">
                          {env.name}
                        </h3>
                        <span className="font-body text-xs text-ink-muted">
                          {formatDate(env.submittedAt)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {env.riskScore != null && (
                          <span
                            className="font-body text-xs font-medium px-2 py-1 rounded-full"
                            style={{ color: riskColor(env.riskScore), backgroundColor: `${riskColor(env.riskScore)}18` }}
                          >
                            Risk {env.riskScore}
                          </span>
                        )}
                        <span
                          className="font-body text-xs font-medium px-2 py-1 rounded-full"
                          style={{ color: stCfg.color, backgroundColor: stCfg.bg }}
                        >
                          {stCfg.label}
                        </span>
                      </div>
                    </div>

                    {/* Pipeline steps */}
                    <div className="flex items-center gap-1" role="progressbar" aria-valuenow={isRejected ? 0 : pipelineIndex + 1} aria-valuemax={3}>
                      {STATUS_PIPELINE.map((step, i) => {
                        const reached = !isRejected && i <= pipelineIndex;
                        const stepCfg = STATUS_STYLE[step];
                        return (
                          <div key={step} className="flex items-center gap-1 flex-1">
                            <div
                              className={cn(
                                'h-2 flex-1 rounded-full transition-colors duration-normal',
                                reached ? '' : 'bg-surface-raised'
                              )}
                              style={reached ? { backgroundColor: stepCfg.color } : undefined}
                            />
                            <span className={cn(
                              'font-body text-xs shrink-0',
                              reached ? 'text-ink font-medium' : 'text-ink-muted'
                            )}>
                              {stepCfg.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Two-column: Nonce registry + Deployment history */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Nonce registry */}
          <section aria-labelledby="nonce-heading">
            <h2 id="nonce-heading" className="font-heading text-lg font-bold text-ink mb-4">
              Nonce registry
            </h2>
            <div className="rounded-lg border border-border-color bg-canvas-surface overflow-hidden">
              <table className="w-full text-left" role="table">
                <thead>
                  <tr className="border-b border-border-color bg-surface-raised">
                    <th className="font-body text-xs font-medium text-ink-muted px-4 py-2">Nonce</th>
                    <th className="font-body text-xs font-medium text-ink-muted px-4 py-2">Status</th>
                    <th className="font-body text-xs font-medium text-ink-muted px-4 py-2">Used</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={3} className="px-4 py-6 text-center text-ink-muted">Loading...</td></tr>
                  ) : nonces.map((n) => {
                    const nCfg = NONCE_STYLE[n.status];
                    return (
                      <tr key={n.nonce} className="border-b border-border-color last:border-0">
                        <td className="font-body text-sm text-ink px-4 py-2 font-mono">{n.nonce}</td>
                        <td className="px-4 py-2">
                          <span
                            className="font-body text-xs font-medium px-2 py-0.5 rounded-full"
                            style={{ color: nCfg.color, backgroundColor: nCfg.bg }}
                          >
                            {n.status}
                          </span>
                        </td>
                        <td className="font-body text-xs text-ink-muted px-4 py-2">{formatDate(n.usedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Deployment history */}
          <section aria-labelledby="deploy-heading">
            <h2 id="deploy-heading" className="font-heading text-lg font-bold text-ink mb-4">
              Deployment history
            </h2>
            <div className="space-y-3">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-lg bg-surface-raised animate-pulse" />
                ))
              ) : deployments.map((dep) => {
                const rCfg = RESULT_STYLE[dep.result];
                return (
                  <div
                    key={dep.id}
                    className="rounded-lg border border-border-color bg-canvas-surface p-3 shadow-token-sm flex items-center justify-between"
                    role="article"
                    aria-label={`Deployment ${dep.envelopeName}, result: ${rCfg.label}`}
                  >
                    <div>
                      <span className="font-body text-sm font-medium text-ink">{dep.envelopeName}</span>
                      <br />
                      <span className="font-body text-xs text-ink-muted">{formatDate(dep.deployedAt)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="font-body text-xs font-medium px-2 py-1 rounded-full"
                        style={{ color: riskColor(dep.riskScore), backgroundColor: `${riskColor(dep.riskScore)}18` }}
                      >
                        Risk {dep.riskScore}
                      </span>
                      <span
                        className="font-body text-xs font-medium px-2 py-1 rounded-full"
                        style={{ color: rCfg.color, backgroundColor: rCfg.bg }}
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
