import { Worker } from "bullmq";
import { redis } from "../queues/redis.js";
import { hiringRecommenderQueue } from "../queues/hiring-recommender.queue.js";
import { saveStage2, markCandidateFailed, updateCandidateStage } from "../db/repositories/candidate.repository.js";
import { scoreCandidate } from "../services/openai/pipeline-ai.js";
import { canProceed, markFailure, markSuccess } from "../services/circuit-breaker/redis-circuit-breaker.js";
import { emitSse } from "../services/sse/sse-store.js";
import { tenants } from "../services/tenants/tenant-config.js";
import type { Stage2Job } from "../queues/jobs.js";

export const candidateScorerWorker = new Worker<Stage2Job>(
  "candidate-scorer",
  async (job) => {
    updateCandidateStage(job.data.candidateId, "STAGE_2", "PROCESSING");
    if (!(await canProceed())) {
      throw new Error("CIRCUIT_OPEN");
    }
    try {
      const tenant = tenants[job.data.tenantId];
      const score = await scoreCandidate({
        jd: job.data.jd,
        normalizedText: job.data.parsedResume.normalizedText,
        weights: tenant.weights
      });
      await markSuccess();
      saveStage2(job.data.candidateId, score);
      emitSse(job.data.batchId, "candidate-update", { candidateId: job.data.candidateId, stage: "STAGE_2" });
      await hiringRecommenderQueue.add(
        "recommend-candidate",
        {
          candidateId: job.data.candidateId,
          batchId: job.data.batchId,
          tenantId: job.data.tenantId,
          score,
          correlationId: job.data.correlationId
        },
        {
          attempts: 1
        }
      );
    } catch (error) {
      await markFailure();
      markCandidateFailed(job.data.candidateId, "STAGE_2", { message: (error as Error).message });
      throw error;
    }
  },
  { connection: redis }
);
