import { Router, Request, Response } from "express";
import { db } from "../db";
import {
  userProfiles, tasks, approvals, spendingItems, calendarEvents,
  requests, conversations, messages, notifications, vendors, people, preferences,
  cleaningVisits, files, importantDates, householdLocations,
  learnedPreferences, celebrations,
} from "@shared/schema";
import { eq, and, or, sql } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import logger from "../lib/logger";

const router = Router();

router.get(
  "/user/export",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;

      logger.info("Data export requested", { userId, householdId });

      const [
        profile,
        userTasks,
        userApprovals,
        userSpending,
        userEvents,
        userRequests,
        userMessages,
        userNotifications,
        householdVendors,
        householdPeople,
        householdPrefs,
        householdVisits,
        userFiles,
        householdDates,
        userLocations,
        householdLearned,
        userCelebrations,
      ] = await Promise.all([
        db.select().from(userProfiles).where(eq(userProfiles.userId, userId)),
        db.select().from(tasks).where(and(eq(tasks.householdId, householdId), eq(tasks.createdBy, userId))),
        db.select().from(approvals).where(and(eq(approvals.householdId, householdId), eq(approvals.createdBy, userId))),
        db.select().from(spendingItems).where(and(eq(spendingItems.householdId, householdId), eq(spendingItems.createdBy, userId))),
        db.select().from(calendarEvents).where(eq(calendarEvents.householdId, householdId)),
        db.select().from(requests).where(and(eq(requests.householdId, householdId), eq(requests.createdBy, userId))),
        db.select({ id: messages.id, conversationId: messages.conversationId, senderId: messages.senderId, text: messages.text, attachments: messages.attachments, createdAt: messages.createdAt })
          .from(messages)
          .innerJoin(conversations, eq(messages.conversationId, conversations.id))
          .where(and(eq(conversations.householdId, householdId), eq(messages.senderId, userId))),
        db.select().from(notifications).where(eq(notifications.userId, userId)),
        db.select().from(vendors).where(eq(vendors.householdId, householdId)),
        db.select().from(people).where(eq(people.householdId, householdId)),
        db.select().from(preferences).where(eq(preferences.householdId, householdId)),
        db.select().from(cleaningVisits).where(eq(cleaningVisits.householdId, householdId)),
        db.select({
          id: files.id,
          filename: files.filename,
          mimeType: files.mimeType,
          fileSize: files.fileSize,
          category: files.category,
          uploadedAt: files.uploadedAt,
        }).from(files).where(and(eq(files.householdId, householdId), eq(files.uploadedBy, userId))),
        db.select().from(importantDates).where(eq(importantDates.householdId, householdId)),
        db.select().from(householdLocations).where(eq(householdLocations.householdId, householdId)),
        db.select().from(learnedPreferences).where(eq(learnedPreferences.householdId, householdId)),
        db.select().from(celebrations).where(eq(celebrations.userId, userId)),
      ]);

      const exportData = {
        exportedAt: new Date().toISOString(),
        userId,
        householdId,
        userData: {
          profile: profile[0] || null,
          tasks: userTasks,
          approvals: userApprovals,
          spending: userSpending,
          requests: userRequests,
          messages: userMessages,
          notifications: userNotifications,
          files: userFiles,
          celebrations: userCelebrations,
        },
        householdData: {
          note: "Shared household data you have access to",
          calendarEvents: userEvents,
          vendors: householdVendors,
          people: householdPeople,
          preferences: householdPrefs,
          cleaningVisits: householdVisits,
          importantDates: householdDates,
          locations: userLocations,
          learnedPreferences: householdLearned,
        },
      };

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="hndld-export-${userId}-${Date.now()}.json"`);
      res.json(exportData);

      logger.info("Data export completed", { userId, householdId });
    } catch (error: unknown) {
      logger.error("Data export failed", {
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.claims.sub,
      });
      res.status(500).json({ error: "Failed to export data" });
    }
  }
);

router.get("/user/export/preview", isAuthenticated, householdContextMiddleware, async (req: Request, res: Response) => {
  try {
    const householdId = req.householdId!;
    const userId = req.user!.claims.sub;

    const counts = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(tasks).where(and(eq(tasks.householdId, householdId), eq(tasks.createdBy, userId))),
      db.select({ count: sql<number>`count(*)` }).from(approvals).where(and(eq(approvals.householdId, householdId), eq(approvals.createdBy, userId))),
      db.select({ count: sql<number>`count(*)` }).from(spendingItems).where(and(eq(spendingItems.householdId, householdId), eq(spendingItems.createdBy, userId))),
      db.select({ count: sql<number>`count(*)` }).from(calendarEvents).where(eq(calendarEvents.householdId, householdId)),
      db.select({ count: sql<number>`count(*)` }).from(messages).innerJoin(conversations, eq(messages.conversationId, conversations.id)).where(and(eq(conversations.householdId, householdId), eq(messages.senderId, userId))),
      db.select({ count: sql<number>`count(*)` }).from(vendors).where(eq(vendors.householdId, householdId)),
      db.select({ count: sql<number>`count(*)` }).from(files).where(and(eq(files.householdId, householdId), eq(files.uploadedBy, userId))),
    ]);

    res.json({
      preview: {
        tasks: counts[0][0]?.count || 0,
        approvals: counts[1][0]?.count || 0,
        spendingItems: counts[2][0]?.count || 0,
        calendarEvents: counts[3][0]?.count || 0,
        messages: counts[4][0]?.count || 0,
        vendors: counts[5][0]?.count || 0,
        files: counts[6][0]?.count || 0,
      },
      note: "Your personal data plus shared household data you have access to. File contents are not included — only metadata.",
    });
  } catch (error: unknown) {
    logger.error("Export preview failed", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: "Failed to generate preview" });
  }
});

export function registerDataExportRoutes(app: Router) {
  app.use(router);
}
