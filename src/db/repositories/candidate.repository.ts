import { db } from "../sqlite.js";
import type { CandidateRecord, CandidateStatus, PipelineStage } from "../../types.js";

const insertCandidateStmt = db.prepare(`
INSERT INTO candidates (
  candidate_id, batch_id, tenant_id, status, current_stage, raw_resume,
  parsed_resume_json, scoring_result_json, recommendation_json, error_json, updated_at
)
VALUES (@candidate_id, @batch_id, @tenant_id, @status, @current_stage, @raw_resume,
        @parsed_resume_json, @scoring_result_json, @recommendation_json, @error_json, @updated_at)
`);

const updateCandidateStageStmt = db.prepare(`
UPDATE candidates
SET status = @status, current_stage = @current_stage, updated_at = @updated_at
WHERE candidate_id = @candidate_id
`);

const saveStage1Stmt = db.prepare(`
UPDATE candidates
SET parsed_resume_json = @parsed_resume_json, status = @status, current_stage = @current_stage, updated_at = @updated_at
WHERE candidate_id = @candidate_id
`);

const saveStage2Stmt = db.prepare(`
UPDATE candidates
SET scoring_result_json = @scoring_result_json, status = @status, current_stage = @current_stage, updated_at = @updated_at
WHERE candidate_id = @candidate_id
`);

const saveStage3Stmt = db.prepare(`
UPDATE candidates
SET recommendation_json = @recommendation_json, status = @status, current_stage = @current_stage, updated_at = @updated_at
WHERE candidate_id = @candidate_id
`);

const markFailedStmt = db.prepare(`
UPDATE candidates
SET status = 'FAILED', error_json = @error_json, current_stage = @current_stage, updated_at = @updated_at
WHERE candidate_id = @candidate_id
`);

const getCandidateStmt = db.prepare(`
SELECT
  candidate_id as candidateId,
  batch_id as batchId,
  tenant_id as tenantId,
  status,
  current_stage as currentStage,
  raw_resume as rawResume,
  parsed_resume_json as parsedResumeJson,
  scoring_result_json as scoringResultJson,
  recommendation_json as recommendationJson,
  error_json as errorJson,
  updated_at as updatedAt
FROM candidates
WHERE candidate_id = ?
`);

const countIncompleteStmt = db.prepare(`
SELECT COUNT(*) as c
FROM candidates
WHERE batch_id = ? AND status != 'COMPLETED'
`);

export function createCandidate(input: { candidateId: string; batchId: string; tenantId: string; rawResume: string }): void {
  insertCandidateStmt.run({
    candidate_id: input.candidateId,
    batch_id: input.batchId,
    tenant_id: input.tenantId,
    status: "PENDING",
    current_stage: null,
    raw_resume: input.rawResume,
    parsed_resume_json: null,
    scoring_result_json: null,
    recommendation_json: null,
    error_json: null,
    updated_at: new Date().toISOString()
  });
}

export function updateCandidateStage(candidateId: string, stage: PipelineStage, status: CandidateStatus): void {
  updateCandidateStageStmt.run({
    candidate_id: candidateId,
    current_stage: stage,
    status,
    updated_at: new Date().toISOString()
  });
}

export function saveStage1(candidateId: string, parsedResume: unknown): void {
  saveStage1Stmt.run({
    candidate_id: candidateId,
    parsed_resume_json: JSON.stringify(parsedResume),
    status: "PROCESSING",
    current_stage: "STAGE_2",
    updated_at: new Date().toISOString()
  });
}

export function saveStage2(candidateId: string, score: unknown): void {
  saveStage2Stmt.run({
    candidate_id: candidateId,
    scoring_result_json: JSON.stringify(score),
    status: "PROCESSING",
    current_stage: "STAGE_3",
    updated_at: new Date().toISOString()
  });
}

export function saveStage3(candidateId: string, recommendation: unknown): void {
  saveStage3Stmt.run({
    candidate_id: candidateId,
    recommendation_json: JSON.stringify(recommendation),
    status: "COMPLETED",
    current_stage: "STAGE_3",
    updated_at: new Date().toISOString()
  });
}

export function markCandidateFailed(candidateId: string, stage: PipelineStage, error: unknown): void {
  markFailedStmt.run({
    candidate_id: candidateId,
    current_stage: stage,
    error_json: JSON.stringify(error),
    updated_at: new Date().toISOString()
  });
}

export function getCandidateById(candidateId: string): CandidateRecord | undefined {
  return getCandidateStmt.get(candidateId) as CandidateRecord | undefined;
}

export function isBatchComplete(batchId: string): boolean {
  const row = countIncompleteStmt.get(batchId) as { c: number };
  return row.c === 0;
}
