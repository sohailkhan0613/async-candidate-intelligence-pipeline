import { Worker } from "bullmq";
import { redis } from "../queues/redis.js";
import { candidateScorerQueue } from "../queues/candidate-scorer.queue.js";
import { saveStage1, markCandidateFailed, updateCandidateStage } from "../db/repositories/candidate.repository.js";
import { parseResume } from "../services/openai/pipeline-ai.js";
import { canProceed, markFailure, markSuccess } from "../services/circuit-breaker/redis-circuit-breaker.js";
import { emitSse } from "../services/sse/sse-store.js";
import type { Stage1Job } from "../queues/jobs.js";

export const resumeParserWorker = new Worker<Stage1Job>(
  "resume-parser",
  async (job) => {
    updateCandidateStage(job.data.candidateId, "STAGE_1", "PROCESSING");
    if (!(await canProceed())) {
      throw new Error("CIRCUIT_OPEN");
    }
    try {
      const parsedResume = await parseResume(job.data.rawResume);
      await markSuccess();
      saveStage1(job.data.candidateId, parsedResume);
      emitSse(job.data.batchId, "candidate-update", { candidateId: job.data.candidateId, stage: "STAGE_1" });
      await candidateScorerQueue.add(
        "score-candidate",
        {
          candidateId: job.data.candidateId,
          batchId: job.data.batchId,
          tenantId: job.data.tenantId,
          jd: job.data.jd,
          parsedResume,
          correlationId: job.data.correlationId
        },
        {
          attempts: 2,
          backoff: { type: "fixed", delay: 5_000 }
        }
      );
    } catch (error) {
      await markFailure();
      markCandidateFailed(job.data.candidateId, "STAGE_1", { message: (error as Error).message });
      throw error;
    }
  },
  { connection: redis }
);
