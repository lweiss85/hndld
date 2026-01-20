import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
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

// =============================================================================
// SECURITY HEADERS (Helmet)
// =============================================================================
app.use(helmet({
  // In production, use strict CSP; in development, disable to avoid breaking hot reload
  contentSecurityPolicy: process.env.NODE_ENV === "production" ? {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com", "https://*.replit.com"],
      connectSrc: ["'self'", "https://api.stripe.com", "https://api.anthropic.com", "https://api.openai.com", "https://*.sentry.io", "https://*.replit.com", "wss:", "https:"],
      frameSrc: ["'self'", "https://js.stripe.com", "https://hooks.stripe.com", "https://*.replit.com"],
      workerSrc: ["'self'", "blob:"],
    },
  } : false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// =============================================================================
// BODY PARSING WITH SIZE LIMITS
// =============================================================================
app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "10mb" }));

// =============================================================================
// HEALTH CHECK ENDPOINTS
// =============================================================================
app.get("/health", (_req, res) => {
  res.status(200).json({ 
    status: "healthy", 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0"
  });
});

app.get("/api/health", (_req, res) => {
  // Only expose details in development
  if (process.env.NODE_ENV === "production") {
    res.status(200).json({ status: "healthy" });
  } else {
    res.status(200).json({ 
      status: "healthy", 
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
      version: process.env.npm_package_version || "1.0.0"
    });
  }
});

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

    // Don't leak error details in production
    if (process.env.NODE_ENV === "production" && status === 500) {
      res.status(status).json({ message: "Internal Server Error" });
    } else {
      res.status(status).json({ message });
    }
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
