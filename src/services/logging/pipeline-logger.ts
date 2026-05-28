import { logger } from "./logger.js";

export type LogStage = "API" | "STAGE_1" | "STAGE_2" | "STAGE_3" | "SYSTEM";

export interface PipelineLogFields {
  correlationId: string;
  tenantId: string;
  stage: LogStage;
  event: string;
  message: string;
  batchId?: string;
  candidateId?: string;
  durationMs?: number;
}

export function logPipeline(fields: PipelineLogFields, level: "info" | "warn" | "error" = "info"): void {
  const payload = {
    correlationId: fields.correlationId,
    tenantId: fields.tenantId,
    stage: fields.stage,
    event: fields.event,
    message: fields.message,
    batchId: fields.batchId,
    candidateId: fields.candidateId,
    durationMs: fields.durationMs
  };

  if (level === "error") {
    logger.error(payload);
    return;
  }
  if (level === "warn") {
    logger.warn(payload);
    return;
  }
  logger.info(payload);
}
