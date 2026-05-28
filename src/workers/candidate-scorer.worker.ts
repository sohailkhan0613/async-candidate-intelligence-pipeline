import { Worker, type Job } from "bullmq";
import { saveStage2, markCandidateFailed, updateCandidateStage } from "../db/repositories/candidate.repository.js";
import { enqueueStage3 } from "../queues/hiring-recommender.queue.js";
import { redisConnection } from "../queues/redis.js";
import { stage2JobSchema, type Stage2Job } from "../queues/jobs.js";
import { canProceed, markFailure, markSuccess } from "../services/circuit-breaker/redis-circuit-breaker.js";
import { logPipeline } from "../services/logging/pipeline-logger.js";
import { scoreCandidate } from "../services/openai/pipeline-ai.js";
import { emitSse } from "../services/sse/sse-store.js";
import { tenants } from "../services/tenants/tenant-config.js";

export async function processCandidateScorerJob(job: Job<Stage2Job>): Promise<void> {
  const data = stage2JobSchema.parse(job.data);
  const startedAt = Date.now();
  updateCandidateStage(data.candidateId, "STAGE_2", "PROCESSING");

  if (!(await canProceed())) {
    throw new Error("CIRCUIT_OPEN");
  }

  try {
    const tenant = tenants[data.tenantId];
    const score = await scoreCandidate({
      jd: data.jd,
      normalizedText: data.parsedResume.normalizedText,
      weights: tenant.weights
    });
    await markSuccess();
    saveStage2(data.candidateId, score);
    emitSse(data.batchId, "candidate-update", { candidateId: data.candidateId, stage: "STAGE_2" });
    logPipeline({
      correlationId: data.correlationId,
      tenantId: data.tenantId,
      stage: "STAGE_2",
      event: "stage_completed",
      batchId: data.batchId,
      candidateId: data.candidateId,
      durationMs: Date.now() - startedAt,
      message: "Candidate scoring completed"
    });

    await enqueueStage3(
      {
        candidateId: data.candidateId,
        batchId: data.batchId,
        tenantId: data.tenantId,
        score,
        correlationId: data.correlationId
      },
      { attempts: 1 }
    );
  } catch (error) {
    await markFailure();
    markCandidateFailed(data.candidateId, "STAGE_2", { message: error instanceof Error ? error.message : "unknown" });
    logPipeline(
      {
        correlationId: data.correlationId,
        tenantId: data.tenantId,
        stage: "STAGE_2",
        event: "stage_failed",
        batchId: data.batchId,
        candidateId: data.candidateId,
        message: "Candidate scoring failed"
      },
      "error"
    );
    throw error;
  }
}

export const candidateScorerWorker =
  process.env.VITEST === "true"
    ? null
    : new Worker<Stage2Job>("candidate-scorer", processCandidateScorerJob, {
        connection: redisConnection
      });
