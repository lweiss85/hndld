import { Router, Request, Response, NextFunction } from "express";
import { getInsights, dismissInsight } from "../services/home-intelligence";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import { internalError } from "../lib/errors";
import logger from "../lib/logger";

const router = Router();

router.get(
  "/insights",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const householdId = req.householdId!;
      const forceRefresh = req.query.refresh === "true";

      const insights = await getInsights(householdId, forceRefresh);

      res.json({
        insights,
        meta: {
          count: insights.length,
          householdId,
          generatedAt: new Date().toISOString(),
        },
      });
    } catch (error: unknown) {
      logger.error("Failed to fetch insights", {
        error: error instanceof Error ? error.message : String(error),
        householdId: req.householdId,
      });
      next(internalError("Failed to generate insights"));
    }
  }
);

router.post(
  "/insights/:id/dismiss",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      await dismissInsight(id);
      res.json({ success: true });
    } catch (error: unknown) {
      logger.error("Failed to dismiss insight", {
        error: error instanceof Error ? error.message : String(error),
        insightId: req.params.id,
      });
      next(internalError("Failed to dismiss insight"));
    }
  }
);

export function registerInsightRoutes(v1: Router) {
  v1.use(router);
}
