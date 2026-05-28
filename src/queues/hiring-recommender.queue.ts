import { Queue } from "bullmq";
import { redis } from "./redis.js";
import type { Stage3Job } from "./jobs.js";

export const hiringRecommenderQueue = new Queue<Stage3Job>("hiring-recommender", { connection: redis });
