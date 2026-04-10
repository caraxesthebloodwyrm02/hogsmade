import { useNukeStore } from "../stores/nuke-store.ts";
import { Trash2 } from "lucide-react";
import type { KnobStatus } from "../types/nuke.ts";

const STATUS_DOT_COLOR: Record<KnobStatus, string> = {
  idle: "var(--led-idle)",
  running: "var(--led-running)",
  success: "var(--led-success)",
  error: "var(--led-error)",
};

export function StatusBar() {
  const log = useNukeStore((s) => s.log);
  const clearLog = useNukeStore((s) => s.clearLog);
  const selectedKnobId = useNukeStore((s) => s.selectedKnobId);
  const knobs = useNukeStore((s) => s.knobs);
  const selectKnob = useNukeStore((s) => s.selectKnob);

  const selectedKnob = selectedKnobId ? knobs.find((k) => k.id === selectedKnobId) : null;

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3 flex-1 min-h-[160px]"
      style={{ background: "var(--nuke-surface)", border: "1px solid var(--nuke-border-dim)" }}
    >
      {/* knob detail panel (when right-clicked) */}
      {selectedKnob && (
        <div
          className="rounded-lg p-3 mb-2 fade-in"
          style={{ background: "var(--nuke-surface-alt)", border: "1px solid var(--nuke-border)" }}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold uppercase" style={{ color: "var(--row-accent)" }}>
                [{selectedKnob.key}]
              </span>
              <span className="text-sm font-medium">{selectedKnob.label}</span>
            </div>
            <button
              onClick={() => selectKnob(null)}
              className="text-[10px] px-2 py-0.5 rounded"
              style={{ background: "var(--nuke-border)", color: "var(--nuke-text-dim)" }}
            >
              Close
            </button>
          </div>
          <p className="text-xs mb-2" style={{ color: "var(--nuke-text-dim)" }}>
            {selectedKnob.description}
          </p>
          <div
            className="text-[10px] flex flex-col gap-1"
            style={{ color: "var(--nuke-text-muted)" }}
          >
            {selectedKnob.calls.map((call, i) => (
              <div key={i} className="flex gap-2">
                <span style={{ color: "var(--nuke-text-dim)" }}>{call.server}</span>
                <span>&rarr;</span>
                <span style={{ color: "var(--nuke-text)" }}>{call.tool}</span>
                {call.params && <span className="opacity-60">{JSON.stringify(call.params)}</span>}
              </div>
            ))}
          </div>
          {selectedKnob.lastRun && (
            <div
              className="text-[10px] mt-2 flex gap-3"
              style={{ color: "var(--nuke-text-muted)" }}
            >
              <span>Last: {new Date(selectedKnob.lastRun).toLocaleTimeString()}</span>
              {selectedKnob.lastDurationMs !== null && <span>{selectedKnob.lastDurationMs}ms</span>}
              {selectedKnob.lastError && (
                <span style={{ color: "var(--led-error)" }}>{selectedKnob.lastError}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* log header */}
      <div className="flex items-center justify-between">
        <div
          className="text-xs font-semibold uppercase tracking-widest pl-1"
          style={{ color: "var(--nuke-text-dim)" }}
        >
          Execution Log
          {log.length > 0 && (
            <span className="ml-2 font-normal" style={{ color: "var(--nuke-text-muted)" }}>
              ({log.length})
            </span>
          )}
        </div>
        {log.length > 0 && (
          <button
            onClick={clearLog}
            className="p-1 rounded transition-colors"
            style={{ color: "var(--nuke-text-muted)" }}
            title="Clear log"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {/* log entries */}
      <div className="flex flex-col gap-0.5 overflow-y-auto max-h-[240px]">
        {log.length === 0 ? (
          <p className="text-[10px] pl-1" style={{ color: "var(--nuke-text-muted)" }}>
            No executions yet. Press a key or run a macro.
          </p>
        ) : (
          log.map((entry, i) => (
            <div
              key={`${entry.timestamp}-${i}`}
              className="flex items-center gap-2 px-1 py-0.5 rounded text-[11px] fade-in"
              style={{ background: i % 2 === 0 ? "transparent" : "var(--nuke-surface-alt)" }}
            >
              {/* status dot */}
              <div
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: STATUS_DOT_COLOR[entry.status] }}
              />

              {/* time */}
              <span style={{ color: "var(--nuke-text-muted)" }} className="flex-shrink-0 w-[60px]">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>

              {/* knob */}
              <span
                style={{ color: "var(--nuke-text-dim)" }}
                className="flex-shrink-0 w-[120px] truncate"
              >
                {entry.knobLabel}
              </span>

              {/* duration */}
              {entry.durationMs !== null && (
                <span
                  style={{ color: "var(--nuke-text-muted)" }}
                  className="flex-shrink-0 w-[50px] text-right"
                >
                  {entry.durationMs}ms
                </span>
              )}

              {/* error */}
              {entry.error && (
                <span style={{ color: "var(--led-error)" }} className="truncate">
                  {entry.error}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
