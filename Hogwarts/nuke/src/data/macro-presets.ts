import type { NukeMacro } from "../types/nuke.ts";

export const MACRO_PRESETS: readonly NukeMacro[] = [
  {
    id: "morning-sweep",
    name: "Morning Sweep",
    description: "Daily health check — quick pulse, workspace scan, enforcement, git health",
    steps: [
      { knobId: "quick-pulse" },
      { knobId: "workspace-scan", delayMs: 500 },
      { knobId: "enforcement", delayMs: 500 },
      { knobId: "git-health", delayMs: 500 },
    ],
    status: "idle",
    currentStepIndex: 0,
  },
  {
    id: "deep-clean",
    name: "Deep Clean",
    description: "Full diagnostic then cleanup — diagnostic, zap temp, clean caches",
    steps: [
      { knobId: "full-diagnostic" },
      { knobId: "zap-temp", delayMs: 1000 },
      { knobId: "clean-caches", delayMs: 1000 },
    ],
    status: "idle",
    currentStepIndex: 0,
  },
  {
    id: "line-check",
    name: "Line Check",
    description: "Structural audit, coverage gaps, then run tests",
    steps: [
      { knobId: "xray-line" },
      { knobId: "test-gaps", delayMs: 500 },
      { knobId: "validate-suite", delayMs: 500 },
    ],
    status: "idle",
    currentStepIndex: 0,
  },
  {
    id: "full-decontamination",
    name: "Full Decontamination",
    description: "Nuclear option — diagnostic, structural fix, purge, test, then pulse check",
    steps: [
      { knobId: "full-diagnostic" },
      { knobId: "xray-line", delayMs: 1000 },
      { knobId: "zap-temp", delayMs: 1000 },
      { knobId: "clean-caches", delayMs: 500 },
      { knobId: "validate-suite", delayMs: 1000 },
      { knobId: "quick-pulse", delayMs: 500 },
    ],
    status: "idle",
    currentStepIndex: 0,
  },
  {
    id: "dep-sweep",
    name: "Dep Sweep",
    description: "Dependency review — workspace scan, dep check, filter signals, then quick pulse",
    steps: [
      { knobId: "workspace-scan" },
      { knobId: "dep-check", delayMs: 500 },
      { knobId: "filter-signals", delayMs: 500 },
      { knobId: "quick-pulse", delayMs: 500 },
    ],
    status: "idle",
    currentStepIndex: 0,
  },
] as const;
