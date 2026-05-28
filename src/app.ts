import express from "express";
import pinoHttp from "pino-http";
import { z } from "zod";
import { correlationIdMiddleware } from "./api/middleware/correlation-id.js";
import { apiRouter } from "./api/routes/index.js";
import { env } from "./config/env.js";
import "./db/sqlite.js";
import { logger } from "./services/logging/logger.js";

export function createApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use(correlationIdMiddleware);
  app.use(
    pinoHttp({
      logger,
      customProps: (req) => ({
        correlationId: req.correlationId
      })
    })
  );
  app.use(apiRouter);

  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof z.ZodError) {
      res.status(400).json({
        error: "Request validation failed",
        code: "VALIDATION_ERROR",
        correlationId: req.correlationId,
        details: err.flatten()
      });
      return;
    }
    logger.error({ err, correlationId: req.correlationId }, "Unhandled error");
    res.status(500).json({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
      correlationId: req.correlationId
    });
  });

  return app;
}

export function startServer(): void {
  const app = createApp();
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, event: "server_started" }, "Server started");
  });
}
