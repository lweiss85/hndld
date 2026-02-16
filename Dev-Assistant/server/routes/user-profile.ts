import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import logger from "../lib/logger";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import { getImpactMetrics } from "../services/analytics";
import { seedDemoData } from "./helpers";

const householdContext = householdContextMiddleware;

export async function registerUserProfileRoutes(app: Express): Promise<void> {
  // Get user profile
  app.get("/api/user-profile", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const profile = await storage.getUserProfile(userId);
      
      // If no profile exists, user needs to select role first
      if (!profile) {
        return res.json({ needsRoleSelection: true });
      }
      
      res.json(profile);
    } catch (error) {
      logger.error("Error fetching user profile", { error, userId });
      res.status(500).json({ message: "Failed to fetch user profile" });
    }
  });
  
  // Set user role (first-time setup)
  app.post("/api/user/role", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const { role } = req.body;
      
      if (!role || !["ASSISTANT", "CLIENT"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      
      // Check if user already has a profile
      const existingProfile = await storage.getUserProfile(userId);
      if (existingProfile) {
        return res.status(400).json({ message: "Role already set" });
      }
      
      // Create household and profile with selected role
      const household = await storage.createHousehold({ name: "My Household" });
      const profile = await storage.createUserProfile({
        userId,
        householdId: household.id,
        role: role as "ASSISTANT" | "CLIENT",
      });
      
      // Seed demo data for new users
      try {
        await seedDemoData(household.id, userId);
        logger.info("Demo data seeded for new user", { userId });
      } catch (error) {
        logger.error("Error seeding demo data", { error, userId });
      }
      
      res.status(201).json(profile);
    } catch (error) {
      logger.error("Error setting user role", { error, userId });
      res.status(500).json({ message: "Failed to set role" });
    }
  });
  
  // Get dashboard data
  app.get("/api/dashboard", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const userRole = req.householdRole;
      
      let [tasks, approvals, events, spending] = await Promise.all([
        storage.getTasks(householdId),
        storage.getApprovals(householdId),
        storage.getCalendarEvents(householdId),
        storage.getSpending(householdId),
      ]);
      
      if (userRole === "STAFF") {
        tasks = tasks.filter(t => t.assignedTo === userId);
        const myTaskIds = new Set(tasks.map(t => t.id));
        approvals = approvals.filter(a => 
          a.createdBy === userId || 
          (a.relatedTaskId && myTaskIds.has(a.relatedTaskId))
        );
      }
      
      let impact = null;
      try {
        impact = await getImpactMetrics(householdId);
      } catch (err) {
        logger.error("Error fetching impact metrics", { error: err, householdId });
      }
      
      res.json({ tasks, approvals, events, spending, impact });
    } catch (error) {
      logger.error("Error fetching dashboard", { error, householdId, userId });
      res.status(500).json({ message: "Failed to fetch dashboard" });
    }
  });
  
  // Get today's tasks and events
  app.get("/api/today", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const userRole = req.householdRole;
      
      let [tasks, events] = await Promise.all([
        storage.getTasks(householdId),
        storage.getCalendarEvents(householdId),
      ]);
      
      if (userRole === "STAFF") {
        tasks = tasks.filter(t => t.assignedTo === userId);
      }
      
      res.json({ tasks, events });
    } catch (error) {
      logger.error("Error fetching today data", { error, householdId, userId });
      res.status(500).json({ message: "Failed to fetch today data" });
    }
  });
  
  // Get user's service memberships
  app.get("/api/services/mine", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const userRole = req.householdRole;
      
      const memberships = await storage.getServiceMemberships(householdId, userId);
      
      // If user has no service memberships, create default based on their role
      if (memberships.length === 0) {
        // For backward compatibility, grant PA service based on current role
        const serviceRole = userRole === "CLIENT" ? "CLIENT" : "PROVIDER";
        const defaultMembership = await storage.createServiceMembership({
          householdId,
          userId,
          serviceType: "PA",
          serviceRole,
          isActive: true,
        });
        memberships.push(defaultMembership);
      }
      
      // Determine default service type
      let defaultServiceType: string | null = null;
      if (memberships.length === 1) {
        defaultServiceType = memberships[0].serviceType;
      }
      
      res.json({
        householdId,
        memberships: memberships.map(m => ({
          serviceType: m.serviceType,
          serviceRole: m.serviceRole,
          isActive: m.isActive,
        })),
        defaultServiceType,
      });
    } catch (error) {
      logger.error("Error fetching service memberships", { error, householdId, userId });
      res.status(500).json({ message: "Failed to fetch service memberships" });
    }
  });
  
  // Set default service type
  app.post("/api/services/set-default", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const { serviceType } = req.body;
      
      if (!serviceType || !["CLEANING", "PA"].includes(serviceType)) {
        return res.status(400).json({ message: "Invalid service type" });
      }
      
      // Verify user has this service membership
      const memberships = await storage.getServiceMemberships(householdId, userId);
      const hasMembership = memberships.some(m => m.serviceType === serviceType);
      
      if (!hasMembership) {
        return res.status(403).json({ message: "You do not have access to this service" });
      }
      
      // Update user profile with default service type
      const profile = await storage.getUserProfileForHousehold(userId, householdId);
      if (profile) {
        await storage.updateUserProfile(profile.id, { defaultServiceType: serviceType });
      }
      
      res.json({ success: true, defaultServiceType: serviceType });
    } catch (error) {
      logger.error("Error setting default service", { error, householdId, userId });
      res.status(500).json({ message: "Failed to set default service" });
    }
  });
}
