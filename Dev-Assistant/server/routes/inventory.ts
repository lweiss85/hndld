import { Router, Request, Response } from "express";
import { db } from "../db";
import { inventoryItems, inventoryServiceHistory, vendors, applianceConsumables, householdConsumableTracking, householdDetails } from "@shared/schema";
import { eq, and, desc, gte, lte, sql, or, ilike, isNull } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import { addDays, differenceInDays, differenceInYears, format } from "date-fns";
import { generateAllPredictiveInsights } from "../services/predictive-maintenance";
import { getApplianceLifespanAnalytics } from "../services/aggregate-analytics";
import logger from "../lib/logger";

const router = Router();

router.get(
  "/inventory",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const { category, location, search, includeDisposed } = req.query;

      const conditions = [eq(inventoryItems.householdId, householdId)];

      if (!includeDisposed) {
        conditions.push(eq(inventoryItems.isActive, true));
      }

      if (category) {
        conditions.push(eq(inventoryItems.category, category as typeof inventoryItems.category.enumValues[number]));
      }

      if (location) {
        conditions.push(eq(inventoryItems.location, location as string));
      }

      let searchCondition;
      if (search) {
        searchCondition = or(
          ilike(inventoryItems.name, `%${search}%`),
          ilike(inventoryItems.brand, `%${search}%`),
          ilike(inventoryItems.model, `%${search}%`)
        );
      }

      const allConditions = searchCondition
        ? and(...conditions, searchCondition)
        : and(...conditions);

      const items = await db
        .select()
        .from(inventoryItems)
        .where(allConditions)
        .orderBy(desc(inventoryItems.updatedAt));

      res.json({ items });
    } catch (error: unknown) {
      logger.error("Failed to fetch inventory", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to fetch inventory" });
    }
  }
);

router.get(
  "/inventory/alerts/warranties",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const ninetyDaysFromNow = addDays(new Date(), 90);

      const [expiringSoon, expiredRecently] = await Promise.all([
        db
          .select()
          .from(inventoryItems)
          .where(
            and(
              eq(inventoryItems.householdId, householdId),
              eq(inventoryItems.isActive, true),
              gte(inventoryItems.warrantyExpires, new Date().toISOString().split("T")[0]),
              lte(inventoryItems.warrantyExpires, ninetyDaysFromNow.toISOString().split("T")[0])
            )
          )
          .orderBy(inventoryItems.warrantyExpires),
        db
          .select()
          .from(inventoryItems)
          .where(
            and(
              eq(inventoryItems.householdId, householdId),
              eq(inventoryItems.isActive, true),
              lte(inventoryItems.warrantyExpires, new Date().toISOString().split("T")[0]),
              gte(inventoryItems.warrantyExpires, addDays(new Date(), -30).toISOString().split("T")[0])
            )
          )
          .orderBy(desc(inventoryItems.warrantyExpires)),
      ]);

      res.json({
        expiringSoon: expiringSoon.map((item) => ({
          ...item,
          daysUntilExpiry: item.warrantyExpires
            ? differenceInDays(new Date(item.warrantyExpires), new Date())
            : null,
        })),
        expiredRecently,
      });
    } catch (error: unknown) {
      logger.error("Failed to fetch warranty alerts", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to fetch alerts" });
    }
  }
);

router.get(
  "/inventory/alerts/maintenance",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const thirtyDaysFromNow = addDays(new Date(), 30);

      const dueSoon = await db
        .select()
        .from(inventoryItems)
        .where(
          and(
            eq(inventoryItems.householdId, householdId),
            eq(inventoryItems.isActive, true),
            lte(inventoryItems.nextServiceDue, thirtyDaysFromNow.toISOString().split("T")[0])
          )
        )
        .orderBy(inventoryItems.nextServiceDue);

      res.json({
        dueSoon: dueSoon.map((item) => ({
          ...item,
          daysUntilDue: item.nextServiceDue
            ? differenceInDays(new Date(item.nextServiceDue), new Date())
            : null,
          isOverdue: item.nextServiceDue
            ? new Date(item.nextServiceDue) < new Date()
            : false,
        })),
      });
    } catch (error: unknown) {
      logger.error("Failed to fetch maintenance alerts", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to fetch alerts" });
    }
  }
);

