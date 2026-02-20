import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db";
import { dataPartners, dataApiLogs } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcrypt";
import {
  getApplianceLifespan,
  getVendorPricingBenchmarks,
  getMaintenanceCostBenchmarks,
  getSeasonalDemandPatterns,
  getServiceQualityBenchmarks,
  getHomeOperatingCostBenchmarks,
} from "../services/aggregate-analytics";
import logger from "../lib/logger";
import type { DataPartner } from "@shared/schema";

interface DataApiRequest extends Request {
  dataPartner?: DataPartner;
  requestStartTime?: number;
}

async function authenticateDataPartner(req: DataApiRequest, res: Response, next: NextFunction) {
  const startTime = Date.now();
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid API key" });
  }

  const apiKey = authHeader.substring(7);
  const apiKeyPrefix = apiKey.substring(0, 8);

  try {
    const [partner] = await db.select().from(dataPartners)
      .where(and(
        eq(dataPartners.apiKeyPrefix, apiKeyPrefix),
        eq(dataPartners.isActive, true)
      ))
      .limit(1);

    if (!partner) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    const isValid = await bcrypt.compare(apiKey, partner.apiKeyHash);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    const today = new Date().toISOString().split("T")[0];
    if (partner.usageResetDate?.toString() !== today) {
      await db.update(dataPartners)
        .set({ currentDayUsage: 0, usageResetDate: today })
        .where(eq(dataPartners.id, partner.id));
      partner.currentDayUsage = 0;
    }

    if ((partner.currentDayUsage ?? 0) >= (partner.dailyRequestLimit ?? 100)) {
      return res.status(429).json({ error: "Daily request limit exceeded" });
    }

    if ((partner.currentMonthUsage ?? 0) >= (partner.monthlyRequestLimit ?? 1000)) {
      return res.status(429).json({ error: "Monthly request limit exceeded" });
    }

    const endpoint = req.path;
    const allowed = partner.allowedEndpoints || [];
    if (allowed.length > 0 && !allowed.some(e => endpoint.startsWith(e))) {
      return res.status(403).json({ error: "Endpoint not allowed for your tier" });
    }

    req.dataPartner = partner;
    req.requestStartTime = startTime;

    next();
  } catch (error: unknown) {
    logger.error("Data API authentication error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "Authentication failed" });
  }
}

function logDataApiRequest(req: DataApiRequest, res: Response, resultCount: number) {
  const partner = req.dataPartner;
  const startTime = req.requestStartTime;

  if (!partner) return;

  const responseTimeMs = startTime ? Date.now() - startTime : 0;

  db.update(dataPartners)
    .set({
      currentDayUsage: (partner.currentDayUsage ?? 0) + 1,
      currentMonthUsage: (partner.currentMonthUsage ?? 0) + 1,
    })
    .where(eq(dataPartners.id, partner.id))
    .catch((err: unknown) => logger.error("Failed to update usage", {
      error: err instanceof Error ? err.message : String(err),
    }));

  db.insert(dataApiLogs)
    .values({
      partnerId: partner.id,
      endpoint: req.path,
      method: req.method,
      queryParams: req.query as Record<string, unknown>,
      responseStatus: res.statusCode,
      responseTimeMs,
      resultCount,
      ipAddress: req.ip || null,
      userAgent: req.headers["user-agent"] || null,
    })
    .catch((err: unknown) => logger.error("Failed to log API request", {
      error: err instanceof Error ? err.message : String(err),
    }));
}

const router = Router();

router.use(authenticateDataPartner as unknown as (req: Request, res: Response, next: NextFunction) => void);

