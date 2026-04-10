import { useState } from "react";
import { useNukeStore } from "../stores/nuke-store.ts";
import type { NukeKnob } from "../types/nuke.ts";

export function MacroEditor() {
  const knobs = useNukeStore((s) => s.knobs);
  const [selectedSteps, setSelectedSteps] = useState<string[]>([]);

  const addStep = (knob: NukeKnob) => {
    setSelectedSteps((prev) => [...prev, knob.id]);
  };

  const removeStep = (index: number) => {
    setSelectedSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const clearSteps = () => setSelectedSteps([]);

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{ background: "var(--nuke-surface)", border: "1px solid var(--nuke-border-dim)" }}
    >
      <div className="flex items-center justify-between">
        <div
          className="text-xs font-semibold uppercase tracking-widest pl-1"
          style={{ color: "var(--nuke-text-dim)" }}
        >
          Macro Editor
        </div>
        {selectedSteps.length > 0 && (
          <button
            onClick={clearSteps}
            className="px-2 py-0.5 rounded text-[10px] font-medium"
            style={{ background: "var(--nuke-border)", color: "var(--nuke-text-dim)" }}
          >
            Clear
          </button>
        )}
      </div>

      {/* available knobs */}
      <div className="flex gap-1.5 flex-wrap">
        {knobs.map((knob) => (
          <button
            key={knob.id}
            onClick={() => addStep(knob)}
            className="px-2 py-1 rounded text-[10px] font-medium uppercase transition-colors"
            style={{
              background: "var(--key-bg)",
              color: "var(--nuke-text-dim)",
              border: "1px solid var(--nuke-border-dim)",
            }}
          >
            {knob.key} {knob.label}
          </button>
        ))}
      </div>

      {/* assembled sequence */}
      {selectedSteps.length > 0 && (
        <div className="flex gap-1 items-center flex-wrap mt-1">
          {selectedSteps.map((stepId, i) => {
            const knob = knobs.find((k) => k.id === stepId);
            return (
              <div key={`step-${i}`} className="flex items-center gap-1">
                {i > 0 && (
                  <span style={{ color: "var(--nuke-text-muted)" }} className="text-[10px]">
                    &rarr;
                  </span>
                )}
                <button
                  onClick={() => removeStep(i)}
                  className="px-2 py-1 rounded text-[10px] font-medium uppercase"
                  style={{
                    background: "var(--rail-step)",
                    color: "var(--nuke-text)",
                  }}
                  title="Click to remove"
                >
                  {knob?.key ?? "?"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {selectedSteps.length === 0 && (
        <p className="text-[10px]" style={{ color: "var(--nuke-text-muted)" }}>
          Click knobs above to assemble a macro sequence.
        </p>
      )}
    </div>
  );
}
