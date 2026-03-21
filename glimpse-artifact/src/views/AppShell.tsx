import { cn } from '@/lib/utils';
import { useCallback, useEffect, useState } from 'react';
import { AuditStreamView } from './AuditStreamView';
import { CognitionView } from './CognitionView';
import { DashboardView } from './DashboardView';
import { GateView } from './GateView';
import { PipelineView } from './PipelineView';
import { ScenarioCanvasView } from './ScenarioCanvasView';
import { TopologyView } from './TopologyView';

type View = 'dashboard' | 'canvas' | 'gate' | 'audit' | 'topology' | 'cognition' | 'pipeline';

const VIEWS: { id: View; label: string; description: string }[] = [
  { id: 'canvas', label: 'Canvas', description: 'Scenario exploration' },
  { id: 'dashboard', label: 'Dashboard', description: 'Ecosystem overview' },
  { id: 'gate', label: 'GATE', description: 'Deployment pipeline' },
  { id: 'audit', label: 'Audit', description: 'Live event stream' },
  { id: 'topology', label: 'Topology', description: 'MCP graph & health' },
  { id: 'cognition', label: 'Cognition', description: 'Pattern radar & GATE flow' },
  { id: 'pipeline', label: 'Pipeline', description: 'CI/CD kanban' },
];

const VALID_VIEWS = new Set<View>([
  'dashboard', 'canvas', 'gate', 'audit', 'topology', 'cognition', 'pipeline',
]);

function viewFromHash(): View {
  const hash = window.location.hash.slice(1) as View;
  return VALID_VIEWS.has(hash) ? hash : 'canvas';
}

export function AppShell() {
  const [activeView, setActiveViewState] = useState<View>(viewFromHash);

  const setActiveView = useCallback((v: View) => {
    setActiveViewState(v);
    window.location.hash = v;
  }, []);

  useEffect(() => {
    const onHash = () => setActiveViewState(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-canvas-bg">
      {/* Navigation bar */}
      {activeView !== 'canvas' && (
        <nav
          className="flex items-center gap-1 px-4 py-2 bg-[var(--glass-fill)] backdrop-blur-xl border-b border-border-color shrink-0 relative overflow-hidden"
          role="tablist"
          aria-label="Main navigation"
        >
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-teal-500/50 to-transparent" />
          {VIEWS.map((view) => (
            <button
              key={view.id}
              onClick={() => setActiveView(view.id)}
              role="tab"
              aria-selected={activeView === view.id}
              aria-controls={`panel-${view.id}`}
              className={cn(
                'font-body text-sm font-medium px-4 py-2 rounded-md',
                'min-h-[44px]',
                'transition-all duration-fast',
                'focus:outline-none focus:ring-2 focus:ring-teal-500',
                activeView === view.id
                  ? 'bg-teal-500/15 text-teal-500 shadow-glow-emerald border border-teal-500/20 breathe-glow'
                  : 'text-ink-muted hover:text-ink hover:bg-surface-raised border border-transparent'
              )}
            >
              {view.label}
            </button>
          ))}
        </nav>
      )}

      {/* Canvas gets its own nav button overlay since it's full-screen */}
      {activeView === 'canvas' && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-1 bg-[var(--glass-fill)] backdrop-blur-xl rounded-lg border border-glass shadow-token-md px-2 py-1 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-teal-500/40 to-transparent" />
          {VIEWS.map((view) => (
            <button
              key={view.id}
              onClick={() => setActiveView(view.id)}
              className={cn(
                'font-body text-xs font-medium px-3 py-1.5 rounded-md',
                'min-h-[36px]',
                'transition-all duration-fast',
                'focus:outline-none focus:ring-2 focus:ring-teal-500',
                activeView === view.id
                  ? 'bg-teal-500/15 text-teal-500 shadow-glow-emerald border border-teal-500/20 breathe-glow'
                  : 'text-ink-muted hover:text-ink hover:bg-surface-raised border border-transparent'
              )}
            >
              {view.label}
            </button>
          ))}
        </div>
      )}

      {/* View panels */}
      <div className="flex-1 min-h-0 overflow-auto" id={`panel-${activeView}`} role="tabpanel">
        {activeView === 'dashboard' && <DashboardView />}
        {activeView === 'canvas' && <ScenarioCanvasView />}
        {activeView === 'gate' && <GateView />}
        {activeView === 'audit' && <AuditStreamView />}
        {activeView === 'topology' && <TopologyView />}
        {activeView === 'cognition' && <CognitionView />}
        {activeView === 'pipeline' && <PipelineView />}
      </div>
    </div>
  );
}
