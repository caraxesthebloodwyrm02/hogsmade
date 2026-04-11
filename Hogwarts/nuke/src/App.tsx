import { useEffect, useCallback } from "react";
import { useNukeStore } from "./stores/nuke-store.ts";
import { KNOB_BY_KEY } from "./data/knob-registry.ts";
import { Pad } from "./components/Pad.tsx";
import { MacroRail } from "./components/MacroRail.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { RouteConfigLens } from "./components/RouteConfigLens.tsx";
import type { HotKey } from "./types/nuke.ts";

const VALID_KEYS = new Set<string>(KNOB_BY_KEY.keys());

export function App() {
  const fireKnob = useNukeStore((s) => s.fireKnob);
  const hotkeyEnabled = useNukeStore((s) => s.hotkeyEnabled);
  const activeMacroId = useNukeStore((s) => s.activeMacroId);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!hotkeyEnabled) return;
      if (activeMacroId) return; // block hotkeys during macro execution
      if (e.repeat) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();
      if (!VALID_KEYS.has(key)) return;

      e.preventDefault();
      const knob = KNOB_BY_KEY.get(key as HotKey);
      if (knob) {
        void fireKnob(knob.id);
      }
    },
    [fireKnob, hotkeyEnabled, activeMacroId],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="flex flex-col min-h-screen p-4 gap-4">
      {/* header */}
      <header className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <h1
            className="text-lg font-bold tracking-wider uppercase"
            style={{ color: "var(--nuke-text)" }}
          >
            Nuke
          </h1>
          <span className="text-xs" style={{ color: "var(--nuke-text-muted)" }}>
            Anti-Staleness Macro Pad
          </span>
        </div>
        <HotkeyToggle />
      </header>

      {/* main pad */}
      <Pad />

      {/* macro rail */}
      <MacroRail />

      {/* bus routing lens */}
      <RouteConfigLens />

      {/* status bar / log */}
      <StatusBar />
    </div>
  );
}

function HotkeyToggle() {
  const hotkeyEnabled = useNukeStore((s) => s.hotkeyEnabled);
  const toggleHotkeys = useNukeStore((s) => s.toggleHotkeys);

  return (
    <button
      onClick={toggleHotkeys}
      className="px-3 py-1 rounded text-xs font-medium transition-colors"
      style={{
        background: hotkeyEnabled ? "var(--led-success)" : "var(--nuke-border)",
        color: hotkeyEnabled ? "#0a0a0f" : "var(--nuke-text-dim)",
      }}
    >
      Hotkeys {hotkeyEnabled ? "ON" : "OFF"}
    </button>
  );
}
