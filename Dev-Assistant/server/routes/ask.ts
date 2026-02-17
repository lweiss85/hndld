import { Router, Request, Response, NextFunction } from "express";
import { askHousehold, buildHouseholdGraph } from "../services/knowledge-graph";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import { criticalLimiter } from "../lib/rate-limit";
import { internalError } from "../lib/errors";
import logger from "../lib/logger";

const router = Router();

router.post(
  "/ask",
  isAuthenticated,
  householdContextMiddleware,
  criticalLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const householdId = req.householdId!;
      const { question } = req.body;

      if (!question || typeof question !== "string" || question.trim().length === 0) {
        return res.status(400).json({ error: "A question is required" });
      }

      if (question.length > 500) {
        return res.status(400).json({ error: "Question must be under 500 characters" });
      }

      logger.info("[KnowledgeGraph] Ask query", {
        householdId,
        questionLength: question.length,
      });

      const result = await askHousehold(householdId, question.trim());

      res.json({
        answer: result.answer,
        connections: result.connections,
        sources: result.sources,
        meta: {
          graphSummary: result.graphSummary,
          householdId,
          answeredAt: new Date().toISOString(),
        },
      });
    } catch (error: unknown) {
      logger.error("[KnowledgeGraph] Ask failed", {
        error: error instanceof Error ? error.message : String(error),
        householdId: req.householdId,
      });
      next(internalError("Failed to answer your question"));
    }
  }
);

router.get(
  "/knowledge-graph",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const householdId = req.householdId!;
      const graph = await buildHouseholdGraph(householdId);

      res.json({
        nodes: graph.nodes.length,
        edges: graph.edges.length,
        summary: graph.summary,
        nodesByType: graph.nodes.reduce((acc, n) => {
          acc[n.type] = (acc[n.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        edgesByRelation: graph.edges.reduce((acc, e) => {
          acc[e.relation] = (acc[e.relation] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      });
    } catch (error: unknown) {
      logger.error("[KnowledgeGraph] Graph build failed", {
        error: error instanceof Error ? error.message : String(error),
        householdId: req.householdId,
      });
      next(internalError("Failed to build knowledge graph"));
    }
  }
);

export function registerAskRoutes(v1: Router) {
  v1.use(router);
}
