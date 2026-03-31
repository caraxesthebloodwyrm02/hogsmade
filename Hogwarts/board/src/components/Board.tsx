import { Search, Zap } from "lucide-react";
import type { House } from "../types/board";
import { HOUSE_META } from "../types/board";
import { useBoardStore } from "../stores/board-store";
import { Module } from "./Module";
import { Screen } from "./Screen";
import { KnobDetail } from "./KnobDetail";
import { PocketManual } from "./PocketManual";
import { PresetBar } from "./PresetBar";

export function Board() {
  const {
    knobs,
    selectedKnobId,
    visibleHouses,
    presets,
    activePresetId,
    snapshots,
    searchQuery,
    selectKnob,
    toggleHouse,
    setSearchQuery,
    savePreset,
    loadPreset,
    deletePreset,
    takeSnapshot,
    restoreSnapshot,
    filteredKnobs,
  } = useBoardStore();

  const visible = filteredKnobs();
  const selectedKnob = knobs.find((k) => k.id === selectedKnobId) ?? null;
  const focusedKnob = selectedKnob;

  const houses: House[] = ["observation", "enforcement", "experimentation", "orchestration"];

  return (
    <div className="min-h-dvh bg-surface text-text-primary">
      {/* ── Top bar ── */}
      <header className="sticky top-0 z-40 border-b border-panel-border bg-panel/95 backdrop-blur-md shadow-md">
        <div className="max-w-[1920px] mx-auto px-4 lg:px-6 py-3 flex items-center gap-4">
          {/* Title */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <Zap size={18} className="text-led-green" style={{ filter: "drop-shadow(0 0 4px rgba(52, 211, 153, 0.4))" }} />
            <h1 className="text-sm font-bold tracking-tight text-text-primary hidden sm:block">
              Hogwarts Synthesizer Board
            </h1>
            <h1 className="text-sm font-bold tracking-tight text-text-primary sm:hidden">HSB</h1>
          </div>

          {/* House toggles */}
          <nav className="flex items-center gap-1 ml-2" aria-label="House filters">
            {houses.map((house) => {
              const meta = HOUSE_META[house];
              const active = visibleHouses.includes(house);
              const count = knobs.filter((k) => k.house === house).length;
              return (
                <button
                  key={house}
                  onClick={() => toggleHouse(house)}
                  aria-pressed={active}
                  aria-label={`${active ? "Hide" : "Show"} ${meta.label} (${count} tools)`}
                  className={`press-scale flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all duration-150 cursor-pointer border ${active
                      ? "border-white/10 bg-panel-light text-text-secondary shadow-sm"
                      : "border-transparent text-text-muted hover:text-text-tertiary hover:bg-panel-light/40"
                    }`}
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full transition-all duration-200"
                    style={{
                      backgroundColor: meta.color,
                      opacity: active ? 1 : 0.25,
                      boxShadow: active ? `0 0 6px ${meta.color}40` : "none",
                    }}
                  />
                  <span className="hidden md:inline">{meta.label}</span>
                  <span className="tabular-nums text-text-muted">{count}</span>
                </button>
              );
            })}
          </nav>

          {/* Search */}
          <div className="flex-1 max-w-xs ml-auto relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              type="search"
              placeholder="Search tools, servers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search tools"
              className="w-full bg-surface border border-panel-border rounded-xl pl-8 pr-3 py-2 text-xs text-text-primary placeholder:text-text-muted/50 transition-colors"
            />
            {searchQuery && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-text-muted tabular-nums">
                {visible.length}
              </span>
            )}
          </div>

          {/* Tool count */}
          <div className="text-xs text-text-muted tabular-nums flex-shrink-0 hidden lg:block">
            {visible.length}/{knobs.length}
          </div>
        </div>
      </header>

      {/* ── Main layout ── */}
      <div className="max-w-[1920px] mx-auto flex gap-4 p-4 lg:p-5 min-h-[calc(100dvh-56px)]">
        {/* Left sidebar — Presets + Manual */}
        <aside className="w-60 flex-shrink-0 space-y-4 hidden lg:block sticky top-[60px] self-start max-h-[calc(100dvh-76px)] overflow-y-auto">
          <PresetBar
            presets={presets}
            activePresetId={activePresetId}
            snapshots={snapshots}
            onLoadPreset={loadPreset}
            onDeletePreset={deletePreset}
            onSavePreset={savePreset}
            onTakeSnapshot={takeSnapshot}
            onRestoreSnapshot={restoreSnapshot}
          />
          <PocketManual knobs={visible} visibleHouses={visibleHouses} />
        </aside>

        {/* Center — Modules */}
        <main className="flex-1 space-y-4 min-w-0" aria-label="Tool modules">
          {houses
            .filter((h) => visibleHouses.includes(h))
            .map((house) => {
              const houseKnobs = visible.filter((k) => k.house === house);
              if (houseKnobs.length === 0) return null;
              return (
                <Module
                  key={house}
                  house={house}
                  knobs={houseKnobs}
                  selectedKnobId={selectedKnobId}
                  onKnobClick={selectKnob}
                />
              );
            })}

          {visible.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-text-muted gap-3">
              <Search size={36} className="opacity-15" />
              <p className="text-sm text-text-tertiary">No tools match your filters</p>
              <p className="text-xs text-text-muted">Adjust house toggles or search query</p>
            </div>
          )}
        </main>

        {/* Right sidebar — Screen + Detail */}
        <aside className="w-[340px] flex-shrink-0 space-y-4 hidden xl:block sticky top-[60px] self-start max-h-[calc(100dvh-76px)] overflow-y-auto">
          <Screen focusedKnob={focusedKnob} />
          {selectedKnob && (
            <KnobDetail
              knob={selectedKnob}
              onClose={() => selectKnob(null)}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
