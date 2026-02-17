import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db";
import {
  apiTokens, cleaningVisits, approvals, requests, spendingItems,
  tasks, userProfiles,
} from "@shared/schema";
import { eq, and, gte, desc, isNull, sql } from "drizzle-orm";
import { startOfMonth, format } from "date-fns";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import { apiLimiter, criticalLimiter } from "../lib/rate-limit";
import { internalError } from "../lib/errors";
import logger from "../lib/logger";
import crypto from "crypto";

const router = Router();

async function tokenAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ spoken: "Authorization required. Please check your API token.", error: "Missing or invalid authorization header" });
  }

  const token = authHeader.slice(7);
  if (!token || token.length < 20) {
    return res.status(401).json({ spoken: "Your API token appears invalid. Please generate a new one in hndld settings.", error: "Invalid token" });
  }

  try {
    const [apiToken] = await db
      .select()
      .from(apiTokens)
      .where(and(eq(apiTokens.token, token), isNull(apiTokens.revokedAt)))
      .limit(1);

    if (!apiToken) {
      return res.status(401).json({ spoken: "Your API token was not found or has been revoked. Please generate a new one.", error: "Token not found or revoked" });
    }

    if (apiToken.expiresAt && apiToken.expiresAt < new Date()) {
      return res.status(401).json({ spoken: "Your API token has expired. Please generate a new one in hndld settings.", error: "Token expired" });
    }

    (req as any).shortcutUserId = apiToken.userId;
    (req as any).shortcutHouseholdId = apiToken.householdId;
    (req as any).shortcutTokenId = apiToken.id;

    db.update(apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiTokens.id, apiToken.id))
      .execute()
      .catch(() => {});

    next();
  } catch (error) {
    logger.error("[Shortcuts] Token auth failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "Authentication failed" });
  }
}

router.post(
  "/shortcuts/token",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      const householdId = req.householdId!;
      const { name } = req.body;

      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const token = crypto.randomBytes(32).toString("hex");

      const [created] = await db
        .insert(apiTokens)
        .values({
          userId,
          householdId,
          token,
          name: name || "Siri Shortcut",
          scopes: ["read", "write"],
        })
        .returning();

      logger.info("[Shortcuts] Token created", { userId, householdId, tokenId: created.id });

      res.json({
        token,
        id: created.id,
        name: created.name,
        message: "Save this token securely. It won't be shown again.",
      });
    } catch (error: unknown) {
      logger.error("[Shortcuts] Token creation failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      next(internalError("Failed to create API token"));
    }
  }
);

router.get(
  "/shortcuts/tokens",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const tokens = await db
        .select({
          id: apiTokens.id,
          name: apiTokens.name,
          lastUsedAt: apiTokens.lastUsedAt,
          createdAt: apiTokens.createdAt,
          revokedAt: apiTokens.revokedAt,
        })
        .from(apiTokens)
        .where(eq(apiTokens.userId, userId))
        .orderBy(desc(apiTokens.createdAt));

      res.json(tokens);
    } catch (error: unknown) {
      next(internalError("Failed to list tokens"));
    }
  }
);

router.delete(
  "/shortcuts/tokens/:id",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      await db
        .update(apiTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(apiTokens.id, req.params.id), eq(apiTokens.userId, userId)));

      res.json({ success: true });
    } catch (error: unknown) {
      next(internalError("Failed to revoke token"));
    }
  }
);

router.get(
  "/shortcuts/next-cleaning",
  tokenAuth,
  apiLimiter,
  async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).shortcutHouseholdId;
      const now = new Date();

      const [nextVisit] = await db
        .select()
        .from(cleaningVisits)
        .where(
          and(
            eq(cleaningVisits.householdId, householdId),
            gte(cleaningVisits.scheduledAt, now),
            eq(cleaningVisits.status, "SCHEDULED")
          )
        )
        .orderBy(cleaningVisits.scheduledAt)
        .limit(1);

      if (!nextVisit) {
        return res.json({
          spoken: "You don't have any upcoming cleaning visits scheduled.",
          data: null,
        });
      }

      const dateStr = format(nextVisit.scheduledAt, "EEEE, MMMM do");
      const timeStr = format(nextVisit.scheduledAt, "h:mm a");
      const cleaner = nextVisit.cleanerName ? ` with ${nextVisit.cleanerName}` : "";
      const addons = nextVisit.addonsRequested?.length
        ? ` including ${nextVisit.addonsRequested.join(", ")}`
        : "";

      res.json({
        spoken: `Your next cleaning is ${dateStr} at ${timeStr}${cleaner}${addons}.`,
        data: {
          id: nextVisit.id,
          scheduledAt: nextVisit.scheduledAt,
          cleanerName: nextVisit.cleanerName,
          status: nextVisit.status,
          addons: nextVisit.addonsRequested,
        },
      });
    } catch (error) {
      logger.error("[Shortcuts] Next cleaning failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ spoken: "Sorry, I couldn't check your cleaning schedule.", error: true });
    }
  }
);

router.get(
  "/shortcuts/pending-approvals",
  tokenAuth,
  apiLimiter,
  async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).shortcutHouseholdId;

      const pending = await db
        .select()
        .from(approvals)
        .where(
          and(
            eq(approvals.householdId, householdId),
            eq(approvals.status, "PENDING")
          )
        )
        .orderBy(desc(approvals.createdAt))
        .limit(10);

      if (pending.length === 0) {
        return res.json({
          spoken: "You have no pending approvals. Everything is up to date!",
          data: { count: 0, items: [] },
        });
      }

      const summaries = pending.slice(0, 3).map(a => a.title).join(", ");
      const moreText = pending.length > 3 ? `, and ${pending.length - 3} more` : "";

      res.json({
        spoken: `You have ${pending.length} pending approval${pending.length > 1 ? "s" : ""}. Including: ${summaries}${moreText}.`,
        data: {
          count: pending.length,
          items: pending.map(a => ({
            id: a.id,
            title: a.title,
            details: a.details,
            amount: a.amount,
            createdAt: a.createdAt,
          })),
        },
      });
    } catch (error) {
      logger.error("[Shortcuts] Pending approvals failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ spoken: "Sorry, I couldn't check your approvals.", error: true });
    }
  }
);

