import type { Request, Response, NextFunction } from "express";
import logger from "../lib/logger";
import { metrics } from "../lib/metrics";

const SLOW_THRESHOLD_MS = 500;

export function responseTimeMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const durationNs = Number(process.hrtime.bigint() - start);
    const durationMs = Math.round(durationNs / 1_000_000);

    const route = req.route?.path
      ? `${req.baseUrl || ""}${req.route.path}`
      : req.path;

    metrics.recordTiming({
      route,
      method: req.method,
      statusCode: res.statusCode,
      durationMs,
      timestamp: Date.now(),
    });

    if (durationMs >= SLOW_THRESHOLD_MS) {
      logger.warn("Slow request detected", {
        method: req.method,
        path: req.path,
        route,
        statusCode: res.statusCode,
        durationMs,
      });
    }
  });

  next();
}
