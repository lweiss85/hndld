import { Router, Request, Response } from "express";
import { db } from "../db";
import { budgets, budgetAlerts, spendingItems, notifications, userProfiles } from "@shared/schema";
import { eq, and, gte, lte, desc, sql, between } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import logger from "../lib/logger";

const router = Router();

function getPeriodDates(period: string, startDate: string): { periodStart: Date; periodEnd: Date } {
  const start = new Date(startDate);
  const now = new Date();

  let periodStart = new Date(start);
  let periodEnd: Date;

  if (period === "monthly") {
    periodStart = new Date(now.getFullYear(), now.getMonth(), start.getDate());
    if (periodStart > now) {
      periodStart.setMonth(periodStart.getMonth() - 1);
    }
    periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    periodEnd.setDate(periodEnd.getDate() - 1);
  } else if (period === "quarterly") {
    const currentQuarter = Math.floor(now.getMonth() / 3);
    periodStart = new Date(now.getFullYear(), currentQuarter * 3, 1);
    periodEnd = new Date(now.getFullYear(), (currentQuarter + 1) * 3, 0);
  } else {
    periodStart = new Date(now.getFullYear(), 0, 1);
    periodEnd = new Date(now.getFullYear(), 11, 31);
  }

  return { periodStart, periodEnd };
}

router.get(
  "/budgets",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).householdId;
      const rows = await db.select().from(budgets)
        .where(and(eq(budgets.householdId, householdId), eq(budgets.isActive, true)))
        .orderBy(budgets.category);
      res.json(rows);
    } catch (err) {
      logger.error("[Budgets] List failed", { error: (err as Error).message });
      res.status(500).json({ error: "Failed to fetch budgets" });
    }
  }
);

router.get(
  "/budgets/status",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).householdId;
      const activeBudgets = await db.select().from(budgets)
        .where(and(eq(budgets.householdId, householdId), eq(budgets.isActive, true)));

      const result = [];
      for (const budget of activeBudgets) {
        const { periodStart, periodEnd } = getPeriodDates(budget.period, budget.startDate);

        const [spentRow] = await db.select({
          total: sql<number>`COALESCE(SUM(${spendingItems.amount}), 0)`,
        }).from(spendingItems).where(
          and(
            eq(spendingItems.householdId, householdId),
            eq(spendingItems.category, budget.category),
            gte(spendingItems.date, periodStart),
            lte(spendingItems.date, periodEnd),
          )
        );

        const spentCents = Number(spentRow?.total ?? 0);
        const percentUsed = budget.budgetAmountCents > 0
          ? Math.round((spentCents / budget.budgetAmountCents) * 100)
          : 0;

        result.push({
          ...budget,
          spentCents,
          remainingCents: budget.budgetAmountCents - spentCents,
          percentUsed,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        });
      }

      res.json(result);
    } catch (err) {
      logger.error("[Budgets] Status failed", { error: (err as Error).message });
      res.status(500).json({ error: "Failed to fetch budget status" });
    }
  }
);

router.get(
  "/budgets/:category/history",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).householdId;
      const { category } = req.params;
      const months = parseInt(req.query.months as string) || 6;

      const history = [];
      const now = new Date();
      for (let i = months - 1; i >= 0; i--) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);

        const [spentRow] = await db.select({
          total: sql<number>`COALESCE(SUM(${spendingItems.amount}), 0)`,
        }).from(spendingItems).where(
          and(
            eq(spendingItems.householdId, householdId),
            eq(spendingItems.category, category),
            gte(spendingItems.date, monthStart),
            lte(spendingItems.date, monthEnd),
          )
        );

        history.push({
          month: monthStart.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
          spentCents: Number(spentRow?.total ?? 0),
        });
      }

      const [budgetRow] = await db.select().from(budgets)
        .where(and(
          eq(budgets.householdId, householdId),
          eq(budgets.category, category),
          eq(budgets.isActive, true),
        ));

      res.json({
        category,
        budgetAmountCents: budgetRow?.budgetAmountCents ?? null,
        period: budgetRow?.period ?? null,
        history,
      });
    } catch (err) {
      logger.error("[Budgets] History failed", { error: (err as Error).message });
      res.status(500).json({ error: "Failed to fetch budget history" });
    }
  }
);

router.post(
  "/budgets",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).householdId;
      const { category, budgetAmountCents, period, startDate, endDate, alertThreshold, notes } = req.body;

      if (!category || !budgetAmountCents || !period || !startDate) {
        return res.status(400).json({ error: "category, budgetAmountCents, period, and startDate are required" });
      }

      const [row] = await db.insert(budgets).values({
        householdId,
        category,
        budgetAmountCents: Number(budgetAmountCents),
        period,
        startDate,
        endDate: endDate || null,
        alertThreshold: alertThreshold != null ? Number(alertThreshold) : 80,
        notes: notes || null,
      }).returning();

      res.status(201).json(row);
    } catch (err) {
      logger.error("[Budgets] Create failed", { error: (err as Error).message });
      res.status(500).json({ error: "Failed to create budget" });
    }
  }
);

