import { useState } from 'react';
import { cn } from '@/lib/utils';
import { DashboardView } from './DashboardView';
import { ScenarioCanvasView } from './ScenarioCanvasView';
import { GateView } from './GateView';

type View = 'dashboard' | 'canvas' | 'gate';

const VIEWS: { id: View; label: string; description: string }[] = [
  { id: 'canvas', label: 'Canvas', description: 'Scenario exploration' },
  { id: 'dashboard', label: 'Dashboard', description: 'Ecosystem overview' },
  { id: 'gate', label: 'GATE', description: 'Deployment pipeline' },
];

export function AppShell() {
  const [activeView, setActiveView] = useState<View>('canvas');

  return (
    <div className="h-screen flex flex-col bg-canvas-bg">
      {/* Navigation bar — minimal, attention-safe (C1: ≤3 choices) */}
      {activeView !== 'canvas' && (
        <nav
          className="flex items-center gap-1 px-4 py-2 bg-canvas-surface border-b border-border-color shrink-0"
          role="tablist"
          aria-label="Main navigation"
        >
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
                'transition-colors duration-fast',
                'focus:outline-none focus:ring-2 focus:ring-teal-500',
                activeView === view.id
                  ? 'bg-teal-100 text-teal-700'
                  : 'text-ink-muted hover:text-ink hover:bg-surface-raised'
              )}
            >
              {view.label}
            </button>
          ))}
        </nav>
      )}

      {/* Canvas gets its own nav button overlay since it's full-screen */}
      {activeView === 'canvas' && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-1 bg-canvas-surface/90 backdrop-blur-sm rounded-lg border border-border-color shadow-token-sm px-2 py-1">
          {VIEWS.map((view) => (
            <button
              key={view.id}
              onClick={() => setActiveView(view.id)}
              className={cn(
                'font-body text-xs font-medium px-3 py-1.5 rounded-md',
                'min-h-[36px]',
                'transition-colors duration-fast',
                'focus:outline-none focus:ring-2 focus:ring-teal-500',
                activeView === view.id
                  ? 'bg-teal-100 text-teal-700'
                  : 'text-ink-muted hover:text-ink hover:bg-surface-raised'
              )}
            >
              {view.label}
            </button>
          ))}
        </div>
      )}

      {/* View panels */}
      <div className="flex-1 min-h-0" id={`panel-${activeView}`} role="tabpanel">
        {activeView === 'dashboard' && <DashboardView />}
        {activeView === 'canvas' && <ScenarioCanvasView />}
        {activeView === 'gate' && <GateView />}
      </div>
    </div>
  );
}
