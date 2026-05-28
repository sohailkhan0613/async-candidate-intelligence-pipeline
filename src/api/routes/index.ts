import { Router } from "express";
import { z } from "zod";
import { submitBatchSchema } from "../../schemas/api.schemas.js";
import { createBatch, getBatchById, updateBatchStatus } from "../../db/repositories/batch.repository.js";
import { createCandidate, getCandidateById } from "../../db/repositories/candidate.repository.js";
import { resumeParserQueue } from "../../queues/resume-parser.queue.js";
import { addSseClient, emitSse, removeSseClient } from "../../services/sse/sse-store.js";
import { getCircuitState } from "../../services/circuit-breaker/redis-circuit-breaker.js";
import { tenants } from "../../services/tenants/tenant-config.js";

export const apiRouter = Router();

apiRouter.post("/api/v1/batches", async (req, res, next) => {
  try {
    const parsed = submitBatchSchema.parse(req.body);
    const tenant = tenants[parsed.tenantId];
    if (!tenant) {
      res.status(400).json({ error: "Unknown tenant", code: "UNKNOWN_TENANT" });
      return;
    }
    if (parsed.candidates.length > tenant.maxCandidatesPerBatch) {
      res.status(400).json({ error: "Batch exceeds tenant limit", code: "BATCH_TOO_LARGE" });
      return;
    }
    const correlationId = crypto.randomUUID();
    const batch = createBatch({ tenantId: parsed.tenantId, jd: parsed.jd, correlationId });
    for (const candidate of parsed.candidates) {
      createCandidate({
        candidateId: candidate.candidateId,
        batchId: batch.id,
        tenantId: parsed.tenantId,
        rawResume: candidate.rawResume
      });
      await resumeParserQueue.add(
        "parse-resume",
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
    res.status(202).json({ batchId: batch.id, correlationId });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/api/v1/batches/:batchId", (req, res) => {
  const batch = getBatchById(req.params.batchId);
  if (!batch) {
    res.status(404).json({ error: "Batch not found", code: "NOT_FOUND" });
    return;
  }
  res.json(batch);
});

apiRouter.get("/api/v1/candidates/:candidateId/result", (req, res) => {
  const candidate = getCandidateById(req.params.candidateId);
  if (!candidate) {
    res.status(404).json({ error: "Candidate not found", code: "NOT_FOUND" });
    return;
  }
  res.json(candidate);
});

apiRouter.get("/api/v1/system/circuit-breaker", async (_req, res) => {
  const state = await getCircuitState();
  res.json(state);
});

apiRouter.get("/api/v1/batches/:batchId/stream", (req, res) => {
  const params = z.object({ batchId: z.string().min(1) }).parse(req.params);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  addSseClient(params.batchId, res);

  const interval = setInterval(() => {
    emitSse(params.batchId, "heartbeat", { ts: new Date().toISOString() });
  }, 15_000);

  req.on("close", () => {
    clearInterval(interval);
    removeSseClient(params.batchId, res);
  });
});
