import { X, BookOpen, Sliders, Flag, Clock, Shield } from "lucide-react";
import type { BoardKnob } from "../types/board";
import { HOUSE_META } from "../types/board";

interface KnobDetailProps {
  knob: BoardKnob;
  onClose: () => void;
}

export function KnobDetail({ knob, onClose }: KnobDetailProps) {
  const house = HOUSE_META[knob.house];

  return (
    <div className="rounded-2xl border border-panel-border bg-panel overflow-hidden shadow-md animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-panel-border">
        <div
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: house.color, boxShadow: `0 0 8px ${house.color}50` }}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-text-primary truncate">{knob.label}</div>
          <div className="text-[11px] text-text-muted">
            {knob.server} · {house.label}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close detail panel"
          className="p-1.5 rounded-lg hover:bg-panel-light transition-colors text-text-muted hover:text-text-primary cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="p-4 space-y-4 text-xs">
        {/* Description */}
        <div>
          <div className="flex items-center gap-1.5 text-text-muted mb-1.5">
            <BookOpen size={11} />
            <span className="text-[11px] uppercase tracking-wider font-medium">Description</span>
          </div>
          <p className="text-text-secondary leading-relaxed">{knob.description}</p>
        </div>

        {/* Parameters */}
        {knob.parameters.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-text-muted mb-2">
              <Sliders size={11} />
              <span className="text-[11px] uppercase tracking-wider font-medium">
                Parameters ({knob.parameters.length})
              </span>
            </div>
            <div className="space-y-2">
              {knob.parameters.map((param) => (
                <div
                  key={param.name}
                  className="rounded-xl bg-panel-light border border-panel-border p-3 space-y-1.5"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-text-primary font-medium">{param.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-led-blue/10 text-led-blue">
                      {param.type}
                    </span>
                    {param.required && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-led-red/10 text-led-red">
                        required
                      </span>
                    )}
                  </div>
                  <p className="text-text-muted text-[11px] leading-relaxed">{param.description}</p>
                  {param.default !== undefined && (
                    <div className="text-[11px] text-text-muted">
                      Default:{" "}
                      <code className="text-text-tertiary bg-surface px-1.5 py-0.5 rounded">
                        {JSON.stringify(param.default)}
                      </code>
                    </div>
                  )}
                  {param.constraints && (
                    <div className="text-[11px] text-text-muted flex flex-wrap gap-1">
                      {param.constraints.min !== undefined && (
                        <span className="bg-surface px-1.5 py-0.5 rounded">
                          min: {param.constraints.min}
                        </span>
                      )}
                      {param.constraints.max !== undefined && (
                        <span className="bg-surface px-1.5 py-0.5 rounded">
                          max: {param.constraints.max}
                        </span>
                      )}
                      {param.constraints.options &&
                        param.constraints.options.map((o) => (
                          <code
                            key={o}
                            className="text-text-tertiary bg-surface px-1.5 py-0.5 rounded"
                          >
                            {o}
                          </code>
                        ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Flags */}
        <div>
          <div className="flex items-center gap-1.5 text-text-muted mb-1.5">
            <Flag size={11} />
            <span className="text-[11px] uppercase tracking-wider font-medium">Flags</span>
          </div>
          {knob.flags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {knob.flags.map((flag) => (
                <span
                  key={flag}
                  className="text-[10px] px-2 py-1 rounded-md bg-panel-raised border border-panel-border-light/30 text-led-yellow"
                >
                  {flag}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-text-muted text-[11px]">No flags set</span>
          )}
        </div>

        {/* Status */}
        <div>
          <div className="flex items-center gap-1.5 text-text-muted mb-1.5">
            <Clock size={11} />
            <span className="text-[11px] uppercase tracking-wider font-medium">Status</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-[11px] px-2.5 py-1 rounded-md font-medium ${
                knob.status === "ready"
                  ? "bg-led-green/10 text-led-green"
                  : knob.status === "running"
                    ? "bg-led-blue/10 text-led-blue"
                    : knob.status === "error"
                      ? "bg-led-red/10 text-led-red"
                      : "bg-panel-light text-text-muted"
              }`}
            >
              {knob.status}
            </span>
            <span
              className={`text-[11px] px-2.5 py-1 rounded-md ${
                knob.healthIndicator === "green"
                  ? "bg-led-green/10 text-led-green"
                  : knob.healthIndicator === "yellow"
                    ? "bg-led-yellow/10 text-led-yellow"
                    : knob.healthIndicator === "red"
                      ? "bg-led-red/10 text-led-red"
                      : "bg-panel-light text-text-muted"
              }`}
            >
              health: {knob.healthIndicator}
            </span>
          </div>
        </div>

        {/* Governance compliance */}
        <div className="pt-3 border-t border-panel-border/50">
          <div className="flex items-center gap-1.5 text-text-muted mb-2">
            <Shield size={11} />
            <span className="text-[11px] uppercase tracking-wider font-medium">Governance</span>
          </div>
          <div className="text-[11px] text-text-muted space-y-1">
            <div className="flex justify-between items-center py-0.5">
              <span>GOV-01 desc ≤ 120</span>
              <span
                className={`tabular-nums font-medium ${knob.description.length <= 120 ? "text-led-green" : "text-led-yellow"}`}
              >
                {knob.description.length}/120
              </span>
            </div>
            <div className="flex justify-between items-center py-0.5">
              <span>GOV-02 param types</span>
              <span
                className={`font-medium ${knob.parameters.every((p) => p.type && p.description) ? "text-led-green" : "text-led-yellow"}`}
              >
                {knob.parameters.every((p) => p.type && p.description) ? "pass" : "warn"}
              </span>
            </div>
            <div className="flex justify-between items-center py-0.5">
              <span>GOV-04 snake_case ≤ 40</span>
              <span
                className={`tabular-nums font-medium ${knob.id.length <= 40 && /^[a-z][a-z0-9_]*$/.test(knob.id) ? "text-led-green" : "text-led-yellow"}`}
              >
                {knob.id.length}/40
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
