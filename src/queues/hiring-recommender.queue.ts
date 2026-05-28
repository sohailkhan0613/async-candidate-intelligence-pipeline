import { Queue } from "bullmq";
import { redisConnection } from "./redis.js";
import { stage3JobSchema, type Stage3Job } from "./jobs.js";

export const hiringRecommenderQueue = new Queue<Stage3Job>("hiring-recommender", {
  connection: redisConnection
});

export async function enqueueStage3(data: unknown, jobOptions?: Parameters<Queue<Stage3Job>["add"]>[2]) {
  const payload = stage3JobSchema.parse(data);
  return hiringRecommenderQueue.add("recommend-candidate", payload, jobOptions);
}
