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

/**
 * @openapi
 * /{householdId}/weekly-brief:
 *   get:
 *     summary: Get latest weekly brief
 *     description: Returns the latest weekly brief for the authenticated user in the specified household. Automatically marks it as read and tracks engagement.
 *     tags:
 *       - Weekly Brief
 *     security:
 *       - session: []
 *     parameters:
 *       - in: path
 *         name: householdId
 *         required: true
 *         schema:
 *           type: string
 *         description: The household ID
 *     responses:
 *       200:
 *         description: Latest weekly brief or null if none available
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 brief:
 *                   oneOf:
 *                     - $ref: '#/components/schemas/WeeklyBrief'
 *                     - type: "null"
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied to this household
 *       500:
 *         description: Internal server error
 */
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

/**
 * @openapi
 * /{householdId}/weekly-brief/history:
 *   get:
 *     summary: Get weekly brief history
 *     description: Returns a paginated list of past weekly briefs for the authenticated user in the specified household.
 *     tags:
 *       - Weekly Brief
 *     security:
 *       - session: []
 *     parameters:
 *       - in: path
 *         name: householdId
 *         required: true
 *         schema:
 *           type: string
 *         description: The household ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Maximum number of briefs to return
 *     responses:
 *       200:
 *         description: List of weekly briefs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 briefs:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/WeeklyBrief'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied to this household
 *       500:
 *         description: Internal server error
 */
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

/**
 * @openapi
 * /{householdId}/weekly-brief/generate:
 *   post:
 *     summary: Generate a new weekly brief
 *     description: Triggers generation of a new weekly brief for the authenticated user in the specified household.
 *     tags:
 *       - Weekly Brief
 *     security:
 *       - session: []
 *     parameters:
 *       - in: path
 *         name: householdId
 *         required: true
 *         schema:
 *           type: string
 *         description: The household ID
 *     responses:
 *       200:
 *         description: Weekly brief generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 brief:
 *                   $ref: '#/components/schemas/WeeklyBrief'
 *                 content:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied to this household
 *       500:
 *         description: Internal server error
 */
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

/**
 * @openapi
 * /{householdId}/weekly-brief/{briefId}/feedback:
 *   post:
 *     summary: Submit feedback for a weekly brief
 *     description: Submits a rating and optional feedback text for a specific weekly brief. Tracks engagement for analytics.
 *     tags:
 *       - Weekly Brief
 *     security:
 *       - session: []
 *     parameters:
 *       - in: path
 *         name: householdId
 *         required: true
 *         schema:
 *           type: string
 *         description: The household ID
 *       - in: path
 *         name: briefId
 *         required: true
 *         schema:
 *           type: string
 *         description: The weekly brief ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rating
 *             properties:
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               feedbackText:
 *                 type: string
 *     responses:
 *       200:
 *         description: Feedback submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid feedback data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied to this household
 *       404:
 *         description: Brief not found
 *       500:
 *         description: Internal server error
 */
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

/**
 * @openapi
 * /{householdId}/engagement:
 *   post:
 *     summary: Track user engagement
 *     description: Records a user engagement event for analytics purposes. Supports various entity types and actions.
 *     tags:
 *       - Weekly Brief
 *     security:
 *       - session: []
 *     parameters:
 *       - in: path
 *         name: householdId
 *         required: true
 *         schema:
 *           type: string
 *         description: The household ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - entityType
 *             properties:
 *               entityType:
 *                 type: string
 *                 description: Type of entity being engaged with
 *               entityId:
 *                 type: string
 *                 description: Optional ID of the entity
 *               action:
 *                 type: string
 *                 default: view
 *                 description: The engagement action
 *               metadata:
 *                 type: object
 *                 additionalProperties: true
 *                 description: Additional metadata for the engagement event
 *     responses:
 *       200:
 *         description: Engagement tracked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: Invalid engagement data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied to this household
 *       500:
 *         description: Internal server error
 */
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
