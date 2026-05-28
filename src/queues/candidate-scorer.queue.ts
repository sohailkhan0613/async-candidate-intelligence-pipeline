import { Queue } from "bullmq";
import { redis } from "./redis.js";
import type { Stage2Job } from "./jobs.js";

export const candidateScorerQueue = new Queue<Stage2Job>("candidate-scorer", { connection: redis });
