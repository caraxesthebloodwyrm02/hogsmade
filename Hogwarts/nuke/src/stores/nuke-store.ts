import { create } from "zustand";
import type { NukeState, NukeKnob, NukeMacro, KnobStatus } from "../types/nuke.ts";
import { KNOB_REGISTRY } from "../data/knob-registry.ts";
import { MACRO_PRESETS } from "../data/macro-presets.ts";
import { callMcp } from "../lib/mcp-bridge.ts";

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

/** Execute all MCP calls defined on a knob sequentially.
 *  Uses the real bridge when VITE_MCP_BRIDGE_URL is set, simulation otherwise. */
async function executeKnobCalls(knob: NukeKnob): Promise<void> {
  for (const call of knob.calls) {
    await callMcp(call.server, call.tool, (call.params ?? {}) as Record<string, unknown>);
  }
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
      await executeKnobCalls(knob);
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

      // Auto-snapshot on success (fire-and-forget — does not block knob state)
      void callMcp("overview-server", "checkpoint", { depth: "summary" }).catch(() => {
        // snapshot failure is non-fatal
      });
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
