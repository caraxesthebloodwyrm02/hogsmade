/**
 * @file shared-types/examples/mcp-guard-usage.ts
 * @description Selective application examples for MCP guard mitigation
 *
 * Shows focused, tailored placement of guards for aggressive mitigation
 * of void pattern bugs in specific server contexts.
 */

import {
  guardedOperation,
  guardedAuditEmit,
  guardedFileWrite,
  guardedServerStartup,
  createGuardConfig,
  MITIGATION_SCOPES,
  type MitigationScope,
} from "../src/mcp-guard.js";
import { createLogger } from "../src/audit-client.js";

// ═══════════════════════════════════════════════════════════════════
// EXAMPLE 1: Grid-Server (SECURITY scope)
// Critical: GATE audits, nonce registry - fail closed
// ═══════════════════════════════════════════════════════════════════

export async function gridServerHardenedStartup(
  startFn: () => Promise<void>
): Promise<void> {
  const logger = createLogger("grid-server");

  // SECURITY scope: max retries, fail closed on audit, verify writes
  await guardedServerStartup(startFn, "grid-server", logger);
}

export async function gridServerGATEAudit(
  writeAuditFn: () => Promise<void>
): Promise<void> {
  const logger = createLogger("grid-server");
  const config = createGuardConfig("grid-server", logger, "SECURITY");

  // SECURITY scope forces failClosedOnAudit
  const result = await guardedOperation(writeAuditFn, config, "gate-audit");

  if (!result.success) {
    // Fail closed - audit failure is critical
    throw new Error(`GATE audit failed: ${result.error?.message}`);
  }
}

export async function gridServerNonceBurn(
  writeNonceFn: () => Promise<void>,
  verifyReadFn: () => Promise<unknown>
): Promise<void> {
  const logger = createLogger("grid-server");
  const config = createGuardConfig("grid-server", logger, "SECURITY");

  // Write + verify read-back for nonce registry
  const result = await guardedFileWrite(writeNonceFn, verifyReadFn, config, "nonce-registry");

  if (!result.success) {
    logger.error("Nonce burn failed - potential replay attack risk", { error: result.error?.message });
    // Continue but log critical - nonce already validated
  }
}

// ═══════════════════════════════════════════════════════════════════
// EXAMPLE 2: Echoes/Seeds/Lots Server (AUDIT scope)
// High: emitAudit fire-and-forget - retry aggressively
// ═══════════════════════════════════════════════════════════════════

export async function echoesServerAuditEmit(
  tool: string,
  status: "success" | "failure" | "blocked",
  metadata?: Record<string, unknown>
): Promise<void> {
  const logger = createLogger("echoes-server");

  // AUDIT scope: retry 3x, don't fail closed (echoes is best-effort audit)
  const success = await guardedAuditEmit(
    "echoes-server",
    tool,
    status,
    { failClosed: false, logger },
    metadata
  );

  if (!success) {
    // Log but continue - audit loss is serious but shouldn't block operation
    logger.warn(`Audit emit failed for ${tool} - proceeding in degraded mode`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// EXAMPLE 3: Pulse-Server (PERSISTENCE scope)
// Medium: Journal, focus, preferences - verify writes
// ═══════════════════════════════════════════════════════════════════

export async function pulseServerSaveJournal(
  writeFn: () => Promise<void>,
  readBackFn: () => Promise<unknown>
): Promise<void> {
  const logger = createLogger("pulse-server");
  const config = createGuardConfig("pulse-server", logger, "PERSISTENCE");

  const result = await guardedFileWrite(writeFn, readBackFn, config, "journal.json");

  if (!result.success) {
    // Log and continue - journal loss is recoverable
    logger.error("Journal save failed", { error: result.error?.message });
  }
}

// ═══════════════════════════════════════════════════════════════════
// EXAMPLE 4: Maintain-Server (STANDARD scope)
// Low: Platform detection - minimal guarding
// ═══════════════════════════════════════════════════════════════════

export async function maintainServerPlatformDetect(
  detectFn: () => Promise<unknown>
): Promise<unknown | null> {
  const logger = createLogger("maintain-server");
  const config = createGuardConfig("maintain-server", logger, "STANDARD");

  const result = await guardedOperation(detectFn, config, "platform-detect");

  if (!result.success) {
    // Log warning but return null - caller handles missing data
    logger.warn("Platform detection failed", { error: result.error?.message });
    return null;
  }

  return result.data;
}

// ═══════════════════════════════════════════════════════════════════
// EXAMPLE 5: Afloat-Server Workflow Save
// Mixed: Workflow = PERSISTENCE, audit = AUDIT
// ═══════════════════════════════════════════════════════════════════

export async function afloatServerWorkflowSave(
  workflowId: string,
  writeWorkflowFn: () => Promise<void>,
  readWorkflowFn: () => Promise<unknown>
): Promise<void> {
  const logger = createLogger("afloat-server");

  // Workflow persistence is important - use PERSISTENCE scope
  const config = createGuardConfig("afloat-server", logger, "PERSISTENCE");
  const result = await guardedFileWrite(
    writeWorkflowFn,
    readWorkflowFn,
    config,
    `workflow-${workflowId}.json`
  );

  if (!result.success) {
    throw new Error(`Workflow save failed: ${result.error?.message}`);
  }

  // Also emit audit - but don't fail on audit
  await guardedAuditEmit(
    "afloat-server",
    "workflow_save",
    "success",
    { failClosed: false, logger },
    { workflowId }
  );
}

// ═══════════════════════════════════════════════════════════════════
// SCOPE SELECTION GUIDE
// ═══════════════════════════════════════════════════════════════════

/**
 * SECURITY scope - Use for:
 * - GATE audit writes (grid-server)
 * - Nonce registry writes (grid-server)
 * - Security-critical authentication events
 *
 * AUDIT scope - Use for:
 * - emitAudit calls (echoes, seeds, lots, pulse)
 * - Non-security audit trails
 * - Best-effort but retry aggressively
 *
 * PERSISTENCE scope - Use for:
 * - User data writes (pulse journal, afloat workflows)
 * - Configuration saves
 * - Cache persistence
 *
 * STANDARD scope - Use for:
 * - Platform detection (maintain-server)
 * - Optional metrics collection
 * - Non-critical background tasks
 */

export const SCOPE_GUIDE = {
  // Critical - fail closed
  "grid-server/gate-audit": "SECURITY",
  "grid-server/nonce-registry": "SECURITY",

  // High - retry aggressively
  "echoes-server/emit-audit": "AUDIT",
  "seeds-server/emit-audit": "AUDIT",
  "lots-server/emit-audit": "AUDIT",
  "maintain-server/cleanup-audit": "AUDIT",

  // Medium - verify writes
  "pulse-server/journal-save": "PERSISTENCE",
  "pulse-server/focus-archive": "PERSISTENCE",
  "pulse-server/preferences": "PERSISTENCE",
  "afloat-server/workflow-save": "PERSISTENCE",

  // Low - minimal guarding
  "maintain-server/platform-detect": "STANDARD",
  "glimpse-server/metrics": "STANDARD",
} as const;
