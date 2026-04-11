/* ── Nuke Type System ─────────────────────────────────────────────── */

/** Physical key on the QWERTY pad */
export type HotKey =
  | "q"
  | "w"
  | "e"
  | "r"
  | "t"
  | "a"
  | "s"
  | "d"
  | "f"
  | "g"
  | "z"
  | "x"
  | "c"
  | "v"
  | "b"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5";

/** Keyboard rows map to operational tiers */
export type KeyRow = "scan" | "analysis" | "zap";

export const ROW_META: Record<KeyRow, { label: string; keys: readonly HotKey[] }> = {
  scan: { label: "Quick Scans", keys: ["q", "w", "e", "r", "t"] },
  analysis: { label: "Analysis", keys: ["a", "s", "d", "f", "g", "1"] },
  zap: { label: "Zap (Remediation)", keys: ["z", "x", "c", "v", "b"] },
} as const;

/** MCP tool call descriptor — one step a knob can fire */
export interface McpCall {
  readonly server: string;
  readonly tool: string;
  readonly params?: Record<string, unknown>;
}

/** Knob execution status */
export type KnobStatus = "idle" | "running" | "success" | "error";

/** A single knob on the pad */
export interface NukeKnob {
  readonly id: string;
  readonly key: HotKey;
  readonly row: KeyRow;
  readonly label: string;
  readonly description: string;
  readonly calls: readonly McpCall[];
  status: KnobStatus;
  lastRun: string | null;
  lastDurationMs: number | null;
  lastError: string | null;
}

/** One step in a macro sequence */
export interface MacroStep {
  readonly knobId: string;
  readonly delayMs?: number;
}

/** Macro execution status */
export type MacroStatus = "idle" | "running" | "completed" | "failed" | "aborted";

/** A fast-forward macro — ordered sequence of knob activations */
export interface NukeMacro {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly steps: readonly MacroStep[];
  status: MacroStatus;
  currentStepIndex: number;
}

/** Entry in the execution log */
export interface LogEntry {
  readonly timestamp: string;
  readonly knobId: string;
  readonly knobLabel: string;
  readonly status: KnobStatus;
  readonly durationMs: number | null;
  readonly error: string | null;
}

/** Top-level pad state for the store */
export interface NukeState {
  /* data */
  knobs: NukeKnob[];
  macros: NukeMacro[];
  log: LogEntry[];

  /* ui */
  activeMacroId: string | null;
  selectedKnobId: string | null;
  hotkeyEnabled: boolean;

  /* actions — knobs */
  fireKnob: (knobId: string) => Promise<void>;
  setKnobStatus: (knobId: string, status: KnobStatus, error?: string) => void;

  /* actions — macros */
  runMacro: (macroId: string) => Promise<void>;
  abortMacro: () => void;

  /* actions — ui */
  selectKnob: (knobId: string | null) => void;
  toggleHotkeys: () => void;
  clearLog: () => void;
}
