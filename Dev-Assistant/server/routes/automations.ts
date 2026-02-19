import { Router, Request, Response } from "express";
import { db } from "../db";
import { automations, automationRuns } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { processTrigger, AUTOMATION_TEMPLATES } from "../services/automation-engine";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import logger from "../lib/logger";

export function registerAutomationRoutes(parent: any) {
  const router = Router();
  parent.use("/automations", router);

  router.get("/", isAuthenticated, householdContextMiddleware, async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).householdId;
      if (!householdId) return res.status(400).json({ error: "Household context required" });

      const result = await db.select().from(automations)
        .where(eq(automations.householdId, householdId))
        .orderBy(desc(automations.createdAt));

      res.json(result);
    } catch (error) {
      logger.error("Failed to list automations", { error });
      res.status(500).json({ error: "Failed to list automations" });
    }
  });

  router.get("/templates", isAuthenticated, async (_req: Request, res: Response) => {
    res.json(AUTOMATION_TEMPLATES);
  });

  router.get("/:id", isAuthenticated, householdContextMiddleware, async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).householdId;
      if (!householdId) return res.status(400).json({ error: "Household context required" });

      const [automation] = await db.select().from(automations)
        .where(and(
          eq(automations.id, req.params.id),
          eq(automations.householdId, householdId)
        ))
        .limit(1);

      if (!automation) return res.status(404).json({ error: "Automation not found" });
      res.json(automation);
    } catch (error) {
      logger.error("Failed to get automation", { error });
      res.status(500).json({ error: "Failed to get automation" });
    }
  });

  router.post("/", isAuthenticated, householdContextMiddleware, async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).householdId;
      const userId = (req as any).userId || (req.user as any)?.id;
      if (!householdId) return res.status(400).json({ error: "Household context required" });

      const { name, description, icon, color, trigger, triggerConfig, conditions, actions, propertyId } = req.body;

      if (!name || !trigger || !triggerConfig || !actions || !Array.isArray(actions) || actions.length === 0) {
        return res.status(400).json({ error: "Name, trigger, triggerConfig, and at least one action are required" });
      }

      const [automation] = await db.insert(automations).values({
        householdId,
        propertyId: propertyId || null,
        name,
        description: description || null,
        icon: icon || "zap",
        color: color || "blue",
        trigger,
        triggerConfig,
        conditions: conditions || null,
        actions: actions.map((a: any, i: number) => ({ ...a, order: a.order ?? i + 1 })),
        createdBy: userId || "system",
      }).returning();

      res.status(201).json(automation);
    } catch (error) {
      logger.error("Failed to create automation", { error });
      res.status(500).json({ error: "Failed to create automation" });
    }
  });

  router.put("/:id", isAuthenticated, householdContextMiddleware, async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).householdId;
      if (!householdId) return res.status(400).json({ error: "Household context required" });

      const { name, description, icon, color, trigger, triggerConfig, conditions, actions, isEnabled, propertyId } = req.body;

      const updates: any = { updatedAt: new Date() };
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (icon !== undefined) updates.icon = icon;
      if (color !== undefined) updates.color = color;
      if (trigger !== undefined) updates.trigger = trigger;
      if (triggerConfig !== undefined) updates.triggerConfig = triggerConfig;
      if (conditions !== undefined) updates.conditions = conditions;
      if (actions !== undefined) updates.actions = actions;
      if (isEnabled !== undefined) updates.isEnabled = isEnabled;
      if (propertyId !== undefined) updates.propertyId = propertyId;

      const [updated] = await db.update(automations)
        .set(updates)
        .where(and(
          eq(automations.id, req.params.id),
          eq(automations.householdId, householdId)
        ))
        .returning();

      if (!updated) return res.status(404).json({ error: "Automation not found" });
      res.json(updated);
    } catch (error) {
      logger.error("Failed to update automation", { error });
      res.status(500).json({ error: "Failed to update automation" });
    }
  });

  router.delete("/:id", isAuthenticated, householdContextMiddleware, async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).householdId;
      if (!householdId) return res.status(400).json({ error: "Household context required" });

      const [deleted] = await db.delete(automations)
        .where(and(
          eq(automations.id, req.params.id),
          eq(automations.householdId, householdId)
        ))
        .returning();

      if (!deleted) return res.status(404).json({ error: "Automation not found" });
      res.json({ success: true });
    } catch (error) {
      logger.error("Failed to delete automation", { error });
      res.status(500).json({ error: "Failed to delete automation" });
    }
  });

  router.get("/:id/runs", isAuthenticated, householdContextMiddleware, async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).householdId;
      if (!householdId) return res.status(400).json({ error: "Household context required" });

      const [automation] = await db.select().from(automations)
        .where(and(
          eq(automations.id, req.params.id),
          eq(automations.householdId, householdId)
        ))
        .limit(1);

      if (!automation) return res.status(404).json({ error: "Automation not found" });

      const limit = parseInt(req.query.limit as string) || 20;
      const runs = await db.select().from(automationRuns)
        .where(eq(automationRuns.automationId, req.params.id))
        .orderBy(desc(automationRuns.startedAt))
        .limit(limit);

      res.json(runs);
    } catch (error) {
      logger.error("Failed to get automation runs", { error });
      res.status(500).json({ error: "Failed to get automation runs" });
    }
  });

  router.post("/:id/test", isAuthenticated, householdContextMiddleware, async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).householdId;
      if (!householdId) return res.status(400).json({ error: "Household context required" });

      const [automation] = await db.select().from(automations)
        .where(and(
          eq(automations.id, req.params.id),
          eq(automations.householdId, householdId)
        ))
        .limit(1);

      if (!automation) return res.status(404).json({ error: "Automation not found" });

      const testEvent = {
        type: automation.trigger,
        householdId: automation.householdId,
        propertyId: automation.propertyId || undefined,
        data: {
          userId: (req as any).userId || (req.user as any)?.id || "test-user",
          taskTitle: "Test Task",
          amount: 100,
          guestName: "Test Guest",
          documentName: "Test Document",
          daysUntilExpiry: 7,
          expiryDate: new Date(Date.now() + 7 * 86400000).toISOString(),
          threshold: 80,
          pendingHours: 24,
          ...(req.body.testData || {}),
        },
      };

      await processTrigger(testEvent);

      const [latestRun] = await db.select().from(automationRuns)
        .where(eq(automationRuns.automationId, automation.id))
        .orderBy(desc(automationRuns.startedAt))
        .limit(1);

      res.json({ success: true, run: latestRun || null });
    } catch (error) {
      logger.error("Failed to test automation", { error });
      res.status(500).json({ error: "Failed to test automation" });
    }
  });

  router.post("/:id/pause", isAuthenticated, householdContextMiddleware, async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).householdId;
      if (!householdId) return res.status(400).json({ error: "Household context required" });

      const { until } = req.body;
      const pauseUntil = until ? new Date(until) : new Date(Date.now() + 86400000);

      const [updated] = await db.update(automations)
        .set({
          isPaused: true,
          pauseUntil,
          updatedAt: new Date(),
        })
        .where(and(
          eq(automations.id, req.params.id),
          eq(automations.householdId, householdId)
        ))
        .returning();

      if (!updated) return res.status(404).json({ error: "Automation not found" });
      res.json(updated);
    } catch (error) {
      logger.error("Failed to pause automation", { error });
      res.status(500).json({ error: "Failed to pause automation" });
    }
  });

  router.post("/:id/resume", isAuthenticated, householdContextMiddleware, async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).householdId;
      if (!householdId) return res.status(400).json({ error: "Household context required" });

      const [updated] = await db.update(automations)
        .set({
          isPaused: false,
          pauseUntil: null,
          updatedAt: new Date(),
        })
        .where(and(
          eq(automations.id, req.params.id),
          eq(automations.householdId, householdId)
        ))
        .returning();

      if (!updated) return res.status(404).json({ error: "Automation not found" });
      res.json(updated);
    } catch (error) {
      logger.error("Failed to resume automation", { error });
      res.status(500).json({ error: "Failed to resume automation" });
    }
  });
}
