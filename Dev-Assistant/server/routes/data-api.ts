import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db";
import { dataPartners, dataApiLogs } from "@shared/schema";
import { eq, and, or, sql } from "drizzle-orm";
import bcrypt from "bcrypt";
import crypto from "crypto";
import {
  getApplianceLifespanAnalytics,
  getVendorPricingBenchmarks,
  getMaintenanceCostBenchmarks,
  getSeasonalDemandPatterns,
  getServiceQualityBenchmarks,
  getHomeOperatingCostBenchmarks,
} from "../services/aggregate-analytics";
import logger from "../lib/logger";
import type { DataPartner } from "@shared/schema";

const TIER_CONFIG: Record<string, { endpoints: string[]; maxResultsPerRequest: number }> = {
  TRIAL: {
    endpoints: ["/appliance-lifespan", "/vendor-pricing"],
    maxResultsPerRequest: 100,
  },
  BASIC: {
    endpoints: ["/appliance-lifespan", "/vendor-pricing", "/service-quality"],
    maxResultsPerRequest: 500,
  },
  PROFESSIONAL: {
    endpoints: ["/appliance-lifespan", "/vendor-pricing", "/service-quality", "/home-operating-costs", "/seasonal-demand"],
    maxResultsPerRequest: 2000,
  },
  ENTERPRISE: {
    endpoints: ["*"],
    maxResultsPerRequest: 10000,
  },
  RESEARCH: {
    endpoints: ["*"],
    maxResultsPerRequest: 50000,
  },
};

interface DataApiRequest extends Request {
  dataPartner?: DataPartner;
  requestStartTime?: number;
  dataRequestId?: string;
}

function generateApiKey() {
  const key = `hndld_data_${crypto.randomBytes(32).toString("hex")}`;
  return {
    key,
    prefix: key.substring(0, 12),
    suffix: key.substring(key.length - 4),
  };
}

