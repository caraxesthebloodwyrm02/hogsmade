import { EligibilityMemoView } from '@/components/EligibilityMemoView';
import { EligibilityShaderView } from '@/components/EligibilityShaderView';
import { useEligibilityPipeline } from '@/hooks/useEligibilityPipeline';
import { useEvolutionCycle } from '@/hooks/useEvolutionCycle';
import { cn } from '@/lib/utils';
import { useState } from 'react';

type ShaderTab = 'gpu' | 'memo';

const BEAT_LABELS: Record<string, string> = {
  map: 'Map (scatter)',
  balance: 'Balance (cluster)',
  tighten: 'Tighten (compress)',
  verify: 'Verify (grid)',
};

export function EligibilityShaderViewPage() {
  const [tab, setTab] = useState<ShaderTab>('memo');
  const { snapshot, loading, error } = useEvolutionCycle();
  const promotionGate = snapshot?.caseRecord.latestPromotionDecision ?? null;
  const data = useEligibilityPipeline(snapshot, promotionGate);

  if (loading && !snapshot) {
    return (
      <div className="flex items-center justify-center h-full text-ink-muted font-body">
        Loading pipeline data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-400 font-body">
        {error}
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="flex items-center justify-center h-full text-ink-muted font-body">
        No evolution case loaded. Open a case from the Evolution view first.
      </div>
    );
  }

  const beat = snapshot.caseRecord.currentBeat;
  const momentum = snapshot.caseRecord.momentum;

  return (
    <div className="h-full flex flex-col">
      {/* Status bar with tab toggle */}
      <div className="flex items-center gap-4 px-4 py-2 bg-[var(--glass-fill)] backdrop-blur-xl border-b border-border-color shrink-0 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-teal-500/40 to-transparent" />

        {/* Tab toggle */}
        <div className="flex items-center rounded-md border border-border-color/50 overflow-hidden shrink-0">
          <button
            onClick={() => setTab('memo')}
            className={cn(
              'font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 transition-all',
              tab === 'memo'
                ? 'bg-teal-500/15 text-teal-500'
                : 'text-ink-ghost hover:text-ink-muted',
            )}
          >
            Memo
          </button>
          <button
            onClick={() => setTab('gpu')}
            className={cn(
              'font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 transition-all',
              tab === 'gpu'
                ? 'bg-teal-500/15 text-teal-500'
                : 'text-ink-ghost hover:text-ink-muted',
            )}
          >
            GPU
          </button>
        </div>

        {/* Status readouts */}
        <span className="font-body text-sm text-ink-muted">
          Beat: <span style={{ color: 'var(--teal-500)' }} className="font-medium">{BEAT_LABELS[beat] ?? beat}</span>
        </span>
        {data && (
          <span className="font-body text-sm text-ink-muted">
            Candidates: <span className="text-ink font-medium">{data.candidateCount}</span>
          </span>
        )}
        {momentum && (
          <>
            <span className="font-body text-sm text-ink-muted">
              Momentum: <span className={cn('font-medium', momentum.momentum > 0.5 ? 'text-emerald-400' : 'text-amber-400')}>{momentum.momentum.toFixed(3)}</span>
            </span>
            <span className="font-body text-sm text-ink-muted">
              Drift: <span className={cn('font-medium', momentum.sidewalkDrift >= 0.35 ? 'text-red-400' : 'text-ink')}>{momentum.sidewalkDrift.toFixed(3)}</span>
            </span>
          </>
        )}
        {data?.uniforms.cbState === 1 && (
          <span className="font-body text-sm text-red-400 font-medium">CB: OPEN</span>
        )}
        {data?.uniforms.cbState === 2 && (
          <span className="font-body text-sm text-amber-400 font-medium">CB: HALF_OPEN</span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto relative">
        {tab === 'gpu' && data && (
          <EligibilityShaderView data={data} className="absolute inset-0" />
        )}
        {tab === 'gpu' && !data && (
          <div className="flex items-center justify-center h-full text-ink-muted font-body">
            No pipeline data available for GPU rendering.
          </div>
        )}
        {tab === 'memo' && (
          <EligibilityMemoView snapshot={snapshot} />
        )}
      </div>
    </div>
  );
}
