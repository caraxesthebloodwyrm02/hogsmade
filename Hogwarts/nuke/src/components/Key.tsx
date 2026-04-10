import { useState, useCallback } from "react";
import { useNukeStore } from "../stores/nuke-store.ts";
import type { NukeKnob, KnobStatus } from "../types/nuke.ts";

const STATUS_COLOR: Record<KnobStatus, string> = {
  idle: "var(--led-idle)",
  running: "var(--led-running)",
  success: "var(--led-success)",
  error: "var(--led-error)",
};

interface KeyProps {
  knob: NukeKnob;
}

export function Key({ knob }: KeyProps) {
  const fireKnob = useNukeStore((s) => s.fireKnob);
  const selectKnob = useNukeStore((s) => s.selectKnob);
  const selectedKnobId = useNukeStore((s) => s.selectedKnobId);
  const activeMacroId = useNukeStore((s) => s.activeMacroId);

  const [pressed, setPressed] = useState(false);
  const isSelected = selectedKnobId === knob.id;
  const isRunning = knob.status === "running";
  const isDisabled = isRunning || activeMacroId !== null;

  const handleClick = useCallback(() => {
    if (isDisabled) return;
    setPressed(true);
    setTimeout(() => setPressed(false), 150);
    void fireKnob(knob.id);
  }, [fireKnob, knob.id, isDisabled]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      selectKnob(isSelected ? null : knob.id);
    },
    [selectKnob, knob.id, isSelected],
  );

  return (
    <button
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      disabled={isDisabled}
      className={`
        relative flex flex-col items-center justify-center
        min-w-[80px] h-[72px] rounded-lg
        transition-all cursor-pointer select-none
        ${pressed ? "key-press-anim" : ""}
        ${isSelected ? "ring-2" : ""}
      `}
      style={{
        background: isSelected ? "var(--key-bg-active)" : "var(--key-bg)",
        boxShadow: "var(--key-shadow)",
        borderRadius: "var(--key-radius)",
        opacity: isDisabled && !isRunning ? 0.5 : 1,
        ...(isSelected ? { outlineColor: "var(--row-accent)" } : {}),
      }}
      title={knob.description}
    >
      {/* status LED */}
      <div
        className={`absolute top-2 right-2 w-2 h-2 rounded-full ${isRunning ? "led-pulse" : ""}`}
        style={{ background: STATUS_COLOR[knob.status] }}
      />

      {/* hotkey */}
      <span className="text-lg font-bold uppercase" style={{ color: "var(--row-accent)" }}>
        {knob.key}
      </span>

      {/* label */}
      <span
        className="text-[10px] mt-0.5 leading-tight text-center px-1"
        style={{ color: "var(--nuke-text-dim)" }}
      >
        {knob.label}
      </span>

      {/* last duration */}
      {knob.lastDurationMs !== null && (
        <span className="text-[9px] mt-0.5" style={{ color: "var(--nuke-text-muted)" }}>
          {knob.lastDurationMs}ms
        </span>
      )}
    </button>
  );
}
