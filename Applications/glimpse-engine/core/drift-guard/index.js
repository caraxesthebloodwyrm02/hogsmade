/**
 * @file core/drift-guard/index.js
 * @description Barrel re-export — backward-compatible entry point
 *
 * All classes extracted to focused modules:
 *   formulas.js  — DriftFormulas, constants, policies
 *   detector.js  — DriftDetector
 *   resolver.js  — DriftResolver
 *   telemetry.js — DriftTelemetry
 *   guard.js     — DriftGuard orchestrator + factory
 */

export { VERSION, DEFAULT_STATE_PATH, LOG_PATH, DRIFT_POLICIES, DriftFormulas } from './formulas.js';
export { DriftDetector } from './detector.js';
export { DriftResolver } from './resolver.js';
export { DriftTelemetry } from './telemetry.js';
export { DriftGuard, createDriftGuard } from './guard.js';
export { default } from './guard.js';
