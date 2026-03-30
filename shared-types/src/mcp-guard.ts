/**
 * MCP Merit Guard — Centralized guard wrappers for MCP servers
 *
 * Provides merit-driven authentication for MCP tool calls using session-first identity.
 * All new entities start at B0_RESTRICTED with strict limited scopes.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  generateMcpIdentity,
  ActionClass,
  Badge,
  PermissionCheckResult,
  Scope,
  MeritAuditEntry,
} from "./merit-policy.js";
import { emitAudit } from "./audit-client.js";

interface MeritGuardConfig {
  serverName: string;
  /** Base GRID API URL for remote verification */
  gridApiUrl?: string;
  /** Enable local fallback if grid unavailable */
  fallbackLocal?: boolean;
  /** Default badge for new entities in fallback mode */
  fallbackBadge?: Badge;
}

interface GuardedToolOptions {
  actionClass: ActionClass;
  requiredScope?: Scope;
  description: string;
  inputSchema?: Record<string, unknown>;
}

/**
 * MCP Merit Guard — wraps MCP tools with merit-based access control
 */
export class McpMeritGuard {
  private config: MeritGuardConfig;
  private cache: Map<string, PermissionCheckResult> = new Map();
  private cacheTtlMs = 30000; // 30 second cache TTL

  constructor(config: MeritGuardConfig) {
    this.config = {
      fallbackLocal: true,
      fallbackBadge: Badge.B0_RESTRICTED,
      ...config,
    };
  }

  /**
   * Generate MCP session identity
   * Format: `mcp:{server}:{session_id}` (fallback deterministic)
   */
  private generateIdentity(sessionId?: string): string {
    return generateMcpIdentity(this.config.serverName, sessionId);
  }

