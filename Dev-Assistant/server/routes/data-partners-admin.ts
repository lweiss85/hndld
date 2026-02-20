import { Router, Request, Response } from "express";
import { db } from "../db";
import { dataPartners, dataApiLogs } from "@shared/schema";
import { eq, and, gte, desc, count, avg, sql } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import bcrypt from "bcrypt";
import { subDays } from "date-fns";
import logger from "../lib/logger";
import { generateApiKey } from "./data-api";

const router = Router();

router.post(
  "/data-partners",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const {
        organizationName, organizationType, website,
        contactName, contactEmail, contactPhone,
        tier, ipWhitelist,
        requestsPerMinute, requestsPerHour, requestsPerDay, requestsPerMonth,
        monthlyBaseFee, perRequestFee,
        contractStartDate, contractEndDate,
      } = req.body;

      if (!organizationName || !contactEmail) {
        return res.status(400).json({ error: "Organization name and contact email are required" });
      }

      const { key, prefix, suffix } = generateApiKey();
      const apiKeyHash = await bcrypt.hash(key, 12);

      const [partner] = await db.insert(dataPartners).values({
        organizationName,
        organizationType: organizationType || null,
        website: website || null,
        contactName: contactName || null,
        contactEmail,
        contactPhone: contactPhone || null,
        tier: tier || "TRIAL",
        status: "PENDING_APPROVAL",
        apiKeyHash,
        apiKeyPrefix: prefix,
        apiKeySuffix: suffix,
        ipWhitelist: ipWhitelist || null,
        requestsPerMinute: requestsPerMinute || 30,
        requestsPerHour: requestsPerHour || 500,
        requestsPerDay: requestsPerDay || 5000,
        requestsPerMonth: requestsPerMonth || 50000,
        monthlyBaseFee: monthlyBaseFee || 0,
        perRequestFee: perRequestFee || 0,
        contractStartDate: contractStartDate || null,
        contractEndDate: contractEndDate || null,
        allowedEndpoints: [],
      }).returning();

      logger.info("Data partner created", { partnerId: partner.id, organizationName });

      res.status(201).json({
        partner: { ...partner, apiKeyHash: undefined, secondaryApiKeyHash: undefined },
        apiKey: key,
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

router.post(
  "/data-partners/:id/approve",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const [partner] = await db.update(dataPartners)
        .set({ status: "ACTIVE", updatedAt: new Date() })
        .where(and(
          eq(dataPartners.id, id),
          eq(dataPartners.status, "PENDING_APPROVAL")
        ))
        .returning();

      if (!partner) {
        return res.status(404).json({ error: "Partner not found or not pending approval" });
      }

      logger.info("Data partner approved", { partnerId: id });

      res.json({ partner: { ...partner, apiKeyHash: undefined, secondaryApiKeyHash: undefined } });
    } catch (error: unknown) {
      logger.error("Failed to approve data partner", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to approve partner" });
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
        organizationName: dataPartners.organizationName,
        organizationType: dataPartners.organizationType,
        contactEmail: dataPartners.contactEmail,
        tier: dataPartners.tier,
        status: dataPartners.status,
        apiKeyPrefix: dataPartners.apiKeyPrefix,
        apiKeySuffix: dataPartners.apiKeySuffix,
        currentMonthUsage: dataPartners.currentMonthUsage,
        currentDayUsage: dataPartners.currentDayUsage,
        requestsPerMonth: dataPartners.requestsPerMonth,
        requestsPerDay: dataPartners.requestsPerDay,
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
      const {
        tier, status,
        requestsPerMinute, requestsPerHour, requestsPerDay, requestsPerMonth,
        allowedEndpoints, allowedRegions, allowedCategories,
        ipWhitelist,
        monthlyBaseFee, perRequestFee,
        stripeCustomerId, stripeSubscriptionId,
        contractStartDate, contractEndDate,
      } = req.body;

      const updates: Record<string, unknown> = { updatedAt: new Date() };

      if (tier !== undefined) updates.tier = tier;
      if (status !== undefined) updates.status = status;
      if (requestsPerMinute !== undefined) updates.requestsPerMinute = requestsPerMinute;
      if (requestsPerHour !== undefined) updates.requestsPerHour = requestsPerHour;
      if (requestsPerDay !== undefined) updates.requestsPerDay = requestsPerDay;
      if (requestsPerMonth !== undefined) updates.requestsPerMonth = requestsPerMonth;
      if (allowedEndpoints !== undefined) updates.allowedEndpoints = allowedEndpoints;
      if (allowedRegions !== undefined) updates.allowedRegions = allowedRegions;
      if (allowedCategories !== undefined) updates.allowedCategories = allowedCategories;
      if (ipWhitelist !== undefined) updates.ipWhitelist = ipWhitelist;
      if (monthlyBaseFee !== undefined) updates.monthlyBaseFee = monthlyBaseFee;
      if (perRequestFee !== undefined) updates.perRequestFee = perRequestFee;
      if (stripeCustomerId !== undefined) updates.stripeCustomerId = stripeCustomerId;
      if (stripeSubscriptionId !== undefined) updates.stripeSubscriptionId = stripeSubscriptionId;
      if (contractStartDate !== undefined) updates.contractStartDate = contractStartDate;
      if (contractEndDate !== undefined) updates.contractEndDate = contractEndDate;

      const [partner] = await db.update(dataPartners)
        .set(updates)
        .where(eq(dataPartners.id, id))
        .returning();

      if (!partner) {
        return res.status(404).json({ error: "Partner not found" });
      }

      logger.info("Data partner updated", { partnerId: id });

      res.json({ partner: { ...partner, apiKeyHash: undefined, secondaryApiKeyHash: undefined } });
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

      const [existing] = await db.select().from(dataPartners)
        .where(eq(dataPartners.id, id)).limit(1);

      if (!existing) {
        return res.status(404).json({ error: "Partner not found" });
      }

      const { key, prefix, suffix } = generateApiKey();
      const newHash = await bcrypt.hash(key, 12);

      const [partner] = await db.update(dataPartners)
        .set({
          secondaryApiKeyHash: existing.apiKeyHash,
          secondaryApiKeyPrefix: existing.apiKeyPrefix,
          apiKeyHash: newHash,
          apiKeyPrefix: prefix,
          apiKeySuffix: suffix,
          updatedAt: new Date(),
        })
        .where(eq(dataPartners.id, id))
        .returning();

      logger.info("Data partner API key rotated", { partnerId: id });

      res.json({
        partner: { ...partner, apiKeyHash: undefined, secondaryApiKeyHash: undefined },
        apiKey: key,
        warning: "Save this new API key securely. The previous key will continue working temporarily for rotation.",
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