router.get(
  "/inventory/insurance-summary",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;

      const items = await db
        .select({
          category: inventoryItems.category,
          totalValue: sql<number>`sum(${inventoryItems.insuredValue})`,
          count: sql<number>`count(*)`,
        })
        .from(inventoryItems)
        .where(
          and(
            eq(inventoryItems.householdId, householdId),
            eq(inventoryItems.isActive, true)
          )
        )
        .groupBy(inventoryItems.category);

      const totalValue = items.reduce((sum, cat) => sum + (cat.totalValue || 0), 0);

      res.json({
        byCategory: items,
        totalInsuredValue: totalValue,
      });
    } catch (error: unknown) {
      logger.error("Failed to fetch insurance summary", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to fetch summary" });
    }
  }
);

router.get(
  "/inventory/locations",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;

      const locations = await db
        .selectDistinct({ location: inventoryItems.location })
        .from(inventoryItems)
        .where(
          and(
            eq(inventoryItems.householdId, householdId),
            sql`${inventoryItems.location} IS NOT NULL`
          )
        );

      res.json({ locations: locations.map((l) => l.location).filter(Boolean) });
    } catch (error: unknown) {
      logger.error("Failed to fetch locations", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to fetch locations" });
    }
  }
);

const INDUSTRY_LIFESPANS: Record<string, number> = {
  "HVAC": 15, "APPLIANCE": 12, "PLUMBING": 12, "ELECTRICAL": 15, "OUTDOOR": 20,
};

router.get(
  "/inventory/predictions",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const predictions = await generateAllPredictiveInsights(householdId);
      res.json({
        predictions,
        meta: { count: predictions.length, generatedAt: new Date().toISOString() },
      });
    } catch (error: unknown) {
      logger.error("Failed to generate predictions", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to generate predictions" });
    }
  }
);

router.get(
  "/inventory/:id",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const { id } = req.params;

      const [item] = await db
        .select()
        .from(inventoryItems)
        .where(
          and(eq(inventoryItems.id, id), eq(inventoryItems.householdId, householdId))
        )
        .limit(1);

      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }

      const serviceHistory = await db
        .select({
          service: inventoryServiceHistory,
          vendor: vendors,
        })
        .from(inventoryServiceHistory)
        .leftJoin(vendors, eq(inventoryServiceHistory.vendorId, vendors.id))
        .where(eq(inventoryServiceHistory.itemId, id))
        .orderBy(desc(inventoryServiceHistory.serviceDate));

      res.json({ item, serviceHistory });
    } catch (error: unknown) {
      logger.error("Failed to fetch inventory item", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to fetch item" });
    }
  }
);

router.post(
  "/inventory",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const userId = req.user!.claims.sub;

      const [item] = await db
        .insert(inventoryItems)
        .values({
          ...req.body,
          householdId,
          createdBy: userId,
        })
        .returning();

      logger.info("Inventory item created", { itemId: item.id, householdId });

      res.status(201).json({ item });
    } catch (error: unknown) {
      logger.error("Failed to create inventory item", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to create item" });
    }
  }
);

router.patch(
  "/inventory/:id",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const { id } = req.params;

      const [item] = await db
        .update(inventoryItems)
        .set({ ...req.body, updatedAt: new Date() })
        .where(
          and(eq(inventoryItems.id, id), eq(inventoryItems.householdId, householdId))
        )
        .returning();

      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }

      res.json({ item });
    } catch (error: unknown) {
      logger.error("Failed to update inventory item", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to update item" });
    }
  }
);

router.post(
  "/inventory/:id/service",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const { id } = req.params;

      const [item] = await db
        .select()
        .from(inventoryItems)
        .where(
          and(eq(inventoryItems.id, id), eq(inventoryItems.householdId, householdId))
        )
        .limit(1);

      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }

      const [service] = await db
        .insert(inventoryServiceHistory)
        .values({
          ...req.body,
          itemId: id,
          householdId,
        })
        .returning();

      const nextDue = item.serviceIntervalDays
        ? addDays(new Date(req.body.serviceDate), item.serviceIntervalDays)
            .toISOString()
            .split("T")[0]
        : null;

      await db
        .update(inventoryItems)
        .set({
          lastServiceDate: req.body.serviceDate,
          nextServiceDue: nextDue,
          updatedAt: new Date(),
        })
        .where(eq(inventoryItems.id, id));

      const { captureInventoryEvent } = await import("../services/data-capture");
      const eventType = req.body.serviceType === "REPAIR" ? "REPAIR" : "ROUTINE_MAINTENANCE";
      captureInventoryEvent(id, eventType, {
        eventDate: req.body.serviceDate,
        eventDescription: req.body.description || req.body.notes || null,
        totalCostCents: req.body.cost ? Math.round(Number(req.body.cost) * 100) : null,
        vendorName: req.body.provider || null,
      }).catch(() => {});

      res.status(201).json({ service });
    } catch (error: unknown) {
      logger.error("Failed to add service record", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to add service record" });
    }
  }
);

