import { appendFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { buildServer as buildMaintainServer } from "../../maintain-server/src/server.ts";

type InternalServer = {
  _registeredTools: Record<string, { inputSchema?: unknown; handler: (...args: any[]) => unknown }>;
};

function getAuditPath(): string {
  const value = process.env.ECHOES_AUDIT_PATH;
  if (!value) {
    throw new Error("Missing ECHOES_AUDIT_PATH for scheduled diagnostics");
  }
  return value;
}

function emitAudit(record: Record<string, unknown>): void {
  const auditPath = getAuditPath();
  mkdirSync(dirname(auditPath), { recursive: true });
  appendFileSync(auditPath, `${JSON.stringify(record)}\n`, "utf-8");
}

async function main(): Promise<void> {
  const server = buildMaintainServer() as unknown as InternalServer;
  const tool = server._registeredTools.full_diagnostic;
  if (!tool) {
    throw new Error("maintain-server full_diagnostic tool is not registered");
  }

  const startedAt = new Date().toISOString();
  try {
    const result = tool.inputSchema
      ? await tool.handler({ saveReport: true }, {} as any)
      : await tool.handler({} as any);
    const payload = JSON.parse((result as any).content?.[0]?.text ?? "{}");

    emitAudit({
      timestamp: new Date().toISOString(),
      source: "afloat-scheduler",
      tool: "scheduled_diagnostics",
      status: "success",
      metadata: {
        startedAt,
        reportId: payload.reportId,
        overallScore: payload.overallScore,
      },
    });

    console.log(JSON.stringify({
      scheduled: true,
      startedAt,
      completedAt: new Date().toISOString(),
      result: payload,
    }, null, 2));
  } catch (error) {
    emitAudit({
      timestamp: new Date().toISOString(),
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
