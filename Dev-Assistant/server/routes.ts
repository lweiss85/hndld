import type { Express } from "express";
import express from "express";
import { type Server } from "http";
import { join } from "path";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { apiLimiter } from "./lib/rate-limit";
import { requestIdMiddleware } from "./middleware/requestId";
import { responseTimeMiddleware } from "./middleware/responseTime";
import { apiVersionMiddleware } from "./middleware/apiVersion";
import { householdContextMiddleware } from "./middleware/householdContext";
import { metrics } from "./lib/metrics";
import { setupSwagger } from "./lib/swagger";
import { apiCacheHeaders } from "./middleware/cacheControl";
import { cache } from "./lib/cache";
import { getPoolStats } from "./db";
import { startScheduledBackups } from "./services/scheduler";
import { runMomentsAutomation } from "./routes/helpers";
import householdRoutes from "./routes/households";
import inviteRoutes from "./routes/invites";
import fileRoutes from "./routes/files";
import weeklyBriefRoutes from "./routes/weekly-brief";
import { registerGoogleCalendarRoutes } from "./routes/google-calendar";
import { registerUserProfileRoutes } from "./routes/user-profile";
import { registerCleaningRoutes } from "./routes/cleaning";
import { registerTaskRoutes } from "./routes/tasks";
import { registerApprovalsRoutes } from "./routes/approvals";
import { registerSpendingRoutes } from "./routes/spending";
import { registerCalendarRoutes } from "./routes/calendar";
import { registerHouseholdConciergeRoutes } from "./routes/household-concierge";
import { registerAdminRoutes } from "./routes/admin";
import { registerAdminOpsRoutes } from "./routes/admin-ops";
import { registerFeatureRoutes } from "./routes/features";
import { registerJobRoutes } from "./routes/jobs";
import { registerInsightRoutes } from "./routes/insights";
import { registerAskRoutes } from "./routes/ask";
import { registerShortcutRoutes } from "./routes/shortcuts";
import { registerNetworkRoutes } from "./routes/network";
import { registerCelebrationRoutes } from "./routes/celebrations";
import { registerTwoFactorRoutes } from "./routes/two-factor";

const householdContext = householdContextMiddleware;

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.use(requestIdMiddleware);
  app.use(responseTimeMiddleware);

  setupSwagger(app);

  app.get("/api/metrics", (_req, res) => {
    res.set("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    const poolInfo = getPoolStats();
    let prom = metrics.toPrometheus();
    prom += "\n# HELP db_pool_total Total connections in pool\n";
    prom += "# TYPE db_pool_total gauge\n";
    prom += `db_pool_total ${poolInfo.total}\n`;
    prom += "# HELP db_pool_idle Idle connections in pool\n";
    prom += "# TYPE db_pool_idle gauge\n";
    prom += `db_pool_idle ${poolInfo.idle}\n`;
    prom += "# HELP db_pool_waiting Clients waiting for a connection\n";
    prom += "# TYPE db_pool_waiting gauge\n";
    prom += `db_pool_waiting ${poolInfo.waiting}\n`;
    prom += "# HELP db_pool_max Maximum pool size\n";
    prom += "# TYPE db_pool_max gauge\n";
    prom += `db_pool_max ${poolInfo.max}\n`;
    prom += "# HELP db_pool_utilization_percent Pool utilization percentage\n";
    prom += "# TYPE db_pool_utilization_percent gauge\n";
    prom += `db_pool_utilization_percent ${poolInfo.utilization}\n`;
    prom += "# HELP db_pool_errors_total Lifetime pool connection errors\n";
    prom += "# TYPE db_pool_errors_total counter\n";
    prom += `db_pool_errors_total ${poolInfo.lifetime.errors}\n`;
    res.send(prom);
  });

  app.get("/api/metrics/json", (_req, res) => {
    res.json({ ...metrics.getStats(), cache: cache.getStats(), pool: getPoolStats() });
  });

  await setupAuth(app);
  registerAuthRoutes(app);

  app.use("/api/", apiLimiter);

  const v1 = express.Router();
  v1.use(apiVersionMiddleware);
  v1.use(apiCacheHeaders);

  v1.use("/households", isAuthenticated, householdRoutes);
  v1.use(inviteRoutes);
  v1.use("/files", isAuthenticated, householdContext, fileRoutes);
  v1.use("/h", isAuthenticated, weeklyBriefRoutes);

  v1.use("/uploads", express.static(join(process.cwd(), "uploads")));

  registerGoogleCalendarRoutes(v1);
  registerUserProfileRoutes(v1);
  registerCleaningRoutes(v1);
  registerTaskRoutes(v1);
  registerApprovalsRoutes(v1);
  registerSpendingRoutes(v1);
  registerCalendarRoutes(v1);
  registerHouseholdConciergeRoutes(v1);
  registerAdminRoutes(v1);
  registerAdminOpsRoutes(v1);
  registerFeatureRoutes(v1);
  registerJobRoutes(v1);
  registerInsightRoutes(v1);
  registerAskRoutes(v1);
  registerShortcutRoutes(v1);
  registerNetworkRoutes(v1);
  registerCelebrationRoutes(v1);
  registerTwoFactorRoutes(v1);

  app.use("/api/v1", v1);
  app.use("/api", v1);

  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  setInterval(runMomentsAutomation, TWENTY_FOUR_HOURS_MS);
  runMomentsAutomation();

  startScheduledBackups();

  metrics.startDailyLog();

  return httpServer;
}
