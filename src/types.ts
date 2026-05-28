export type PipelineStage = "STAGE_1" | "STAGE_2" | "STAGE_3";
export type CandidateStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface BatchRecord {
  id: string;
  tenantId: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED";
  jd: string;
  correlationId: string;
  createdAt: string;
}

export interface CandidateRecord {
  candidateId: string;
  batchId: string;
  tenantId: string;
  status: CandidateStatus;
  currentStage: PipelineStage | null;
  rawResume: string;
  parsedResumeJson: string | null;
  scoringResultJson: string | null;
  recommendationJson: string | null;
  errorJson: string | null;
  updatedAt: string;
}
