import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { initSentry, getSentryHandlers } from "./lib/sentry";
import { startCalendarSync, stopCalendarSync } from "./services/scheduler";
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

// =============================================================================
// SECURITY HEADERS (Helmet)
// =============================================================================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Required for React dev
      connectSrc: ["'self'", "https://api.stripe.com", "https://api.anthropic.com", "https://api.openai.com", "wss:", "https:"],
      frameSrc: ["'self'", "https://js.stripe.com", "https://hooks.stripe.com"],
      workerSrc: ["'self'", "blob:"],
    },
  },
  crossOriginEmbedderPolicy: false, // Required for some third-party scripts
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow loading images from CDNs
}));

// =============================================================================
// BODY PARSING WITH SIZE LIMITS
// =============================================================================
app.use(
  express.json({
    limit: "10mb", // Prevent DoS via large payloads
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "10mb" }));

// =============================================================================
// REQUEST LOGGING
// =============================================================================
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
  // Add database health check in production
  res.status(200).json({ 
    status: "healthy", 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    version: process.env.npm_package_version || "1.0.0"
  });
});

// =============================================================================
// MAIN APP INITIALIZATION
// =============================================================================
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
      console.log("[SERVER] Background jobs started");
    } catch (error) {
      console.error("[SERVER] Failed to start background jobs:", error);
    }
  }

  process.on("SIGTERM", () => {
    console.log("[SERVER] SIGTERM received, shutting down gracefully...");
    stopCalendarSync();
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
