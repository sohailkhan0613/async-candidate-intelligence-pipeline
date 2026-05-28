import { describe, expect, it } from "vitest";
import { parseResume } from "../services/openai/pipeline-ai.js";
import { chunkText, countTokens } from "../services/tokenization/resume-tokenizer.js";

describe("resume chunking", () => {
  it("chunks resumes larger than 3000 tokens and marks truncation", async () => {
    const largeResume = "experience ".repeat(12_000);
    expect(countTokens(largeResume)).toBeGreaterThan(3000);

    const chunks = chunkText(largeResume);
    expect(chunks.length).toBeGreaterThan(1);

    const parsed = await parseResume(largeResume);
    expect(parsed.wasTruncated).toBe(true);
    expect(parsed.normalizedText.length).toBeGreaterThan(0);
    expect(parsed.summary.length).toBeGreaterThan(0);
  });
});