  /**
   * Check permission with the GRID merit engine
   */
  private async checkPermission(
    entityId: string,
    actionClass: ActionClass,
    requiredScope?: Scope
  ): Promise<PermissionCheckResult> {
    // Check cache first
    const cacheKey = `${entityId}:${actionClass}:${requiredScope || "none"}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Try to verify with GRID Mothership
    if (this.config.gridApiUrl) {
      try {
        const response = await fetch(
          `${this.config.gridApiUrl}/admission/check-permission`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              entity_id: entityId,
              action_class: actionClass,
              required_scope: requiredScope,
            }),
          }
        );

        if (response.ok) {
          const result = (await response.json()) as PermissionCheckResult;
          this.cache.set(cacheKey, result);
          return result;
        }
      } catch {
        // Fail closed or use fallback
      }
    }

    // Fallback: local evaluation
    if (this.config.fallbackLocal) {
      // Local evaluation based on action class requirements
      const requiredBadge = this.getRequiredBadge(actionClass);
      const entityBadge = this.config.fallbackBadge!;
      const hasBadge = this.badgeRank(entityBadge) >= this.badgeRank(requiredBadge);

      const result: PermissionCheckResult = {
        allowed: hasBadge,
        entity_id: entityId,
        action_class: actionClass,
        required_badge: requiredBadge,
        actual_badge: entityBadge,
        has_badge: hasBadge,
        required_scopes: this.getRequiredScopes(actionClass),
        eligible_scopes: [],
        has_scopes: false,
        has_specific_scope: false,
        score: 45,
        roll_number: 0,
      };

      this.cache.set(cacheKey, result);
      return result;
    }

    // Fail closed
    return {
      allowed: false,
      entity_id: entityId,
      action_class: actionClass,
      required_badge: this.getRequiredBadge(actionClass),
      actual_badge: Badge.B0_RESTRICTED,
      has_badge: false,
      required_scopes: this.getRequiredScopes(actionClass),
      eligible_scopes: [],
      has_scopes: false,
      has_specific_scope: false,
      score: 0,
      roll_number: 0,
    };
  }

  /**
   * Get required badge for action class
   */
  private getRequiredBadge(actionClass: ActionClass): Badge {
    const mapping: Record<ActionClass, Badge> = {
      [ActionClass.PUBLIC_BASIC]: Badge.B0_RESTRICTED,
      [ActionClass.ANALYSIS_READ]: Badge.B1_TRUSTED,
      [ActionClass.ACTION_WRITE]: Badge.B2_VERIFIED,
      [ActionClass.CONTROL_ADMIN]: Badge.B3_PRIVILEGED,
    };
    return mapping[actionClass];
  }

  /**
   * Get required scopes for action class
   */
  private getRequiredScopes(actionClass: ActionClass): Scope[] {
    const mapping: Record<ActionClass, Scope[]> = {
      [ActionClass.PUBLIC_BASIC]: [],
      [ActionClass.ANALYSIS_READ]: [Scope.READ],
      [ActionClass.ACTION_WRITE]: [Scope.READ, Scope.WRITE],
      [ActionClass.CONTROL_ADMIN]: [Scope.READ, Scope.WRITE, Scope.ADMIN],
    };
    return mapping[actionClass];
  }

  /**
   * Get badge rank for comparison
   */
  private badgeRank(badge: Badge): number {
    const ranks: Record<Badge, number> = {
      [Badge.B0_RESTRICTED]: 0,
      [Badge.B1_TRUSTED]: 1,
      [Badge.B2_VERIFIED]: 2,
      [Badge.B3_PRIVILEGED]: 3,
    };
    return ranks[badge];
  }

  /**
   * Log merit decision to audit trail
   */
  private async logMeritDecision(
    entry: Omit<MeritAuditEntry, "timestamp" | "source">
  ): Promise<void> {
    const auditEntry: MeritAuditEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
      source: "mcp",
    };

    await emitAudit({
      timestamp: auditEntry.timestamp,
      source: `${this.config.serverName}-merit-guard`,
      tool: "merit_check",
      status: auditEntry.verdict === "allowed" ? "success" : "blocked",
      metadata: auditEntry,
    });
  }

  /**
   * Register a guarded tool with merit checking
   */
  registerGuardedTool<TArgs extends Record<string, unknown>, TResult>(
    server: McpServer,
    name: string,
    options: GuardedToolOptions,
    handler: (args: TArgs, sessionId?: string) => Promise<TResult>
  ): void {
    server.registerTool(
      name,
      {
        description: `${options.description} [Requires: ${options.actionClass}]`,
        inputSchema: options.inputSchema || { type: "object", properties: {} },
      },
      async (args: TArgs) => {
        const sessionId = (args as { session_id?: string }).session_id;
        const entityId = this.generateIdentity(sessionId);

        // Check permission
        const permission = await this.checkPermission(
          entityId,
          options.actionClass,
          options.requiredScope
        );

        // Log the decision
        await this.logMeritDecision({
          entity_id: entityId,
          action_class: options.actionClass,
          required_badge: permission.required_badge,
          actual_badge: permission.actual_badge,
          verdict: permission.allowed ? "allowed" : "denied",
          penalty_delta: 0,
          roll_number: permission.roll_number,
          score: permission.score,
          session_id: sessionId,
        });

        if (!permission.allowed) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: "INSUFFICIENT_MERIT_STANDING",
                  entity_id: entityId,
                  required_badge: permission.required_badge,
                  actual_badge: permission.actual_badge,
                  required_scope: options.requiredScope,
                  message: `Insufficient merit standing for ${options.actionClass}. ` +
                    `Required: ${permission.required_badge}, Current: ${permission.actual_badge}`,
                }, null, 2),
              },
            ],
            isError: true,
          };
        }

        // Execute the handler
        const result = await handler(args, sessionId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }
    );
  }

  /**
   * Wrap an entire McpServer with merit guards
   *
   * This wraps all tools with a baseline check and allows individual tools
   * to have their own action_class metadata.
   */
  wrapServer(server: McpServer, defaultActionClass: ActionClass = ActionClass.PUBLIC_BASIC): void {
    // Note: This is a simplified wrapper. In production, you would
    // use a more sophisticated approach that preserves individual tool metadata.
    // This demonstrates the concept.

    // Store reference to the original registerTool
    const originalRegisterTool = server.registerTool.bind(server);

    // Replace with a wrapped version
    server.registerTool = (
      name: string,
      config: { description: string; inputSchema?: Record<string, unknown> },
      handler: (args: Record<string, unknown>) => Promise<unknown>
    ) => {
      // Extract action_class from description if present
      const actionMatch = config.description.match(/\[action_class:\s*(\w+)\]/);
      const actionClass = actionMatch
        ? (actionMatch[1] as ActionClass)
        : defaultActionClass;

      this.registerGuardedTool(server, name, {
        actionClass,
        description: config.description,
        inputSchema: config.inputSchema,
      }, handler);
    };
  }
}

/**
 * Convenience function to create a merit guard for an MCP server
 */
export function createMeritGuard(
  serverName: string,
  gridApiUrl?: string
): McpMeritGuard {
  return new McpMeritGuard({
    serverName,
    gridApiUrl: gridApiUrl || process.env.GRID_API_URL,
  });
}
