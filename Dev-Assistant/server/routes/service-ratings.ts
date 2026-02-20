import { Router, Request, Response } from "express";
import { db } from "../db";
import { serviceQualityRatings, vendors, householdDetails, tasks, spendingItems } from "@shared/schema";
import { eq, and, desc, sql, avg, count } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import logger from "../lib/logger";

const router = Router();

router.post(
  "/service-ratings",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const {
        vendorId, serviceCategory, serviceSubcategory, serviceDate,
        relatedTaskId, relatedSpendingItemId,
        overallRating, qualityRating, punctualityRating,
        communicationRating, professionalismRating, valueForMoneyRating,
        wouldRecommend, wouldHireAgain, likelihoodToRecommend,
        hadIssue, issueCategory, issueDescription, issueResolvedSatisfactorily,
        pricePaidCents, positiveHighlights, areasForImprovement, reviewText,
        isPublic, isAnonymous,
      } = req.body;

      if (!vendorId || !serviceCategory || !serviceDate || !overallRating) {
        return res.status(400).json({ error: "vendorId, serviceCategory, serviceDate, and overallRating are required" });
      }

      if (overallRating < 1 || overallRating > 5) {
        return res.status(400).json({ error: "overallRating must be between 1 and 5" });
      }

      const [details] = await db.select()
        .from(householdDetails)
        .where(eq(householdDetails.householdId, householdId));

      const [created] = await db.insert(serviceQualityRatings)
        .values({
          householdId,
          vendorId,
          serviceCategory,
          serviceSubcategory: serviceSubcategory || null,
          serviceDate,
          relatedTaskId: relatedTaskId || null,
          relatedSpendingItemId: relatedSpendingItemId || null,
          overallRating,
          qualityRating: qualityRating || null,
          punctualityRating: punctualityRating || null,
          communicationRating: communicationRating || null,
          professionalismRating: professionalismRating || null,
          valueForMoneyRating: valueForMoneyRating || null,
          wouldRecommend: wouldRecommend ?? null,
          wouldHireAgain: wouldHireAgain ?? null,
          likelihoodToRecommend: likelihoodToRecommend || null,
          hadIssue: hadIssue ?? false,
          issueCategory: issueCategory || null,
          issueDescription: issueDescription || null,
          issueResolvedSatisfactorily: issueResolvedSatisfactorily ?? null,
          pricePaidCents: pricePaidCents || null,
          positiveHighlights: positiveHighlights || null,
          areasForImprovement: areasForImprovement || null,
          reviewText: reviewText || null,
          region: details?.region || null,
          metroArea: details?.metroArea || null,
          homeSquareFootage: details?.squareFootage || null,
          isPublic: isPublic ?? false,
          isAnonymous: isAnonymous ?? false,
        })
        .returning();

      res.status(201).json({ rating: created });
    } catch (error: unknown) {
      logger.error("Failed to create service rating", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to create rating" });
    }
  }
);

router.get(
  "/service-ratings",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const { category, vendorId } = req.query;

      const conditions = [eq(serviceQualityRatings.householdId, householdId)];
      if (category) conditions.push(eq(serviceQualityRatings.serviceCategory, String(category)));
      if (vendorId) conditions.push(eq(serviceQualityRatings.vendorId, String(vendorId)));

      const ratings = await db.select()
        .from(serviceQualityRatings)
        .where(and(...conditions))
        .orderBy(desc(serviceQualityRatings.createdAt));

      res.json({ ratings });
    } catch (error: unknown) {
      logger.error("Failed to get service ratings", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to get ratings" });
    }
  }
);

