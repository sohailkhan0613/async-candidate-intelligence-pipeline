import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";

describe("tenant validation", () => {
  const app = createApp();

  it("rejects unknown tenant", async () => {
    const response = await request(app)
      .post("/api/v1/batches")
      .send({
        tenantId: "unknown-tenant",
        jd: "Role",
        candidates: [{ candidateId: "c-1", rawResume: "Resume text" }]
      })
      .expect(400);

    expect(response.body.code).toBe("UNKNOWN_TENANT");
  });

  it("rejects batches above tenant max size", async () => {
    const candidates = Array.from({ length: 101 }, (_, index) => ({
      candidateId: `candidate-${index}`,
      rawResume: `Resume ${index}`
    }));

    const response = await request(app)
      .post("/api/v1/batches")
      .send({
        tenantId: "acme-corp",
        jd: "Role",
        candidates
      })
      .expect(400);

    expect(response.body.code).toBe("BATCH_TOO_LARGE");
  });
});
