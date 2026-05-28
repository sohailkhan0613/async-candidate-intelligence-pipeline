import { Queue } from "bullmq";
import { redisConnection } from "./redis.js";
import { stage2JobSchema, type Stage2Job } from "./jobs.js";

export const candidateScorerQueue = new Queue<Stage2Job>("candidate-scorer", { connection: redisConnection });

export async function enqueueStage2(data: unknown, jobOptions?: Parameters<Queue<Stage2Job>["add"]>[2]) {
  const payload = stage2JobSchema.parse(data);
  return candidateScorerQueue.add("score-candidate", payload, jobOptions);
}
