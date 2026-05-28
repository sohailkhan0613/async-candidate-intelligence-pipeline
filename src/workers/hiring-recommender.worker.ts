import { Worker, type Job } from "bullmq";
import { updateBatchStatus } from "../db/repositories/batch.repository.js";
import {
  isBatchComplete,
  markCandidateFailed,
  saveStage3,
  updateCandidateStage
} from "../db/repositories/candidate.repository.js";
import { redisConnection } from "../queues/redis.js";
import { stage3JobSchema, type Stage3Job } from "../queues/jobs.js";
import { canProceed, markFailure, markSuccess } from "../services/circuit-breaker/redis-circuit-breaker.js";
import { logPipeline } from "../services/logging/pipeline-logger.js";
import { recommendCandidate } from "../services/openai/pipeline-ai.js";
import { emitSse } from "../services/sse/sse-store.js";
import { tenants } from "../services/tenants/tenant-config.js";

export async function processHiringRecommenderJob(job: Job<Stage3Job>): Promise<void> {
  const data = stage3JobSchema.parse(job.data);
  const startedAt = Date.now();
  updateCandidateStage(data.candidateId, "STAGE_3", "PROCESSING");

  if (!(await canProceed())) {
    throw new Error("CIRCUIT_OPEN");
  }

  try {
    const tenant = tenants[data.tenantId];
    const recommendation = await recommendCandidate(data.score, tenant.hiringThreshold);
    await markSuccess();
    saveStage3(data.candidateId, recommendation);
    emitSse(data.batchId, "candidate-update", { candidateId: data.candidateId, stage: "STAGE_3" });
    logPipeline({
      correlationId: data.correlationId,
      tenantId: data.tenantId,
      stage: "STAGE_3",
      event: "stage_completed",
      batchId: data.batchId,
      candidateId: data.candidateId,
      durationMs: Date.now() - startedAt,
      message: "Hiring recommendation completed"
    });

    if (isBatchComplete(data.batchId)) {
      updateBatchStatus(data.batchId, "COMPLETED");
      emitSse(data.batchId, "batch-complete", { batchId: data.batchId });
      logPipeline({
        correlationId: data.correlationId,
        tenantId: data.tenantId,
        stage: "API",
        event: "batch_completed",
        batchId: data.batchId,
        message: "Batch processing completed"
      });
    }
  } catch (error) {
    await markFailure();
    markCandidateFailed(data.candidateId, "STAGE_3", { message: error instanceof Error ? error.message : "unknown" });
    logPipeline(
      {
        correlationId: data.correlationId,
        tenantId: data.tenantId,
        stage: "STAGE_3",
        event: "stage_failed",
        batchId: data.batchId,
        candidateId: data.candidateId,
        message: "Hiring recommendation failed"
      },
      "error"
    );
    throw error;
  }
}

export const hiringRecommenderWorker =
  process.env.VITEST === "true"
    ? null
    : new Worker<Stage3Job>("hiring-recommender", processHiringRecommenderJob, {
        connection: redisConnection
      });
