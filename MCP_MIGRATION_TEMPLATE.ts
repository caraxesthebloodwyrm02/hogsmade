/**
 * MCP Server Hardened Migration Template
 * 
 * Add these imports and initialization code to migrate existing MCP servers
 * to use the hardened merit guard with void-pattern-free implementation.
 */

// === ADD THESE IMPORTS ===
import {
  ActionClass,
  createHardenedMeritGuard,
  HardenedMcpMeritGuard,
} from "@cascade/shared-types";

// === ADD TO buildServer() FUNCTION ===

export function buildServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: VERSION,
  });

  // Initialize hardened merit guard for session-first identity enforcement
  const meritGuard = createHardenedMeritGuard(
    SERVER_NAME,
    process.env.GRID_API_URL,
  );

  // === HEALTH CHECK (PUBLIC_BASIC) ===
  meritGuard.registerGuardedTool(
    server,
    "health_check",
    {
      actionClass: ActionClass.PUBLIC_BASIC,
      description: "Check server health and status",
    },
    async () => {
      return {
        status: "ok",
        server: SERVER_NAME,
        version: VERSION,
        timestamp: new Date().toISOString(),
        circuitState: meritGuard.getCircuitState(),
        metrics: meritGuard.getMetrics(),
      };
    },
  );

  // === EXAMPLE: READ OPERATION (ANALYSIS_READ) ===
  meritGuard.registerGuardedTool(
    server,
    "list_data",
    {
      actionClass: ActionClass.ANALYSIS_READ,
      description: "List data with merit-guarded access",
      inputSchema: z.object({ limit: z.number().optional() }),
    },
    async (args: { limit?: number }) => {
      // Your original logic here
      return { items: [] };
    },
  );

  // === EXAMPLE: WRITE OPERATION (ACTION_WRITE) ===
  meritGuard.registerGuardedTool(
    server,
    "create_data",
    {
      actionClass: ActionClass.ACTION_WRITE,
      description: "Create data with merit-guarded write access",
      requiredScope: Scope.WRITE,
      inputSchema: z.object({ data: z.any() }),
    },
    async (args: { data: any }) => {
      // Your original write logic here
      return { created: true };
    },
  );

  // === EXAMPLE: ADMIN OPERATION (CONTROL_ADMIN) ===
  meritGuard.registerGuardedTool(
    server,
    "admin_operation",
    {
      actionClass: ActionClass.CONTROL_ADMIN,
      description: "Admin operation requiring B3 privilege",
      requiredScope: Scope.ADMIN,
    },
    async () => {
      // Admin logic here
      return { result: "success" };
    },
  );

  return server;
}

/**
 * Error Handling Guide:
 * 
 * The hardened guard automatically handles these scenarios:
 * - Invalid session_id → 400 error with INVALID_SESSION_FORMAT
 * - Rate limit exceeded → 429 error with RATE_LIMITED
 * - Circuit breaker open → 503 error with CIRCUIT_OPEN
 * - GRID timeout → 504 error with GRID_TIMEOUT
 * - Permission denied → 403 error with INSUFFICIENT_MERIT_STANDING
 * - Handler exception → 500 error with HANDLER_EXECUTION_FAILED
 * 
 * All errors are structured:
 * {
 *   error: "ERROR_CODE",
 *   message: "human readable description",
 *   entity_id?: "mcp:server:session_id",
 *   required_badge?: "B1_TRUSTED",
 *   actual_badge?: "B0_RESTRICTED"
 * }
 */