router.get("/appliance-lifespan", async (req: DataApiRequest, res: Response) => {
  try {
    const { category, brand, model } = req.query;

    if (!category) {
      return res.status(400).json({ error: "category is required" });
    }

    const result = await getApplianceLifespan(
      category as string,
      brand as string | undefined,
      model as string | undefined
    );

    if (!result.meetsMinimumThreshold) {
      logDataApiRequest(req, res, 0);
      return res.status(404).json({
        error: "Insufficient data",
        message: "Not enough records to provide anonymized results",
        sampleSize: result.sampleSize,
        minimumRequired: 10,
      });
    }

    logDataApiRequest(req, res, result.sampleSize);
    res.json(result);
  } catch (error: unknown) {
    logger.error("Appliance lifespan API error", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/vendor-pricing", async (req: DataApiRequest, res: Response) => {
  try {
    const { serviceCategory, region, priceType } = req.query;

    if (!serviceCategory) {
      return res.status(400).json({ error: "serviceCategory is required" });
    }

    const partner = req.dataPartner;
    const allowedRegions = partner?.allowedRegions || [];
    if (allowedRegions.length > 0 && region && !allowedRegions.includes(region as string)) {
      return res.status(403).json({ error: "Region not allowed for your tier" });
    }

    const result = await getVendorPricingBenchmarks(
      serviceCategory as string,
      region as string | undefined,
      priceType as string | undefined
    );

    if (!result.meetsMinimumThreshold) {
      logDataApiRequest(req, res, 0);
      return res.status(404).json({ error: "Insufficient data", sampleSize: result.sampleSize });
    }

    logDataApiRequest(req, res, result.sampleSize);
    res.json(result);
  } catch (error: unknown) {
    logger.error("Vendor pricing API error", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/maintenance-costs", async (req: DataApiRequest, res: Response) => {
  try {
    const { category, region, homeType } = req.query;

    if (!category) {
      return res.status(400).json({ error: "category is required" });
    }

    const result = await getMaintenanceCostBenchmarks(
      category as string,
      region as string | undefined,
      homeType as string | undefined
    );

    logDataApiRequest(req, res, result.sampleSize);

    if (!result.meetsMinimumThreshold) {
      return res.status(404).json({ error: "Insufficient data" });
    }

    res.json(result);
  } catch (error: unknown) {
    logger.error("Maintenance costs API error", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/seasonal-demand", async (req: DataApiRequest, res: Response) => {
  try {
    const { serviceCategory, region } = req.query;

    if (!serviceCategory) {
      return res.status(400).json({ error: "serviceCategory is required" });
    }

    const result = await getSeasonalDemandPatterns(
      serviceCategory as string,
      region as string | undefined
    );

    logDataApiRequest(req, res, result.sampleSize);
    res.json(result);
  } catch (error: unknown) {
    logger.error("Seasonal demand API error", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/service-quality", async (req: DataApiRequest, res: Response) => {
  try {
    const { serviceCategory, region } = req.query;

    if (!serviceCategory) {
      return res.status(400).json({ error: "serviceCategory is required" });
    }

    const result = await getServiceQualityBenchmarks(
      serviceCategory as string,
      region as string | undefined
    );

    logDataApiRequest(req, res, result.sampleSize);

    if (!result.meetsMinimumThreshold) {
      return res.status(404).json({ error: "Insufficient data" });
    }

    res.json(result);
  } catch (error: unknown) {
    logger.error("Service quality API error", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/home-operating-costs", async (req: DataApiRequest, res: Response) => {
  try {
    const { region, homeType, sqftMin, sqftMax } = req.query;

    if (!region) {
      return res.status(400).json({ error: "region is required" });
    }

    const result = await getHomeOperatingCostBenchmarks(
      region as string,
      homeType as string | undefined,
      sqftMin && sqftMax ? { min: Number(sqftMin), max: Number(sqftMax) } : undefined
    );

    logDataApiRequest(req, res, result.sampleSize);

    if (!result.meetsMinimumThreshold) {
      return res.status(404).json({ error: "Insufficient data" });
    }

    res.json(result);
  } catch (error: unknown) {
    logger.error("Home operating costs API error", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

export function registerDataApiRoutes(app: Router) {
  app.use("/data/v1", router);
}
