import { afterEach, beforeEach, vi } from "vitest";
import { redisMock } from "./mocks/redis-mock.js";

process.env.DATABASE_PATH = ":memory:";
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";
process.env.REDIS_HOST = "127.0.0.1";
process.env.REDIS_PORT = "6379";

vi.mock("../queues/redis.js", () => ({
  redis: redisMock,
  redisConnection: {
    host: "127.0.0.1",
    port: 6379,
    maxRetriesPerRequest: null
  }
}));

vi.mock("../queues/resume-parser.queue.js", () => ({
  enqueueStage1: vi.fn(async () => ({ id: "mock-job-id" }))
}));

beforeEach(() => {
  redisMock.reset();
});

afterEach(() => {
  vi.clearAllMocks();
});
