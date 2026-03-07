import { z } from "zod";

export const TelemetrySnapshotSchema = z.object({
  timestamp: z.string().datetime(),
  source: z.string(),
  metrics: z.record(z.union([z.number(), z.string(), z.boolean()])),
  tags: z.array(z.string()).optional(),
});

export type TelemetrySnapshot = z.infer<typeof TelemetrySnapshotSchema>;
