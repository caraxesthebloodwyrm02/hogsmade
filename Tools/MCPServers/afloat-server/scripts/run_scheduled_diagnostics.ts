import { emitAudit } from "@cascade/shared-types/audit-client";
import { buildServer as buildMaintainServer } from "../../maintain-server/src/server.ts";

type InternalServer = {
  _registeredTools: Record<string, { inputSchema?: unknown; handler: (...args: any[]) => unknown }>;
};

const HEALTH_THRESHOLD = Math.max(
  0,
  Number(process.env.SCHEDULED_DIAGNOSTICS_HEALTH_THRESHOLD) || 70,
);

function getTextPayload(result: unknown): Record<string, unknown> {
  return JSON.parse((result as any).content?.[0]?.text ?? "{}");
}

async function invokeTool(
  server: InternalServer,
  name: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  const tool = server._registeredTools[name];
  if (!tool) throw new Error(`maintain-server ${name} tool is not registered`);
  return tool.inputSchema ? await tool.handler(args, {} as any) : await tool.handler({} as any);
}

async function main(): Promise<void> {
  const server = buildMaintainServer() as unknown as InternalServer;

  const startedAt = new Date().toISOString();
  try {
    const diagResult = await invokeTool(server, "full_diagnostic", {
      saveReport: true,
    });
    const diagPayload = getTextPayload(diagResult);
    const overallScore =
      typeof diagPayload.overallScore === "number" ? diagPayload.overallScore : null;

    // Phase 3.1: threshold check — invoke scan_workspaces when health is below threshold
    let followUp: Record<string, unknown> | undefined;
    if (overallScore !== null && overallScore < HEALTH_THRESHOLD) {
      try {
        const scanResult = await invokeTool(server, "scan_workspaces", {});
        const scanPayload = getTextPayload(scanResult);
        const tail = scanPayload._tailFunction as Record<string, unknown> | undefined;
        followUp = {
          triggered: true,
          reason: `overallScore ${overallScore} < threshold ${HEALTH_THRESHOLD}`,
          totalReclaimableMB: tail?.totalReclaimableMB ?? null,
          topReclaimable: tail?.topReclaimable ?? [],
          recommendation: tail?.recommendation ?? null,
        };
      } catch (scanError) {
        followUp = {
          triggered: true,
          reason: `overallScore ${overallScore} < threshold ${HEALTH_THRESHOLD}`,
          error: scanError instanceof Error ? scanError.message : String(scanError),
        };
      }
    }

    emitAudit({
      source: "afloat-scheduler",
      tool: "scheduled_diagnostics",
      status: "success",
      metadata: {
        startedAt,
        reportId: diagPayload.reportId,
        overallScore: diagPayload.overallScore,
        healthThreshold: HEALTH_THRESHOLD,
        ...(followUp ? { followUp } : {}),
      },
    });

    console.log(
      JSON.stringify(
        {
          scheduled: true,
          startedAt,
          completedAt: new Date().toISOString(),
          healthThreshold: HEALTH_THRESHOLD,
          result: diagPayload,
          ...(followUp ? { followUp } : {}),
        },
        null,
        2,
      ),
    );
  } catch (error) {
    emitAudit({
      source: "afloat-scheduler",
      tool: "scheduled_diagnostics",
      status: "failure",
      metadata: {
        startedAt,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}

void main();
