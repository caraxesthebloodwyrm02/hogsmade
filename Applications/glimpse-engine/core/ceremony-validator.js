/**
 * Ceremony / phase validation before expensive pipeline work (Step 4 glimpse adaptation).
 */

/** @param {{ phase: number; hasRawData: boolean; hasMaster: boolean }} state */
export function validatePipelineCeremony(state) {
  const { phase, hasRawData, hasMaster } = state;
  if (!hasMaster) {
    return { valid: false, reason: "missing_master_config" };
  }
  if (!hasRawData) {
    return { valid: false, reason: "missing_raw_data" };
  }
  if (phase === 2) {
    return { valid: false, reason: "pipeline_busy" };
  }
  if (phase !== 1 && phase !== 4) {
    return { valid: false, reason: "invalid_phase_for_pipeline", phase };
  }
  return { valid: true, reason: "" };
}
