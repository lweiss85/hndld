import * as Sentry from "@sentry/node";
import { Express, RequestHandler, ErrorRequestHandler } from "express";
import logger from "./logger";

export function initSentry(app: Express) {
  const sentryDsn = process.env.SENTRY_DSN;
  const environment = process.env.NODE_ENV || "development";

  if (environment !== "production" || !sentryDsn) {
    logger.info("[SENTRY] Error monitoring disabled (not production or no DSN)");
    return;
  }

  try {
    Sentry.init({
      dsn: sentryDsn,
      environment,
      tracesSampleRate: 0.1,
      ignoreErrors: [
        "ECONNREFUSED",
        "ENOTFOUND",
        "NetworkError",
        "Non-Error promise rejection captured",
      ],
      beforeSend(event) {
        if (event.request?.data) {
          const data = event.request.data;
          if (typeof data === "object") {
            const sensitiveFields = ["password", "pin", "token", "secret", "key"];
            for (const field of sensitiveFields) {
              if (field in data) {
                (data as any)[field] = "[REDACTED]";
              }
            }
          }
        }
        return event;
      },
    });

    logger.info("[SENTRY] Error monitoring enabled");
  } catch (error) {
    logger.error("[SENTRY] Failed to initialize", { error: error instanceof Error ? error.message : String(error) });
  }
}

export function getSentryHandlers(): { requestHandler: RequestHandler; errorHandler: ErrorRequestHandler } {
  const requestHandler: RequestHandler = (req, res, next) => {
    next();
  };
  
  const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
    if (process.env.NODE_ENV === "production" && process.env.SENTRY_DSN) {
      Sentry.captureException(err);
    }
    next(err);
  };
  
  return { requestHandler, errorHandler };
}

export function captureException(error: Error, context?: Record<string, any>) {
  if (process.env.NODE_ENV === "production" && process.env.SENTRY_DSN) {
    Sentry.captureException(error, {
      extra: context,
    });
  } else {
    logger.error("[ERROR]", { error: error instanceof Error ? error.message : String(error), context });
  }
}

export function captureMessage(message: string, level: Sentry.SeverityLevel = "info") {
  if (process.env.NODE_ENV === "production" && process.env.SENTRY_DSN) {
    Sentry.captureMessage(message, level);
  } else {
    logger.info(message, { level });
  }
}
