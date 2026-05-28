import { randomUUID } from "node:crypto";
import { db } from "../sqlite.js";
import type { BatchRecord } from "../../types.js";

const insertBatchStmt = db.prepare(`
INSERT INTO batches (id, tenant_id, status, jd, correlation_id, created_at)
VALUES (@id, @tenant_id, @status, @jd, @correlation_id, @created_at)
`);

const getBatchStmt = db.prepare(`
SELECT
  id,
  tenant_id as tenantId,
  status,
  jd,
  correlation_id as correlationId,
  created_at as createdAt
FROM batches
WHERE id = ?
`);

const updateBatchStatusStmt = db.prepare("UPDATE batches SET status = ? WHERE id = ?");

export function createBatch(input: { tenantId: string; jd: string; correlationId: string }): BatchRecord {
  const now = new Date().toISOString();
  const batch: BatchRecord = {
    id: randomUUID(),
    tenantId: input.tenantId,
    status: "QUEUED",
    jd: input.jd,
    correlationId: input.correlationId,
    createdAt: now
  };
  insertBatchStmt.run({
    id: batch.id,
    tenant_id: batch.tenantId,
    status: batch.status,
    jd: batch.jd,
    correlation_id: batch.correlationId,
    created_at: batch.createdAt
  });
  return batch;
}

export function getBatchById(batchId: string): BatchRecord | undefined {
  return getBatchStmt.get(batchId) as BatchRecord | undefined;
}

export function updateBatchStatus(batchId: string, status: BatchRecord["status"]): void {
  updateBatchStatusStmt.run(status, batchId);
}
