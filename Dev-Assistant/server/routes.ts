import type { Express } from "express";
import express from "express";
import { type Server } from "http";
import { join } from "path";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { apiLimiter } from "./lib/rate-limit";
import { requestIdMiddleware } from "./middleware/requestId";
import { householdContextMiddleware } from "./middleware/householdContext";
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

const householdContext = householdContextMiddleware;

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.use(requestIdMiddleware);

  await setupAuth(app);
  registerAuthRoutes(app);

  app.use("/api/", apiLimiter);

  app.use("/api/households", isAuthenticated, householdRoutes);
  app.use(inviteRoutes);
  app.use("/api/files", isAuthenticated, householdContext, fileRoutes);
  app.use("/api/h", isAuthenticated, weeklyBriefRoutes);

  app.use("/uploads", express.static(join(process.cwd(), "uploads")));

  registerGoogleCalendarRoutes(app);
  registerUserProfileRoutes(app);
  registerCleaningRoutes(app);
  registerTaskRoutes(app);
  registerApprovalsRoutes(app);
  registerSpendingRoutes(app);
  registerCalendarRoutes(app);
  registerHouseholdConciergeRoutes(app);
  registerAdminRoutes(app);
  registerAdminOpsRoutes(app);
  registerFeatureRoutes(app);

  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  setInterval(runMomentsAutomation, TWENTY_FOUR_HOURS_MS);
  runMomentsAutomation();

  startScheduledBackups();

  return httpServer;
}
