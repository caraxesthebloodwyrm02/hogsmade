import { z } from "zod";

export const AuditStatusSchema = z.enum(["success", "failure", "blocked", "dry_run", "error"]);
export type AuditStatus = z.infer<typeof AuditStatusSchema>;

export const AuditEventSchema = z.object({
  timestamp: z.string().datetime(),
  source: z.string(),
  tool: z.string(),
  status: AuditStatusSchema,
  durationMs: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const AuditQuerySchema = z.object({
  tool: z.string().optional(),
  status: AuditStatusSchema.optional(),
  source: z.string().optional(),
  since: z.string().datetime().optional(),
  limit: z.number().min(1).max(500).default(50),
});

export type AuditQuery = z.infer<typeof AuditQuerySchema>;
