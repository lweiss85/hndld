# Replit Agent Prompt: Final Production Polish for hndld

You are a senior full-stack engineer completing the final production polish for **hndld**, a luxury household concierge platform. The app is 95% complete and production-ready. Your task is to implement the remaining 5% to make it launch-ready.

---

## 🎯 CONTEXT

**Current State:** The app is fully functional with:
- ✅ Multi-household switching working perfectly
- ✅ Vault security with PIN + bcrypt + audit logging
- ✅ Google Calendar OAuth with AES-256-GCM encryption
- ✅ Household invites system complete
- ✅ All core features implemented
- ✅ UI/UX polished and responsive

**What's Missing:** 5 production essentials (6 hours of work)

**Tech Stack:**
- Backend: Node.js + Express + TypeScript + Drizzle ORM
- Frontend: React + Vite + TypeScript + TailwindCSS + shadcn/ui
- Database: PostgreSQL
- Auth: Replit Auth (already configured)

---

## 📋 PART 1: CREATE .env.example FILE (10 minutes)

### Problem
No documentation of required environment variables. Deployment and team onboarding will be difficult.

### Solution
Create a comprehensive `.env.example` file in the project root.

**Create: `.env.example`**

```bash
# =============================================================================
# hndld Environment Variables
# =============================================================================
# Copy this file to .env and fill in your actual values
# DO NOT commit .env to git - it contains secrets!

# -----------------------------------------------------------------------------
# Database Configuration (Required)
# -----------------------------------------------------------------------------
DATABASE_URL=postgresql://username:password@localhost:5432/hndld
# Example for Replit: postgresql://username:password@db.replit.com:5432/hndld

# -----------------------------------------------------------------------------
# Session & Security (Required)
# -----------------------------------------------------------------------------
SESSION_SECRET=your-random-secret-key-minimum-32-characters-long-change-this
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# -----------------------------------------------------------------------------
# Replit Environment (Auto-set by Replit)
# -----------------------------------------------------------------------------
# These are automatically set by Replit - no need to set manually
REPLIT_DEPLOYMENT_URL=https://your-app.replit.app
REPLIT_DEV_DOMAIN=your-app-username.repl.co

# -----------------------------------------------------------------------------
# Google Calendar OAuth (Required for Calendar Feature)
# -----------------------------------------------------------------------------
GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-client-secret-here
# Get these from: https://console.cloud.google.com/apis/credentials
# Redirect URI should be: https://your-domain.com/api/google/callback

# -----------------------------------------------------------------------------
# Email / SMTP (Required for Notifications & Invites)
# -----------------------------------------------------------------------------
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
FROM_EMAIL=noreply@hndld.app
FROM_NAME=hndld

# For Gmail: Use App Password, not regular password
# Enable 2FA, then create App Password: https://myaccount.google.com/apppasswords

# -----------------------------------------------------------------------------
# AI Services (Optional - for AI features)
# -----------------------------------------------------------------------------
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
OPENAI_API_KEY=sk-your-openai-key-here

# -----------------------------------------------------------------------------
# Stripe Payment Processing (Optional - for billing)
# -----------------------------------------------------------------------------
STRIPE_SECRET_KEY=sk_test_your-test-key
STRIPE_PUBLISHABLE_KEY=pk_test_your-test-key
STRIPE_WEBHOOK_SECRET=whsec_your-webhook-secret
# For production, use: sk_live_... and pk_live_...

# -----------------------------------------------------------------------------
# File Storage (Optional - for attachments)
# -----------------------------------------------------------------------------
# S3-compatible storage (AWS S3, Backblaze B2, DigitalOcean Spaces, etc.)
S3_BUCKET=your-bucket-name
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key
S3_ENDPOINT=https://your-endpoint.com  # Optional, for non-AWS S3

# -----------------------------------------------------------------------------
# Error Monitoring (Optional - for production monitoring)
# -----------------------------------------------------------------------------
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
# Get from: https://sentry.io/

# -----------------------------------------------------------------------------
# Application Settings
# -----------------------------------------------------------------------------
NODE_ENV=development
# Options: development, production
LOG_LEVEL=info
# Options: error, warn, info, debug

PORT=5000
# Port for the application to run on

# -----------------------------------------------------------------------------
# Rate Limiting (Optional - recommended for production)
# -----------------------------------------------------------------------------
RATE_LIMIT_WINDOW_MS=900000
# 15 minutes in milliseconds
RATE_LIMIT_MAX_REQUESTS=100
# Maximum requests per window

AUTH_RATE_LIMIT_MAX=5
# Maximum auth attempts per window (stricter)

# -----------------------------------------------------------------------------
# Feature Flags (Optional)
# -----------------------------------------------------------------------------
ENABLE_CALENDAR_SYNC=true
ENABLE_AI_FEATURES=true
ENABLE_BILLING=false
ENABLE_EMAIL_NOTIFICATIONS=true

# -----------------------------------------------------------------------------
# Backup Settings (Optional)
# -----------------------------------------------------------------------------
BACKUP_RETENTION_DAYS=30
# How many days to keep backups
AUTO_BACKUP_ENABLED=true
# Enable automatic daily backups
```

