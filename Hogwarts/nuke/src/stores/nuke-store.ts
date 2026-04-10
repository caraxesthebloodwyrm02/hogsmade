import { create } from "zustand";
import type { NukeState, NukeKnob, NukeMacro, KnobStatus } from "../types/nuke.ts";
import { KNOB_REGISTRY } from "../data/knob-registry.ts";
import { MACRO_PRESETS } from "../data/macro-presets.ts";

/* ── helpers ─────────────────────────────────────────────────────── */

function deepCloneKnobs(): NukeKnob[] {
  return KNOB_REGISTRY.map((k) => ({ ...k }));
}

function deepCloneMacros(): NukeMacro[] {
  return MACRO_PRESETS.map((m) => ({ ...m, steps: [...m.steps] }));
}

function timestamp(): string {
  return new Date().toISOString();
}

/** Simulate firing a knob's MCP calls. In a real integration this would
 *  hit the MCP servers via fetch — for now it simulates with a delay. */
async function simulateKnobExecution(knob: NukeKnob): Promise<void> {
  const baseMs = 400 + knob.calls.length * 200;
  const jitter = Math.random() * 300;
  await new Promise((r) => setTimeout(r, baseMs + jitter));
}

/* ── abort controller for macro cancellation ─────────────────────── */

let macroAbort: AbortController | null = null;

/* ── store ───────────────────────────────────────────────────────── */

export const useNukeStore = create<NukeState>((set, get) => ({
  /* data */
  knobs: deepCloneKnobs(),
  macros: deepCloneMacros(),
  log: [],

  /* ui */
  activeMacroId: null,
  selectedKnobId: null,
  hotkeyEnabled: true,

  /* ── knob actions ──────────────────────────────────────────────── */

  setKnobStatus: (knobId, status, error) => {
    set((s) => ({
      knobs: s.knobs.map((k) => (k.id === knobId ? { ...k, status, lastError: error ?? null } : k)),
    }));
  },

  fireKnob: async (knobId) => {
    const { knobs, setKnobStatus } = get();
    const knob = knobs.find((k) => k.id === knobId);
    if (!knob || knob.status === "running") return;

    const start = performance.now();
    setKnobStatus(knobId, "running");

    try {
      await simulateKnobExecution(knob);
      const durationMs = Math.round(performance.now() - start);

      set((s) => ({
        knobs: s.knobs.map((k) =>
          k.id === knobId
            ? {
                ...k,
                status: "success" as KnobStatus,
                lastRun: timestamp(),
                lastDurationMs: durationMs,
                lastError: null,
              }
            : k,
        ),
        log: [
          {
            timestamp: timestamp(),
            knobId,
            knobLabel: knob.label,
            status: "success" as KnobStatus,
            durationMs,
            error: null,
          },
          ...s.log,
        ].slice(0, 200),
      }));
    } catch (err) {
      const durationMs = Math.round(performance.now() - start);
      const errorMsg = err instanceof Error ? err.message : String(err);

      set((s) => ({
        knobs: s.knobs.map((k) =>
          k.id === knobId
            ? {
                ...k,
                status: "error" as KnobStatus,
                lastRun: timestamp(),
                lastDurationMs: durationMs,
                lastError: errorMsg,
              }
            : k,
        ),
        log: [
          {
            timestamp: timestamp(),
            knobId,
            knobLabel: knob.label,
            status: "error" as KnobStatus,
            durationMs,
            error: errorMsg,
          },
          ...s.log,
        ].slice(0, 200),
      }));
    }
  },

  /* ── macro actions ─────────────────────────────────────────────── */

  runMacro: async (macroId) => {
    const state = get();
    if (state.activeMacroId) return; // already running a macro

    const macroIndex = state.macros.findIndex((m) => m.id === macroId);
    if (macroIndex === -1) return;

    macroAbort = new AbortController();

    set((s) => ({
      activeMacroId: macroId,
      macros: s.macros.map((m) =>
        m.id === macroId ? { ...m, status: "running", currentStepIndex: 0 } : m,
      ),
    }));

    const macro = get().macros[macroIndex]!;

    for (let i = 0; i < macro.steps.length; i++) {
      if (macroAbort.signal.aborted) {
        set((s) => ({
          activeMacroId: null,
          macros: s.macros.map((m) =>
            m.id === macroId ? { ...m, status: "aborted", currentStepIndex: i } : m,
          ),
        }));
        return;
      }

      const step = macro.steps[i]!;

      /* update current step index */
      set((s) => ({
        macros: s.macros.map((m) => (m.id === macroId ? { ...m, currentStepIndex: i } : m)),
      }));

      /* optional inter-step delay */
      if (step.delayMs && i > 0) {
        await new Promise((r) => setTimeout(r, step.delayMs));
      }

      /* fire the knob */
      await get().fireKnob(step.knobId);

      /* check if knob errored — fail the macro */
      const knob = get().knobs.find((k) => k.id === step.knobId);
      if (knob?.status === "error") {
        set((s) => ({
          activeMacroId: null,
          macros: s.macros.map((m) =>
            m.id === macroId ? { ...m, status: "failed", currentStepIndex: i } : m,
          ),
        }));
        macroAbort = null;
        return;
      }
    }

    set((s) => ({
      activeMacroId: null,
      macros: s.macros.map((m) =>
        m.id === macroId
          ? { ...m, status: "completed", currentStepIndex: macro.steps.length - 1 }
          : m,
      ),
    }));
    macroAbort = null;
  },

  abortMacro: () => {
    macroAbort?.abort();
  },

  /* ── ui actions ────────────────────────────────────────────────── */

  selectKnob: (knobId) => set({ selectedKnobId: knobId }),
  toggleHotkeys: () => set((s) => ({ hotkeyEnabled: !s.hotkeyEnabled })),
  clearLog: () => set({ log: [] }),
}));
