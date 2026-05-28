import { Worker, type Job } from "bullmq";
import { saveStage1, markCandidateFailed, updateCandidateStage } from "../db/repositories/candidate.repository.js";
import { enqueueStage2 } from "../queues/candidate-scorer.queue.js";
import { redisConnection } from "../queues/redis.js";
import { stage1JobSchema, type Stage1Job } from "../queues/jobs.js";
import { canProceed, markFailure, markSuccess } from "../services/circuit-breaker/redis-circuit-breaker.js";
import { logPipeline } from "../services/logging/pipeline-logger.js";
import { parseResume } from "../services/openai/pipeline-ai.js";
import { emitSse } from "../services/sse/sse-store.js";

export async function processResumeParserJob(job: Job<Stage1Job>): Promise<void> {
  const data = stage1JobSchema.parse(job.data);
  const startedAt = Date.now();
  updateCandidateStage(data.candidateId, "STAGE_1", "PROCESSING");

  if (!(await canProceed())) {
    throw new Error("CIRCUIT_OPEN");
  }

  try {
    const parsedResume = await parseResume(data.rawResume);
    await markSuccess();
    saveStage1(data.candidateId, parsedResume);
    emitSse(data.batchId, "candidate-update", { candidateId: data.candidateId, stage: "STAGE_1" });
    logPipeline({
      correlationId: data.correlationId,
      tenantId: data.tenantId,
      stage: "STAGE_1",
      event: "stage_completed",
      batchId: data.batchId,
      candidateId: data.candidateId,
      durationMs: Date.now() - startedAt,
      message: "Resume parsing completed"
    });

    await enqueueStage2(
      {
        candidateId: data.candidateId,
        batchId: data.batchId,
        tenantId: data.tenantId,
        jd: data.jd,
        parsedResume,
        correlationId: data.correlationId
      },
      {
        attempts: 2,
        backoff: { type: "fixed", delay: 5_000 }
      }
    );
  } catch (error) {
    await markFailure();
    markCandidateFailed(data.candidateId, "STAGE_1", { message: error instanceof Error ? error.message : "unknown" });
    logPipeline(
      {
        correlationId: data.correlationId,
        tenantId: data.tenantId,
        stage: "STAGE_1",
        event: "stage_failed",
        batchId: data.batchId,
        candidateId: data.candidateId,
        message: "Resume parsing failed"
      },
      "error"
    );
    throw error;
  }
}

export const resumeParserWorker =
  process.env.VITEST === "true"
    ? null
    : new Worker<Stage1Job>("resume-parser", processResumeParserJob, {
        connection: redisConnection
      });
