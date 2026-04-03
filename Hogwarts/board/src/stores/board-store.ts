import { create } from "zustand";
import type {
  BoardKnob,
  BoardPreset,
  BoardSnapshot,
  House,
  KnobState,
  HealthIndicator,
} from "../types/board";
import { TOOL_REGISTRY } from "../data/tool-registry";

interface BoardStore {
  knobs: BoardKnob[];
  selectedKnobId: string | null;
  visibleHouses: House[];
  screenFocus: string | null;
  presets: BoardPreset[];
  activePresetId: string | null;
  snapshots: BoardSnapshot[];
  searchQuery: string;

  selectKnob: (id: string | null) => void;
  toggleHouse: (house: House) => void;
  setScreenFocus: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  updateKnobFlags: (knobId: string, flags: string[]) => void;
  updateKnobHealth: (knobId: string, health: HealthIndicator) => void;

  savePreset: (name: string, description: string) => void;
  loadPreset: (presetId: string) => void;
  deletePreset: (presetId: string) => void;

  takeSnapshot: (label?: string) => void;
  restoreSnapshot: (snapshotId: string) => void;

  filteredKnobs: () => BoardKnob[];
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function computeHash(obj: unknown): string {
  const str = JSON.stringify(obj);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

function buildKnobStates(knobs: BoardKnob[]): Record<string, KnobState> {
  const states: Record<string, KnobState> = {};
  for (const knob of knobs) {
    const paramValues: Record<string, unknown> = {};
    for (const param of knob.parameters) {
      if (param.default !== undefined) {
        paramValues[param.name] = param.default;
      }
    }
    states[knob.id] = {
      enabled: knob.status !== "disabled",
      paramValues,
      flags: [...knob.flags],
    };
  }
  return states;
}

const DEFAULT_PRESETS: BoardPreset[] = [
  {
    id: "preset-morning",
    name: "Morning",
    description: "Start-of-day orientation — briefing, alerts, work queue",
    createdAt: new Date().toISOString(),
    knobStates: {},
    visibleHouses: ["observation"],
    screenFocus: "morning_briefing",
  },
  {
    id: "preset-deep-work",
    name: "Deep Work",
    description: "Focused coding session — observation + experimentation",
    createdAt: new Date().toISOString(),
    knobStates: {},
    visibleHouses: ["observation", "experimentation"],
    screenFocus: "focus_status",
  },
  {
    id: "preset-audit",
    name: "Audit",
    description: "Security and compliance review",
    createdAt: new Date().toISOString(),
    knobStates: {},
    visibleHouses: ["enforcement"],
    screenFocus: "enforcement_status",
  },
  {
    id: "preset-maintenance",
    name: "Maintenance",
    description: "System health sweep and cleanup",
    createdAt: new Date().toISOString(),
    knobStates: {},
    visibleHouses: ["orchestration"],
    screenFocus: "full_diagnostic",
  },
  {
    id: "preset-exploration",
    name: "Exploration",
    description: "Full ecosystem awareness — all houses visible",
    createdAt: new Date().toISOString(),
    knobStates: {},
    visibleHouses: ["observation", "enforcement", "experimentation", "orchestration"],
    screenFocus: "checkpoint",
  },
];

export const useBoardStore = create<BoardStore>((set, get) => ({
  knobs: [...TOOL_REGISTRY],
  selectedKnobId: null,
  visibleHouses: ["observation", "enforcement", "experimentation", "orchestration"],
  screenFocus: null,
  presets: [...DEFAULT_PRESETS],
  activePresetId: null,
  snapshots: [],
  searchQuery: "",

  selectKnob: (id) => set({ selectedKnobId: id, screenFocus: id }),

  toggleHouse: (house) =>
    set((state) => {
      const visible = state.visibleHouses.includes(house)
        ? state.visibleHouses.filter((h) => h !== house)
        : [...state.visibleHouses, house];
      return { visibleHouses: visible.length > 0 ? visible : [house] };
    }),

  setScreenFocus: (id) => set({ screenFocus: id }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  updateKnobFlags: (knobId, flags) =>
    set((state) => ({
      knobs: state.knobs.map((k) => (k.id === knobId ? { ...k, flags } : k)),
    })),

  updateKnobHealth: (knobId, health) =>
    set((state) => ({
      knobs: state.knobs.map((k) => (k.id === knobId ? { ...k, healthIndicator: health } : k)),
    })),

  savePreset: (name, description) => {
    const state = get();
    const preset: BoardPreset = {
      id: generateId("preset"),
      name,
      description,
      createdAt: new Date().toISOString(),
      knobStates: buildKnobStates(state.knobs),
      visibleHouses: [...state.visibleHouses],
      screenFocus: state.screenFocus,
    };
    set((s) => ({ presets: [...s.presets, preset], activePresetId: preset.id }));
  },

  loadPreset: (presetId) => {
    const state = get();
    const preset = state.presets.find((p) => p.id === presetId);
    if (!preset) return;
    set({
      visibleHouses: [...preset.visibleHouses],
      screenFocus: preset.screenFocus,
      activePresetId: presetId,
    });
  },

  deletePreset: (presetId) =>
    set((state) => ({
      presets: state.presets.filter((p) => p.id !== presetId),
      activePresetId: state.activePresetId === presetId ? null : state.activePresetId,
    })),

  takeSnapshot: (label) => {
    const state = get();
    const knobStates = buildKnobStates(state.knobs);
    const serverHealth: Record<string, HealthIndicator> = {};
    for (const knob of state.knobs) {
      if (!serverHealth[knob.server]) {
        serverHealth[knob.server] = knob.healthIndicator;
      }
    }
    const snapshot: BoardSnapshot = {
      id: generateId("snap"),
      presetId: state.activePresetId ?? "none",
      timestamp: new Date().toISOString(),
      label,
      knobStates,
      serverHealth,
      hash: computeHash(knobStates),
    };
    set((s) => ({ snapshots: [...s.snapshots, snapshot] }));
  },

  restoreSnapshot: (snapshotId) => {
    const state = get();
    const snapshot = state.snapshots.find((s) => s.id === snapshotId);
    if (!snapshot) return;
    set({
      knobs: state.knobs.map((k) => {
        const saved = snapshot.knobStates[k.id];
        if (!saved) return k;
        return { ...k, flags: saved.flags, status: saved.enabled ? "ready" : "disabled" };
      }),
    });
  },

  filteredKnobs: () => {
    const state = get();
    let knobs = state.knobs.filter((k) => state.visibleHouses.includes(k.house));
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      knobs = knobs.filter(
        (k) =>
          k.id.toLowerCase().includes(q) ||
          k.label.toLowerCase().includes(q) ||
          k.description.toLowerCase().includes(q) ||
          k.server.toLowerCase().includes(q),
      );
    }
    return knobs;
  },
}));
