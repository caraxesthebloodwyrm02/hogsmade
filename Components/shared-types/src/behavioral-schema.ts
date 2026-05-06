import type { AgentBias } from "./signal-model.js";

/**
 * Behavioral Schema — Defines trigger logic, probing patterns, and routine
 * conditions for autonomous agents within the Mangrove ecosystem.
 */

export type RoutineType =
  | "probe"
  | "evaluate"
  | "triage"
  | "stabilize"
  | "synthesize"
  | "architect";

export interface BehavioralTrigger {
  id: string;
  description: string;
  /** The core event condition that fires the trigger */
  condition:
    | "anomaly_detected"
    | "threshold_crossed"
    | "idle_timeout"
    | "commit_detected"
    | "gate_breached";
  /** Sensitivity threshold needed to fire (0.0 to 1.0) */
  sensitivity: number;
  urgency: "low" | "medium" | "high" | "critical";
}

export interface AgentRoutine {
  routineId: string;
  type: RoutineType;
  /** The specific focus this routine applies, linking to the Magnetism attraction matrix */
  bias: AgentBias;
  triggers: BehavioralTrigger[];
  /** Optional minimum threshold state required to execute this routine (e.g., 'elevated') */
  requiresThresholdState?: string;
}

/**
 * Standard templates for behavioral routines.
 */
export const ROUTINE_TEMPLATES: Record<string, AgentRoutine> = {
  SAFETY_PROBE: {
    routineId: "rt_safety_probe",
    type: "probe",
    bias: "safety",
    triggers: [
      {
        id: "tr_anomaly",
        description: "High sensitivity anomaly detection",
        condition: "anomaly_detected",
        sensitivity: 0.8,
        urgency: "medium",
      },
    ],
  },
  RIFT_EVALUATION: {
    routineId: "rt_rift_evaluation",
    type: "evaluate",
    bias: "clarity",
    requiresThresholdState: "evaluating",
    triggers: [
      {
        id: "tr_threshold",
        description: "Quality threshold evaluation crossed",
        condition: "threshold_crossed",
        sensitivity: 0.95,
        urgency: "high",
      },
    ],
  },
};
