import { useNukeStore } from "../stores/nuke-store.ts";
import { Play, Square, CheckCircle2, XCircle, CircleDashed } from "lucide-react";
import type { MacroStatus } from "../types/nuke.ts";

const STATUS_ICON: Record<MacroStatus, typeof Play> = {
  idle: CircleDashed,
  running: Play,
  completed: CheckCircle2,
  failed: XCircle,
  aborted: Square,
};

const STATUS_COLOR: Record<MacroStatus, string> = {
  idle: "var(--nuke-text-muted)",
  running: "var(--led-running)",
  completed: "var(--led-success)",
  failed: "var(--led-error)",
  aborted: "var(--nuke-text-dim)",
};

export function MacroRail() {
  const macros = useNukeStore((s) => s.macros);
  const knobs = useNukeStore((s) => s.knobs);
  const runMacro = useNukeStore((s) => s.runMacro);
  const abortMacro = useNukeStore((s) => s.abortMacro);
  const activeMacroId = useNukeStore((s) => s.activeMacroId);

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{ background: "var(--rail-bg)", border: "1px solid var(--nuke-border-dim)" }}
    >
      <div
        className="text-xs font-semibold uppercase tracking-widest pl-1"
        style={{ color: "var(--nuke-text-dim)" }}
      >
        Fast-Forward Macros
      </div>

      <div className="flex gap-3 flex-wrap">
        {macros.map((macro) => {
          const Icon = STATUS_ICON[macro.status];
          const isActive = activeMacroId === macro.id;
          const canRun = !activeMacroId;

          return (
            <div
              key={macro.id}
              className="rounded-lg p-3 flex flex-col gap-2 min-w-[200px] flex-1"
              style={{
                background: "var(--nuke-surface)",
                border: isActive
                  ? "1px solid var(--led-running)"
                  : "1px solid var(--nuke-border-dim)",
              }}
            >
              {/* header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon size={14} style={{ color: STATUS_COLOR[macro.status] }} />
                  <span className="text-sm font-medium">{macro.name}</span>
                </div>
                {isActive ? (
                  <button
                    onClick={abortMacro}
                    className="px-2 py-0.5 rounded text-[10px] font-medium"
                    style={{ background: "var(--led-error)", color: "#0a0a0f" }}
                  >
                    Abort
                  </button>
                ) : (
                  <button
                    onClick={() => void runMacro(macro.id)}
                    disabled={!canRun}
                    className="px-2 py-0.5 rounded text-[10px] font-medium transition-opacity"
                    style={{
                      background: "var(--scan-accent)",
                      color: "#0a0a0f",
                      opacity: canRun ? 1 : 0.4,
                    }}
                  >
                    Run
                  </button>
                )}
              </div>

              {/* description */}
              <p className="text-[10px]" style={{ color: "var(--nuke-text-muted)" }}>
                {macro.description}
              </p>

              {/* step rail */}
              <div className="flex gap-1 items-center">
                {macro.steps.map((step, i) => {
                  const knob = knobs.find((k) => k.id === step.knobId);
                  const isCurrent = isActive && macro.currentStepIndex === i;
                  const isDone = isActive && i < macro.currentStepIndex;
                  const isUpcoming = isActive && i > macro.currentStepIndex;

                  let bg = "var(--rail-step)";
                  if (isCurrent) bg = "var(--rail-active)";
                  else if (isDone) bg = "var(--led-success)";
                  else if (macro.status === "completed") bg = "var(--led-success)";
                  else if (macro.status === "failed" && i <= macro.currentStepIndex)
                    bg = "var(--led-error)";

                  return (
                    <div
                      key={`${macro.id}-${i}`}
                      className={`
                        flex items-center justify-center rounded px-2 py-1
                        text-[10px] font-medium uppercase
                        ${isCurrent ? "led-pulse" : ""}
                      `}
                      style={{
                        background: bg,
                        color:
                          isCurrent || isDone || macro.status === "completed"
                            ? "#0a0a0f"
                            : "var(--nuke-text-muted)",
                        opacity: isUpcoming ? 0.5 : 1,
                      }}
                      title={knob?.description ?? step.knobId}
                    >
                      {knob?.key ?? "?"}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
