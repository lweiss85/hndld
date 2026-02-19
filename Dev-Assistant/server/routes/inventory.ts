import { Router, Request, Response } from "express";
import { db } from "../db";
import { inventoryItems, inventoryServiceHistory, vendors } from "@shared/schema";
import { eq, and, desc, gte, lte, sql, or, ilike } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import { addDays, differenceInDays } from "date-fns";
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

      res.status(201).json({ service });
    } catch (error: unknown) {
      logger.error("Failed to add service record", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to add service record" });
    }
  }
);

export function registerInventoryRoutes(app: Router) {
  app.use(router);
}
