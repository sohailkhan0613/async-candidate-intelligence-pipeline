import { z } from "zod";

export const errorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "AI_ERROR",
  "SCHEMA_VIOLATION",
  "CIRCUIT_OPEN",
  "UNKNOWN_TENANT",
  "BATCH_TOO_LARGE",
  "NOT_FOUND",
  "RATE_LIMIT",
  "INTERNAL_ERROR"
]);

export const apiErrorSchema = z.object({
  error: z.string(),
  code: errorCodeSchema,
  correlationId: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional()
});

export type ApiError = z.infer<typeof apiErrorSchema>;