router.patch(
  "/budgets/:id",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).householdId;
      const { id } = req.params;

      const [existing] = await db.select().from(budgets)
        .where(and(eq(budgets.id, id), eq(budgets.householdId, householdId)));
      if (!existing) return res.status(404).json({ error: "Budget not found" });

      const updates: any = { updatedAt: new Date() };
      if (req.body.budgetAmountCents != null) updates.budgetAmountCents = Number(req.body.budgetAmountCents);
      if (req.body.alertThreshold != null) updates.alertThreshold = Number(req.body.alertThreshold);
      if (req.body.period) updates.period = req.body.period;
      if (req.body.endDate !== undefined) updates.endDate = req.body.endDate || null;
      if (req.body.notes !== undefined) updates.notes = req.body.notes || null;
      if (req.body.isActive !== undefined) updates.isActive = req.body.isActive;

      const [row] = await db.update(budgets).set(updates)
        .where(eq(budgets.id, id)).returning();

      res.json(row);
    } catch (err) {
      logger.error("[Budgets] Update failed", { error: (err as Error).message });
      res.status(500).json({ error: "Failed to update budget" });
    }
  }
);

router.delete(
  "/budgets/:id",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).householdId;
      const { id } = req.params;

      const [existing] = await db.select().from(budgets)
        .where(and(eq(budgets.id, id), eq(budgets.householdId, householdId)));
      if (!existing) return res.status(404).json({ error: "Budget not found" });

      await db.update(budgets).set({ isActive: false, updatedAt: new Date() })
        .where(eq(budgets.id, id));

      res.json({ success: true });
    } catch (err) {
      logger.error("[Budgets] Delete failed", { error: (err as Error).message });
      res.status(500).json({ error: "Failed to delete budget" });
    }
  }
);

router.get(
  "/budgets/alerts",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = (req as any).householdId;
      const rows = await db.select().from(budgetAlerts)
        .where(eq(budgetAlerts.householdId, householdId))
        .orderBy(desc(budgetAlerts.sentAt))
        .limit(50);
      res.json(rows);
    } catch (err) {
      logger.error("[Budgets] Alerts list failed", { error: (err as Error).message });
      res.status(500).json({ error: "Failed to fetch alerts" });
    }
  }
);

router.patch(
  "/budgets/alerts/:id/acknowledge",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const [row] = await db.update(budgetAlerts)
        .set({ acknowledged: true })
        .where(eq(budgetAlerts.id, id))
        .returning();
      res.json(row);
    } catch (err) {
      logger.error("[Budgets] Acknowledge alert failed", { error: (err as Error).message });
      res.status(500).json({ error: "Failed to acknowledge alert" });
    }
  }
);

export async function processBudgetAlerts(): Promise<void> {
  const activeBudgets = await db.select().from(budgets)
    .where(eq(budgets.isActive, true));

  let alertCount = 0;

  for (const budget of activeBudgets) {
    const { periodStart, periodEnd } = getPeriodDates(budget.period, budget.startDate);

    const [spentRow] = await db.select({
      total: sql<number>`COALESCE(SUM(${spendingItems.amount}), 0)`,
    }).from(spendingItems).where(
      and(
        eq(spendingItems.householdId, budget.householdId),
        eq(spendingItems.category, budget.category),
        gte(spendingItems.date, periodStart),
        lte(spendingItems.date, periodEnd),
      )
    );

    const spentCents = Number(spentRow?.total ?? 0);
    const percentUsed = budget.budgetAmountCents > 0
      ? Math.round((spentCents / budget.budgetAmountCents) * 100)
      : 0;

    const threshold = budget.alertThreshold ?? 80;
    if (percentUsed < threshold) continue;

    const existingAlerts = await db.select().from(budgetAlerts)
      .where(and(
        eq(budgetAlerts.budgetId, budget.id),
        gte(budgetAlerts.sentAt, periodStart),
      ));

    const alreadySentForThreshold = existingAlerts.some(
      a => a.thresholdPercent === threshold && a.actualPercent >= percentUsed - 5
    );
    if (alreadySentForThreshold) continue;

    await db.insert(budgetAlerts).values({
      budgetId: budget.id,
      householdId: budget.householdId,
      thresholdPercent: threshold,
      actualPercent: percentUsed,
    });

    const householdMembers = await db.select().from(userProfiles)
      .where(eq(userProfiles.householdId, budget.householdId));

    const overLabel = percentUsed >= 100
      ? `over budget (${percentUsed}%)`
      : `at ${percentUsed}% of budget`;

    for (const member of householdMembers) {
      await db.insert(notifications).values({
        householdId: budget.householdId,
        userId: member.userId,
        type: "DAILY_DIGEST",
        title: `${budget.category} spending ${overLabel}`,
        body: `$${(spentCents / 100).toFixed(2)} spent of $${(budget.budgetAmountCents / 100).toFixed(2)} ${budget.period} budget for ${budget.category}.`,
        linkUrl: "/budgets",
      });
    }

    alertCount++;
  }

  if (alertCount > 0) {
    logger.info("[BudgetAlerts] Processed budget threshold alerts", { alertCount });
  }
}

export function registerBudgetRoutes(app: Router) {
  app.use(router);
}
