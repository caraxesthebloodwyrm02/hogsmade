import { z } from "zod";

export const HealthCheckResponseSchema = z.object({
  status: z.string(),
  server: z.string(),
  version: z.string(),
  timestamp: z.string().datetime(),
});

export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;