async function checkAndUpdateRateLimits(partner: DataPartner): Promise<{ allowed: boolean; message?: string; retryAfter?: number }> {
  const now = new Date();
  const nowMs = now.getTime();

  const result = await db.execute(sql`
    UPDATE data_partners SET
      minute_reset_at = CASE 
        WHEN minute_reset_at IS NULL OR EXTRACT(EPOCH FROM (${now}::timestamp - minute_reset_at)) * 1000 >= 60000 
        THEN ${now}::timestamp ELSE minute_reset_at END,
      current_minute_usage = CASE 
        WHEN minute_reset_at IS NULL OR EXTRACT(EPOCH FROM (${now}::timestamp - minute_reset_at)) * 1000 >= 60000 
        THEN 1 ELSE current_minute_usage + 1 END,
      hour_reset_at = CASE 
        WHEN hour_reset_at IS NULL OR EXTRACT(EPOCH FROM (${now}::timestamp - hour_reset_at)) * 1000 >= 3600000 
        THEN ${now}::timestamp ELSE hour_reset_at END,
      current_hour_usage = CASE 
        WHEN hour_reset_at IS NULL OR EXTRACT(EPOCH FROM (${now}::timestamp - hour_reset_at)) * 1000 >= 3600000 
        THEN 1 ELSE current_hour_usage + 1 END,
      day_reset_at = CASE 
        WHEN day_reset_at IS NULL OR EXTRACT(EPOCH FROM (${now}::timestamp - day_reset_at)) * 1000 >= 86400000 
        THEN ${now}::timestamp ELSE day_reset_at END,
      current_day_usage = CASE 
        WHEN day_reset_at IS NULL OR EXTRACT(EPOCH FROM (${now}::timestamp - day_reset_at)) * 1000 >= 86400000 
        THEN 1 ELSE current_day_usage + 1 END,
      month_reset_at = CASE 
        WHEN month_reset_at IS NULL OR EXTRACT(EPOCH FROM (${now}::timestamp - month_reset_at)) * 1000 >= 2592000000 
        THEN ${now}::timestamp ELSE month_reset_at END,
      current_month_usage = CASE 
        WHEN month_reset_at IS NULL OR EXTRACT(EPOCH FROM (${now}::timestamp - month_reset_at)) * 1000 >= 2592000000 
        THEN 1 ELSE current_month_usage + 1 END
    WHERE id = ${partner.id}
    RETURNING 
      current_minute_usage, requests_per_minute, minute_reset_at,
      current_hour_usage, requests_per_hour, hour_reset_at,
      current_day_usage, requests_per_day, day_reset_at,
      current_month_usage, requests_per_month, month_reset_at
  `);

  const row = (result as { rows: Record<string, unknown>[] }).rows?.[0] || (result as Record<string, unknown>[])[0];
  if (!row) return { allowed: false, message: "Partner not found" };

  const minuteUsage = Number(row.current_minute_usage);
  const minuteLimit = Number(row.requests_per_minute);
  if (minuteUsage > minuteLimit) {
    const resetAt = row.minute_reset_at ? new Date(row.minute_reset_at as string).getTime() : nowMs;
    const retryAfter = Math.max(1, Math.ceil((60_000 - (nowMs - resetAt)) / 1000));
    return { allowed: false, message: "Minute rate limit exceeded", retryAfter };
  }

  const hourUsage = Number(row.current_hour_usage);
  const hourLimit = Number(row.requests_per_hour);
  if (hourUsage > hourLimit) {
    const resetAt = row.hour_reset_at ? new Date(row.hour_reset_at as string).getTime() : nowMs;
    const retryAfter = Math.max(1, Math.ceil((3_600_000 - (nowMs - resetAt)) / 1000));
    return { allowed: false, message: "Hourly rate limit exceeded", retryAfter };
  }

  const dayUsage = Number(row.current_day_usage);
  const dayLimit = Number(row.requests_per_day);
  if (dayUsage > dayLimit) {
    return { allowed: false, message: "Daily rate limit exceeded", retryAfter: 86400 };
  }

  const monthUsage = Number(row.current_month_usage);
  const monthLimit = Number(row.requests_per_month);
  if (monthUsage > monthLimit) {
    return { allowed: false, message: "Monthly rate limit exceeded" };
  }

  return { allowed: true };
}

async function authenticatePartner(req: DataApiRequest, res: Response, next: NextFunction) {
  const startTime = Date.now();
  req.requestStartTime = startTime;
  req.dataRequestId = crypto.randomUUID();

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header" });
  }

  const apiKey = authHeader.substring(7);
  if (!apiKey.startsWith("hndld_data_")) {
    return res.status(401).json({ error: "Invalid API key format" });
  }

  const prefix = apiKey.substring(0, 12);

  try {
    const [partner] = await db.select().from(dataPartners)
      .where(
        or(
          eq(dataPartners.apiKeyPrefix, prefix),
          eq(dataPartners.secondaryApiKeyPrefix, prefix)
        )
      )
      .limit(1);

    if (!partner) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    let keyValid = await bcrypt.compare(apiKey, partner.apiKeyHash);
    if (!keyValid && partner.secondaryApiKeyHash) {
      keyValid = await bcrypt.compare(apiKey, partner.secondaryApiKeyHash);
    }
    if (!keyValid) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    if (partner.status !== "ACTIVE") {
      return res.status(403).json({ error: `Partner account is ${partner.status.toLowerCase()}` });
    }

    const ipWhitelist = partner.ipWhitelist || [];
    if (ipWhitelist.length > 0) {
      const clientIp = req.ip || req.socket.remoteAddress || "";
      if (!ipWhitelist.includes(clientIp)) {
        return res.status(403).json({ error: "IP address not whitelisted" });
      }
    }

    const endpoint = req.path;
    const tierConfig = TIER_CONFIG[partner.tier] || TIER_CONFIG.TRIAL;
    const customEndpoints = partner.allowedEndpoints || [];

    if (customEndpoints.length > 0) {
      if (!customEndpoints.some(e => endpoint.startsWith(e))) {
        return res.status(403).json({ error: "Endpoint not allowed for your account" });
      }
    } else if (!tierConfig.endpoints.includes("*") && !tierConfig.endpoints.includes(endpoint)) {
      return res.status(403).json({ error: "Endpoint not available for your tier. Upgrade to access this data." });
    }

    const rateCheck = await checkAndUpdateRateLimits(partner);
    if (!rateCheck.allowed) {
      const headers: Record<string, string> = {};
      if (rateCheck.retryAfter) headers["Retry-After"] = String(rateCheck.retryAfter);
      return res.status(429).set(headers).json({ error: rateCheck.message });
    }

    req.dataPartner = partner;
    next();
  } catch (error: unknown) {
    logger.error("Data API authentication error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "Authentication failed" });
  }
}

