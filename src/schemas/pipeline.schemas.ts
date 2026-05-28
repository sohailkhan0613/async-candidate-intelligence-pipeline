import { z } from "zod";

export const parsedResumeSchema = z.object({
  summary: z.string().min(1),
  normalizedText: z.string().min(1),
  wasTruncated: z.boolean()
});

export const scoringResultSchema = z.object({
  totalScore: z.number().min(0).max(1),
  rationale: z.string().min(1),
  dimensions: z.object({
    experience: z.number().min(0).max(1),
    skills: z.number().min(0).max(1),
    education: z.number().min(0).max(1)
  })
});

export const hiringRecommendationSchema = z.object({
  recommendation: z.enum(["STRONG_YES", "YES", "MAYBE", "NO"]),
  rationale: z.string().min(1)
});

export const stage1JobSchema = z
  .object({
    candidateId: z.string().min(1),
    batchId: z.string().min(1),
    tenantId: z.string().min(1),
    jd: z.string().min(1),
    rawResume: z.string().min(1),
    correlationId: z.string().min(1)
  })
  .strict();

export const stage2JobSchema = z
  .object({
    candidateId: z.string().min(1),
    batchId: z.string().min(1),
    tenantId: z.string().min(1),
    jd: z.string().min(1),
    parsedResume: parsedResumeSchema,
    correlationId: z.string().min(1)
  })
  .strict();

export const stage3JobSchema = z
  .object({
    candidateId: z.string().min(1),
    batchId: z.string().min(1),
    tenantId: z.string().min(1),
    score: scoringResultSchema,
    correlationId: z.string().min(1)
  })
  .strict();

export type ParsedResume = z.infer<typeof parsedResumeSchema>;
export type ScoringResult = z.infer<typeof scoringResultSchema>;
export type HiringRecommendation = z.infer<typeof hiringRecommendationSchema>;
export type Stage1Job = z.infer<typeof stage1JobSchema>;
export type Stage2Job = z.infer<typeof stage2JobSchema>;
export type Stage3Job = z.infer<typeof stage3JobSchema>;
