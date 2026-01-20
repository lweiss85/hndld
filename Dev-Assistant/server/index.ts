import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { initSentry, getSentryHandlers } from "./lib/sentry";
import { startCalendarSync, stopCalendarSync, startProactiveAgent, stopProactiveAgent } from "./services/scheduler";
import { wsManager } from "./services/websocket";

const app = express();
const httpServer = createServer(app);

initSentry(app);
const sentryHandlers = getSentryHandlers();
app.use(sentryHandlers.requestHandler);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use(sentryHandlers.errorHandler);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  wsManager.initialize(httpServer);

  if (process.env.NODE_ENV === "production" || process.env.ENABLE_CALENDAR_SYNC === "true") {
    try {
      startCalendarSync();
      console.log("[SERVER] Calendar sync started");
    } catch (error) {
      console.error("[SERVER] Failed to start calendar sync:", error);
    }
  }
  
  try {
    startProactiveAgent();
    console.log("[SERVER] Proactive AI agent started");
  } catch (error) {
    console.error("[SERVER] Failed to start proactive agent:", error);
  }

  process.on("SIGTERM", () => {
    console.log("[SERVER] SIGTERM received, shutting down gracefully...");
    stopCalendarSync();
    stopProactiveAgent();
    httpServer.close(() => {
      console.log("[SERVER] Server closed");
      process.exit(0);
    });
  });

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