router.get(
  "/inventory/:id/health",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const itemId = req.params.id;
      const now = new Date();

      const [item] = await db.select().from(inventoryItems)
        .where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.householdId, householdId)));

      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }

      const ageYears = item.purchaseDate
        ? differenceInYears(now, new Date(item.purchaseDate))
        : 0;

      let expectedLifespanYears = INDUSTRY_LIFESPANS[item.category] || 12;
      let networkComparison: { medianLifespan: number; reliabilityScore: number; brandRank: string } | null = null;

      try {
        const [detail] = await db.select().from(householdDetails)
          .where(eq(householdDetails.householdId, householdId)).limit(1);
        const analytics = await getApplianceLifespanAnalytics(item.category, {
          brand: item.brand || undefined,
          region: detail?.state || undefined,
        });
        if (analytics.data && analytics.metadata.meetsKAnonymity) {
          expectedLifespanYears = analytics.data.medianLifespanYears;
          const brandData = analytics.data.brandComparison?.find(b => b.brand === item.brand);
          networkComparison = {
            medianLifespan: analytics.data.medianLifespanYears,
            reliabilityScore: analytics.data.reliabilityScore,
            brandRank: brandData ? `${brandData.avgLifespan.toFixed(1)} yr avg (${brandData.sampleSize} units)` : "N/A",
          };
        }
      } catch {
        // use industry defaults
      }

      const lifespanPercentUsed = item.purchaseDate
        ? Math.round((ageYears / expectedLifespanYears) * 100)
        : 0;

      let riskLevel: "good" | "monitor" | "plan_replacement" | "replace_soon" = "good";
      if (lifespanPercentUsed > 100) riskLevel = "replace_soon";
      else if (lifespanPercentUsed > 80) riskLevel = "plan_replacement";
      else if (lifespanPercentUsed > 60) riskLevel = "monitor";

      const consumables = await db.select({
        tracking: householdConsumableTracking,
        consumable: applianceConsumables,
      }).from(householdConsumableTracking)
        .innerJoin(applianceConsumables, eq(householdConsumableTracking.consumableId, applianceConsumables.id))
        .where(and(
          eq(householdConsumableTracking.inventoryItemId, itemId),
          eq(householdConsumableTracking.householdId, householdId),
        ));

      const upcomingMaintenance = consumables
        .filter(c => c.tracking.nextDueDate)
        .map(c => ({
          name: c.consumable.consumableName,
          dueDate: c.tracking.nextDueDate!,
          daysUntil: differenceInDays(new Date(c.tracking.nextDueDate!), now),
        }))
        .sort((a, b) => a.daysUntil - b.daysUntil);

      const serviceHistory = await db.select().from(inventoryServiceHistory)
        .where(eq(inventoryServiceHistory.itemId, itemId));

      const totalCostCents = serviceHistory.reduce((sum, s) => sum + (s.cost || 0), 0);
      const lastService = serviceHistory.sort((a, b) =>
        new Date(b.serviceDate).getTime() - new Date(a.serviceDate).getTime()
      )[0];

      let warrantyStatus: "active" | "expiring_soon" | "expired" | "none" = "none";
      if (item.warrantyExpires) {
        const expiryDate = new Date(item.warrantyExpires);
        if (expiryDate < now) warrantyStatus = "expired";
        else if (differenceInDays(expiryDate, now) <= 90) warrantyStatus = "expiring_soon";
        else warrantyStatus = "active";
      }

      res.json({
        item,
        health: {
          ageYears,
          expectedLifespanYears,
          lifespanPercentUsed,
          riskLevel,
          networkComparison,
          upcomingMaintenance,
          serviceHistorySummary: {
            totalServices: serviceHistory.length,
            totalCostCents,
            lastServiceDate: lastService?.serviceDate || null,
          },
          warrantyStatus,
        },
      });
    } catch (error: unknown) {
      logger.error("Failed to get item health", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to get item health" });
    }
  }
);

