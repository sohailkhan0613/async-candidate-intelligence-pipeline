import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { db } from "../db/sqlite.js";
import { getBatchById } from "../db/repositories/batch.repository.js";
import { getCandidateById } from "../db/repositories/candidate.repository.js";

describe("batch submission", () => {
  beforeEach(() => {
    db.exec("DELETE FROM candidates");
    db.exec("DELETE FROM batches");
  });

  it("persists batch and candidates then returns 202", async () => {
    const app = createApp();
    const response = await request(app)
      .post("/api/v1/batches")
      .send({
        tenantId: "acme-corp",
        jd: "Senior backend engineer with Node.js and Redis experience.",
        candidates: [
          {
            candidateId: "candidate-1",
            rawResume: "Built async APIs with Node.js, BullMQ, and Redis."
          }
        ]
      })
      .expect(202);

    expect(response.body.batchId).toBeTypeOf("string");
    expect(response.body.correlationId).toBeTypeOf("string");

    const batch = getBatchById(response.body.batchId);
    expect(batch).toBeDefined();
    expect(batch?.tenantId).toBe("acme-corp");

    const candidate = getCandidateById("candidate-1");
    expect(candidate).toBeDefined();
    expect(candidate?.batchId).toBe(response.body.batchId);
    expect(candidate?.rawResume).toContain("BullMQ");
  });
});
