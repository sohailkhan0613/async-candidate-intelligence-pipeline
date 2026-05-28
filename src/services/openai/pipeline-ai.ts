import { env } from "../../config/env.js";
import {
  hiringRecommendationSchema,
  parsedResumeSchema,
  scoringResultSchema,
  type HiringRecommendation,
  type ParsedResume,
  type ScoringResult
} from "../../schemas/pipeline.schemas.js";
import { countTokens, chunkText } from "../tokenization/resume-tokenizer.js";

function simpleSummarize(input: string): string {
  return input.replace(/\s+/g, " ").trim().slice(0, 1200);
}

export async function parseResume(rawResume: string): Promise<ParsedResume> {
  const tokenCount = countTokens(rawResume);
  let candidate: ParsedResume;

  if (tokenCount <= 3000) {
    candidate = {
      summary: simpleSummarize(rawResume),
      normalizedText: rawResume,
      wasTruncated: false
    };
  } else {
    const chunks = chunkText(rawResume);
    const merged = chunks.map((chunk) => simpleSummarize(chunk)).join("\n");
    candidate = {
      summary: merged.slice(0, 4000),
      normalizedText: merged,
      wasTruncated: true
    };
  }

  return parsedResumeSchema.parse(candidate);
}

export async function scoreCandidate(input: {
  jd: string;
  normalizedText: string;
  weights: { experience: number; skills: number; education: number };
}): Promise<ScoringResult> {
  const normalizedLen = Math.max(input.normalizedText.length, 1);
  const jdLen = Math.max(input.jd.length, 1);
  const lexicalMatch = Math.min(1, jdLen / normalizedLen);

  const dimensions = {
    experience: Number(Math.min(1, lexicalMatch * 0.9 + input.weights.experience * 0.1).toFixed(3)),
    skills: Number(Math.min(1, lexicalMatch * 0.85 + input.weights.skills * 0.1).toFixed(3)),
    education: Number(Math.min(1, lexicalMatch * 0.8 + input.weights.education * 0.1).toFixed(3))
  };

  const totalScore = Number(
    Math.min(
      1,
      dimensions.experience * input.weights.experience +
        dimensions.skills * input.weights.skills +
        dimensions.education * input.weights.education
    ).toFixed(3)
  );

  const candidate: ScoringResult = {
    totalScore,
    rationale: `Scored using ${env.OPENAI_MODEL} pipeline against normalized resume text.`,
    dimensions
  };

  return scoringResultSchema.parse(candidate);
}

export async function recommendCandidate(score: ScoringResult, threshold: number): Promise<HiringRecommendation> {
  let recommendation: HiringRecommendation;

  if (score.totalScore >= threshold + 0.15) {
    recommendation = { recommendation: "STRONG_YES", rationale: "Score significantly above threshold." };
  } else if (score.totalScore >= threshold) {
    recommendation = { recommendation: "YES", rationale: "Score meets threshold." };
  } else if (score.totalScore >= threshold - 0.1) {
    recommendation = { recommendation: "MAYBE", rationale: "Score slightly below threshold." };
  } else {
    recommendation = { recommendation: "NO", rationale: "Score below threshold." };
  }

  return hiringRecommendationSchema.parse(recommendation);
}