router.get(
  "/inventory/:id/consumables",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const itemId = req.params.id;

      const [item] = await db.select().from(inventoryItems)
        .where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.householdId, householdId)));

      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }

      const tracked = await db.select({
        tracking: householdConsumableTracking,
        consumable: applianceConsumables,
      }).from(householdConsumableTracking)
        .innerJoin(applianceConsumables, eq(householdConsumableTracking.consumableId, applianceConsumables.id))
        .where(and(
          eq(householdConsumableTracking.inventoryItemId, itemId),
          eq(householdConsumableTracking.householdId, householdId),
        ));

      const trackedConsumableIds = new Set(tracked.map(t => t.consumable.id));

      const available = await db.select().from(applianceConsumables).where(
        and(
          eq(applianceConsumables.applianceCategory, item.category),
          eq(applianceConsumables.isActive, true),
          or(
            isNull(applianceConsumables.applianceBrand),
            item.brand ? eq(applianceConsumables.applianceBrand, item.brand) : sql`true`,
          ),
        )
      );

      const untracked = available.filter(c => !trackedConsumableIds.has(c.id));

      res.json({
        tracked: tracked.map(t => ({
          ...t.consumable,
          tracking: t.tracking,
        })),
        available: untracked,
      });
    } catch (error: unknown) {
      logger.error("Failed to get consumables", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to get consumables" });
    }
  }
);

router.post(
  "/inventory/:id/consumables/track",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const itemId = req.params.id;
      const { consumableId, lastReplacedDate, customIntervalDays } = req.body;

      if (!consumableId) {
        return res.status(400).json({ error: "consumableId is required" });
      }

      const [item] = await db.select().from(inventoryItems)
        .where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.householdId, householdId)));
      if (!item) return res.status(404).json({ error: "Item not found" });

      const [consumable] = await db.select().from(applianceConsumables)
        .where(eq(applianceConsumables.id, consumableId));
      if (!consumable) return res.status(404).json({ error: "Consumable not found" });

      const interval = customIntervalDays || consumable.defaultIntervalDays;
      const replacedDate = lastReplacedDate || format(new Date(), "yyyy-MM-dd");
      const nextDue = format(addDays(new Date(replacedDate), interval), "yyyy-MM-dd");

      const [tracking] = await db.insert(householdConsumableTracking).values({
        householdId,
        inventoryItemId: itemId,
        consumableId,
        lastReplacedDate: replacedDate,
        customIntervalDays: customIntervalDays || null,
        nextDueDate: nextDue,
      }).returning();

      res.status(201).json({ tracking });
    } catch (error: unknown) {
      logger.error("Failed to track consumable", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to track consumable" });
    }
  }
);

router.patch(
  "/inventory/consumables/tracking/:trackingId/replace",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const trackingId = req.params.trackingId;

      const [existing] = await db.select({
        tracking: householdConsumableTracking,
        consumable: applianceConsumables,
      }).from(householdConsumableTracking)
        .innerJoin(applianceConsumables, eq(householdConsumableTracking.consumableId, applianceConsumables.id))
        .where(and(
          eq(householdConsumableTracking.id, trackingId),
          eq(householdConsumableTracking.householdId, householdId),
        ));

      if (!existing) return res.status(404).json({ error: "Tracking record not found" });

      const todayStr = format(new Date(), "yyyy-MM-dd");
      const interval = existing.tracking.customIntervalDays || existing.consumable.defaultIntervalDays;
      const nextDue = format(addDays(new Date(), interval), "yyyy-MM-dd");

      const [updated] = await db.update(householdConsumableTracking)
        .set({ lastReplacedDate: todayStr, nextDueDate: nextDue, updatedAt: new Date() })
        .where(eq(householdConsumableTracking.id, trackingId))
        .returning();

      res.json({ tracking: updated });
    } catch (error: unknown) {
      logger.error("Failed to mark consumable replaced", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to mark consumable replaced" });
    }
  }
);

export function registerInventoryRoutes(app: Router) {
  app.use(router);
}