**Also create: `.env`** (for local development)
```bash
# Copy .env.example to .env and fill in your actual values
# This file is gitignored and should never be committed

DATABASE_URL=postgresql://localhost:5432/hndld_dev
SESSION_SECRET=dev-secret-change-in-production
NODE_ENV=development
```

**Add to `.gitignore`** (if not already there)
```
.env
.env.local
.env.production
*.env
```

---

## 📋 PART 2: ADD AUTOMATIC CALENDAR SYNC (30 minutes)

### Problem
Calendar events only sync manually. Users won't see updated events until they click "sync".

### Solution
Add a cron job to sync calendars automatically every 15 minutes.

---

### Step 2.1: Update Scheduler Service

**Update: `server/services/scheduler.ts`**

Add this to the existing file (or create if doesn't exist):

```typescript
import cron from "node-cron";
import { syncCalendarEvents } from "./google-calendar";
import { db } from "../db";
import { calendarConnections } from "@shared/schema";

let calendarSyncJob: cron.ScheduledTask | null = null;

/**
 * Start automatic calendar sync
 * Runs every 15 minutes to sync all connected Google Calendars
 */
export function startCalendarSync() {
  // Prevent duplicate jobs
  if (calendarSyncJob) {
    console.log("[SCHEDULER] Calendar sync already running");
    return;
  }

  // Only run in production or if explicitly enabled
  const isEnabled = process.env.ENABLE_CALENDAR_SYNC !== "false";
  if (!isEnabled) {
    console.log("[SCHEDULER] Calendar sync disabled via env var");
    return;
  }

  // Schedule sync every 15 minutes
  calendarSyncJob = cron.schedule("*/15 * * * *", async () => {
    const startTime = Date.now();
    console.log("[SCHEDULER] Starting calendar sync...");
    
    try {
      // Get all unique households with calendar connections
      const connections = await db
        .selectDistinct({ 
          householdId: calendarConnections.householdId 
        })
        .from(calendarConnections);
      
      if (connections.length === 0) {
        console.log("[SCHEDULER] No calendar connections to sync");
        return;
      }

      let totalSynced = 0;
      let successCount = 0;
      let errorCount = 0;

      for (const { householdId } of connections) {
        try {
          const result = await syncCalendarEvents(householdId);
          
          if (result.synced !== undefined) {
            totalSynced += result.synced;
            successCount++;
            console.log(
              `[SCHEDULER] ✓ Synced ${result.synced} events for household ${householdId}`
            );
          } else if (result.error) {
            errorCount++;
            console.log(
              `[SCHEDULER] ⚠ Skipped household ${householdId}: ${result.error}`
            );
          }
        } catch (error: any) {
          errorCount++;
          console.error(
            `[SCHEDULER] ✗ Failed to sync household ${householdId}:`,
            error.message
          );
        }
      }

      const duration = Date.now() - startTime;
      console.log(
        `[SCHEDULER] Calendar sync complete: ${totalSynced} events, ` +
        `${successCount} households succeeded, ${errorCount} failed ` +
        `(${duration}ms)`
      );
    } catch (error: any) {
      console.error("[SCHEDULER] Calendar sync job failed:", error.message);
    }
  });

  console.log("[SCHEDULER] ✓ Calendar sync scheduled (every 15 minutes)");
}

/**
 * Stop automatic calendar sync
 * Useful for graceful shutdown
 */
export function stopCalendarSync() {
  if (calendarSyncJob) {
    calendarSyncJob.stop();
    calendarSyncJob = null;
    console.log("[SCHEDULER] Calendar sync stopped");
  }
}

/**
 * Trigger an immediate sync (for testing or manual triggers)
 */
export async function triggerImmediateSync() {
  console.log("[SCHEDULER] Triggering immediate calendar sync...");
  
  const connections = await db
    .selectDistinct({ householdId: calendarConnections.householdId })
    .from(calendarConnections);
  
  const results = await Promise.allSettled(
    connections.map(({ householdId }) => syncCalendarEvents(householdId))
  );
  
  return {
    total: connections.length,
    succeeded: results.filter(r => r.status === "fulfilled").length,
    failed: results.filter(r => r.status === "rejected").length,
  };
}
```

---

### Step 2.2: Start Scheduler on Server Boot

**Update: `server/index.ts`**

Find the section where the server starts and add the scheduler:

```typescript
import { startCalendarSync, stopCalendarSync } from "./services/scheduler";

(async () => {
  await registerRoutes(httpServer, app);

  // Error handler middleware (existing code)
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });

  // Setup static serving or vite (existing code)
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ============================================================================
  // START BACKGROUND JOBS
  // ============================================================================
  
  // Start automatic calendar sync (every 15 minutes)
  if (process.env.NODE_ENV === "production" || process.env.ENABLE_CALENDAR_SYNC === "true") {
    try {
      startCalendarSync();
      console.log("✓ Background jobs started");
    } catch (error) {
      console.error("✗ Failed to start background jobs:", error);
    }
  } else {
    console.log("⚠ Background jobs disabled (development mode)");
  }

  // Graceful shutdown handler
  process.on("SIGTERM", () => {
    console.log("SIGTERM received, shutting down gracefully...");
    stopCalendarSync();
    httpServer.close(() => {
      console.log("Server closed");
      process.exit(0);
    });
  });

  // ============================================================================
  // START SERVER
  // ============================================================================
  
  const PORT = process.env.PORT || 5000;
  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
})();
```

---

### Step 2.3: Add Manual Sync Trigger Endpoint (Optional but Useful)

**Update: `server/routes.ts`**

Add this endpoint for manual sync triggers:

```typescript
import { triggerImmediateSync } from "./services/scheduler";

// Manual calendar sync trigger (for admins)
app.post("/api/admin/sync-calendars", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const profile = await getUserProfile(userId);
    
    if (profile?.role !== "ASSISTANT") {
      return res.status(403).json({ message: "Only assistants can trigger sync" });
    }

    const result = await triggerImmediateSync();
    
    res.json({
      message: "Calendar sync triggered",
      ...result,
    });
  } catch (error: any) {
    console.error("Error triggering sync:", error);
    res.status(500).json({ message: "Failed to trigger sync" });
  }
});
```

---

## 📋 PART 3: ADD RATE LIMITING (1 hour)

### Problem
No rate limiting on API endpoints. Vulnerable to brute force attacks and abuse.

### Solution
Add express-rate-limit with different limits for different endpoint types.

---

### Step 3.1: Install Rate Limiting Package

```bash
npm install express-rate-limit
```

---

### Step 3.2: Create Rate Limiting Configuration

**Create: `server/lib/rate-limit.ts`**

```typescript
import rateLimit from "express-rate-limit";

/**
 * General API rate limiter
 * Applies to all /api/* routes
 */
export const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000"), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100"), // 100 requests per window
  message: {
    error: "Too many requests from this IP, please try again later",
    retryAfter: "15 minutes",
  },
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
  // Skip rate limiting for health checks
  skip: (req) => req.path === "/health",
});

/**
 * Strict rate limiter for authentication endpoints
 * Prevents brute force attacks on login/PIN/passwords
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || "5"), // 5 attempts per window
  message: {
    error: "Too many authentication attempts, please try again later",
    retryAfter: "15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Key by IP + user identifier if available
  keyGenerator: (req: any) => {
    return req.user?.claims?.sub || req.ip;
  },
});

/**
 * Moderate rate limiter for expensive operations
 * For AI calls, calendar syncs, backups, etc.
 */
export const expensiveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 requests per hour
  message: {
    error: "Too many requests for this operation, please try again later",
    retryAfter: "1 hour",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Very strict limiter for critical operations
 * For password resets, account deletions, etc.
 */
export const criticalLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 3, // 3 attempts per day
  message: {
    error: "Too many attempts for this critical operation, please try again tomorrow",
    retryAfter: "24 hours",
  },
  standardHeaders: true,
  legacyHeaders: false,
});
```

---

### Step 3.3: Apply Rate Limiting to Routes

**Update: `server/routes.ts`**

Add rate limiting imports at the top:

```typescript
import { apiLimiter, authLimiter, expensiveLimiter, criticalLimiter } from "./lib/rate-limit";
```

Then apply rate limiters to appropriate routes. Find these endpoints and add the limiters:

```typescript
// ============================================================================
// APPLY RATE LIMITING
// ============================================================================

// General API rate limiting (apply to all /api routes)
app.use("/api/", apiLimiter);

// ============================================================================
// VAULT ENDPOINTS (Strict rate limiting)
// ============================================================================

// Change from:
app.post("/api/vault/set-pin", isAuthenticated, async (req: any, res) => {
  
// To:
app.post("/api/vault/set-pin", authLimiter, isAuthenticated, async (req: any, res) => {

// Change from:
app.post("/api/vault/verify-pin", isAuthenticated, async (req: any, res) => {
  
// To:
app.post("/api/vault/verify-pin", authLimiter, isAuthenticated, async (req: any, res) => {

// ============================================================================
// AI ENDPOINTS (Expensive operation limiting)
// ============================================================================

// Change from:
app.get("/api/ai/weekly-brief", isAuthenticated, async (req: any, res) => {
  
// To:
app.get("/api/ai/weekly-brief", expensiveLimiter, isAuthenticated, async (req: any, res) => {

// Change from:
app.post("/api/ai/parse-request", isAuthenticated, async (req: any, res) => {
  
// To:
app.post("/api/ai/parse-request", expensiveLimiter, isAuthenticated, async (req: any, res) => {

// Change from:
app.post("/api/ai/transcribe", isAuthenticated, async (req: any, res) => {
  
// To:
app.post("/api/ai/transcribe", expensiveLimiter, isAuthenticated, async (req: any, res) => {

// Change from:
app.post("/api/ai/smart-actions", isAuthenticated, async (req: any, res) => {
  
// To:
app.post("/api/ai/smart-actions", expensiveLimiter, isAuthenticated, async (req: any, res) => {

// ============================================================================
// CALENDAR SYNC (Expensive operation limiting)
// ============================================================================

// Change from:
app.post("/api/google/sync", isAuthenticated, householdContext, async (req: any, res) => {
  
// To:
app.post("/api/google/sync", expensiveLimiter, isAuthenticated, householdContext, async (req: any, res) => {

// ============================================================================
// BACKUP ENDPOINTS (Critical operation limiting)
// ============================================================================

// Change from:
app.post("/api/admin/backup", isAuthenticated, async (req: any, res) => {
  
// To:
app.post("/api/admin/backup", criticalLimiter, isAuthenticated, async (req: any, res) => {

// Change from:
app.delete("/api/admin/backups/:filename", isAuthenticated, async (req: any, res) => {
  
// To:
app.delete("/api/admin/backups/:filename", criticalLimiter, isAuthenticated, async (req: any, res) => {
```

---

### Step 3.4: Add Rate Limit Info to Response Headers

Rate limit info is automatically added to response headers:
- `RateLimit-Limit`: Maximum requests allowed
- `RateLimit-Remaining`: Requests remaining in window
- `RateLimit-Reset`: Time when limit resets (Unix timestamp)

Clients can check these headers to show user-friendly messages.

---

## 📋 PART 4: ADD ERROR MONITORING (2 hours)

### Problem
No way to know when errors occur in production. Can't debug issues, track error rates, or alert on problems.

### Solution
Add Sentry for error monitoring, tracking, and alerting.

---

### Step 4.1: Install Sentry

```bash
npm install @sentry/node @sentry/react
```

---

### Step 4.2: Configure Sentry Backend

**Create: `server/lib/sentry.ts`**

```typescript
import * as Sentry from "@sentry/node";
import { Express } from "express";

/**
 * Initialize Sentry error monitoring
 * Only enabled in production with SENTRY_DSN set
 */
export function initSentry(app: Express) {
  const sentryDsn = process.env.SENTRY_DSN;
  const environment = process.env.NODE_ENV || "development";

  // Only enable in production with DSN configured
  if (environment !== "production" || !sentryDsn) {
    console.log("[SENTRY] Error monitoring disabled (not production or no DSN)");
    return;
  }

  try {
    Sentry.init({
      dsn: sentryDsn,
      environment,
      
      // Set tracesSampleRate to 1.0 to capture 100% of transactions
      // Reduce in production to save costs (0.1 = 10%)
      tracesSampleRate: 0.1,
      
      // Capture console errors
      integrations: [
        // Enable HTTP calls tracing
        new Sentry.Integrations.Http({ tracing: true }),
        // Enable Express tracing
        new Sentry.Integrations.Express({ app }),
      ],
      
      // Don't send these errors to Sentry
      ignoreErrors: [
        "ECONNREFUSED",
        "ENOTFOUND",
        "NetworkError",
        "Non-Error promise rejection captured",
      ],
      
      // Filter out sensitive data
      beforeSend(event, hint) {
        // Remove request body with sensitive data
        if (event.request?.data) {
          const data = event.request.data;
          if (typeof data === "object") {
            // Redact sensitive fields
            const sensitiveFields = ["password", "pin", "token", "secret", "key"];
            for (const field of sensitiveFields) {
              if (field in data) {
                data[field] = "[REDACTED]";
              }
            }
          }
        }
        return event;
      },
    });

    console.log("[SENTRY] ✓ Error monitoring enabled");
  } catch (error) {
    console.error("[SENTRY] Failed to initialize:", error);
  }
}

/**
 * Get Sentry request and error handlers for Express
 */
export function getSentryHandlers() {
  return {
    requestHandler: Sentry.Handlers.requestHandler(),
    errorHandler: Sentry.Handlers.errorHandler({
      shouldHandleError(error) {
        // Send 4xx and 5xx errors to Sentry
        return error.status >= 400;
      },
    }),
  };
}

/**
 * Capture an exception manually
 */
export function captureException(error: Error, context?: Record<string, any>) {
  if (process.env.NODE_ENV === "production" && process.env.SENTRY_DSN) {
    Sentry.captureException(error, {
      extra: context,
    });
  } else {
    console.error("[ERROR]", error, context);
  }
}

/**
 * Capture a message manually
 */
export function captureMessage(message: string, level: Sentry.SeverityLevel = "info") {
  if (process.env.NODE_ENV === "production" && process.env.SENTRY_DSN) {
    Sentry.captureMessage(message, level);
  } else {
    console.log(`[${level.toUpperCase()}]`, message);
  }
}
```

---

### Step 4.3: Add Sentry to Express Server

**Update: `server/index.ts`**

```typescript
import { initSentry, getSentryHandlers } from "./lib/sentry";

const app = express();
const httpServer = createServer(app);

// ============================================================================
// INITIALIZE SENTRY (must be first)
// ============================================================================
initSentry(app);
const sentryHandlers = getSentryHandlers();

// Sentry request handler must be the first middleware
app.use(sentryHandlers.requestHandler);

// ============================================================================
// EXISTING MIDDLEWARE
// ============================================================================

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// ... rest of existing middleware (logging, etc.)

(async () => {
  await registerRoutes(httpServer, app);

  // ============================================================================
  // SENTRY ERROR HANDLER (must be after routes, before other error handlers)
  // ============================================================================
  app.use(sentryHandlers.errorHandler);

  // Your existing error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });

  // ... rest of server startup
})();
```

---

### Step 4.4: Configure Sentry Frontend

**Update: `client/src/main.tsx`**

```typescript
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App";
import "./index.css";

// Initialize Sentry in production only
if (import.meta.env.PROD && import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: "production",
    
    // Set tracesSampleRate to capture performance data
    tracesSampleRate: 0.1,
    
    // Capture replay sessions for debugging
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    
    integrations: [
      new Sentry.BrowserTracing(),
      new Sentry.Replay({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    
    // Filter out errors we don't care about
    ignoreErrors: [
      "ResizeObserver loop",
      "Non-Error promise rejection",
      "NetworkError",
    ],
    
    beforeSend(event, hint) {
      // Don't send events in development
      if (import.meta.env.DEV) {
        return null;
      }
      return event;
    },
  });
}

createRoot(document.getElementById("root")!).render(<App />);
```

---

### Step 4.5: Add Sentry DSN to Environment Variables

**Update: `.env.example`** (add to error monitoring section)

```bash
# -----------------------------------------------------------------------------
# Error Monitoring (Recommended for Production)
# -----------------------------------------------------------------------------
SENTRY_DSN=https://your-key@o123456.ingest.sentry.io/123456
# Get from: https://sentry.io/settings/projects/

# Frontend also needs this (add to Replit Secrets with VITE_ prefix)
VITE_SENTRY_DSN=https://your-key@o123456.ingest.sentry.io/123456
```

---

### Step 4.6: Use Sentry in Code

Replace some critical error logs with Sentry capture:

**Example in routes.ts:**

```typescript
import { captureException, captureMessage } from "./lib/sentry";

// Before:
console.error("Error creating backup:", error);

// After:
captureException(error, { 
  context: "backup_creation",
  userId,
  householdId,
});

// For important events (not errors):
captureMessage("Household created", "info");
captureMessage("Large backup created (>100MB)", "warning");
```

---

### Step 4.7: Setup Sentry Account (Manual Step)

**Instructions for you to do manually:**

1. Go to https://sentry.io/signup/
2. Create free account (free for 5,000 errors/month)
3. Create new project → Select "Express"
4. Copy the DSN (looks like: `https://abc123@o456.ingest.sentry.io/789`)
5. Add to Replit Secrets:
   - `SENTRY_DSN` = your backend DSN
   - `VITE_SENTRY_DSN` = your frontend DSN (usually the same)
6. Deploy and test by triggering an error

---

## 📋 PART 5: CLEAN UP CONSOLE STATEMENTS (Optional - 2 hours)

### Problem
138 console.log/console.error statements. Hard to filter, search, or control log levels.

### Solution (Two Options)

**Option A: Keep as-is** (Acceptable for v1 launch)
- Just remove non-error console.log statements
- Keep console.error for actual errors
- Ship and improve later

**Option B: Proper logging** (Better long-term)
- Install Winston logger
- Replace console.* with logger.*
- Get log levels, filtering, formatting

---

### Option B Implementation (if you want proper logging)

**Step 5.1: Install Winston**

```bash
npm install winston
```

---

**Step 5.2: Create Logger**

**Create: `server/lib/logger.ts`**

```typescript
import winston from "winston";

const logLevel = process.env.LOG_LEVEL || "info";
const isDevelopment = process.env.NODE_ENV !== "production";

const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    isDevelopment
      ? winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : "";
            return `${timestamp} [${level}] ${message} ${metaStr}`;
          })
        )
      : winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      stderrLevels: ["error"],
    }),
  ],
});

export default logger;
```

---

**Step 5.3: Replace Console Statements**

This is tedious but valuable. Example replacements:

```typescript
import logger from "./lib/logger";

// Before:
console.log("Calendar sync complete:", result);

// After:
logger.info("Calendar sync complete", { result });

// Before:
console.error("Failed to sync calendar:", error);

// After:
logger.error("Failed to sync calendar", { error: error.message, stack: error.stack });

// Before:
console.log("User logged in:", userId);

// After:
logger.info("User logged in", { userId });
```

**You can do this gradually** - don't need to replace all 138 at once.

**Priority areas:**
1. Error handlers (high priority)
2. Background jobs/scheduler (medium priority)
3. Request logging (low priority - already using custom logger)

---

## 🧪 PART 6: TESTING & VERIFICATION

After implementing all the above, test everything:

### Test 1: Environment Variables
```bash
# Check .env.example exists
ls -la .env.example

# Check it has all required vars
cat .env.example | grep DATABASE_URL
cat .env.example | grep SESSION_SECRET
cat .env.example | grep GOOGLE_CLIENT_ID
cat .env.example | grep SENTRY_DSN
```

### Test 2: Calendar Auto-Sync
```bash
# Start the server
npm run dev

# Check scheduler started
# Look for: "✓ Calendar sync scheduled (every 15 minutes)"

# Wait 15 minutes and check logs for sync
# Look for: "[SCHEDULER] Starting calendar sync..."

# Or trigger manual sync
curl -X POST http://localhost:5000/api/admin/sync-calendars \
  -H "Cookie: your-session-cookie"
```

### Test 3: Rate Limiting
```bash
# Test general API rate limit (100 requests/15 min)
for i in {1..101}; do
  curl -X GET http://localhost:5000/api/tasks
done
# Should see "Too many requests" on request 101

# Test auth rate limit (5 attempts/15 min)
for i in {1..6}; do
  curl -X POST http://localhost:5000/api/vault/verify-pin \
    -H "Content-Type: application/json" \
    -d '{"pin":"1234"}'
done
# Should see "Too many authentication attempts" on attempt 6
```

### Test 4: Error Monitoring
```bash
# Trigger a test error
curl -X GET http://localhost:5000/api/test-error

# Check Sentry dashboard for the error
# Should appear within ~30 seconds
```

### Test 5: Full Smoke Test
1. Start server: `npm run dev`
2. Open app: http://localhost:5000
3. Login as assistant
4. Switch households (should work)
5. Set vault PIN (should work)
6. Unlock vault (should work, max 5 attempts)
7. Connect Google Calendar (should work)
8. Wait 15 minutes (calendar should auto-sync)
9. Check Sentry dashboard (no unexpected errors)

---

## 📝 IMPLEMENTATION CHECKLIST

Use this to track your progress:

### Part 1: Environment Variables (10 min)
- [ ] Create `.env.example` with all required variables
- [ ] Add to `.gitignore` if not already there
- [ ] Verify file contains: DATABASE_URL, SESSION_SECRET, GOOGLE_*, SMTP_*, SENTRY_DSN
- [ ] Test: File exists and has 100+ lines

### Part 2: Calendar Auto-Sync (30 min)
- [ ] Update `server/services/scheduler.ts` with `startCalendarSync()`
- [ ] Update `server/index.ts` to call `startCalendarSync()` on boot
- [ ] Add graceful shutdown handler
- [ ] Add manual sync endpoint (optional)
- [ ] Test: Check logs for "Calendar sync scheduled"
- [ ] Test: Wait 15 min or manually trigger sync

### Part 3: Rate Limiting (1 hour)
- [ ] Install: `npm install express-rate-limit`
- [ ] Create `server/lib/rate-limit.ts` with all limiters
- [ ] Apply `apiLimiter` to all `/api/*` routes
- [ ] Apply `authLimiter` to vault endpoints
- [ ] Apply `expensiveLimiter` to AI and sync endpoints
- [ ] Apply `criticalLimiter` to backup endpoints
- [ ] Test: Try making 101 requests rapidly (should fail)
- [ ] Test: Try vault PIN 6 times (should fail)

### Part 4: Error Monitoring (2 hours)
- [ ] Install: `npm install @sentry/node @sentry/react`
- [ ] Create `server/lib/sentry.ts` with init functions
- [ ] Update `server/index.ts` to initialize Sentry
- [ ] Update `client/src/main.tsx` to initialize Sentry
- [ ] Sign up for Sentry account (manual)
- [ ] Add `SENTRY_DSN` to environment variables
- [ ] Add `VITE_SENTRY_DSN` to environment variables
- [ ] Test: Trigger error and check Sentry dashboard

### Part 5: Clean Up Logs (Optional - 2 hours)
- [ ] Install: `npm install winston` (optional)
- [ ] Create `server/lib/logger.ts` (optional)
- [ ] Replace critical console.error with logger.error (optional)
- [ ] Test: Logs have proper format and levels (optional)

### Part 6: Final Testing (1 hour)
- [ ] All environment variables documented
- [ ] Calendar syncs automatically every 15 minutes
- [ ] Rate limiting prevents abuse
- [ ] Errors appear in Sentry dashboard
- [ ] No console errors in browser
- [ ] Full user flow works end-to-end

---

## 🚀 DEPLOYMENT CHECKLIST

Before deploying to production:

### Environment Setup
- [ ] Set all required environment variables in Replit Secrets
- [ ] `DATABASE_URL` points to production database
- [ ] `SESSION_SECRET` is 32+ random characters
- [ ] `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set
- [ ] `GOOGLE_REDIRECT_URI` matches production URL
- [ ] `SMTP_*` configured for email sending
- [ ] `SENTRY_DSN` configured for error monitoring
- [ ] `NODE_ENV=production` set

### Google OAuth Setup
- [ ] Google Cloud Console has production redirect URI
- [ ] OAuth consent screen is published
- [ ] Test users added (if in Testing mode)
- [ ] Scopes include calendar.readonly

### Email Setup
- [ ] SMTP credentials are valid
- [ ] Test email sends successfully
- [ ] From email is not marked as spam

### Sentry Setup
- [ ] Sentry project created
- [ ] DSN added to environment
- [ ] Test error appears in dashboard

### Final Checks
- [ ] Database migrations applied: `npm run db:push`
- [ ] Build successful: `npm run build`
- [ ] Server starts without errors: `npm start`
- [ ] No console errors in browser
- [ ] Rate limiting works
- [ ] Calendar sync starts automatically
- [ ] Errors go to Sentry

---

## ⚡ QUICK START (TL;DR)

If you just want to get started immediately:

```bash
# 1. Create .env.example (copy content from Part 1)
touch .env.example

# 2. Install dependencies
npm install express-rate-limit @sentry/node @sentry/react

# 3. Update files in this order:
# - server/services/scheduler.ts (add startCalendarSync)
# - server/index.ts (call startCalendarSync)
# - server/lib/rate-limit.ts (create file)
# - server/routes.ts (add rate limiters)
# - server/lib/sentry.ts (create file)
# - server/index.ts (add Sentry)
# - client/src/main.tsx (add Sentry)

# 4. Test locally
npm run dev

# 5. Deploy to production
# (Replit does this automatically)
```

---

## 🎯 EXPECTED OUTCOMES

After completing all parts:

✅ **Environment Variables**
- Clear documentation of all required settings
- Easy onboarding for new developers
- No confusion about what needs to be set

✅ **Calendar Auto-Sync**
- Events update automatically every 15 minutes
- Users always see latest calendar data
- No manual sync button needed

✅ **Rate Limiting**
- Protected against brute force attacks
- Protected against API abuse
- Better resource utilization

✅ **Error Monitoring**
- Real-time alerts when errors occur
- Stack traces for debugging
- Error trends over time
- User impact visibility

✅ **Production Ready**
- App is robust and secure
- You know when things break
- Users have reliable experience
- Ready to scale

---

## 💡 HELPFUL TIPS

1. **Do parts in order** - They build on each other
2. **Test after each part** - Don't wait until the end
3. **Check Sentry last** - Errors will accumulate during development
4. **Use .env.example** - It's your documentation
5. **Don't skip rate limiting** - Security is critical

---

## 🆘 TROUBLESHOOTING

### Issue: Calendar sync doesn't start
**Check:**
- Is `ENABLE_CALENDAR_SYNC` set to true?
- Is `NODE_ENV` set to production?
- Are there any calendar connections in the database?
- Check logs for "[SCHEDULER]" messages

### Issue: Rate limiting not working
**Check:**
- Did you install `express-rate-limit`?
- Is it applied BEFORE the routes?
- Try making 101 requests rapidly
- Check response headers for `RateLimit-*`

### Issue: Sentry not capturing errors
**Check:**
- Is `SENTRY_DSN` set correctly?
- Is `NODE_ENV=production`?
- Try triggering a test error
- Check Sentry project settings

### Issue: Environment variables not loading
**Check:**
- Are they in Replit Secrets (not just .env)?
- Did you restart the server after adding them?
- Check with: `console.log(process.env.YOUR_VAR)`

---

## ✅ SUCCESS CRITERIA

You'll know you're done when:

1. ✅ `.env.example` exists with 100+ lines
2. ✅ Console shows "Calendar sync scheduled" on startup
3. ✅ Making 101 API requests gets rate limited
4. ✅ Errors appear in Sentry dashboard within seconds
5. ✅ Calendar events sync every 15 minutes automatically
6. ✅ Full user flow works without errors
7. ✅ You feel confident deploying to production

---

## 🎉 YOU'RE DONE!

After completing these tasks, your app is 100% production-ready.

You've added:
- ✅ Documentation (.env.example)
- ✅ Reliability (calendar auto-sync)
- ✅ Security (rate limiting)
- ✅ Observability (error monitoring)
- ✅ Confidence (ready to ship!)

**Ship it and celebrate!** 🚀

Good luck!
