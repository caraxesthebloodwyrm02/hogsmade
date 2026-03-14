import { z } from "zod";

export const TelemetrySnapshotSchema = z.object({
  timestamp: z.string().datetime(),
  workspace: z.string(),
  projects: z.number(),
  activeServers: z.array(z.string()),
  metrics: z.record(z.number()),
});

export type TelemetrySnapshot = z.infer<typeof TelemetrySnapshotSchema>;
