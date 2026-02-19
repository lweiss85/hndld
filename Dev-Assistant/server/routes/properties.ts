import { Router, Request, Response } from "express";
import { db } from "../db";
import { properties, tasks, vendors, smartLocks } from "@shared/schema";
import { eq, and, desc, count, ne } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import { encryptVaultValue, decryptVaultValue } from "../services/vault-encryption";
import logger from "../lib/logger";

const router = Router();

router.get("/properties", isAuthenticated, householdContextMiddleware, async (req: Request, res: Response) => {
  try {
    const householdId = (req as any).householdId;
    if (!householdId) return res.status(400).json({ message: "No household context" });

    const householdProperties = await db.select().from(properties)
      .where(and(eq(properties.householdId, householdId), eq(properties.isActive, true)))
      .orderBy(desc(properties.isPrimary), properties.name);

    const propertiesWithCounts = await Promise.all(
      householdProperties.map(async (property) => {
        const [taskCount, vendorCount, lockCount] = await Promise.all([
          db.select({ count: count() }).from(tasks)
            .where(and(eq(tasks.householdId, householdId), eq(tasks.propertyId, property.id))),
          db.select({ count: count() }).from(vendors)
            .where(and(eq(vendors.householdId, householdId), eq(vendors.propertyId, property.id))),
          db.select({ count: count() }).from(smartLocks)
            .where(and(eq(smartLocks.householdId, householdId), eq(smartLocks.propertyId, property.id))),
        ]);

        return {
          ...property,
          alarmCode: property.alarmCode ? "••••••" : null,
          wifiPassword: property.wifiPassword ? "••••••" : null,
          counts: {
            tasks: taskCount[0]?.count || 0,
            vendors: vendorCount[0]?.count || 0,
            locks: lockCount[0]?.count || 0,
          },
        };
      })
    );

    res.json({ properties: propertiesWithCounts });
  } catch (error) {
    logger.error("[Properties] List error", { error });
    res.status(500).json({ message: "Failed to fetch properties" });
  }
});

router.get("/properties/:id", isAuthenticated, householdContextMiddleware, async (req: Request, res: Response) => {
  try {
    const householdId = (req as any).householdId;
    const includeSensitive = req.query.sensitive === "true";

    const [property] = await db.select().from(properties)
      .where(and(eq(properties.id, req.params.id), eq(properties.householdId, householdId)));

    if (!property) return res.status(404).json({ message: "Property not found" });

    if (includeSensitive) {
      return res.json({
        property: {
          ...property,
          alarmCode: property.alarmCode ? decryptVaultValue(property.alarmCode) : null,
          wifiPassword: property.wifiPassword ? decryptVaultValue(property.wifiPassword) : null,
        },
      });
    }

    res.json({
      property: {
        ...property,
        alarmCode: property.alarmCode ? "••••••" : null,
        wifiPassword: property.wifiPassword ? "••••••" : null,
      },
    });
  } catch (error) {
    logger.error("[Properties] Get error", { error });
    res.status(500).json({ message: "Failed to fetch property" });
  }
});

router.post("/properties", isAuthenticated, householdContextMiddleware, async (req: Request, res: Response) => {
  try {
    const householdId = (req as any).householdId;
    const userId = (req as any).user?.claims?.sub;
    const { alarmCode, wifiPassword, ...rest } = req.body;

    if (!rest.name || !rest.type) {
      return res.status(400).json({ message: "Name and type are required" });
    }

    if (rest.isPrimary) {
      await db.update(properties)
        .set({ isPrimary: false })
        .where(eq(properties.householdId, householdId));
    }

    const [property] = await db.insert(properties).values({
      ...rest,
      householdId,
      createdBy: userId || "system",
      alarmCode: alarmCode ? encryptVaultValue(alarmCode) : null,
      wifiPassword: wifiPassword ? encryptVaultValue(wifiPassword) : null,
    }).returning();

    logger.info("[Properties] Created", { propertyId: property.id, householdId });
    res.status(201).json({ property });
  } catch (error) {
    logger.error("[Properties] Create error", { error });
    res.status(500).json({ message: "Failed to create property" });
  }
});

router.patch("/properties/:id", isAuthenticated, householdContextMiddleware, async (req: Request, res: Response) => {
  try {
    const householdId = (req as any).householdId;
    const { alarmCode, wifiPassword, ...rest } = req.body;

    if (rest.isPrimary) {
      await db.update(properties)
        .set({ isPrimary: false })
        .where(and(eq(properties.householdId, householdId), ne(properties.id, req.params.id)));
    }

    const updates: Record<string, any> = {
      ...rest,
      updatedAt: new Date(),
    };

    if (alarmCode !== undefined) {
      updates.alarmCode = alarmCode ? encryptVaultValue(alarmCode) : null;
    }
    if (wifiPassword !== undefined) {
      updates.wifiPassword = wifiPassword ? encryptVaultValue(wifiPassword) : null;
    }

    const [property] = await db.update(properties)
      .set(updates)
      .where(and(eq(properties.id, req.params.id), eq(properties.householdId, householdId)))
      .returning();

    if (!property) return res.status(404).json({ message: "Property not found" });
    res.json({ property });
  } catch (error) {
    logger.error("[Properties] Update error", { error });
    res.status(500).json({ message: "Failed to update property" });
  }
});

router.delete("/properties/:id", isAuthenticated, householdContextMiddleware, async (req: Request, res: Response) => {
  try {
    const householdId = (req as any).householdId;

    const [property] = await db.update(properties)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(properties.id, req.params.id), eq(properties.householdId, householdId)))
      .returning();

    if (!property) return res.status(404).json({ message: "Property not found" });
    res.json({ success: true });
  } catch (error) {
    logger.error("[Properties] Delete error", { error });
    res.status(500).json({ message: "Failed to remove property" });
  }
});

router.post("/properties/:id/set-primary", isAuthenticated, householdContextMiddleware, async (req: Request, res: Response) => {
  try {
    const householdId = (req as any).householdId;

    await db.update(properties)
      .set({ isPrimary: false })
      .where(eq(properties.householdId, householdId));

    const [property] = await db.update(properties)
      .set({ isPrimary: true, updatedAt: new Date() })
      .where(and(eq(properties.id, req.params.id), eq(properties.householdId, householdId)))
      .returning();

    if (!property) return res.status(404).json({ message: "Property not found" });
    res.json({ property });
  } catch (error) {
    logger.error("[Properties] Set primary error", { error });
    res.status(500).json({ message: "Failed to set primary property" });
  }
});

export function registerPropertyRoutes(app: any) {
  app.use(router);
}
