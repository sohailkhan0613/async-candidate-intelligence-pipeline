import { env } from "../../config/env.js";
import { countTokens, chunkText } from "../tokenization/resume-tokenizer.js";

interface ParsedResume {
  summary: string;
  normalizedText: string;
  wasTruncated: boolean;
}

interface ScoreResult {
  totalScore: number;
  rationale: string;
}

interface RecommendationResult {
  recommendation: "STRONG_YES" | "YES" | "MAYBE" | "NO";
  rationale: string;
}

function simpleSummarize(input: string): string {
  return input.replace(/\s+/g, " ").trim().slice(0, 1200);
}

export async function parseResume(rawResume: string): Promise<ParsedResume> {
  const tokenCount = countTokens(rawResume);
  if (tokenCount <= 3000) {
    return {
      summary: simpleSummarize(rawResume),
      normalizedText: rawResume,
      wasTruncated: false
    };
  }

  const chunks = chunkText(rawResume);
  const merged = chunks.map((chunk) => simpleSummarize(chunk)).join("\n");
  return {
    summary: merged.slice(0, 4000),
    normalizedText: merged,
    wasTruncated: true
  };
}

export async function scoreCandidate(input: {
  jd: string;
  normalizedText: string;
  weights: { experience: number; skills: number; education: number };
}): Promise<ScoreResult> {
  const normalizedLen = Math.max(input.normalizedText.length, 1);
  const jdLen = Math.max(input.jd.length, 1);
  const lexicalMatch = Math.min(1, jdLen / normalizedLen);
  const totalScore = Number((0.6 + lexicalMatch * 0.4).toFixed(3));
  return {
    totalScore,
    rationale: `Scored with deterministic fallback pipeline using model ${env.OPENAI_MODEL}.`
  };
}

export async function recommendCandidate(score: ScoreResult, threshold: number): Promise<RecommendationResult> {
  if (score.totalScore >= threshold + 0.15) {
    return { recommendation: "STRONG_YES", rationale: "Score significantly above threshold." };
  }
  if (score.totalScore >= threshold) {
    return { recommendation: "YES", rationale: "Score meets threshold." };
  }
  if (score.totalScore >= threshold - 0.1) {
    return { recommendation: "MAYBE", rationale: "Score slightly below threshold." };
  }
  return { recommendation: "NO", rationale: "Score below threshold." };
}
