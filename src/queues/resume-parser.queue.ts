import { Queue } from "bullmq";
import { redisConnection } from "./redis.js";
import { stage1JobSchema, type Stage1Job } from "./jobs.js";

export const resumeParserQueue = new Queue<Stage1Job>("resume-parser", { connection: redisConnection });

export async function enqueueStage1(data: unknown, jobOptions?: Parameters<Queue<Stage1Job>["add"]>[2]) {
  const payload = stage1JobSchema.parse(data);
  return resumeParserQueue.add("parse-resume", payload, jobOptions);
}