async function logRequest(
  req: DataApiRequest,
  statusCode: number,
  resultCount: number,
  errorCode?: string,
  errorMessage?: string
) {
  const partner = req.dataPartner;
  if (!partner) return;

  const responseTimeMs = req.requestStartTime ? Date.now() - req.requestStartTime : 0;

  db.insert(dataApiLogs)
    .values({
      partnerId: partner.id,
      endpoint: req.path,
      method: req.method,
      queryParams: req.query as Record<string, unknown>,
      responseStatus: statusCode,
      responseTimeMs,
      resultCount,
      errorCode: errorCode || null,
      errorMessage: errorMessage || null,
      billableUnits: errorCode ? 0 : 1,
      ipAddress: req.ip || null,
      userAgent: req.headers["user-agent"] || null,
      requestId: req.dataRequestId || null,
    })
    .catch((err: unknown) => logger.error("Failed to log API request", {
      error: err instanceof Error ? err.message : String(err),
    }));
}

const router = Router();

router.use(authenticatePartner as unknown as (req: Request, res: Response, next: NextFunction) => void);

router.get("/appliance-lifespan", async (req: DataApiRequest, res: Response) => {
  try {
    const { category, brand, model, region, climateZone } = req.query;

    if (!category) {
      await logRequest(req, 400, 0, "MISSING_PARAM", "category is required");
      return res.status(400).json({ error: "category is required" });
    }

    const result = await getApplianceLifespanAnalytics(
      category as string,
      {
        brand: brand as string | undefined,
        model: model as string | undefined,
        region: region as string | undefined,
        climateZone: climateZone as string | undefined,
      }
    );

    if (!result.metadata.meetsKAnonymity) {
      await logRequest(req, 404, result.metadata.sampleSize, "INSUFFICIENT_DATA");
      return res.status(404).json({
        error: "Insufficient data",
        message: "Not enough records to provide anonymized results",
        sampleSize: result.metadata.sampleSize,
        minimumRequired: result.metadata.kThreshold,
      });
    }

    await logRequest(req, 200, result.metadata.sampleSize);
    res.json(result);
  } catch (error: unknown) {
    logger.error("Appliance lifespan API error", {
      error: error instanceof Error ? error.message : String(error),
    });
    await logRequest(req, 500, 0, "INTERNAL_ERROR", error instanceof Error ? error.message : "Unknown");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/vendor-pricing", async (req: DataApiRequest, res: Response) => {
  try {
    const { serviceCategory, region, state, metroArea, priceType, sqftMin, sqftMax } = req.query;

    if (!serviceCategory) {
      await logRequest(req, 400, 0, "MISSING_PARAM", "serviceCategory is required");
      return res.status(400).json({ error: "serviceCategory is required" });
    }

    const partner = req.dataPartner;
    const allowedRegions = partner?.allowedRegions || [];
    if (allowedRegions.length > 0 && region && !allowedRegions.includes(region as string)) {
      await logRequest(req, 403, 0, "REGION_RESTRICTED");
      return res.status(403).json({ error: "Region not allowed for your tier" });
    }

    const result = await getVendorPricingBenchmarks(
      serviceCategory as string,
      {
        region: region as string | undefined,
        state: state as string | undefined,
        metroArea: metroArea as string | undefined,
        priceType: priceType as string | undefined,
        sqftMin: sqftMin ? Number(sqftMin) : undefined,
        sqftMax: sqftMax ? Number(sqftMax) : undefined,
      }
    );

    if (!result.metadata.meetsKAnonymity) {
      await logRequest(req, 404, result.metadata.sampleSize, "INSUFFICIENT_DATA");
      return res.status(404).json({
        error: "Insufficient data",
        sampleSize: result.metadata.sampleSize,
        minimumRequired: result.metadata.kThreshold,
      });
    }

    await logRequest(req, 200, result.metadata.sampleSize);
    res.json(result);
  } catch (error: unknown) {
    logger.error("Vendor pricing API error", {
      error: error instanceof Error ? error.message : String(error),
    });
    await logRequest(req, 500, 0, "INTERNAL_ERROR");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/service-quality", async (req: DataApiRequest, res: Response) => {
  try {
    const { serviceCategory, region, minRating } = req.query;

    if (!serviceCategory) {
      await logRequest(req, 400, 0, "MISSING_PARAM", "serviceCategory is required");
      return res.status(400).json({ error: "serviceCategory is required" });
    }

    const result = await getServiceQualityBenchmarks(
      serviceCategory as string,
      {
        region: region as string | undefined,
        minRating: minRating ? Number(minRating) : undefined,
      }
    );

    if (!result.metadata.meetsKAnonymity) {
      await logRequest(req, 404, result.metadata.sampleSize, "INSUFFICIENT_DATA");
      return res.status(404).json({
        error: "Insufficient data",
        sampleSize: result.metadata.sampleSize,
        minimumRequired: result.metadata.kThreshold,
      });
    }

    await logRequest(req, 200, result.metadata.sampleSize);
    res.json(result);
  } catch (error: unknown) {
    logger.error("Service quality API error", {
      error: error instanceof Error ? error.message : String(error),
    });
    await logRequest(req, 500, 0, "INTERNAL_ERROR");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/home-operating-costs", async (req: DataApiRequest, res: Response) => {
  try {
    const { region, homeType, sqftMin, sqftMax } = req.query;

    if (!region) {
      await logRequest(req, 400, 0, "MISSING_PARAM", "region is required");
      return res.status(400).json({ error: "region is required" });
    }

    const result = await getHomeOperatingCostBenchmarks(
      {
        region: region as string,
        homeType: homeType as string | undefined,
        sqftMin: sqftMin ? Number(sqftMin) : undefined,
        sqftMax: sqftMax ? Number(sqftMax) : undefined,
      }
    );

    if (!result.metadata.meetsKAnonymity) {
      await logRequest(req, 404, result.metadata.sampleSize, "INSUFFICIENT_DATA");
      return res.status(404).json({
        error: "Insufficient data",
        sampleSize: result.metadata.sampleSize,
        minimumRequired: result.metadata.kThreshold,
      });
    }

    await logRequest(req, 200, result.metadata.sampleSize);
    res.json(result);
  } catch (error: unknown) {
    logger.error("Home operating costs API error", {
      error: error instanceof Error ? error.message : String(error),
    });
    await logRequest(req, 500, 0, "INTERNAL_ERROR");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/seasonal-demand", async (req: DataApiRequest, res: Response) => {
  try {
    const { serviceCategory, region } = req.query;

    if (!serviceCategory) {
      await logRequest(req, 400, 0, "MISSING_PARAM", "serviceCategory is required");
      return res.status(400).json({ error: "serviceCategory is required" });
    }

    const result = await getSeasonalDemandPatterns(
      serviceCategory as string,
      region as string | undefined
    );

    if (!result.metadata.meetsKAnonymity) {
      await logRequest(req, 404, result.metadata.sampleSize, "INSUFFICIENT_DATA");
      return res.status(404).json({
        error: "Insufficient data",
        sampleSize: result.metadata.sampleSize,
        minimumRequired: result.metadata.kThreshold,
      });
    }

    await logRequest(req, 200, result.metadata.sampleSize);
    res.json(result);
  } catch (error: unknown) {
    logger.error("Seasonal demand API error", {
      error: error instanceof Error ? error.message : String(error),
    });
    await logRequest(req, 500, 0, "INTERNAL_ERROR");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/maintenance-costs", async (req: DataApiRequest, res: Response) => {
  try {
    const { category, region, homeType } = req.query;

    if (!category) {
      await logRequest(req, 400, 0, "MISSING_PARAM", "category is required");
      return res.status(400).json({ error: "category is required" });
    }

    const result = await getMaintenanceCostBenchmarks(
      category as string,
      region as string | undefined,
      homeType as string | undefined
    );

    if (!result.metadata.meetsKAnonymity) {
      await logRequest(req, 404, result.metadata.sampleSize, "INSUFFICIENT_DATA");
      return res.status(404).json({
        error: "Insufficient data",
        sampleSize: result.metadata.sampleSize,
        minimumRequired: result.metadata.kThreshold,
      });
    }

    await logRequest(req, 200, result.metadata.sampleSize);
    res.json(result);
  } catch (error: unknown) {
    logger.error("Maintenance costs API error", {
      error: error instanceof Error ? error.message : String(error),
    });
    await logRequest(req, 500, 0, "INTERNAL_ERROR");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/usage", async (req: DataApiRequest, res: Response) => {
  const partner = req.dataPartner;
  if (!partner) return res.status(401).json({ error: "Unauthorized" });

  await logRequest(req, 200, 0);

  res.json({
    tier: partner.tier,
    limits: {
      requestsPerMinute: partner.requestsPerMinute,
      requestsPerHour: partner.requestsPerHour,
      requestsPerDay: partner.requestsPerDay,
      requestsPerMonth: partner.requestsPerMonth,
    },
    currentUsage: {
      minute: partner.currentMinuteUsage ?? 0,
      hour: partner.currentHourUsage ?? 0,
      day: partner.currentDayUsage ?? 0,
      month: partner.currentMonthUsage ?? 0,
    },
    resets: {
      minuteResetAt: partner.minuteResetAt,
      hourResetAt: partner.hourResetAt,
      dayResetAt: partner.dayResetAt,
      monthResetAt: partner.monthResetAt,
    },
  });
});

router.get("/available-endpoints", async (req: DataApiRequest, res: Response) => {
  const partner = req.dataPartner;
  if (!partner) return res.status(401).json({ error: "Unauthorized" });

  const tierConfig = TIER_CONFIG[partner.tier] || TIER_CONFIG.TRIAL;
  const allEndpoints = [
    { path: "/appliance-lifespan", description: "Appliance lifespan analytics with brand comparison and reliability scoring" },
    { path: "/vendor-pricing", description: "Vendor pricing benchmarks by region and square footage" },
    { path: "/service-quality", description: "Service quality ratings with NPS scoring" },
    { path: "/home-operating-costs", description: "Home operating cost benchmarks with monthly trends" },
    { path: "/seasonal-demand", description: "Seasonal demand patterns with year-over-year growth" },
    { path: "/maintenance-costs", description: "Maintenance cost benchmarks by category" },
  ];

  const available = allEndpoints.map(ep => ({
    ...ep,
    accessible: tierConfig.endpoints.includes("*") || tierConfig.endpoints.includes(ep.path),
  }));

  await logRequest(req, 200, 0);

  res.json({
    tier: partner.tier,
    maxResultsPerRequest: tierConfig.maxResultsPerRequest,
    endpoints: available,
  });
});

export { generateApiKey };

export function registerDataApiRoutes(app: Router) {
  app.use("/data/v1", router);
}
