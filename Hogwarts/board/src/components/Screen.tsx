import { Monitor, Terminal, ChevronRight } from "lucide-react";
import type { BoardKnob } from "../types/board";
import { HOUSE_META } from "../types/board";

interface ScreenProps {
  focusedKnob: BoardKnob | null;
}

export function Screen({ focusedKnob }: ScreenProps) {
  return (
    <div
      className="rounded-2xl border border-panel-border bg-screen-bg overflow-hidden flex flex-col shadow-lg"
      role="region"
      aria-label="Tool output screen"
    >
      {/* Screen header bar — CRT aesthetic */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-panel-border/50 bg-panel/30">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-led-green/70" style={{ boxShadow: "var(--shadow-glow-green)" }} />
          <div className="w-2 h-2 rounded-full bg-led-yellow/40" />
          <div className="w-2 h-2 rounded-full bg-led-red/40" />
        </div>
        <Monitor size={12} className="text-screen-text/70 ml-2" />
        <span className="text-[11px] text-screen-text/70 uppercase tracking-widest font-medium">
          Output
        </span>
        {focusedKnob && (
          <span className="ml-auto text-[11px] text-text-muted font-mono">
            {focusedKnob.server}/{focusedKnob.id}
          </span>
        )}
      </div>

      {/* Screen content with scanlines */}
      <div className="relative flex-1 min-h-[240px]">
        <div className="absolute inset-0 crt-scanlines z-10" />
        <div className="relative z-0 p-5 font-mono text-xs">
          {focusedKnob ? (
            <div className="space-y-4 animate-fade-in-up">
              {/* Tool header */}
              <div className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{
                    backgroundColor: HOUSE_META[focusedKnob.house].color,
                    boxShadow: `0 0 6px ${HOUSE_META[focusedKnob.house].color}60`,
                  }}
                />
                <span className="text-screen-text font-semibold text-sm">{focusedKnob.label}</span>
                <span className="text-text-muted text-[11px]">@{focusedKnob.server}</span>
              </div>

              {/* Description */}
              <p className="text-text-tertiary text-xs leading-relaxed">
                {focusedKnob.description}
              </p>

              {/* Parameter listing */}
              {focusedKnob.parameters.length > 0 && (
                <div className="space-y-2">
                  <div className="text-text-muted text-[11px] uppercase tracking-wider font-medium">Parameters</div>
                  {focusedKnob.parameters.map((param) => (
                    <div key={param.name} className="flex items-start gap-2 pl-3 border-l-2 border-panel-border-light/50 py-1">
                      <ChevronRight size={10} className="text-screen-text/50 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-screen-text font-medium">{param.name}</span>
                          <span className="text-led-blue text-[10px] bg-led-blue/10 px-1.5 py-0.5 rounded">{param.type}</span>
                          {param.required && <span className="text-led-red text-[10px] bg-led-red/10 px-1.5 py-0.5 rounded">req</span>}
                          {param.default !== undefined && (
                            <span className="text-text-muted text-[10px]">= {JSON.stringify(param.default)}</span>
                          )}
                        </div>
                        <p className="text-text-muted text-[10px] mt-0.5 leading-relaxed">{param.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Flags */}
              {focusedKnob.flags.length > 0 && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-text-muted text-[11px] font-medium">FLAGS</span>
                  {focusedKnob.flags.map((flag) => (
                    <span key={flag} className="text-[10px] px-2 py-0.5 rounded-md bg-panel-raised/50 border border-panel-border-light/30 text-led-yellow">
                      {flag}
                    </span>
                  ))}
                </div>
              )}

              {/* Mock invocation area */}
              <div className="mt-2 pt-3 border-t border-panel-border/30">
                <div className="flex items-center gap-2 text-text-muted mb-2">
                  <Terminal size={11} />
                  <span className="text-[11px] font-medium">Invocation</span>
                </div>
                <div className="bg-surface/50 rounded-lg px-4 py-3 border border-panel-border/30 text-[11px]">
                  <span className="text-screen-text">$</span>
                  <span className="text-text-secondary ml-1">{focusedKnob.id}</span>
                  <span className="text-text-muted">(</span>
                  <span className="text-led-blue">
                    {focusedKnob.parameters
                      .filter((p) => p.required)
                      .map((p) => p.name)
                      .join(", ")}
                  </span>
                  <span className="text-text-muted">)</span>
                  <span className="animate-blink ml-0.5 text-screen-text">_</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full min-h-[180px] text-text-muted gap-3">
              <Monitor size={28} className="opacity-20" />
              <div className="text-center">
                <p className="text-xs text-text-tertiary">Select a knob to inspect</p>
                <p className="text-[11px] text-text-muted mt-1">
                  Parameters, status, and invocation details will appear here
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
