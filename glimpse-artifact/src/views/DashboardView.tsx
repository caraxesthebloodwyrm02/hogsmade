import { HealthGauge } from "@/components/phase4/HealthGauge";
import { AuditTimeline } from "@/components/phase4/AuditTimeline";
import { ExperimentCard } from "@/components/phase4/ExperimentCard";
import { WorkflowStatusCard } from "@/components/phase4/WorkflowStatusCard";
import { DataError } from "@/components/phase4/DataError";
import { useHealthData } from "@/hooks/useHealthData";
import { useAuditStream } from "@/hooks/useAuditStream";
import { useExperiments } from "@/hooks/useExperiments";
import { useFocusSession } from "@/hooks/useFocusSession";
import { HeartPulse, History, FlaskConical, Target, LayoutDashboard } from "lucide-react";

export function DashboardView() {
  const health = useHealthData();
  const audit = useAuditStream();
  const experiments = useExperiments();
  const focus = useFocusSession();

  return (
    <div className="h-full overflow-y-auto bg-canvas-bg dot-grid font-body selection:bg-teal-500/20">
      <header className="px-6 py-6 border-b border-border-color bg-[var(--glass-fill)] backdrop-blur-xl shadow-token-sm sticky top-0 z-20 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-teal-500/50 to-transparent" />
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-4 animate-fade-in relative">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-500 shadow-glow-emerald shrink-0">
            <LayoutDashboard className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold text-ink tracking-tight flex items-center gap-2" style={{ letterSpacing: '-0.02em' }}>
              Glimpse Dashboard
            </h1>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted mt-1">
              <span className="text-teal-500">◉</span> Ecosystem health, events, and experiments
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Health grid */}
        <section aria-labelledby="health-heading" className="mb-10 animate-fade-slide-up">
          <div className="section-divider mb-6">
            <div className="section-divider-line" />
            <div className="section-divider-label">
              <span className="section-divider-sym">◉</span>
              System Health
            </div>
            <div className="section-divider-line" />
          </div>
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <HeartPulse className="w-5 h-5" />
            </div>
            <h2
              id="health-heading"
              className="font-body text-xs font-medium uppercase tracking-[0.08em] text-ink"
            >
              System Health
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-5 stagger-children">
            {health.error
              ? <DataError message={health.error} onRetry={health.retry} className="col-span-full" />
              : health.loading
                ? Array.from({ length: 5 }).map((_, i) => (
                  <HealthGauge key={i} loading />
                ))
                : health.data.map((h) => (
                  <HealthGauge key={h.repoName} data={h} />
                ))}
          </div>
        </section>

        {/* Two-column layout: Timeline + right column */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Audit timeline */}
          <section aria-labelledby="audit-heading" className="animate-fade-slide-up" style={{ animationDelay: "200ms" }}>
            <div className="flex items-center gap-2 mb-6">
              <div className="p-1.5 rounded-md bg-teal-500/10 text-teal-500 border border-teal-500/20">
                <History className="w-5 h-5" />
              </div>
              <h2
                id="audit-heading"
                className="font-body text-xs font-medium uppercase tracking-[0.08em] text-ink"
              >
                Timeline
              </h2>
            </div>
            <div className="glass-panel p-5 card-glow">
              {audit.error
                ? <DataError message={audit.error} onRetry={audit.retry} />
                : <AuditTimeline
                  events={audit.events}
                  loading={audit.loading}
                />}
            </div>
          </section>

          <div className="space-y-10">
            {/* Experiments */}
            <section aria-labelledby="experiments-heading" className="animate-fade-slide-up" style={{ animationDelay: "300ms" }}>
              <div className="flex items-center gap-2 mb-6">
                <div className="p-1.5 rounded-md bg-amber-400/10 text-amber-400 border border-amber-400/20">
                  <FlaskConical className="w-5 h-5" />
                </div>
                <h2
                  id="experiments-heading"
                  className="font-body text-xs font-medium uppercase tracking-[0.08em] text-ink"
                >
                  Experiments
                </h2>
              </div>
              <div className="space-y-4">
                {experiments.error
                  ? <DataError message={experiments.error} onRetry={experiments.retry} />
                  : experiments.loading
                    ? Array.from({ length: 2 }).map((_, i) => (
                      <ExperimentCard key={i} loading />
                    ))
                    : experiments.experiments.map((exp) => (
                      <ExperimentCard key={exp.id} data={exp} />
                    ))}
              </div>
            </section>

            {/* Focus session / workflow */}
            <section aria-labelledby="focus-heading" className="animate-fade-slide-up" style={{ animationDelay: "400ms" }}>
              <div className="flex items-center gap-2 mb-6">
                <div className="p-1.5 rounded-md bg-rose-500/10 text-rose-500 border border-rose-500/20">
                  <Target className="w-5 h-5" />
                </div>
                <h2
                  id="focus-heading"
                  className="font-body text-xs font-medium uppercase tracking-[0.08em] text-ink"
                >
                  Current Focus
                </h2>
              </div>
              {focus.error
                ? <DataError message={focus.error} onRetry={focus.retry} />
                : <WorkflowStatusCard
                  data={focus.session ?? undefined}
                  loading={focus.loading}
                />}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
