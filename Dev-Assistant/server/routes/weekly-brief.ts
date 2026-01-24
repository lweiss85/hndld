import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import {
  getLatestBrief,
  createAndSendWeeklyBrief,
  markBriefAsRead,
  submitBriefFeedback,
  trackUserEngagement,
} from "../services/weekly-brief";
import { db } from "../db";
import { weeklyBriefs, userProfiles } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

async function verifyHouseholdAccess(req: any, res: Response, next: NextFunction) {
  const { householdId } = req.params;
  const userId = req.user?.claims?.sub;

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const profile = await db
    .select()
    .from(userProfiles)
    .where(
      and(
        eq(userProfiles.userId, userId),
        eq(userProfiles.householdId, householdId)
      )
    )
    .limit(1);

  if (!profile[0]) {
    return res.status(403).json({ error: "Access denied to this household" });
  }

  req.userProfile = profile[0];
  next();
}

router.get(
  "/:householdId/weekly-brief",
  verifyHouseholdAccess,
  async (req: any, res: Response, next: NextFunction) => {
    try {
      const { householdId } = req.params;
      const userId = req.user.claims.sub;

      const brief = await getLatestBrief(userId, householdId);

      if (!brief) {
        return res.json({ brief: null, message: "No brief available yet" });
      }

      if (brief.status === "SENT") {
        await markBriefAsRead(brief.id);
      }

      await trackUserEngagement(userId, householdId, "weekly_brief", brief.id, "view");

      res.json({ brief });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/:householdId/weekly-brief/history",
  verifyHouseholdAccess,
  async (req: any, res: Response, next: NextFunction) => {
    try {
      const { householdId } = req.params;
      const userId = req.user.claims.sub;
      const limit = parseInt(req.query.limit as string) || 10;

      const briefs = await db
        .select()
        .from(weeklyBriefs)
        .where(
          and(
            eq(weeklyBriefs.userId, userId),
            eq(weeklyBriefs.householdId, householdId)
          )
        )
        .orderBy(desc(weeklyBriefs.createdAt))
        .limit(limit);

      res.json({ briefs });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/:householdId/weekly-brief/generate",
  verifyHouseholdAccess,
  async (req: any, res: Response, next: NextFunction) => {
    try {
      const { householdId } = req.params;
      const userId = req.user.claims.sub;

      const content = await createAndSendWeeklyBrief(userId, householdId);
      const brief = await getLatestBrief(userId, householdId);

      res.json({ success: true, brief, content });
    } catch (error) {
      next(error);
    }
  }
);

const feedbackSchema = z.object({
  rating: z.number().min(1).max(5),
  feedbackText: z.string().optional(),
});

router.post(
  "/:householdId/weekly-brief/:briefId/feedback",
  verifyHouseholdAccess,
  async (req: any, res: Response, next: NextFunction) => {
    try {
      const { briefId, householdId } = req.params;
      const userId = req.user.claims.sub;

      const validation = feedbackSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error.errors });
      }

      const { rating, feedbackText } = validation.data;

      const brief = await db
        .select()
        .from(weeklyBriefs)
        .where(
          and(
            eq(weeklyBriefs.id, briefId),
            eq(weeklyBriefs.userId, userId)
          )
        )
        .limit(1);

      if (!brief[0]) {
        return res.status(404).json({ error: "Brief not found" });
      }

      await submitBriefFeedback(briefId, rating, feedbackText);
      await trackUserEngagement(userId, householdId, "weekly_brief_feedback", briefId, "feedback", { rating });

      res.json({ success: true, message: "Feedback submitted" });
    } catch (error) {
      next(error);
    }
  }
);

const engagementSchema = z.object({
  entityType: z.string(),
  entityId: z.string().optional(),
  action: z.string().default("view"),
  metadata: z.record(z.any()).optional(),
});

router.post(
  "/:householdId/engagement",
  verifyHouseholdAccess,
  async (req: any, res: Response, next: NextFunction) => {
    try {
      const { householdId } = req.params;
      const userId = req.user.claims.sub;

      const validation = engagementSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error.errors });
      }

      const { entityType, entityId, action, metadata } = validation.data;

      await trackUserEngagement(userId, householdId, entityType, entityId, action, metadata);

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
