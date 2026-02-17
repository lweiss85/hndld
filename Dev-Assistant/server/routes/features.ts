import type { Request, Response, NextFunction } from "express";
import { AppError, badRequest, forbidden, internalError, notFound, unauthorized, validationError } from "../lib/errors";
import type { Router } from "express";
import { storage } from "../storage";
import logger from "../lib/logger";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import { expensiveLimiter } from "../lib/rate-limit";
import { wsManager } from "../services/websocket";
import { db } from "../db";
import { eq, and, sql, desc } from "drizzle-orm";
import { emergencyContacts, emergencyProtocols, conversations, messages } from "@shared/schema";
import { estimateTaskMinutes } from "../services/ai-provider";

const householdContext = householdContextMiddleware;

async function getUserProfile(userId: string) {
  return storage.getUserProfile(userId);
}

export function registerFeatureRoutes(app: Router) {

  // ============================================
  // ANALYTICS ROUTES (Phase 1 - PRO Feature)
  // ============================================

  /**
   * @openapi
   * /analytics/dashboard:
   *   get:
   *     tags: [Analytics]
   *     summary: Get analytics dashboard
   *     description: Returns the full analytics dashboard for a household (assistants only)
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: query
   *         name: period
   *         schema:
   *           type: string
   *           enum: [week, month, quarter, year]
   *           default: month
   *     responses:
   *       200:
   *         description: Analytics dashboard data
   *       403:
   *         description: Not an assistant
   *       500:
   *         description: Server error
   */
  app.get("/analytics/dashboard", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        throw forbidden("Analytics available for assistants only");
      }

      const period = (req.query.period as "week" | "month" | "quarter" | "year") || "month";
      const { getAnalyticsDashboard } = await import("../services/analytics");
      const dashboard = await getAnalyticsDashboard(householdId, period);
      res.json(dashboard);
    } catch (error) {
      logger.error("Error fetching analytics", { error, userId, householdId });
      next(internalError("Failed to fetch analytics"));
    }
  });

  /**
   * @openapi
   * /analytics/tasks-over-time:
   *   get:
   *     tags: [Analytics]
   *     summary: Get tasks over time data
   *     description: Returns task completion trends over a given period (assistants only)
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: query
   *         name: period
   *         schema:
   *           type: string
   *           enum: [week, month, quarter, year]
   *           default: month
   *     responses:
   *       200:
   *         description: Tasks over time data
   *       403:
   *         description: Not an assistant
   *       500:
   *         description: Server error
   */
  app.get("/analytics/tasks-over-time", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        throw forbidden("Analytics available for assistants only");
      }

      const period = (req.query.period as "week" | "month" | "quarter" | "year") || "month";
      const { getTasksOverTime } = await import("../services/analytics");
      const data = await getTasksOverTime(householdId, period);
      res.json(data);
    } catch (error) {
      logger.error("Error fetching tasks over time", { error, userId, householdId });
      next(internalError("Failed to fetch analytics"));
    }
  });

  /**
   * @openapi
   * /analytics/tasks-by-category:
   *   get:
   *     tags: [Analytics]
   *     summary: Get tasks grouped by category
   *     description: Returns task counts broken down by category for the given period
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: query
   *         name: period
   *         schema:
   *           type: string
   *           enum: [week, month, quarter, year]
   *           default: month
   *     responses:
   *       200:
   *         description: Tasks by category data
   *       500:
   *         description: Server error
   */
  app.get("/analytics/tasks-by-category", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const period = (req.query.period as "week" | "month" | "quarter" | "year") || "month";
      const { getTasksByCategory } = await import("../services/analytics");
      const data = await getTasksByCategory(householdId, period);
      res.json(data);
    } catch (error) {
      logger.error("Error fetching tasks by category", { error, userId, householdId });
      next(internalError("Failed to fetch analytics"));
    }
  });

  /**
   * @openapi
   * /analytics/client-summary:
   *   get:
   *     tags: [Analytics]
   *     summary: Get client impact summary
   *     description: Generates a client-facing summary of assistant impact for the household
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: Client impact summary
   *       500:
   *         description: Server error
   */
  app.get("/analytics/client-summary", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const { generateClientImpactSummary } = await import("../services/analytics");
      const summary = await generateClientImpactSummary(householdId);
      res.json(summary);
    } catch (error) {
      logger.error("Error generating client summary", { error, userId, householdId });
      next(internalError("Failed to generate summary"));
    }
  });

  /**
   * @openapi
   * /analytics/stats:
   *   get:
   *     tags: [Analytics]
   *     summary: Get dashboard statistics
   *     description: Returns high-level stats for the analytics dashboard
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: query
   *         name: period
   *         schema:
   *           type: string
   *           default: 30d
   *     responses:
   *       200:
   *         description: Dashboard statistics
   *       500:
   *         description: Server error
   */
  app.get("/analytics/stats", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const householdId = req.householdId!;
      const period = (req.query.period as string) || "30d";
      
      const { getDashboardStats } = await import("../services/analytics");
      const stats = await getDashboardStats(householdId, period);
      res.json(stats);
    } catch (error) {
      logger.error("Error fetching analytics stats", { error, householdId });
      next(internalError("Failed to fetch analytics"));
    }
  });

  /**
   * @openapi
   * /analytics/task-breakdown:
   *   get:
   *     tags: [Analytics]
   *     summary: Get task breakdown
   *     description: Returns a detailed breakdown of tasks for the given period
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: query
   *         name: period
   *         schema:
   *           type: string
   *           default: 30d
   *     responses:
   *       200:
   *         description: Task breakdown data
   *       500:
   *         description: Server error
   */
  app.get("/analytics/task-breakdown", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const householdId = req.householdId!;
      const period = (req.query.period as string) || "30d";
      
      const { getTaskBreakdown } = await import("../services/analytics");
      const breakdown = await getTaskBreakdown(householdId, period);
      res.json(breakdown);
    } catch (error) {
      logger.error("Error fetching task breakdown", { error, householdId });
      next(internalError("Failed to fetch analytics"));
    }
  });

  /**
   * @openapi
   * /analytics/spending-breakdown:
   *   get:
   *     tags: [Analytics]
   *     summary: Get spending breakdown
   *     description: Returns spending data broken down by category for the given period
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: query
   *         name: period
   *         schema:
   *           type: string
   *           default: 30d
   *     responses:
   *       200:
   *         description: Spending breakdown data
   *       500:
   *         description: Server error
   */
  app.get("/analytics/spending-breakdown", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const householdId = req.householdId!;
      const period = (req.query.period as string) || "30d";
      
      const { getSpendingBreakdown } = await import("../services/analytics");
      const breakdown = await getSpendingBreakdown(householdId, period);
      res.json(breakdown);
    } catch (error) {
      logger.error("Error fetching spending breakdown", { error, householdId });
      next(internalError("Failed to fetch analytics"));
    }
  });

  /**
   * @openapi
   * /analytics/timeline:
   *   get:
   *     tags: [Analytics]
   *     summary: Get activity timeline
   *     description: Returns a timeline of household activity for the given period
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: query
   *         name: period
   *         schema:
   *           type: string
   *           default: 30d
   *     responses:
   *       200:
   *         description: Timeline data
   *       500:
   *         description: Server error
   */
  app.get("/analytics/timeline", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const householdId = req.householdId!;
      const period = (req.query.period as string) || "30d";
      
      const { getTimelineData } = await import("../services/analytics");
      const timeline = await getTimelineData(householdId, period);
      res.json(timeline);
    } catch (error) {
      logger.error("Error fetching timeline", { error, householdId });
      next(internalError("Failed to fetch analytics"));
    }
  });

  /**
   * @openapi
   * /analytics/performance:
   *   get:
   *     tags: [Analytics]
   *     summary: Get assistant performance metrics
   *     description: Returns performance metrics for the assistant in the household
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: query
   *         name: period
   *         schema:
   *           type: string
   *           default: 30d
   *     responses:
   *       200:
   *         description: Performance metrics
   *       500:
   *         description: Server error
   */
  app.get("/analytics/performance", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const householdId = req.householdId!;
      const period = (req.query.period as string) || "30d";
      
      const { getAssistantPerformance } = await import("../services/analytics");
      const performance = await getAssistantPerformance(householdId, period);
      res.json(performance);
    } catch (error) {
      logger.error("Error fetching performance", { error, householdId });
      next(internalError("Failed to fetch analytics"));
    }
  });

  // ============================================
  // EMERGENCY CONTACTS & PROTOCOLS (Phase 1)
  // ============================================

  /**
   * @openapi
   * /emergency/contacts:
   *   get:
   *     tags: [Emergency Contacts]
   *     summary: List emergency contacts
   *     description: Returns all emergency contacts for the household
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: List of emergency contacts
   *       500:
   *         description: Server error
   */
  app.get("/emergency/contacts", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const contacts = await db.select().from(emergencyContacts)
        .where(eq(emergencyContacts.householdId, householdId));
      res.json(contacts);
    } catch (error) {
      logger.error("Error fetching emergency contacts", { error, userId, householdId });
      next(internalError("Failed to fetch contacts"));
    }
  });

  /**
   * @openapi
   * /emergency/contacts:
   *   post:
   *     tags: [Emergency Contacts]
   *     summary: Create an emergency contact
   *     description: Creates a new emergency contact for the household (assistants only)
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
   *     responses:
   *       201:
   *         description: Emergency contact created
   *       403:
   *         description: Not an assistant
   *       500:
   *         description: Server error
   */
  app.post("/emergency/contacts", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        throw forbidden("Only assistants can manage contacts");
      }

      const [contact] = await db.insert(emergencyContacts)
        .values({ ...req.body, householdId })
        .returning();
      res.status(201).json(contact);
    } catch (error) {
      logger.error("Error creating emergency contact", { error, userId, householdId });
      next(internalError("Failed to create contact"));
    }
  });

  /**
   * @openapi
   * /emergency/contacts/{id}:
   *   patch:
   *     tags: [Emergency Contacts]
   *     summary: Update an emergency contact
   *     description: Updates an existing emergency contact (assistants only)
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     responses:
   *       200:
   *         description: Emergency contact updated
   *       403:
   *         description: Not an assistant
   *       404:
   *         description: Contact not found
   *       500:
   *         description: Server error
   */
  app.patch("/emergency/contacts/:id", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        throw forbidden("Only assistants can manage contacts");
      }

      const [existing] = await db.select().from(emergencyContacts)
        .where(eq(emergencyContacts.id, req.params.id));
      
      if (!existing || existing.householdId !== householdId) {
        throw notFound("Contact not found");
      }

      const [updated] = await db.update(emergencyContacts)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(emergencyContacts.id, req.params.id))
        .returning();
      res.json(updated);
    } catch (error) {
      logger.error("Error updating emergency contact", { error, userId, householdId, contactId: req.params.id });
      next(internalError("Failed to update contact"));
    }
  });

  /**
   * @openapi
   * /emergency/contacts/{id}:
   *   delete:
   *     tags: [Emergency Contacts]
   *     summary: Delete an emergency contact
   *     description: Deletes an emergency contact from the household (assistants only)
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Emergency contact deleted
   *       403:
   *         description: Not an assistant
   *       404:
   *         description: Contact not found
   *       500:
   *         description: Server error
   */
  app.delete("/emergency/contacts/:id", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        throw forbidden("Only assistants can manage contacts");
      }

      const [existing] = await db.select().from(emergencyContacts)
        .where(eq(emergencyContacts.id, req.params.id));
      
      if (!existing || existing.householdId !== householdId) {
        throw notFound("Contact not found");
      }

      await db.delete(emergencyContacts).where(eq(emergencyContacts.id, req.params.id));
      res.json({ success: true });
    } catch (error) {
      logger.error("Error deleting emergency contact", { error, userId, householdId, contactId: req.params.id });
      next(internalError("Failed to delete contact"));
    }
  });

  /**
   * @openapi
   * /emergency/protocols:
   *   get:
   *     tags: [Emergency Contacts]
   *     summary: List emergency protocols
   *     description: Returns all emergency protocols for the household
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: List of emergency protocols
   *       500:
   *         description: Server error
   */
  app.get("/emergency/protocols", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const protocols = await db.select().from(emergencyProtocols)
        .where(eq(emergencyProtocols.householdId, householdId));
      res.json(protocols);
    } catch (error) {
      logger.error("Error fetching protocols", { error, userId, householdId });
      next(internalError("Failed to fetch protocols"));
    }
  });

  /**
   * @openapi
   * /emergency/protocols:
   *   post:
   *     tags: [Emergency Contacts]
   *     summary: Create an emergency protocol
   *     description: Creates a new emergency protocol for the household (assistants only)
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
   *     responses:
   *       201:
   *         description: Emergency protocol created
   *       403:
   *         description: Not an assistant
   *       500:
   *         description: Server error
   */
  app.post("/emergency/protocols", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        throw forbidden("Only assistants can manage protocols");
      }

      const [protocol] = await db.insert(emergencyProtocols)
        .values({ ...req.body, householdId })
        .returning();
      res.status(201).json(protocol);
    } catch (error) {
      logger.error("Error creating protocol", { error, userId, householdId });
      next(internalError("Failed to create protocol"));
    }
  });

  // ============================================
  // IN-APP MESSAGING ROUTES (Phase 1 - Premium)
  // ============================================

  /**
   * @openapi
   * /conversations:
   *   get:
   *     tags: [Messaging]
   *     summary: List conversations
   *     description: Returns all conversations for the household, ordered by most recent message
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: List of conversations
   *       500:
   *         description: Server error
   */
  app.get("/conversations", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const convos = await db.select().from(conversations)
        .where(eq(conversations.householdId, householdId))
        .orderBy(conversations.lastMessageAt);
      res.json(convos.reverse());
    } catch (error) {
      logger.error("Error fetching conversations", { error, userId, householdId });
      next(internalError("Failed to fetch conversations"));
    }
  });

  /**
   * @openapi
   * /conversations:
   *   post:
   *     tags: [Messaging]
   *     summary: Create a conversation
   *     description: Creates a new conversation in the household
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
   *             properties:
   *               type:
   *                 type: string
   *               title:
   *                 type: string
   *               participantIds:
   *                 type: array
   *                 items:
   *                   type: string
   *     responses:
   *       201:
   *         description: Conversation created
   *       500:
   *         description: Server error
   */
  app.post("/conversations", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const { type, title, participantIds } = req.body;

      const [convo] = await db.insert(conversations)
        .values({ 
          householdId, 
          type: type || "CLIENT_ASSISTANT",
          title,
          participantIds: participantIds || [userId],
        })
        .returning();
      res.status(201).json(convo);
    } catch (error) {
      logger.error("Error creating conversation", { error, userId, householdId });
      next(internalError("Failed to create conversation"));
    }
  });

  /**
   * @openapi
   * /conversations/{id}/messages:
   *   get:
   *     tags: [Messaging]
   *     summary: Get messages in a conversation
   *     description: Returns all messages for a specific conversation
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Conversation ID
   *     responses:
   *       200:
   *         description: List of messages
   *       404:
   *         description: Conversation not found
   *       500:
   *         description: Server error
   */
  app.get("/conversations/:id/messages", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const conversationId = req.params.id;
      
      const [convo] = await db.select().from(conversations)
        .where(eq(conversations.id, conversationId));
      
      if (!convo || convo.householdId !== householdId) {
        throw notFound("Conversation not found");
      }

      const msgs = await db.select().from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(messages.createdAt);
      res.json(msgs);
    } catch (error) {
      logger.error("Error fetching messages", { error, userId, householdId, conversationId });
      next(internalError("Failed to fetch messages"));
    }
  });

  /**
   * @openapi
   * /conversations/{id}/messages:
   *   post:
   *     tags: [Messaging]
   *     summary: Send a message
   *     description: Sends a new message in a conversation
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Conversation ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [text]
   *             properties:
   *               text:
   *                 type: string
   *               attachments:
   *                 type: array
   *               isVoice:
   *                 type: boolean
   *               voiceTranscription:
   *                 type: string
   *     responses:
   *       201:
   *         description: Message sent
   *       400:
   *         description: Invalid message text
   *       404:
   *         description: Conversation not found
   *       500:
   *         description: Server error
   */
  app.post("/conversations/:id/messages", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const conversationId = req.params.id;
      const { text, attachments, isVoice, voiceTranscription } = req.body;

      if (!text || typeof text !== "string" || text.trim().length === 0) {
        throw badRequest("Message text is required");
      }

      if (text.length > 10000) {
        throw badRequest("Message too long");
      }

      const [convo] = await db.select().from(conversations)
        .where(eq(conversations.id, conversationId));
      
      if (!convo || convo.householdId !== householdId) {
        throw notFound("Conversation not found");
      }

      const [msg] = await db.insert(messages)
        .values({
          conversationId,
          senderId: userId,
          text,
          attachments: attachments || [],
          isVoice: isVoice || false,
          voiceTranscription,
          readBy: [userId],
        })
        .returning();

      await db.update(conversations)
        .set({ lastMessageAt: new Date() })
        .where(eq(conversations.id, conversationId));

      res.status(201).json(msg);
    } catch (error) {
      logger.error("Error sending message", { error, userId, householdId, conversationId });
      next(internalError("Failed to send message"));
    }
  });

  /**
   * @openapi
   * /messages/{id}/read:
   *   patch:
   *     tags: [Messaging]
   *     summary: Mark a message as read
   *     description: Marks a message as read by the current user
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Message ID
   *     responses:
   *       200:
   *         description: Message marked as read
   *       404:
   *         description: Message not found
   *       500:
   *         description: Server error
   */
  app.patch("/messages/:id/read", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const messageId = req.params.id;

      const [msg] = await db.select().from(messages)
        .where(eq(messages.id, messageId));
      
      if (!msg) {
        throw notFound("Message not found");
      }

      const [convo] = await db.select().from(conversations)
        .where(and(
          eq(conversations.id, msg.conversationId),
          eq(conversations.householdId, householdId)
        ));
      
      if (!convo) {
        throw notFound("Message not found");
      }

      const readBy = msg.readBy || [];
      if (!readBy.includes(userId)) {
        readBy.push(userId);
        await db.update(messages)
          .set({ readBy })
          .where(eq(messages.id, messageId));
      }

      res.json({ success: true });
    } catch (error) {
      logger.error("Error marking message read", { error, userId, householdId, messageId });
      next(internalError("Failed to mark as read"));
    }
  });

  // ============================================
  // AI ASSISTANT ROUTES (Phase 1 - Premium)
  // ============================================

  /**
   * @openapi
   * /ai/status:
   *   get:
   *     tags: [AI Assistant]
   *     summary: Get AI service status
   *     description: Returns the current status and provider of the AI service
   *     security:
   *       - session: []
   *     responses:
   *       200:
   *         description: AI service status
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 available:
   *                   type: boolean
   *                 provider:
   *                   type: string
   *                 demoMode:
   *                   type: boolean
   */
  app.get("/ai/status", isAuthenticated, async (_req, res) => {
    const { isDemoMode, getActiveProvider } = await import("../services/ai-provider");
    res.json({
      available: !isDemoMode(),
      provider: getActiveProvider(),
      demoMode: isDemoMode(),
    });
  });

  /**
   * @openapi
   * /ai/parse-request:
   *   post:
   *     tags: [AI Assistant]
   *     summary: Parse a natural language request
   *     description: Uses AI to parse a natural language text into structured request data
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
   *             required: [text]
   *             properties:
   *               text:
   *                 type: string
   *     responses:
   *       200:
   *         description: Parsed request data
   *       400:
   *         description: Text required
   *       500:
   *         description: Server error
   */
  app.post("/ai/parse-request", expensiveLimiter, isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { text } = req.body;
      if (!text) {
        throw badRequest("Text required");
      }

      const { parseRequest } = await import("../services/ai-provider");
      const parsed = await parseRequest(text);
      res.json(parsed);
    } catch (error) {
      logger.error("Error parsing request", { error });
      next(internalError("Failed to parse request"));
    }
  });

  /**
   * @openapi
   * /ai/weekly-brief:
   *   get:
   *     tags: [AI Assistant]
   *     summary: Get AI-generated weekly brief
   *     description: Generates a weekly brief summarizing upcoming events, tasks, and birthdays
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: Weekly brief
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 brief:
   *                   type: string
   *                 fallback:
   *                   type: boolean
   *       500:
   *         description: Server error
   */
  app.get("/ai/weekly-brief", expensiveLimiter, isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const events = await storage.getCalendarEvents(householdId);
      const tasksList = await storage.getTasks(householdId);
      const importantDates = await storage.getImportantDates(householdId);
      
      const now = new Date();
      const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      const upcomingEvents = events.filter((e) => 
        e.startAt && e.startAt >= now && e.startAt <= weekEnd
      );
      
      const upcomingTasks = tasksList.filter((t) => t.status !== "DONE");
      
      const upcomingBirthdays = importantDates
        .filter((d) => d.type === "BIRTHDAY")
        .map((d) => ({ name: d.title, date: d.date }));

      try {
        const { generateWeeklyBrief } = await import("../services/ai-provider");
        const brief = await generateWeeklyBrief({
          events: upcomingEvents.map((e) => ({ title: e.title, startAt: e.startAt! })),
          tasks: upcomingTasks.map((t) => ({
            title: t.title,
            category: t.category,
            dueAt: t.dueAt,
          })),
          birthdays: upcomingBirthdays,
        });
        res.json({ brief });
      } catch (aiError) {
        logger.error("AI brief generation failed, using fallback", { error: aiError, userId, householdId });
        const parts: string[] = [];
        if (upcomingEvents.length > 0) parts.push(`${upcomingEvents.length} event${upcomingEvents.length > 1 ? "s" : ""}`);
        if (upcomingTasks.length > 0) parts.push(`${upcomingTasks.length} task${upcomingTasks.length > 1 ? "s" : ""}`);
        if (upcomingBirthdays.length > 0) parts.push(`${upcomingBirthdays.length} birthday${upcomingBirthdays.length > 1 ? "s" : ""}`);
        const fallbackBrief = `This week: ${parts.length > 0 ? parts.join(", ") : "looking calm and clear"}.`;
        res.json({ brief: fallbackBrief, fallback: true });
      }
    } catch (error) {
      logger.error("Error generating brief", { error, userId, householdId });
      next(internalError("Failed to generate brief"));
    }
  });

  /**
   * @openapi
   * /ai/transcribe:
   *   post:
   *     tags: [AI Assistant]
   *     summary: Transcribe voice audio
   *     description: Transcribes base64-encoded audio to text using AI
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
   *             required: [audioBase64]
   *             properties:
   *               audioBase64:
   *                 type: string
   *     responses:
   *       200:
   *         description: Transcription result
   *       400:
   *         description: Audio data required
   *       500:
   *         description: Server error
   */
  app.post("/ai/transcribe", expensiveLimiter, isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { audioBase64 } = req.body;
      if (!audioBase64 || typeof audioBase64 !== "string") {
        throw badRequest("Audio data required");
      }

      const { transcribeVoice } = await import("../services/ai-provider");
      const transcription = await transcribeVoice(audioBase64);
      res.json({ transcription });
    } catch (error) {
      logger.error("Error transcribing voice", { error });
      next(internalError("Failed to transcribe voice"));
    }
  });

  /**
   * @openapi
   * /ai/smart-actions:
   *   post:
   *     tags: [AI Assistant]
   *     summary: Get smart action suggestions
   *     description: Uses AI to suggest smart actions based on household context
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: Smart action suggestions
   *       500:
   *         description: Server error
   */
  app.post("/ai/smart-actions", expensiveLimiter, isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;

      const tasksList = await storage.getTasks(householdId);
      const vendors = await storage.getVendors(householdId);
      const importantDates = await storage.getImportantDates(householdId);

      const recentTasks = tasksList.slice(0, 5).map((t) => t.title);
      const upcomingDates = importantDates.slice(0, 3).map((d) => d.title);

      const { suggestSmartActions } = await import("../services/ai-provider");
      const suggestions = await suggestSmartActions({
        recentTasks,
        upcomingDates,
      });

      res.json({ suggestions });
    } catch (error) {
      logger.error("Error getting smart actions", { error, userId, householdId });
      next(internalError("Failed to get suggestions"));
    }
  });

  /**
   * @openapi
   * /ai/chat:
   *   post:
   *     tags: [AI Assistant]
   *     summary: Chat with AI assistant
   *     description: Sends messages to the AI chat assistant and gets a response
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
   *             required: [messages]
   *             properties:
   *               messages:
   *                 type: array
   *                 items:
   *                   type: object
   *     responses:
   *       200:
   *         description: AI chat response
   *       400:
   *         description: Messages array required
   *       500:
   *         description: Server error
   */
  app.post("/ai/chat", expensiveLimiter, isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const householdId = req.householdId!;
      const { messages } = req.body;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        throw badRequest("Messages array required");
      }

      const { chat } = await import("../services/ai-chat");
      const result = await chat(messages, householdId);
      res.json(result);
    } catch (error) {
      logger.error("Error in AI chat", { error, householdId });
      next(internalError("Failed to process chat"));
    }
  });

  /**
   * @openapi
   * /ai/chat/create-request:
   *   post:
   *     tags: [AI Assistant]
   *     summary: Create a request from AI chat
   *     description: Creates a household request from within the AI chat interface
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
   *             required: [title]
   *             properties:
   *               title:
   *                 type: string
   *               description:
   *                 type: string
   *               category:
   *                 type: string
   *               urgency:
   *                 type: string
   *     responses:
   *       201:
   *         description: Request created from chat
   *       400:
   *         description: Title is required
   *       500:
   *         description: Server error
   */
  app.post("/ai/chat/create-request", expensiveLimiter, isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const { title, description, category, urgency } = req.body;

      if (!title) {
        throw badRequest("Title is required");
      }

      const requestData = {
        title,
        description: description || null,
        category: category || "OTHER",
        urgency: urgency || "MEDIUM",
        createdBy: userId,
        householdId,
      };

      const request = await storage.createRequest(requestData);
      
      wsManager.broadcast("request:created", { id: request.id, title: request.title }, householdId, userId);
      
      res.status(201).json({ 
        success: true, 
        request,
        message: `I've submitted your request for "${title}". Your assistant will see it right away!`
      });
    } catch (error) {
      logger.error("Error creating request from chat", { error, userId, householdId });
      next(internalError("Failed to create request"));
    }
  });

  /**
   * @openapi
   * /ai/parse-smart:
   *   post:
   *     tags: [AI Assistant]
   *     summary: Smart parse a natural language request
   *     description: Parses natural language request text with optional AI enhancement and household context
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
   *             required: [text]
   *             properties:
   *               text:
   *                 type: string
   *               useAI:
   *                 type: boolean
   *                 default: true
   *     responses:
   *       200:
   *         description: Parsed request data
   *       400:
   *         description: Request text too short
   *       500:
   *         description: Server error
   */
  app.post("/ai/parse-smart", expensiveLimiter, isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const householdId = req.householdId!;
      const { text, useAI = true } = req.body;

      if (!text || text.length < 3) {
        throw badRequest("Request text too short");
      }

      const { parseNaturalLanguageRequest, quickParseRequest } = await import("../services/ai-chat");
      
      if (!useAI) {
        const result = quickParseRequest(text);
        return res.json({ ...result, usedAI: false });
      }

      const [people, locations] = await Promise.all([
        storage.getPeople(householdId),
        storage.getHouseholdLocations(householdId),
      ]);

      const result = await parseNaturalLanguageRequest(text, {
        familyMembers: people.map(p => p.preferredName || p.fullName),
        frequentLocations: locations.map(l => l.name),
      });

      res.json({ ...result, usedAI: true });
    } catch (error) {
      logger.error("Error parsing smart request", { error, householdId });
      next(internalError("Failed to parse request"));
    }
  });

  /**
   * @openapi
   * /ai/insights:
   *   get:
   *     tags: [AI Assistant]
   *     summary: Get proactive insights
   *     description: Returns AI-generated proactive insights for the household
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: Proactive insights
   *       500:
   *         description: Server error
   */
  app.get("/ai/insights", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const householdId = req.householdId!;
      const { getProactiveInsights } = await import("../services/ai-agent");
      
      const insights = await getProactiveInsights(householdId);
      res.json({ insights });
    } catch (error) {
      logger.error("Error fetching proactive insights", { error, householdId });
      next(internalError("Failed to fetch insights"));
    }
  });

  /**
   * @openapi
   * /ai/insights/refresh:
   *   post:
   *     tags: [AI Assistant]
   *     summary: Refresh proactive insights
   *     description: Regenerates proactive insights using AI based on current household context
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *     responses:
   *       200:
   *         description: Refreshed insights
   *       500:
   *         description: Server error
   */
  app.post("/ai/insights/refresh", expensiveLimiter, isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const householdId = req.householdId!;
      const { gatherHouseholdContext, generateProactiveInsights } = await import("../services/ai-agent");
      
      const context = await gatherHouseholdContext(householdId);
      const insights = await generateProactiveInsights(context);
      
      res.json({ insights, generated: insights.length });
    } catch (error) {
      logger.error("Error generating insights", { error, householdId });
      next(internalError("Failed to generate insights"));
    }
  });

  /**
   * @openapi
   * /ai/insights/{id}/dismiss:
   *   post:
   *     tags: [AI Assistant]
   *     summary: Dismiss an insight
   *     description: Dismisses a proactive insight so it no longer appears
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Insight ID
   *     responses:
   *       200:
   *         description: Insight dismissed
   *       500:
   *         description: Server error
   */
  app.post("/ai/insights/:id/dismiss", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { dismissInsight } = await import("../services/ai-agent");
      
      await dismissInsight(id);
      res.json({ success: true });
    } catch (error) {
      logger.error("Error dismissing insight", { error, insightId: req.params.id });
      next(internalError("Failed to dismiss insight"));
    }
  });

  /**
   * @openapi
   * /ai/estimate-duration:
   *   get:
   *     tags: [AI Assistant]
   *     summary: Estimate task duration
   *     description: Uses AI to estimate the duration for a task based on category and household history
   *     security:
   *       - session: []
   *     parameters:
   *       - $ref: '#/components/parameters/HouseholdHeader'
   *       - in: query
   *         name: category
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Duration estimate
   *       400:
   *         description: Category required
   *       500:
   *         description: Server error
   */
  app.get("/ai/estimate-duration", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const householdId = req.householdId!;
      const { category } = req.query;
      
      if (!category) {
        throw badRequest("Category required");
      }
      
      const { getSmartEstimate } = await import("../services/ai-agent");
      const estimate = await getSmartEstimate(householdId, category as string);
      
      res.json(estimate);
    } catch (error) {
      logger.error("Error getting estimate", { error, householdId });
      next(internalError("Failed to get estimate"));
    }
  });

  /**
   * @openapi
   * /ai/learn/task-complete:
   *   post:
   *     tags: [AI Assistant]
   *     summary: Record task completion for AI learning
   *     description: Records a task completion event so the AI can learn and improve duration estimates
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
   *             required: [taskId, category, createdAt, completedAt]
   *             properties:
   *               taskId:
   *                 type: string
   *               category:
   *                 type: string
   *               estimatedMinutes:
   *                 type: integer
   *               createdAt:
   *                 type: string
   *                 format: date-time
   *               completedAt:
   *                 type: string
   *                 format: date-time
   *     responses:
   *       200:
   *         description: Task completion recorded
   *       400:
   *         description: Missing required fields or invalid dates
   *       500:
   *         description: Server error
   */
  app.post("/ai/learn/task-complete", isAuthenticated, householdContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const householdId = req.householdId!;
      const { taskId, category, estimatedMinutes, createdAt, completedAt } = req.body;
      
      if (!taskId || !category || !createdAt || !completedAt) {
        throw badRequest("Missing required fields: taskId, category, createdAt, and completedAt are required");
      }
      
      const parsedCreatedAt = new Date(createdAt);
      const parsedCompletedAt = new Date(completedAt);
      
      if (isNaN(parsedCreatedAt.getTime()) || isNaN(parsedCompletedAt.getTime())) {
        throw badRequest("Invalid date format for createdAt or completedAt");
      }
      
      const { recordTaskCompletion } = await import("../services/ai-agent");
      
      await recordTaskCompletion({
        id: taskId,
        householdId,
        category,
        estimatedMinutes: estimatedMinutes || null,
        createdAt: parsedCreatedAt,
        completedAt: parsedCompletedAt,
      });
      
      res.json({ success: true });
    } catch (error) {
      logger.error("Error recording task completion", { error, householdId });
      next(internalError("Failed to record completion"));
    }
  });
}
