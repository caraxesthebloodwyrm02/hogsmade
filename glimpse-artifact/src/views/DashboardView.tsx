import { HealthGauge } from '@/components/phase4/HealthGauge';
import { AuditTimeline } from '@/components/phase4/AuditTimeline';
import { ExperimentCard } from '@/components/phase4/ExperimentCard';
import { WorkflowStatusCard } from '@/components/phase4/WorkflowStatusCard';
import { useHealthData } from '@/hooks/useHealthData';
import { useAuditStream } from '@/hooks/useAuditStream';
import { useExperiments } from '@/hooks/useExperiments';
import { useFocusSession } from '@/hooks/useFocusSession';

export function DashboardView() {
  const health = useHealthData();
  const audit = useAuditStream();
  const experiments = useExperiments();
  const focus = useFocusSession();

  return (
    <div className="min-h-screen bg-canvas-bg font-body">
      <header className="px-6 py-5 border-b border-border-color bg-canvas-surface">
        <h1 className="font-heading text-xl font-bold text-ink">
          Glimpse Dashboard
        </h1>
        <p className="font-body text-sm text-ink-muted mt-1">
          Ecosystem health, events, and experiments at a glance.
        </p>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Health grid */}
        <section aria-labelledby="health-heading" className="mb-8">
          <h2 id="health-heading" className="font-heading text-lg font-bold text-ink mb-4">
            Health
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {health.loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <HealthGauge key={i} loading />
                ))
              : health.data.map((h) => (
                  <HealthGauge key={h.repoName} data={h} />
                ))}
          </div>
        </section>

        {/* Two-column layout: Timeline + right column */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Audit timeline */}
          <section aria-labelledby="audit-heading">
            <h2 id="audit-heading" className="font-heading text-lg font-bold text-ink mb-4">
              Timeline
            </h2>
            <div className="rounded-lg border border-border-color bg-canvas-surface p-4">
              <AuditTimeline
                events={audit.events}
                loading={audit.loading}
                error={audit.error ?? undefined}
              />
            </div>
          </section>

          {/* Right column: experiments + focus */}
          <div className="space-y-6">
            {/* Experiments */}
            <section aria-labelledby="experiments-heading">
              <h2 id="experiments-heading" className="font-heading text-lg font-bold text-ink mb-4">
                Experiments
              </h2>
              <div className="space-y-3">
                {experiments.loading
                  ? Array.from({ length: 2 }).map((_, i) => (
                      <ExperimentCard key={i} loading />
                    ))
                  : experiments.experiments.map((exp) => (
                      <ExperimentCard key={exp.id} data={exp} />
                    ))}
              </div>
            </section>

            {/* Focus session / workflow */}
            <section aria-labelledby="focus-heading">
              <h2 id="focus-heading" className="font-heading text-lg font-bold text-ink mb-4">
                Current focus
              </h2>
              <WorkflowStatusCard
                data={focus.session ?? undefined}
                loading={focus.loading}
                error={focus.error ?? undefined}
              />
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
