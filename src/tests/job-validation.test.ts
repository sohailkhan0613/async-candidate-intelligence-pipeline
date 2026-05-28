import { describe, expect, it } from "vitest";
import { stage1JobSchema, stage2JobSchema } from "../schemas/pipeline.schemas.js";

describe("bullmq payload validation", () => {
  it("rejects stage 2 payloads that include raw resume", () => {
    expect(() =>
      stage2JobSchema.parse({
        candidateId: "c-1",
        batchId: "b-1",
        tenantId: "acme-corp",
        jd: "Role",
        correlationId: "corr-1",
        rawResume: "should not be here",
        parsedResume: {
          summary: "summary",
          normalizedText: "normalized",
          wasTruncated: false
        }
      })
    ).toThrow();
  });

  it("accepts valid stage 1 payloads", () => {
    const payload = stage1JobSchema.parse({
      candidateId: "c-1",
      batchId: "b-1",
      tenantId: "acme-corp",
      jd: "Role",
      rawResume: "resume",
      correlationId: "corr-1"
    });
    expect(payload.rawResume).toBe("resume");
  });
});