router.post(
  "/shortcuts/approve/:id",
  tokenAuth,
  criticalLimiter,
  async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).shortcutHouseholdId;
      const userId = (req as any).shortcutUserId;
      const { id } = req.params;

      const [approval] = await db
        .select()
        .from(approvals)
        .where(
          and(
            eq(approvals.id, id),
            eq(approvals.householdId, householdId),
            eq(approvals.status, "PENDING")
          )
        )
        .limit(1);

      if (!approval) {
        return res.json({
          spoken: "I couldn't find that approval, or it's already been handled.",
          success: false,
        });
      }

      await db
        .update(approvals)
        .set({
          status: "APPROVED",
          updatedAt: new Date(),
        })
        .where(eq(approvals.id, id));

      res.json({
        spoken: `Done! "${approval.title}" has been approved.`,
        success: true,
        data: { id: approval.id, title: approval.title },
      });
    } catch (error) {
      logger.error("[Shortcuts] Approve failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ spoken: "Sorry, I couldn't approve that item.", error: true });
    }
  }
);

router.post(
  "/shortcuts/message",
  tokenAuth,
  criticalLimiter,
  async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).shortcutHouseholdId;
      const userId = (req as any).shortcutUserId;
      const { message, category, urgency } = req.body;

      if (!message || typeof message !== "string" || message.trim().length === 0) {
        return res.status(400).json({
          spoken: "Please provide a message.",
          error: true,
        });
      }

      const [created] = await db
        .insert(requests)
        .values({
          title: message.trim().slice(0, 100),
          description: message.trim().length > 100 ? message.trim() : null,
          category: category || "HOUSEHOLD",
          urgency: urgency || "MEDIUM",
          createdBy: userId,
          householdId,
        })
        .returning();

      res.json({
        spoken: `Got it! Your message has been sent to your assistant: "${message.trim().slice(0, 60)}${message.trim().length > 60 ? "..." : ""}"`,
        success: true,
        data: { id: created.id, title: created.title },
      });
    } catch (error) {
      logger.error("[Shortcuts] Message failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ spoken: "Sorry, I couldn't send your message.", error: true });
    }
  }
);

router.get(
  "/shortcuts/spending",
  tokenAuth,
  apiLimiter,
  async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).shortcutHouseholdId;
      const monthStart = startOfMonth(new Date());

      const monthSpending = await db
        .select()
        .from(spendingItems)
        .where(
          and(
            eq(spendingItems.householdId, householdId),
            gte(spendingItems.date, monthStart)
          )
        )
        .orderBy(desc(spendingItems.date));

      const total = monthSpending.reduce((sum, s) => sum + s.amount, 0) / 100;
      const count = monthSpending.length;

      const byCategory = new Map<string, number>();
      for (const item of monthSpending) {
        const cat = item.category || "Other";
        byCategory.set(cat, (byCategory.get(cat) || 0) + item.amount / 100);
      }

      const topCategories = Array.from(byCategory.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([cat, amt]) => `${cat}: $${amt.toFixed(0)}`)
        .join(", ");

      const monthName = format(new Date(), "MMMM");

      res.json({
        spoken: `This ${monthName}, you've spent $${total.toFixed(2)} across ${count} item${count !== 1 ? "s" : ""}. ${topCategories ? `Top categories: ${topCategories}.` : ""}`,
        data: {
          total,
          count,
          month: monthName,
          byCategory: Object.fromEntries(byCategory),
          recentItems: monthSpending.slice(0, 5).map(s => ({
            id: s.id,
            amount: s.amount / 100,
            category: s.category,
            vendor: s.vendor,
            note: s.note,
            date: s.date,
          })),
        },
      });
    } catch (error) {
      logger.error("[Shortcuts] Spending failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ spoken: "Sorry, I couldn't check your spending.", error: true });
    }
  }
);

router.get(
  "/shortcuts/status",
  tokenAuth,
  apiLimiter,
  async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).shortcutHouseholdId;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [todayTasks] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(tasks)
        .where(
          and(
            eq(tasks.householdId, householdId),
            gte(tasks.createdAt, today)
          )
        );

      const [pendingApprovals] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(approvals)
        .where(
          and(
            eq(approvals.householdId, householdId),
            eq(approvals.status, "PENDING")
          )
        );

      const [pendingRequests] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(requests)
        .where(eq(requests.householdId, householdId));

      res.json({
        spoken: `You have ${todayTasks.count} task${todayTasks.count !== 1 ? "s" : ""} today, ${pendingApprovals.count} pending approval${pendingApprovals.count !== 1 ? "s" : ""}, and ${pendingRequests.count} open request${pendingRequests.count !== 1 ? "s" : ""}.`,
        data: {
          tasks: todayTasks.count,
          approvals: pendingApprovals.count,
          requests: pendingRequests.count,
        },
      });
    } catch (error) {
      logger.error("[Shortcuts] Status check failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ spoken: "Sorry, I couldn't check your status.", error: true });
    }
  }
);

export function registerShortcutRoutes(v1: Router) {
  v1.use(router);
}
