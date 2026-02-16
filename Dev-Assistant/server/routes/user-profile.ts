import type { Request, Response } from "express";
import type { Router } from "express";
import { storage } from "../storage";
import logger from "../lib/logger";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import { getImpactMetrics } from "../services/analytics";
import { seedDemoData } from "./helpers";

const householdContext = householdContextMiddleware;

export async function registerUserProfileRoutes(app: Router): Promise<void> {
  /**
   * @openapi
   * /user-profile:
   *   get:
   *     summary: Get current user profile
   *     description: Returns the authenticated user's profile. If no profile exists, returns a flag indicating role selection is needed.
   *     tags:
   *       - User Profile
   *     security:
   *       - session: []
   *     responses:
   *       200:
   *         description: User profile or role selection prompt
   *         content:
   *           application/json:
   *             schema:
   *               oneOf:
   *                 - $ref: '#/components/schemas/UserProfile'
   *                 - type: object
   *                   properties:
   *                     needsRoleSelection:
   *                       type: boolean
   *       500:
   *         description: Internal server error
   */
  app.get("/user-profile", isAuthenticated, async (req: Request, res: Response) => {
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
  
  /**
   * @openapi
   * /user/role:
   *   post:
   *     summary: Set user role (first-time setup)
   *     description: Creates a new user profile with the selected role and seeds demo data. Can only be called once per user.
   *     tags:
   *       - User Profile
   *     security:
   *       - session: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - role
   *             properties:
   *               role:
   *                 type: string
   *                 enum: [ASSISTANT, CLIENT]
   *     responses:
   *       201:
   *         description: User profile created
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/UserProfile'
   *       400:
   *         description: Invalid role or role already set
   *       500:
   *         description: Internal server error
   */
  app.post("/user/role", isAuthenticated, async (req: Request, res: Response) => {
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
  
  /**
   * @openapi
   * /dashboard:
   *   get:
   *     summary: Get dashboard data
   *     description: Returns tasks, approvals, events, spending, and impact metrics for the household. Staff users see only their assigned tasks.
   *     tags:
   *       - User Profile
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: Dashboard data
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 tasks:
   *                   type: array
   *                   items:
   *                     type: object
   *                 approvals:
   *                   type: array
   *                   items:
   *                     type: object
   *                 events:
   *                   type: array
   *                   items:
   *                     type: object
   *                 spending:
   *                   type: array
   *                   items:
   *                     type: object
   *                 impact:
   *                   type: object
   *                   nullable: true
   *       500:
   *         description: Internal server error
   */
  app.get("/dashboard", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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
  
  /**
   * @openapi
   * /today:
   *   get:
   *     summary: Get today's tasks and events
   *     description: Returns tasks and calendar events for the current day. Staff users see only their assigned tasks.
   *     tags:
   *       - User Profile
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: Today's tasks and events
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 tasks:
   *                   type: array
   *                   items:
   *                     type: object
   *                 events:
   *                   type: array
   *                   items:
   *                     type: object
   *       500:
   *         description: Internal server error
   */
  app.get("/today", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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
  
  /**
   * @openapi
   * /services/mine:
   *   get:
   *     summary: Get user's service memberships
   *     description: Returns the authenticated user's service memberships for the current household. Creates a default PA membership if none exist.
   *     tags:
   *       - User Profile
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: Service memberships
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 householdId:
   *                   type: integer
   *                 memberships:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       serviceType:
   *                         type: string
   *                       serviceRole:
   *                         type: string
   *                       isActive:
   *                         type: boolean
   *                 defaultServiceType:
   *                   type: string
   *                   nullable: true
   *       500:
   *         description: Internal server error
   */
  app.get("/services/mine", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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
  
  /**
   * @openapi
   * /services/set-default:
   *   post:
   *     summary: Set default service type
   *     description: Sets the user's default service type for the current household. User must have an active membership for the service.
   *     tags:
   *       - User Profile
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - serviceType
   *             properties:
   *               serviceType:
   *                 type: string
   *                 enum: [CLEANING, PA]
   *     responses:
   *       200:
   *         description: Default service type updated
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 defaultServiceType:
   *                   type: string
   *       400:
   *         description: Invalid service type
   *       403:
   *         description: User does not have access to this service
   *       500:
   *         description: Internal server error
   */
  app.post("/services/set-default", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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
