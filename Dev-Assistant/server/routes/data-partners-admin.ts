import { Router, Request, Response } from "express";
import { db } from "../db";
import { dataPartners, dataApiLogs } from "@shared/schema";
import { eq, and, gte, desc, count, avg, sql } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { subDays } from "date-fns";
import logger from "../lib/logger";

const router = Router();

router.post(
  "/data-partners",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { name, companyName, contactEmail, contactName, tier, monthlyRequestLimit, dailyRequestLimit } = req.body;

      if (!name || !contactEmail) {
        return res.status(400).json({ error: "Name and contact email are required" });
      }

      const apiKey = `hndld_data_${crypto.randomBytes(32).toString("hex")}`;
      const apiKeyPrefix = apiKey.substring(0, 8);
      const apiKeyHash = await bcrypt.hash(apiKey, 10);

      const [partner] = await db.insert(dataPartners).values({
        name,
        companyName: companyName || null,
        contactEmail,
        contactName: contactName || null,
        tier: tier || "BASIC",
        apiKeyHash,
        apiKeyPrefix,
        monthlyRequestLimit: monthlyRequestLimit || 1000,
        dailyRequestLimit: dailyRequestLimit || 100,
        allowedEndpoints: [],
        activatedAt: new Date(),
      }).returning();

      logger.info("Data partner created", { partnerId: partner.id, name });

      res.status(201).json({
        partner: { ...partner, apiKeyHash: undefined },
        apiKey,
        warning: "Save this API key securely. It cannot be retrieved again.",
      });
    } catch (error: unknown) {
      logger.error("Failed to create data partner", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to create partner" });
    }
  }
);

router.get(
  "/data-partners",
  isAuthenticated,
  householdContextMiddleware,
  async (_req: Request, res: Response) => {
    try {
      const partners = await db.select({
        id: dataPartners.id,
        name: dataPartners.name,
        companyName: dataPartners.companyName,
        contactEmail: dataPartners.contactEmail,
        tier: dataPartners.tier,
        isActive: dataPartners.isActive,
        currentMonthUsage: dataPartners.currentMonthUsage,
        currentDayUsage: dataPartners.currentDayUsage,
        monthlyRequestLimit: dataPartners.monthlyRequestLimit,
        dailyRequestLimit: dataPartners.dailyRequestLimit,
        contractStartDate: dataPartners.contractStartDate,
        contractEndDate: dataPartners.contractEndDate,
        createdAt: dataPartners.createdAt,
      }).from(dataPartners).orderBy(desc(dataPartners.createdAt));

      res.json({ partners });
    } catch (error: unknown) {
      logger.error("Failed to list data partners", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to list partners" });
    }
  }
);

router.get(
  "/data-partners/:id/usage",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const days = Number(req.query.days || 30);
      const since = subDays(new Date(), days);

      const usage = await db.select({
        date: sql<string>`DATE(${dataApiLogs.createdAt})`,
        endpoint: dataApiLogs.endpoint,
        requests: count(),
        avgResponseTime: avg(dataApiLogs.responseTimeMs),
      })
        .from(dataApiLogs)
        .where(and(
          eq(dataApiLogs.partnerId, id),
          gte(dataApiLogs.createdAt, since)
        ))
        .groupBy(sql`DATE(${dataApiLogs.createdAt})`, dataApiLogs.endpoint)
        .orderBy(desc(sql`DATE(${dataApiLogs.createdAt})`));

      const totals = await db.select({
        totalRequests: count(),
        avgResponseTime: avg(dataApiLogs.responseTimeMs),
      })
        .from(dataApiLogs)
        .where(and(
          eq(dataApiLogs.partnerId, id),
          gte(dataApiLogs.createdAt, since)
        ));

      res.json({
        usage,
        totals: {
          totalRequests: Number(totals[0]?.totalRequests || 0),
          avgResponseTimeMs: Math.round(Number(totals[0]?.avgResponseTime || 0)),
        },
        period: { days, since: since.toISOString() },
      });
    } catch (error: unknown) {
      logger.error("Failed to fetch partner usage", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to fetch usage" });
    }
  }
);

router.patch(
  "/data-partners/:id",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { tier, monthlyRequestLimit, dailyRequestLimit, isActive, allowedEndpoints, allowedRegions, allowedCategories, deactivationReason } = req.body;

      const updates: Record<string, unknown> = { updatedAt: new Date() };

      if (tier !== undefined) updates.tier = tier;
      if (monthlyRequestLimit !== undefined) updates.monthlyRequestLimit = monthlyRequestLimit;
      if (dailyRequestLimit !== undefined) updates.dailyRequestLimit = dailyRequestLimit;
      if (allowedEndpoints !== undefined) updates.allowedEndpoints = allowedEndpoints;
      if (allowedRegions !== undefined) updates.allowedRegions = allowedRegions;
      if (allowedCategories !== undefined) updates.allowedCategories = allowedCategories;

      if (isActive === false) {
        updates.isActive = false;
        updates.deactivatedAt = new Date();
        updates.deactivationReason = deactivationReason || "Deactivated by admin";
      } else if (isActive === true) {
        updates.isActive = true;
        updates.deactivatedAt = null;
        updates.deactivationReason = null;
        updates.activatedAt = new Date();
      }

      const [partner] = await db.update(dataPartners)
        .set(updates)
        .where(eq(dataPartners.id, id))
        .returning();

      if (!partner) {
        return res.status(404).json({ error: "Partner not found" });
      }

      logger.info("Data partner updated", { partnerId: id });

      res.json({ partner: { ...partner, apiKeyHash: undefined } });
    } catch (error: unknown) {
      logger.error("Failed to update data partner", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to update partner" });
    }
  }
);

router.post(
  "/data-partners/:id/rotate-key",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const apiKey = `hndld_data_${crypto.randomBytes(32).toString("hex")}`;
      const apiKeyPrefix = apiKey.substring(0, 8);
      const apiKeyHash = await bcrypt.hash(apiKey, 10);

      const [partner] = await db.update(dataPartners)
        .set({ apiKeyHash, apiKeyPrefix, updatedAt: new Date() })
        .where(eq(dataPartners.id, id))
        .returning();

      if (!partner) {
        return res.status(404).json({ error: "Partner not found" });
      }

      logger.info("Data partner API key rotated", { partnerId: id });

      res.json({
        partner: { ...partner, apiKeyHash: undefined },
        apiKey,
        warning: "Save this new API key securely. The old key is now invalid.",
      });
    } catch (error: unknown) {
      logger.error("Failed to rotate partner key", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to rotate key" });
    }
  }
);

export function registerDataPartnersAdminRoutes(app: Router) {
  app.use(router);
}
