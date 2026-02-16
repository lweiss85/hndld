import type { Express, Request, Response } from "express";
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

export function registerFeatureRoutes(app: Express) {

  // ============================================
  // ANALYTICS ROUTES (Phase 1 - PRO Feature)
  // ============================================

  app.get("/api/analytics/dashboard", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Analytics available for assistants only" });
      }

      const period = (req.query.period as "week" | "month" | "quarter" | "year") || "month";
      const { getAnalyticsDashboard } = await import("../services/analytics");
      const dashboard = await getAnalyticsDashboard(householdId, period);
      res.json(dashboard);
    } catch (error) {
      logger.error("Error fetching analytics", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  app.get("/api/analytics/tasks-over-time", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Analytics available for assistants only" });
      }

      const period = (req.query.period as "week" | "month" | "quarter" | "year") || "month";
      const { getTasksOverTime } = await import("../services/analytics");
      const data = await getTasksOverTime(householdId, period);
      res.json(data);
    } catch (error) {
      logger.error("Error fetching tasks over time", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  app.get("/api/analytics/tasks-by-category", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const period = (req.query.period as "week" | "month" | "quarter" | "year") || "month";
      const { getTasksByCategory } = await import("../services/analytics");
      const data = await getTasksByCategory(householdId, period);
      res.json(data);
    } catch (error) {
      logger.error("Error fetching tasks by category", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  app.get("/api/analytics/client-summary", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const { generateClientImpactSummary } = await import("../services/analytics");
      const summary = await generateClientImpactSummary(householdId);
      res.json(summary);
    } catch (error) {
      logger.error("Error generating client summary", { error, userId, householdId });
      res.status(500).json({ message: "Failed to generate summary" });
    }
  });

  app.get("/api/analytics/stats", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const period = (req.query.period as string) || "30d";
      
      const { getDashboardStats } = await import("../services/analytics");
      const stats = await getDashboardStats(householdId, period);
      res.json(stats);
    } catch (error) {
      logger.error("Error fetching analytics stats", { error, householdId });
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  app.get("/api/analytics/task-breakdown", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const period = (req.query.period as string) || "30d";
      
      const { getTaskBreakdown } = await import("../services/analytics");
      const breakdown = await getTaskBreakdown(householdId, period);
      res.json(breakdown);
    } catch (error) {
      logger.error("Error fetching task breakdown", { error, householdId });
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  app.get("/api/analytics/spending-breakdown", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const period = (req.query.period as string) || "30d";
      
      const { getSpendingBreakdown } = await import("../services/analytics");
      const breakdown = await getSpendingBreakdown(householdId, period);
      res.json(breakdown);
    } catch (error) {
      logger.error("Error fetching spending breakdown", { error, householdId });
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  app.get("/api/analytics/timeline", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const period = (req.query.period as string) || "30d";
      
      const { getTimelineData } = await import("../services/analytics");
      const timeline = await getTimelineData(householdId, period);
      res.json(timeline);
    } catch (error) {
      logger.error("Error fetching timeline", { error, householdId });
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  app.get("/api/analytics/performance", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const period = (req.query.period as string) || "30d";
      
      const { getAssistantPerformance } = await import("../services/analytics");
      const performance = await getAssistantPerformance(householdId, period);
      res.json(performance);
    } catch (error) {
      logger.error("Error fetching performance", { error, householdId });
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // ============================================
  // EMERGENCY CONTACTS & PROTOCOLS (Phase 1)
  // ============================================

  app.get("/api/emergency/contacts", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const contacts = await db.select().from(emergencyContacts)
        .where(eq(emergencyContacts.householdId, householdId));
      res.json(contacts);
    } catch (error) {
      logger.error("Error fetching emergency contacts", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch contacts" });
    }
  });

  app.post("/api/emergency/contacts", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can manage contacts" });
      }

      const [contact] = await db.insert(emergencyContacts)
        .values({ ...req.body, householdId })
        .returning();
      res.status(201).json(contact);
    } catch (error) {
      logger.error("Error creating emergency contact", { error, userId, householdId });
      res.status(500).json({ message: "Failed to create contact" });
    }
  });

  app.patch("/api/emergency/contacts/:id", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can manage contacts" });
      }

      const [existing] = await db.select().from(emergencyContacts)
        .where(eq(emergencyContacts.id, req.params.id));
      
      if (!existing || existing.householdId !== householdId) {
        return res.status(404).json({ message: "Contact not found" });
      }

      const [updated] = await db.update(emergencyContacts)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(emergencyContacts.id, req.params.id))
        .returning();
      res.json(updated);
    } catch (error) {
      logger.error("Error updating emergency contact", { error, userId, householdId, contactId: req.params.id });
      res.status(500).json({ message: "Failed to update contact" });
    }
  });

  app.delete("/api/emergency/contacts/:id", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can manage contacts" });
      }

      const [existing] = await db.select().from(emergencyContacts)
        .where(eq(emergencyContacts.id, req.params.id));
      
      if (!existing || existing.householdId !== householdId) {
        return res.status(404).json({ message: "Contact not found" });
      }

      await db.delete(emergencyContacts).where(eq(emergencyContacts.id, req.params.id));
      res.json({ success: true });
    } catch (error) {
      logger.error("Error deleting emergency contact", { error, userId, householdId, contactId: req.params.id });
      res.status(500).json({ message: "Failed to delete contact" });
    }
  });

  app.get("/api/emergency/protocols", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const protocols = await db.select().from(emergencyProtocols)
        .where(eq(emergencyProtocols.householdId, householdId));
      res.json(protocols);
    } catch (error) {
      logger.error("Error fetching protocols", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch protocols" });
    }
  });

  app.post("/api/emergency/protocols", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const profile = await getUserProfile(userId);
      
      if (profile?.role !== "ASSISTANT") {
        return res.status(403).json({ message: "Only assistants can manage protocols" });
      }

      const [protocol] = await db.insert(emergencyProtocols)
        .values({ ...req.body, householdId })
        .returning();
      res.status(201).json(protocol);
    } catch (error) {
      logger.error("Error creating protocol", { error, userId, householdId });
      res.status(500).json({ message: "Failed to create protocol" });
    }
  });

  // ============================================
  // IN-APP MESSAGING ROUTES (Phase 1 - Premium)
  // ============================================

  app.get("/api/conversations", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      
      const convos = await db.select().from(conversations)
        .where(eq(conversations.householdId, householdId))
        .orderBy(conversations.lastMessageAt);
      res.json(convos.reverse());
    } catch (error) {
      logger.error("Error fetching conversations", { error, userId, householdId });
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  app.post("/api/conversations", isAuthenticated, householdContext, async (req: Request, res: Response) => {
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
      res.status(500).json({ message: "Failed to create conversation" });
    }
  });

  app.get("/api/conversations/:id/messages", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const conversationId = req.params.id;
      
      const [convo] = await db.select().from(conversations)
        .where(eq(conversations.id, conversationId));
      
      if (!convo || convo.householdId !== householdId) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const msgs = await db.select().from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(messages.createdAt);
      res.json(msgs);
    } catch (error) {
      logger.error("Error fetching messages", { error, userId, householdId, conversationId });
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post("/api/conversations/:id/messages", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const conversationId = req.params.id;
      const { text, attachments, isVoice, voiceTranscription } = req.body;

      if (!text || typeof text !== "string" || text.trim().length === 0) {
        return res.status(400).json({ message: "Message text is required" });
      }

      if (text.length > 10000) {
        return res.status(400).json({ message: "Message too long" });
      }

      const [convo] = await db.select().from(conversations)
        .where(eq(conversations.id, conversationId));
      
      if (!convo || convo.householdId !== householdId) {
        return res.status(404).json({ message: "Conversation not found" });
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
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  app.patch("/api/messages/:id/read", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const messageId = req.params.id;

      const [msg] = await db.select().from(messages)
        .where(eq(messages.id, messageId));
      
      if (!msg) {
        return res.status(404).json({ message: "Message not found" });
      }

      const [convo] = await db.select().from(conversations)
        .where(and(
          eq(conversations.id, msg.conversationId),
          eq(conversations.householdId, householdId)
        ));
      
      if (!convo) {
        return res.status(404).json({ message: "Message not found" });
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
      res.status(500).json({ message: "Failed to mark as read" });
    }
  });

  // ============================================
  // AI ASSISTANT ROUTES (Phase 1 - Premium)
  // ============================================

  app.get("/api/ai/status", isAuthenticated, async (_req, res) => {
    const { isDemoMode, getActiveProvider } = await import("../services/ai-provider");
    res.json({
      available: !isDemoMode(),
      provider: getActiveProvider(),
      demoMode: isDemoMode(),
    });
  });

  app.post("/api/ai/parse-request", expensiveLimiter, isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ message: "Text required" });
      }

      const { parseRequest } = await import("../services/ai-provider");
      const parsed = await parseRequest(text);
      res.json(parsed);
    } catch (error) {
      logger.error("Error parsing request", { error });
      res.status(500).json({ message: "Failed to parse request" });
    }
  });

  app.get("/api/ai/weekly-brief", expensiveLimiter, isAuthenticated, householdContext, async (req: Request, res: Response) => {
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
      res.status(500).json({ message: "Failed to generate brief" });
    }
  });

  app.post("/api/ai/transcribe", expensiveLimiter, isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const { audioBase64 } = req.body;
      if (!audioBase64 || typeof audioBase64 !== "string") {
        return res.status(400).json({ message: "Audio data required" });
      }

      const { transcribeVoice } = await import("../services/ai-provider");
      const transcription = await transcribeVoice(audioBase64);
      res.json({ transcription });
    } catch (error) {
      logger.error("Error transcribing voice", { error });
      res.status(500).json({ message: "Failed to transcribe voice" });
    }
  });

  app.post("/api/ai/smart-actions", expensiveLimiter, isAuthenticated, householdContext, async (req: Request, res: Response) => {
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
      res.status(500).json({ message: "Failed to get suggestions" });
    }
  });

  app.post("/api/ai/chat", expensiveLimiter, isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const { messages } = req.body;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ message: "Messages array required" });
      }

      const { chat } = await import("../services/ai-chat");
      const result = await chat(messages, householdId);
      res.json(result);
    } catch (error) {
      logger.error("Error in AI chat", { error, householdId });
      res.status(500).json({ message: "Failed to process chat" });
    }
  });

  app.post("/api/ai/chat/create-request", expensiveLimiter, isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const { title, description, category, urgency } = req.body;

      if (!title) {
        return res.status(400).json({ message: "Title is required" });
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
      res.status(500).json({ message: "Failed to create request" });
    }
  });

  app.post("/api/ai/parse-smart", expensiveLimiter, isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const { text, useAI = true } = req.body;

      if (!text || text.length < 3) {
        return res.status(400).json({ message: "Request text too short" });
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
      res.status(500).json({ message: "Failed to parse request" });
    }
  });

  app.get("/api/ai/insights", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const { getProactiveInsights } = await import("../services/ai-agent");
      
      const insights = await getProactiveInsights(householdId);
      res.json({ insights });
    } catch (error) {
      logger.error("Error fetching proactive insights", { error, householdId });
      res.status(500).json({ message: "Failed to fetch insights" });
    }
  });

  app.post("/api/ai/insights/refresh", expensiveLimiter, isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const { gatherHouseholdContext, generateProactiveInsights } = await import("../services/ai-agent");
      
      const context = await gatherHouseholdContext(householdId);
      const insights = await generateProactiveInsights(context);
      
      res.json({ insights, generated: insights.length });
    } catch (error) {
      logger.error("Error generating insights", { error, householdId });
      res.status(500).json({ message: "Failed to generate insights" });
    }
  });

  app.post("/api/ai/insights/:id/dismiss", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { dismissInsight } = await import("../services/ai-agent");
      
      await dismissInsight(id);
      res.json({ success: true });
    } catch (error) {
      logger.error("Error dismissing insight", { error, insightId: req.params.id });
      res.status(500).json({ message: "Failed to dismiss insight" });
    }
  });

  app.get("/api/ai/estimate-duration", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const { category } = req.query;
      
      if (!category) {
        return res.status(400).json({ message: "Category required" });
      }
      
      const { getSmartEstimate } = await import("../services/ai-agent");
      const estimate = await getSmartEstimate(householdId, category as string);
      
      res.json(estimate);
    } catch (error) {
      logger.error("Error getting estimate", { error, householdId });
      res.status(500).json({ message: "Failed to get estimate" });
    }
  });

  app.post("/api/ai/learn/task-complete", isAuthenticated, householdContext, async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const { taskId, category, estimatedMinutes, createdAt, completedAt } = req.body;
      
      if (!taskId || !category || !createdAt || !completedAt) {
        return res.status(400).json({ 
          message: "Missing required fields: taskId, category, createdAt, and completedAt are required" 
        });
      }
      
      const parsedCreatedAt = new Date(createdAt);
      const parsedCompletedAt = new Date(completedAt);
      
      if (isNaN(parsedCreatedAt.getTime()) || isNaN(parsedCompletedAt.getTime())) {
        return res.status(400).json({ message: "Invalid date format for createdAt or completedAt" });
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
      res.status(500).json({ message: "Failed to record completion" });
    }
  });
}
