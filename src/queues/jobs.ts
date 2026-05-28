export interface Stage1Job {
  candidateId: string;
  batchId: string;
  tenantId: string;
  jd: string;
  rawResume: string;
  correlationId: string;
}

export interface Stage2Job {
  candidateId: string;
  batchId: string;
  tenantId: string;
  jd: string;
  parsedResume: {
    normalizedText: string;
    summary: string;
    wasTruncated: boolean;
  };
  correlationId: string;
}

export interface Stage3Job {
  candidateId: string;
  batchId: string;
  tenantId: string;
  score: {
    totalScore: number;
    rationale: string;
  };
  correlationId: string;
}
