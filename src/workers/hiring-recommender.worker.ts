import { Worker } from "bullmq";
import { redis } from "../queues/redis.js";
import {
  isBatchComplete,
  markCandidateFailed,
  saveStage3,
  updateCandidateStage
} from "../db/repositories/candidate.repository.js";
import { updateBatchStatus } from "../db/repositories/batch.repository.js";
import { recommendCandidate } from "../services/openai/pipeline-ai.js";
import { canProceed, markFailure, markSuccess } from "../services/circuit-breaker/redis-circuit-breaker.js";
import { emitSse } from "../services/sse/sse-store.js";
import { tenants } from "../services/tenants/tenant-config.js";
import type { Stage3Job } from "../queues/jobs.js";

export const hiringRecommenderWorker = new Worker<Stage3Job>(
  "hiring-recommender",
  async (job) => {
    updateCandidateStage(job.data.candidateId, "STAGE_3", "PROCESSING");
    if (!(await canProceed())) {
      throw new Error("CIRCUIT_OPEN");
    }
    try {
      const tenant = tenants[job.data.tenantId];
      const recommendation = await recommendCandidate(job.data.score, tenant.hiringThreshold);
      await markSuccess();
      saveStage3(job.data.candidateId, recommendation);
      emitSse(job.data.batchId, "candidate-update", { candidateId: job.data.candidateId, stage: "STAGE_3" });
      if (isBatchComplete(job.data.batchId)) {
        updateBatchStatus(job.data.batchId, "COMPLETED");
        emitSse(job.data.batchId, "batch-complete", { batchId: job.data.batchId });
      }
    } catch (error) {
      await markFailure();
      markCandidateFailed(job.data.candidateId, "STAGE_3", { message: (error as Error).message });
      throw error;
    }
  },
  { connection: redis }
);