router.get(
  "/service-ratings/vendor/:vendorId",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { vendorId } = req.params;
      const householdId = req.householdId!;

      const ratings = await db.select()
        .from(serviceQualityRatings)
        .where(and(
          eq(serviceQualityRatings.vendorId, vendorId),
          eq(serviceQualityRatings.householdId, householdId)
        ))
        .orderBy(desc(serviceQualityRatings.serviceDate));

      const summary = await db.select({
        avgOverall: avg(serviceQualityRatings.overallRating),
        avgQuality: avg(serviceQualityRatings.qualityRating),
        avgPunctuality: avg(serviceQualityRatings.punctualityRating),
        avgCommunication: avg(serviceQualityRatings.communicationRating),
        avgProfessionalism: avg(serviceQualityRatings.professionalismRating),
        avgValue: avg(serviceQualityRatings.valueForMoneyRating),
        totalRatings: count(),
        recommendCount: count(sql`CASE WHEN ${serviceQualityRatings.wouldRecommend} = true THEN 1 END`),
        issueCount: count(sql`CASE WHEN ${serviceQualityRatings.hadIssue} = true THEN 1 END`),
      })
        .from(serviceQualityRatings)
        .where(and(
          eq(serviceQualityRatings.vendorId, vendorId),
          eq(serviceQualityRatings.householdId, householdId)
        ));

      const total = Number(summary[0]?.totalRatings || 0);

      res.json({
        ratings,
        summary: {
          avgOverallRating: Number(Number(summary[0]?.avgOverall || 0).toFixed(2)),
          avgQualityRating: Number(Number(summary[0]?.avgQuality || 0).toFixed(2)),
          avgPunctualityRating: Number(Number(summary[0]?.avgPunctuality || 0).toFixed(2)),
          avgCommunicationRating: Number(Number(summary[0]?.avgCommunication || 0).toFixed(2)),
          avgProfessionalismRating: Number(Number(summary[0]?.avgProfessionalism || 0).toFixed(2)),
          avgValueRating: Number(Number(summary[0]?.avgValue || 0).toFixed(2)),
          totalRatings: total,
          recommendationRate: total > 0 ? Number(((Number(summary[0]?.recommendCount || 0) / total) * 100).toFixed(1)) : 0,
          issueRate: total > 0 ? Number(((Number(summary[0]?.issueCount || 0) / total) * 100).toFixed(1)) : 0,
        },
      });
    } catch (error: unknown) {
      logger.error("Failed to get vendor ratings", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to get vendor ratings" });
    }
  }
);

router.get(
  "/service-ratings/prompts",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;

      const recentTasks = await db.select({
        id: tasks.id,
        title: tasks.title,
        category: tasks.category,
        updatedAt: tasks.updatedAt,
      })
        .from(tasks)
        .where(and(
          eq(tasks.householdId, householdId),
          eq(tasks.status, "DONE")
        ))
        .orderBy(desc(tasks.updatedAt))
        .limit(10);

      const recentSpending = await db.select({
        id: spendingItems.id,
        vendor: spendingItems.vendor,
        category: spendingItems.category,
        date: spendingItems.date,
        amount: spendingItems.amount,
      })
        .from(spendingItems)
        .where(eq(spendingItems.householdId, householdId))
        .orderBy(desc(spendingItems.date))
        .limit(10);

      const existingRatingTaskIds = await db.select({
        taskId: serviceQualityRatings.relatedTaskId,
      })
        .from(serviceQualityRatings)
        .where(eq(serviceQualityRatings.householdId, householdId));

      const ratedTaskIds = new Set(existingRatingTaskIds.map(r => r.taskId).filter(Boolean));

      const prompts = recentTasks
        .filter(t => !ratedTaskIds.has(t.id))
        .map(t => ({
          type: "TASK" as const,
          id: t.id,
          title: t.title,
          category: t.category,
          date: t.updatedAt,
        }));

      const existingRatingSpendingIds = await db.select({
        spendingId: serviceQualityRatings.relatedSpendingItemId,
      })
        .from(serviceQualityRatings)
        .where(eq(serviceQualityRatings.householdId, householdId));

      const ratedSpendingIds = new Set(existingRatingSpendingIds.map(r => r.spendingId).filter(Boolean));

      const spendingPrompts = recentSpending
        .filter(s => s.vendor && !ratedSpendingIds.has(s.id))
        .map(s => ({
          type: "SPENDING" as const,
          id: s.id,
          title: `Rate ${s.vendor}`,
          category: s.category,
          date: s.date,
          vendor: s.vendor,
          amount: s.amount,
        }));

      res.json({ prompts: [...prompts, ...spendingPrompts].slice(0, 5) });
    } catch (error: unknown) {
      logger.error("Failed to get rating prompts", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to get prompts" });
    }
  }
);

export function registerServiceRatingsRoutes(app: Router) {
  app.use(router);
}
