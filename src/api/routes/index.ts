import { Router } from "express";
import { z } from "zod";
import { createBatch, getBatchById, updateBatchStatus } from "../../db/repositories/batch.repository.js";
import { createCandidate, getCandidateById } from "../../db/repositories/candidate.repository.js";
import { enqueueStage1 } from "../../queues/resume-parser.queue.js";
import { submitBatchSchema } from "../../schemas/api.schemas.js";
import { getCircuitState } from "../../services/circuit-breaker/redis-circuit-breaker.js";
import { logPipeline } from "../../services/logging/pipeline-logger.js";
import { addSseClient, emitHeartbeat, removeSseClient } from "../../services/sse/sse-store.js";
import { tenants } from "../../services/tenants/tenant-config.js";

export const apiRouter = Router();

apiRouter.post("/api/v1/batches", async (req, res, next) => {
  try {
    const parsed = submitBatchSchema.parse(req.body);
    const tenant = tenants[parsed.tenantId];
    if (!tenant) {
      res.status(400).json({
        error: "Unknown tenant",
        code: "UNKNOWN_TENANT",
        correlationId: req.correlationId
      });
      return;
    }
    if (parsed.candidates.length > tenant.maxCandidatesPerBatch) {
      res.status(400).json({
        error: "Batch exceeds tenant limit",
        code: "BATCH_TOO_LARGE",
        correlationId: req.correlationId
      });
      return;
    }

    const correlationId = req.correlationId;
    const batch = createBatch({ tenantId: parsed.tenantId, jd: parsed.jd, correlationId });

    for (const candidate of parsed.candidates) {
      createCandidate({
        candidateId: candidate.candidateId,
        batchId: batch.id,
        tenantId: parsed.tenantId,
        rawResume: candidate.rawResume
      });
      await enqueueStage1(
        {
          candidateId: candidate.candidateId,
          batchId: batch.id,
          tenantId: parsed.tenantId,
          jd: parsed.jd,
          rawResume: candidate.rawResume,
          correlationId
        },
        {
          attempts: 3,
          backoff: { type: "exponential", delay: 2_000 }
        }
      );
    }

    updateBatchStatus(batch.id, "PROCESSING");
    logPipeline({
      correlationId,
      tenantId: parsed.tenantId,
      stage: "API",
      event: "batch_queued",
      batchId: batch.id,
      message: "Batch accepted and stage 1 jobs enqueued"
    });

    res.status(202).json({ batchId: batch.id, correlationId });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/api/v1/batches/:batchId", (req, res) => {
  const batch = getBatchById(req.params.batchId);
  if (!batch) {
    res.status(404).json({ error: "Batch not found", code: "NOT_FOUND", correlationId: req.correlationId });
    return;
  }
  res.json(batch);
});

apiRouter.get("/api/v1/candidates/:candidateId/result", (req, res) => {
  const candidate = getCandidateById(req.params.candidateId);
  if (!candidate) {
    res.status(404).json({ error: "Candidate not found", code: "NOT_FOUND", correlationId: req.correlationId });
    return;
  }
  res.json(candidate);
});

apiRouter.get("/api/v1/system/circuit-breaker", async (req, res) => {
  const state = await getCircuitState();
  logPipeline({
    correlationId: req.correlationId,
    tenantId: "system",
    stage: "SYSTEM",
    event: "circuit_state_read",
    message: "Circuit breaker state requested"
  });
  res.json(state);
});

apiRouter.get("/api/v1/batches/:batchId/stream", (req, res) => {
  const params = z.object({ batchId: z.string().min(1) }).parse(req.params);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  addSseClient(params.batchId, res);

  const interval = setInterval(() => {
    emitHeartbeat(params.batchId);
  }, 15_000);

  req.on("close", () => {
    clearInterval(interval);
    removeSseClient(params.batchId, res);
  });
});
