export type House = "observation" | "enforcement" | "experimentation" | "orchestration";

export type KnobStatus = "ready" | "running" | "error" | "disabled";
export type HealthIndicator = "green" | "yellow" | "red" | "unknown";
export type ParamType = "string" | "number" | "boolean" | "enum" | "object" | "array";

export interface KnobParam {
  name: string;
  type: ParamType;
  description: string;
  default?: unknown;
  constraints?: { min?: number; max?: number; options?: string[] };
  required?: boolean;
}

export interface InvocationRecord {
  timestamp: string;
  durationMs: number;
  status: "success" | "failure" | "error";
  outputPreview?: string;
}

export interface BoardKnob {
  id: string;
  server: string;
  house: House;
  label: string;
  description: string;
  parameters: KnobParam[];
  flags: string[];
  status: KnobStatus;
  lastInvocation?: InvocationRecord;
  healthIndicator: HealthIndicator;
}

export interface ServerProfile {
  key: string;
  name: string;
  house: House;
  runtime: "typescript" | "python";
  motto?: string;
  toolCount: number;
}

export interface KnobState {
  enabled: boolean;
  paramValues: Record<string, unknown>;
  flags: string[];
}

export interface BoardPreset {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  knobStates: Record<string, KnobState>;
  visibleHouses: House[];
  screenFocus: string | null;
}

export interface BoardSnapshot {
  id: string;
  presetId: string;
  timestamp: string;
  label?: string;
  knobStates: Record<string, KnobState>;
  serverHealth: Record<string, HealthIndicator>;
  hash: string;
}

export const HOUSE_META: Record<House, { label: string; motto: string; color: string; bgClass: string }> = {
  observation: {
    label: "Observation",
    motto: "See clearly",
    color: "#7dd3fc",
    bgClass: "bg-house-observation",
  },
  enforcement: {
    label: "Enforcement",
    motto: "Hold the line",
    color: "#fca5a5",
    bgClass: "bg-house-enforcement",
  },
  experimentation: {
    label: "Experimentation",
    motto: "Try, measure, learn",
    color: "#6ee7b7",
    bgClass: "bg-house-experimentation",
  },
  orchestration: {
    label: "Orchestration",
    motto: "Coordinate and flow",
    color: "#fcd34d",
    bgClass: "bg-house-orchestration",
  },
};
