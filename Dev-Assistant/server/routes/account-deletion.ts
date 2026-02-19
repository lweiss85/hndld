import { Router, Request, Response } from "express";
import { db } from "../db";
import {
  accountDeletionRequests, userProfiles, households, tasks,
  approvals, spendingItems, notifications, files,
  twoFactorSecrets, apiTokens, celebrations, conversations, messages,
  calendarEvents, requests, vendors, people, preferences,
  cleaningVisits, importantDates, householdLocations,
  learnedPreferences, calendarConnections,
} from "@shared/schema";
import { eq, and, lte, or, sql } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import { addDays } from "date-fns";
import logger from "../lib/logger";

const router = Router();
const GRACE_PERIOD_DAYS = 7;

router.post(
  "/user/delete",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;
      const householdId = req.householdId!;
      const { reason, confirmText } = req.body;

      if (confirmText !== "DELETE MY ACCOUNT") {
        return res.status(400).json({
          error: "Please type 'DELETE MY ACCOUNT' to confirm",
        });
      }

      const [existing] = await db.select().from(accountDeletionRequests)
        .where(eq(accountDeletionRequests.userId, userId)).limit(1);

      if (existing?.status === "PENDING") {
        return res.status(400).json({
          error: "Deletion already requested",
          scheduledDeletionAt: existing.scheduledDeletionAt,
        });
      }

      const scheduledDeletionAt = addDays(new Date(), GRACE_PERIOD_DAYS);

      if (existing) {
        await db.update(accountDeletionRequests)
          .set({
            householdId,
            reason: reason || null,
            scheduledDeletionAt,
            status: "PENDING",
            requestedAt: new Date(),
            cancelledAt: null,
            completedAt: null,
          })
          .where(eq(accountDeletionRequests.userId, userId));
      } else {
        await db.insert(accountDeletionRequests).values({
          userId,
          householdId,
          reason: reason || null,
          scheduledDeletionAt,
          status: "PENDING",
        });
      }

      logger.info("Account deletion requested", {
        userId,
        householdId,
        scheduledDeletionAt: scheduledDeletionAt.toISOString(),
      });

      res.json({
        success: true,
        message: `Your account is scheduled for deletion on ${scheduledDeletionAt.toLocaleDateString()}`,
        scheduledDeletionAt,
        gracePeriodDays: GRACE_PERIOD_DAYS,
        canCancel: true,
      });
    } catch (error: unknown) {
      logger.error("Account deletion request failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to process deletion request" });
    }
  }
);

router.post(
  "/user/delete/cancel",
  isAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;

      await db.update(accountDeletionRequests)
        .set({ status: "CANCELLED", cancelledAt: new Date() })
        .where(and(
          eq(accountDeletionRequests.userId, userId),
          eq(accountDeletionRequests.status, "PENDING")
        ));

      logger.info("Account deletion cancelled", { userId });

      res.json({ success: true, message: "Deletion request cancelled" });
    } catch (error: unknown) {
      logger.error("Cancellation failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to cancel deletion" });
    }
  }
);

router.get(
  "/user/delete/status",
  isAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.claims.sub;

      const [request] = await db.select().from(accountDeletionRequests)
        .where(and(
          eq(accountDeletionRequests.userId, userId),
          eq(accountDeletionRequests.status, "PENDING")
        )).limit(1);

      if (!request) {
        return res.json({ pending: false });
      }

      res.json({
        pending: true,
        scheduledDeletionAt: request.scheduledDeletionAt,
        requestedAt: request.requestedAt,
        canCancel: true,
      });
    } catch (error: unknown) {
      logger.error("Status check failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to check status" });
    }
  }
);

export function registerAccountDeletionRoutes(app: Router) {
  app.use(router);
}

export async function processScheduledDeletions() {
  try {
    const pendingDeletions = await db.select().from(accountDeletionRequests)
      .where(and(
        eq(accountDeletionRequests.status, "PENDING"),
        lte(accountDeletionRequests.scheduledDeletionAt, new Date())
      ));

    for (const deletion of pendingDeletions) {
      try {
        await performAccountDeletion(deletion.userId, deletion.householdId);

        await db.update(accountDeletionRequests)
          .set({ status: "COMPLETED", completedAt: new Date() })
          .where(eq(accountDeletionRequests.id, deletion.id));

        logger.info("Account deleted", { userId: deletion.userId });
      } catch (error: unknown) {
        logger.error("Failed to delete account", {
          userId: deletion.userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } catch (error: unknown) {
    logger.error("Scheduled deletion processing failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function performAccountDeletion(userId: string, householdId: string) {
  await db.delete(notifications).where(eq(notifications.userId, userId));
  await db.delete(celebrations).where(eq(celebrations.userId, userId));
  await db.delete(apiTokens).where(eq(apiTokens.userId, userId));
  await db.delete(twoFactorSecrets).where(eq(twoFactorSecrets.userId, userId));

  const memberCount = await db.select({ count: sql<number>`count(*)` })
    .from(userProfiles)
    .where(eq(userProfiles.householdId, householdId));

  if (Number(memberCount[0]?.count) <= 1) {
    const householdConversations = await db.select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.householdId, householdId));
    for (const conv of householdConversations) {
      await db.delete(messages).where(eq(messages.conversationId, conv.id));
    }
    await db.delete(conversations).where(eq(conversations.householdId, householdId));

    await db.delete(calendarConnections).where(eq(calendarConnections.householdId, householdId));
    await db.delete(calendarEvents).where(eq(calendarEvents.householdId, householdId));
    await db.delete(requests).where(eq(requests.householdId, householdId));
    await db.delete(tasks).where(eq(tasks.householdId, householdId));
    await db.delete(approvals).where(eq(approvals.householdId, householdId));
    await db.delete(spendingItems).where(eq(spendingItems.householdId, householdId));
    await db.delete(files).where(eq(files.householdId, householdId));
    await db.delete(vendors).where(eq(vendors.householdId, householdId));
    await db.delete(people).where(eq(people.householdId, householdId));
    await db.delete(preferences).where(eq(preferences.householdId, householdId));
    await db.delete(cleaningVisits).where(eq(cleaningVisits.householdId, householdId));
    await db.delete(importantDates).where(eq(importantDates.householdId, householdId));
    await db.delete(householdLocations).where(eq(householdLocations.householdId, householdId));
    await db.delete(learnedPreferences).where(eq(learnedPreferences.householdId, householdId));

    await db.delete(userProfiles).where(eq(userProfiles.householdId, householdId));
    await db.delete(households).where(eq(households.id, householdId));
  } else {
    await db.delete(userProfiles).where(eq(userProfiles.userId, userId));
  }

  logger.info("Account data purged", { userId, householdId });
}
