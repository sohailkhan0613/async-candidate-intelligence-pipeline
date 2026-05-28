import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

declare module "express-serve-static-core" {
  interface Request {
    correlationId: string;
  }
}

export function correlationIdMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header("x-correlation-id");
  req.correlationId = header && header.length > 0 ? header : randomUUID();
  next();
}
