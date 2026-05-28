import express from "express";
import pinoHttp from "pino-http";
import { z } from "zod";
import { env } from "./config/env.js";
import { logger } from "./services/logging/logger.js";
import { apiRouter } from "./api/routes/index.js";
import "./db/sqlite.js";
import "./workers/resume-parser.worker.js";
import "./workers/candidate-scorer.worker.js";
import "./workers/hiring-recommender.worker.js";

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(pinoHttp({ logger }));
app.use(apiRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof z.ZodError) {
    res.status(400).json({
      error: "Request validation failed",
      code: "VALIDATION_ERROR",
      details: err.flatten()
    });
    return;
  }
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
});

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "Server started");
});
