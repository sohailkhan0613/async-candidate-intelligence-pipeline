import { Queue } from "bullmq";
import { redis } from "./redis.js";
import type { Stage1Job } from "./jobs.js";

export const resumeParserQueue = new Queue<Stage1Job>("resume-parser", { connection: redis });
