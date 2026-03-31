/**
 * @file core/validators/index.js
 * @description Canonical exports for validator modules
 * Agentic validation infrastructure
 */

// Sync validation
export {
  computeChecksum,
  detectDrift,
  validateSyncHealth,
  autoSync,
  ciCheck,
  loadSyncRegistry,
  saveSyncRegistry
} from './sync-validator.js';

// Calibration engine
export {
  createCalibrationEngine,
  createCalibratedFrame,
  comparePolicies,
  CALIBRATION_POLICIES,
  GAP_TYPES
} from './calibration-engine.js';

// Function contracts
export {
  validateFunctionContracts,
  generateFunctionStub,
  generateHealingPatch,
  wrapWithContract,
  formatReport,
  quickValidate
} from './function-contract.js';

/**
 * Runs complete agentic validation suite
 * @param {Object} options - Validation options
 * @returns {Promise<Object>} Complete validation report
 */
export async function runAgenticValidation(options = {}) {
  const { validateSyncHealth } = await import('./sync-validator.js');
  const { validateFunctionContracts } = await import('./function-contract.js');
  
  const startTime = Date.now();
  
  const report = {
    timestamp: new Date().toISOString(),
    durationMs: 0,
    healthy: true,
    checks: {}
  };
  
  // 1. Sync validation
  const syncHealth = validateSyncHealth();
  report.checks.sync = {
    healthy: syncHealth.healthy,
    details: syncHealth
  };
  report.healthy = report.healthy && syncHealth.healthy;
  
  // 2. Future: Add other checks
  // report.checks.contracts = ...
  // report.checks.calibration = ...
  
  report.durationMs = Date.now() - startTime;
  
  return report;
}
