import { HealthGauge } from "@/components/phase4/HealthGauge";
import { AuditTimeline } from "@/components/phase4/AuditTimeline";
import { ExperimentCard } from "@/components/phase4/ExperimentCard";
import { WorkflowStatusCard } from "@/components/phase4/WorkflowStatusCard";
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
    <div className="h-full overflow-y-auto bg-canvas-bg font-body selection:bg-teal-500/20">
      <header className="px-6 py-6 border-b border-border-color bg-canvas-surface shadow-sm sticky top-0 z-20">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-teal-50 border border-teal-200 text-teal-600 shadow-sm shrink-0">
            <LayoutDashboard className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold text-ink tracking-tight flex items-center gap-2">
              Glimpse Dashboard
            </h1>
            <p className="font-body text-sm text-ink-muted mt-1 font-medium">
              Ecosystem health, events, and experiments at a glance.
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Health grid */}
        <section aria-labelledby="health-heading" className="mb-10">
          <div className="flex items-center gap-2 mb-6 border-b border-border-color/40 pb-3">
            <div className="p-1.5 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-100/50">
              <HeartPulse className="w-5 h-5" />
            </div>
            <h2
              id="health-heading"
              className="font-heading text-xl font-bold text-ink tracking-tight"
            >
              System Health
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6">
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Audit timeline */}
          <section aria-labelledby="audit-heading">
            <div className="flex items-center gap-2 mb-6 border-b border-border-color/40 pb-3">
              <div className="p-1.5 rounded-md bg-blue-50 text-blue-600 border border-blue-100/50">
                <History className="w-5 h-5" />
              </div>
              <h2
                id="audit-heading"
                className="font-heading text-xl font-bold text-ink tracking-tight"
              >
                Timeline
              </h2>
            </div>
            <div className="rounded-xl border border-border-color/50 bg-canvas-surface p-5 shadow-token-sm">
              <AuditTimeline
                events={audit.events}
                loading={audit.loading}
                error={audit.error ?? undefined}
              />
            </div>
          </section>

          <div className="space-y-10">
            {/* Experiments */}
            <section aria-labelledby="experiments-heading">
              <div className="flex items-center gap-2 mb-6 border-b border-border-color/40 pb-3">
                <div className="p-1.5 rounded-md bg-purple-50 text-purple-600 border border-purple-100/50">
                  <FlaskConical className="w-5 h-5" />
                </div>
                <h2
                  id="experiments-heading"
                  className="font-heading text-xl font-bold text-ink tracking-tight"
                >
                  Experiments
                </h2>
              </div>
              <div className="space-y-4">
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
              <div className="flex items-center gap-2 mb-6 border-b border-border-color/40 pb-3">
                <div className="p-1.5 rounded-md bg-rose-50 text-rose-600 border border-rose-100/50">
                  <Target className="w-5 h-5" />
                </div>
                <h2
                  id="focus-heading"
                  className="font-heading text-xl font-bold text-ink tracking-tight"
                >
                  Current Focus
                </h2>
              </div>
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
