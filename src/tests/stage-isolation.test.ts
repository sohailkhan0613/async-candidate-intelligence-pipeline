import type { Job } from "bullmq";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../db/sqlite.js";
import { createBatch } from "../db/repositories/batch.repository.js";
import { createCandidate, getCandidateById } from "../db/repositories/candidate.repository.js";
import type { Stage1Job, Stage2Job } from "../schemas/pipeline.schemas.js";
import * as pipelineAi from "../services/openai/pipeline-ai.js";
import { processCandidateScorerJob } from "../workers/candidate-scorer.worker.js";
import { processResumeParserJob } from "../workers/resume-parser.worker.js";

vi.mock("../queues/candidate-scorer.queue.js", () => ({
  enqueueStage2: vi.fn(async () => undefined)
}));

describe("stage isolation", () => {
  beforeEach(() => {
    db.exec("DELETE FROM candidates");
    db.exec("DELETE FROM batches");
  });

  it("runs stage 1 once even when stage 2 fails", async () => {
    const parseSpy = vi.spyOn(pipelineAi, "parseResume").mockResolvedValue({
      summary: "summary",
      normalizedText: "normalized resume text only",
      wasTruncated: false
    });
    const scoreSpy = vi.spyOn(pipelineAi, "scoreCandidate").mockRejectedValue(new Error("stage 2 failed"));

    const batch = createBatch({
      tenantId: "acme-corp",
      jd: "Backend role",
      correlationId: "corr-stage-isolation"
    });
    createCandidate({
      candidateId: "candidate-iso-1",
      batchId: batch.id,
      tenantId: "acme-corp",
      rawResume: "raw resume should not be used in stage 2"
    });

    const stage1Job = {
      id: "job-1",
      data: {
        candidateId: "candidate-iso-1",
        batchId: batch.id,
        tenantId: "acme-corp",
        jd: "Backend role",
        rawResume: "raw resume should not be used in stage 2",
        correlationId: "corr-stage-isolation"
      }
    } as Job<Stage1Job>;

    await processResumeParserJob(stage1Job);

    const stage2Job = {
      id: "job-2",
      data: {
        candidateId: "candidate-iso-1",
        batchId: batch.id,
        tenantId: "acme-corp",
        jd: "Backend role",
        parsedResume: {
          summary: "summary",
          normalizedText: "normalized resume text only",
          wasTruncated: false
        },
        correlationId: "corr-stage-isolation"
      }
    } as Job<Stage2Job>;

    await expect(processCandidateScorerJob(stage2Job)).rejects.toThrow("stage 2 failed");

    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(scoreSpy).toHaveBeenCalledTimes(1);
    expect(scoreSpy.mock.calls[0]?.[0].normalizedText).toBe("normalized resume text only");
    expect(scoreSpy.mock.calls[0]?.[0]).not.toHaveProperty("rawResume");

    const candidate = getCandidateById("candidate-iso-1");
    expect(candidate?.parsedResumeJson).toContain("normalized resume text only");
    expect(candidate?.status).toBe("FAILED");
    expect(candidate?.currentStage).toBe("STAGE_2");
  });
});
