import { useEffect, useRef, useState } from "react";
import { Bookmark, Camera, Plus, Trash2, RotateCcw, ChevronDown } from "lucide-react";
import type { BoardPreset, BoardSnapshot } from "../types/board";

interface PresetBarProps {
  presets: BoardPreset[];
  activePresetId: string | null;
  snapshots: BoardSnapshot[];
  onLoadPreset: (id: string) => void;
  onDeletePreset: (id: string) => void;
  onSavePreset: (name: string, description: string) => void;
  onTakeSnapshot: (label?: string) => void;
  onRestoreSnapshot: (id: string) => void;
}

export function PresetBar({
  presets,
  activePresetId,
  snapshots,
  onLoadPreset,
  onDeletePreset,
  onSavePreset,
  onTakeSnapshot,
  onRestoreSnapshot,
}: PresetBarProps) {
  const [showNewPreset, setShowNewPreset] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [showSnapshots, setShowSnapshots] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showNewPreset) nameInputRef.current?.focus();
  }, [showNewPreset]);

  const handleSave = () => {
    if (!newName.trim()) return;
    onSavePreset(newName.trim(), newDesc.trim());
    setNewName("");
    setNewDesc("");
    setShowNewPreset(false);
  };

  return (
    <div className="rounded-2xl border border-panel-border bg-panel overflow-hidden shadow-md">
      {/* Presets section */}
      <div className="px-4 py-3 border-b border-panel-border">
        <div className="flex items-center gap-2">
          <Bookmark size={12} className="text-text-muted" />
          <span className="text-[11px] text-text-muted uppercase tracking-widest font-medium flex-1">
            Presets
          </span>
          <button
            onClick={() => setShowNewPreset(!showNewPreset)}
            aria-label={showNewPreset ? "Cancel new preset" : "Create new preset"}
            className="p-1.5 rounded-lg hover:bg-panel-light transition-colors text-text-muted hover:text-text-primary cursor-pointer"
          >
            <Plus
              size={12}
              className={`transition-transform duration-200 ${showNewPreset ? "rotate-45" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Preset list */}
      <div className="p-2 space-y-0.5" role="listbox" aria-label="Board presets">
        {presets.map((preset) => (
          <button
            key={preset.id}
            role="option"
            aria-selected={activePresetId === preset.id}
            onClick={() => onLoadPreset(preset.id)}
            className={`press-scale group w-full flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150 text-left border ${
              activePresetId === preset.id
                ? "bg-panel-light border-white/10 shadow-sm"
                : "hover:bg-panel-light/60 border-transparent"
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="text-xs text-text-secondary truncate font-medium">{preset.name}</div>
              <div className="text-[10px] text-text-muted truncate">{preset.description}</div>
            </div>
            <span className="text-[10px] text-text-muted tabular-nums flex-shrink-0">
              {preset.visibleHouses.length}h
            </span>
            {!preset.id.startsWith("preset-") && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeletePreset(preset.id);
                }}
                aria-label={`Delete preset ${preset.name}`}
                className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-led-red/20 text-text-muted hover:text-led-red transition-all cursor-pointer"
              >
                <Trash2 size={11} />
              </button>
            )}
          </button>
        ))}
      </div>

      {/* New preset form */}
      {showNewPreset && (
        <div className="px-3 pb-3 space-y-2 border-t border-panel-border pt-3 animate-fade-in-up">
          <div>
            <label
              htmlFor="preset-name"
              className="text-[10px] text-text-muted uppercase tracking-wider block mb-1"
            >
              Name
            </label>
            <input
              ref={nameInputRef}
              id="preset-name"
              type="text"
              placeholder="e.g. Debug Session"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full bg-surface border border-panel-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-muted/50 transition-colors"
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
          </div>
          <div>
            <label
              htmlFor="preset-desc"
              className="text-[10px] text-text-muted uppercase tracking-wider block mb-1"
            >
              Description
            </label>
            <input
              id="preset-desc"
              type="text"
              placeholder="Optional"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="w-full bg-surface border border-panel-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-muted/50 transition-colors"
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
          </div>
          <button
            onClick={handleSave}
            disabled={!newName.trim()}
            className="w-full bg-panel-raised hover:bg-knob-highlight border border-panel-border-light rounded-lg px-3 py-2 text-xs text-text-secondary font-medium transition-colors disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed press-scale"
          >
            Save Preset
          </button>
        </div>
      )}

      {/* Snapshots section */}
      <div className="border-t border-panel-border">
        <div className="flex items-center">
          <button
            onClick={() => setShowSnapshots(!showSnapshots)}
            aria-expanded={showSnapshots}
            className="flex-1 flex items-center gap-2 px-4 py-2.5 cursor-pointer hover:bg-panel-light/60 transition-colors text-left"
          >
            <Camera size={12} className="text-text-muted" />
            <span className="text-[11px] text-text-muted uppercase tracking-widest font-medium flex-1">
              Snapshots ({snapshots.length})
            </span>
            <ChevronDown
              size={12}
              className={`text-text-muted transition-transform duration-200 ${
                showSnapshots ? "" : "-rotate-90"
              }`}
            />
          </button>
          <button
            onClick={() => onTakeSnapshot()}
            aria-label="Take new snapshot"
            className="p-2 mr-2 rounded-lg hover:bg-panel-light transition-colors text-text-muted hover:text-led-green cursor-pointer"
          >
            <Camera size={11} />
          </button>
        </div>

        {showSnapshots && snapshots.length > 0 && (
          <div
            className="px-2 pb-2 space-y-0.5 animate-expand"
            role="list"
            aria-label="Board snapshots"
          >
            {snapshots
              .slice(-10)
              .reverse()
              .map((snap) => (
                <button
                  key={snap.id}
                  role="listitem"
                  onClick={() => onRestoreSnapshot(snap.id)}
                  className="press-scale group w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-panel-light cursor-pointer transition-colors text-left"
                >
                  <RotateCcw
                    size={11}
                    className="text-text-muted group-hover:text-led-blue flex-shrink-0 transition-colors"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-text-tertiary truncate">
                      {snap.label || snap.id.slice(0, 12)}
                    </div>
                    <div className="text-[10px] text-text-muted">
                      {new Date(snap.timestamp).toLocaleTimeString()} · #{snap.hash.slice(0, 6)}
                    </div>
                  </div>
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
