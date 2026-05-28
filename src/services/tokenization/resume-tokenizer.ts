import { encoding_for_model } from "tiktoken";

const encoder = encoding_for_model("gpt-4o-mini");
const CHUNK_SIZE = 2000;
const OVERLAP = 250;

export function countTokens(input: string): number {
  return encoder.encode(input).length;
}

export function chunkText(input: string): string[] {
  const tokens = encoder.encode(input);
  if (tokens.length <= CHUNK_SIZE) {
    return [input];
  }

  const chunks: string[] = [];
  let idx = 0;
  while (idx < tokens.length) {
    const end = Math.min(tokens.length, idx + CHUNK_SIZE);
    const chunk = encoder.decode(tokens.slice(idx, end));
    chunks.push(chunk);
    if (end === tokens.length) {
      break;
    }
    idx = end - OVERLAP;
  }
  return chunks;
}
