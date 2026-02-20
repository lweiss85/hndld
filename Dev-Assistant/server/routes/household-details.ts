import { Router, Request, Response } from "express";
import { db } from "../db";
import { householdDetails } from "@shared/schema";
import { eq } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import {
  deriveRegionFromState,
  deriveClimateZone,
  calculateCompletenessScore,
  getDataCompletionSuggestions,
} from "../services/data-capture";
import logger from "../lib/logger";

const router = Router();

router.get(
  "/household-details",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const [details] = await db.select()
        .from(householdDetails)
        .where(eq(householdDetails.householdId, householdId));

      if (!details) {
        return res.json({ details: null, completenessScore: 0 });
      }

      res.json({ details, completenessScore: details.completenessScore || 0 });
    } catch (error: unknown) {
      logger.error("Failed to get household details", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to get household details" });
    }
  }
);

router.post(
  "/household-details",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;

      const [existing] = await db.select()
        .from(householdDetails)
        .where(eq(householdDetails.householdId, householdId));

      if (existing) {
        return res.status(409).json({ error: "Household details already exist. Use PATCH to update." });
      }

      const data = req.body;

      if (data.state && !data.region) {
        data.region = deriveRegionFromState(data.state);
      }
      if (data.state && !data.climateZone) {
        data.climateZone = deriveClimateZone(data.state);
      }

      const completenessScore = calculateCompletenessScore(data);

      const [created] = await db.insert(householdDetails)
        .values({
          householdId,
          ...data,
          completenessScore,
        })
        .returning();

      res.status(201).json({ details: created, completenessScore });
    } catch (error: unknown) {
      logger.error("Failed to create household details", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to create household details" });
    }
  }
);

router.patch(
  "/household-details",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;

      const [existing] = await db.select()
        .from(householdDetails)
        .where(eq(householdDetails.householdId, householdId));

      if (!existing) {
        return res.status(404).json({ error: "Household details not found. Use POST to create." });
      }

      const data = req.body;

      const mergedState = data.state || existing.state;
      if (mergedState && !data.region) {
        data.region = deriveRegionFromState(mergedState);
      }
      if (mergedState && !data.climateZone) {
        data.climateZone = deriveClimateZone(mergedState);
      }

      const merged = { ...existing, ...data };
      const completenessScore = calculateCompletenessScore(merged);

      const [updated] = await db.update(householdDetails)
        .set({
          ...data,
          completenessScore,
          updatedAt: new Date(),
        })
        .where(eq(householdDetails.householdId, householdId))
        .returning();

      res.json({ details: updated, completenessScore });
    } catch (error: unknown) {
      logger.error("Failed to update household details", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to update household details" });
    }
  }
);

router.get(
  "/household-details/suggestions",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const suggestions = await getDataCompletionSuggestions(householdId);
      res.json({ suggestions });
    } catch (error: unknown) {
      logger.error("Failed to get data suggestions", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to get suggestions" });
    }
  }
);

router.post(
  "/household-details/consent",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const { consentToAnonymizedAnalytics, consentToDataSharing } = req.body;

      const [existing] = await db.select()
        .from(householdDetails)
        .where(eq(householdDetails.householdId, householdId));

      if (!existing) {
        const [created] = await db.insert(householdDetails)
          .values({
            householdId,
            consentToAnonymizedAnalytics: consentToAnonymizedAnalytics ?? false,
            consentToDataSharing: consentToDataSharing ?? false,
            consentUpdatedAt: new Date(),
          })
          .returning();
        return res.json({ consent: created });
      }

      const [updated] = await db.update(householdDetails)
        .set({
          consentToAnonymizedAnalytics: consentToAnonymizedAnalytics ?? existing.consentToAnonymizedAnalytics,
          consentToDataSharing: consentToDataSharing ?? existing.consentToDataSharing,
          consentUpdatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(householdDetails.householdId, householdId))
        .returning();

      res.json({ consent: updated });
    } catch (error: unknown) {
      logger.error("Failed to update consent", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to update consent" });
    }
  }
);

export function registerHouseholdDetailsRoutes(app: Router) {
  app.use(router);
}
