import { db } from "../db";
import {
  inventoryEvents, vendorPricing, serviceQualityRatings,
  spendingItems, householdDetails,
} from "@shared/schema";
import { eq, and, gte, lte, sql, count, avg, min, max, inArray } from "drizzle-orm";
import logger from "../lib/logger";

const DEFAULT_K_ANONYMITY = 10;
const CACHE_TTL_SECONDS = 3600;

const cache = new Map<string, { data: unknown; expiresAt: number }>();

interface AggregationOptions {
  kAnonymity?: number;
  cacheKey?: string;
  cacheTtl?: number;
}

interface AggregationResult<T> {
  data: T | null;
  metadata: {
    sampleSize: number;
    meetsKAnonymity: boolean;
    kThreshold: number;
    queryTimeMs: number;
    cached: boolean;
  };
  filters?: Record<string, unknown>;
}

function getCached<T>(key: string): { hit: true; result: AggregationResult<T> } | { hit: false } {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    const result = { ...(entry.data as AggregationResult<T>) };
    result.metadata = { ...result.metadata, cached: true, queryTimeMs: 0 };
    logAggregationQuery("cache-hit", { cacheKey: key }, 0, result.metadata.sampleSize);
    return { hit: true, result };
  }
  if (entry) cache.delete(key);
  return { hit: false };
}

function setCache(key: string, data: unknown, ttl: number) {
  cache.set(key, { data, expiresAt: Date.now() + ttl * 1000 });
}

function consentFilter(householdIdCol: ReturnType<typeof sql>) {
  return sql`${householdIdCol} IN (
    SELECT household_id FROM household_details
    WHERE consent_to_anonymized_analytics = true
  )`;
}

function logAggregationQuery(endpoint: string, filters: Record<string, unknown>, queryTimeMs: number, sampleSize: number) {
  logger.info("Aggregation query", { endpoint, filters, queryTimeMs, sampleSize });
}

function rows(result: any): any[] {
  return result.rows ?? result ?? [];
}

function firstRow(result: any): any {
  const r = rows(result);
  return r[0] ?? {};
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

// ─── 1. Appliance Lifespan Analytics ──────────────────────────

export async function getApplianceLifespanAnalytics(
  category: string,
  filters?: { brand?: string; model?: string; region?: string; climateZone?: string },
  options?: AggregationOptions
): Promise<AggregationResult<{
  averageLifespanYears: number;
  medianLifespanYears: number;
  percentile10: number;
  percentile90: number;
  standardDeviation: number;
  totalFailures: number;
  failuresByAge: { ageRange: string; count: number; percentage: number }[];
  topFailureCategories: { category: string; count: number; percentage: number }[];
  reliabilityScore: number;
  brandComparison?: { brand: string; avgLifespan: number; sampleSize: number }[];
}>> {
  const k = options?.kAnonymity ?? DEFAULT_K_ANONYMITY;
  const cacheKey = options?.cacheKey ?? `appliance-lifespan:${category}:${JSON.stringify(filters || {})}`;
  const cached = getCached<any>(cacheKey);
  if (cached.hit) return cached.result;

  const startTime = Date.now();

  try {
    const conditions: ReturnType<typeof sql>[] = [
      sql`${inventoryEvents.eventType} = 'FAILURE'`,
      sql`${inventoryEvents.itemCategory} = ${category}`,
      consentFilter(sql`${inventoryEvents.householdId}`),
    ];

    if (filters?.brand) conditions.push(sql`${inventoryEvents.itemBrand} = ${filters.brand}`);
    if (filters?.model) conditions.push(sql`${inventoryEvents.itemModel} = ${filters.model}`);
    if (filters?.region) {
      conditions.push(sql`${inventoryEvents.householdId} IN (
        SELECT household_id FROM household_details WHERE region = ${filters.region}
      )`);
    }
    if (filters?.climateZone) {
      conditions.push(sql`${inventoryEvents.householdId} IN (
        SELECT household_id FROM household_details WHERE climate_zone = ${filters.climateZone}
      )`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const statsResult = await db.execute(sql`
      SELECT
        AVG(appliance_age_years::numeric) as avg_age,
        STDDEV(appliance_age_years::numeric) as stddev_age,
        PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY appliance_age_years::numeric) as p10,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY appliance_age_years::numeric) as p50,
        PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY appliance_age_years::numeric) as p90,
        COUNT(*) as total
      FROM inventory_events
      WHERE ${whereClause}
    `);
    const stats = firstRow(statsResult);

    const sampleSize = Number(stats.total || 0);
    const queryTimeMs = Date.now() - startTime;

    if (sampleSize < k) {
      const result: AggregationResult<any> = {
        data: null,
        metadata: { sampleSize, meetsKAnonymity: false, kThreshold: k, queryTimeMs, cached: false },
        filters: { category, ...filters },
      };
      logAggregationQuery("appliance-lifespan", { category, ...filters }, queryTimeMs, sampleSize);
      return result;
    }

    const ageBuckets = rows(await db.execute(sql`
      SELECT
        CASE
          WHEN appliance_age_years::numeric < 2 THEN '0-2 years'
          WHEN appliance_age_years::numeric < 5 THEN '2-5 years'
          WHEN appliance_age_years::numeric < 8 THEN '5-8 years'
          WHEN appliance_age_years::numeric < 12 THEN '8-12 years'
          ELSE '12+ years'
        END as age_range,
        COUNT(*) as cnt
      FROM inventory_events
      WHERE ${whereClause}
      GROUP BY 1
      ORDER BY 1
    `));

    const failureCategories = rows(await db.execute(sql`
      SELECT failure_category as category, COUNT(*) as cnt
      FROM inventory_events
      WHERE ${whereClause} AND failure_category IS NOT NULL
      GROUP BY 1
      ORDER BY cnt DESC
      LIMIT 10
    `));

    let brandComparison: { brand: string; avgLifespan: number; sampleSize: number }[] | undefined;
    if (!filters?.brand) {
      const brands = rows(await db.execute(sql`
        SELECT
          item_brand as brand,
          AVG(appliance_age_years::numeric) as avg_lifespan,
          COUNT(*) as cnt
        FROM inventory_events
        WHERE ${whereClause} AND item_brand IS NOT NULL
        GROUP BY 1
        HAVING COUNT(*) >= ${k}
        ORDER BY avg_lifespan DESC
        LIMIT 15
      `));
      if (brands.length > 0) {
        brandComparison = brands.map((b: any) => ({
          brand: b.brand,
          avgLifespan: Number(Number(b.avg_lifespan).toFixed(2)),
          sampleSize: Number(b.cnt),
        }));
      }
    }

    const expectedLifespan: Record<string, number> = {
      HVAC: 15, REFRIGERATOR: 13, WASHER: 11, DRYER: 13, DISHWASHER: 10,
      WATER_HEATER: 10, OVEN: 15, MICROWAVE: 9, GARBAGE_DISPOSAL: 12,
    };
    const expected = expectedLifespan[category.toUpperCase()] || 10;
    const avgLife = Number(stats.avg_age || 0);
    const reliabilityScore = Math.min(100, Math.max(0, Math.round((avgLife / expected) * 100)));

    const result: AggregationResult<any> = {
      data: {
        averageLifespanYears: Number(Number(stats.avg_age || 0).toFixed(2)),
        medianLifespanYears: Number(Number(stats.p50 || 0).toFixed(2)),
        percentile10: Number(Number(stats.p10 || 0).toFixed(2)),
        percentile90: Number(Number(stats.p90 || 0).toFixed(2)),
        standardDeviation: Number(Number(stats.stddev_age || 0).toFixed(2)),
        totalFailures: sampleSize,
        failuresByAge: ageBuckets
          .filter((b: any) => Number(b.cnt) >= k)
          .map((b: any) => ({
            ageRange: b.age_range,
            count: Number(b.cnt),
            percentage: Number(((Number(b.cnt) / sampleSize) * 100).toFixed(1)),
          })),
        topFailureCategories: failureCategories
          .filter((c: any) => Number(c.cnt) >= k)
          .map((c: any) => ({
            category: c.category,
            count: Number(c.cnt),
            percentage: Number(((Number(c.cnt) / sampleSize) * 100).toFixed(1)),
          })),
        reliabilityScore,
        brandComparison,
      },
      metadata: { sampleSize, meetsKAnonymity: true, kThreshold: k, queryTimeMs, cached: false },
      filters: { category, ...filters },
    };

    setCache(cacheKey, result, options?.cacheTtl ?? CACHE_TTL_SECONDS);
    logAggregationQuery("appliance-lifespan", { category, ...filters }, queryTimeMs, sampleSize);
    return result;
  } catch (error: unknown) {
    logger.error("getApplianceLifespanAnalytics error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      data: null,
      metadata: { sampleSize: 0, meetsKAnonymity: false, kThreshold: k, queryTimeMs: Date.now() - startTime, cached: false },
      filters: { category, ...filters },
    };
  }
}

// ─── 2. Vendor Pricing Benchmarks ─────────────────────────────

export async function getVendorPricingBenchmarks(
  serviceCategory: string,
  filters?: { region?: string; state?: string; metroArea?: string; priceType?: string; sqftMin?: number; sqftMax?: number },
  options?: AggregationOptions
): Promise<AggregationResult<{
  averagePriceCents: number;
  medianPriceCents: number;
  percentile25: number;
  percentile75: number;
  minPriceCents: number;
  maxPriceCents: number;
  priceBySquareFootage: { sqftRange: string; avgPrice: number; count: number }[];
  priceByRegion: { region: string; avgPrice: number; count: number }[];
  priceHistory: { month: string; avgPrice: number; count: number }[];
  recommendedBudgetRange: { low: number; mid: number; high: number };
}>> {
  const k = options?.kAnonymity ?? DEFAULT_K_ANONYMITY;
  const cacheKey = options?.cacheKey ?? `vendor-pricing:${serviceCategory}:${JSON.stringify(filters || {})}`;
  const cached = getCached<any>(cacheKey);
  if (cached.hit) return cached.result;

  const startTime = Date.now();

  try {
    const conditions: ReturnType<typeof sql>[] = [
      sql`${vendorPricing.serviceCategory} = ${serviceCategory}`,
      consentFilter(sql`${vendorPricing.householdId}`),
    ];

    if (filters?.region) conditions.push(sql`${vendorPricing.region} = ${filters.region}`);
    if (filters?.state) conditions.push(sql`${vendorPricing.state} = ${filters.state}`);
    if (filters?.metroArea) conditions.push(sql`${vendorPricing.metroArea} = ${filters.metroArea}`);
    if (filters?.priceType) conditions.push(sql`${vendorPricing.priceType} = ${filters.priceType}`);
    if (filters?.sqftMin) conditions.push(sql`${vendorPricing.homeSquareFootage} >= ${filters.sqftMin}`);
    if (filters?.sqftMax) conditions.push(sql`${vendorPricing.homeSquareFootage} <= ${filters.sqftMax}`);

    const whereClause = sql.join(conditions, sql` AND `);

    const stats = firstRow(await db.execute(sql`
      SELECT
        AVG(price_amount_cents) as avg_price,
        MIN(price_amount_cents) as min_price,
        MAX(price_amount_cents) as max_price,
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY price_amount_cents) as p25,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY price_amount_cents) as p50,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY price_amount_cents) as p75,
        COUNT(*) as total
      FROM vendor_pricing
      WHERE ${whereClause}
    `));

    const sampleSize = Number(stats.total || 0);
    const queryTimeMs = Date.now() - startTime;

    if (sampleSize < k) {
      const result: AggregationResult<any> = {
        data: null,
        metadata: { sampleSize, meetsKAnonymity: false, kThreshold: k, queryTimeMs, cached: false },
        filters: { serviceCategory, ...filters },
      };
      logAggregationQuery("vendor-pricing", { serviceCategory, ...filters }, queryTimeMs, sampleSize);
      return result;
    }

    const priceBySquareFootage = rows(await db.execute(sql`
      SELECT
        CASE
          WHEN home_square_footage < 1000 THEN 'Under 1,000 sqft'
          WHEN home_square_footage < 2000 THEN '1,000-2,000 sqft'
          WHEN home_square_footage < 3000 THEN '2,000-3,000 sqft'
          WHEN home_square_footage < 5000 THEN '3,000-5,000 sqft'
          ELSE '5,000+ sqft'
        END as sqft_range,
        AVG(price_amount_cents)::integer as avg_price,
        COUNT(*) as cnt
      FROM vendor_pricing
      WHERE ${whereClause} AND home_square_footage IS NOT NULL
      GROUP BY 1
      ORDER BY 1
    `));

    const priceByRegion = rows(await db.execute(sql`
      SELECT
        region,
        AVG(price_amount_cents)::integer as avg_price,
        COUNT(*) as cnt
      FROM vendor_pricing
      WHERE ${whereClause} AND region IS NOT NULL
      GROUP BY 1
      ORDER BY avg_price DESC
    `));

    const priceHistory = rows(await db.execute(sql`
      SELECT
        TO_CHAR(effective_date::date, 'YYYY-MM') as month,
        AVG(price_amount_cents)::integer as avg_price,
        COUNT(*) as cnt
      FROM vendor_pricing
      WHERE ${whereClause}
      GROUP BY 1
      ORDER BY 1
    `));

    const p25 = Math.round(Number(stats.p25 || 0));
    const p50 = Math.round(Number(stats.p50 || 0));
    const p75 = Math.round(Number(stats.p75 || 0));

    const result: AggregationResult<any> = {
      data: {
        averagePriceCents: Math.round(Number(stats.avg_price || 0)),
        medianPriceCents: p50,
        percentile25: p25,
        percentile75: p75,
        minPriceCents: Number(stats.min_price || 0),
        maxPriceCents: Number(stats.max_price || 0),
        priceBySquareFootage: priceBySquareFootage
          .filter((p: any) => Number(p.cnt) >= k)
          .map((p: any) => ({ sqftRange: p.sqft_range, avgPrice: Number(p.avg_price), count: Number(p.cnt) })),
        priceByRegion: priceByRegion
          .filter((p: any) => Number(p.cnt) >= k)
          .map((p: any) => ({ region: p.region, avgPrice: Number(p.avg_price), count: Number(p.cnt) })),
        priceHistory: priceHistory
          .filter((p: any) => Number(p.cnt) >= k)
          .map((p: any) => ({ month: p.month, avgPrice: Number(p.avg_price), count: Number(p.cnt) })),
        recommendedBudgetRange: { low: p25, mid: p50, high: p75 },
      },
      metadata: { sampleSize, meetsKAnonymity: true, kThreshold: k, queryTimeMs, cached: false },
      filters: { serviceCategory, ...filters },
    };

    setCache(cacheKey, result, options?.cacheTtl ?? CACHE_TTL_SECONDS);
    logAggregationQuery("vendor-pricing", { serviceCategory, ...filters }, queryTimeMs, sampleSize);
    return result;
  } catch (error: unknown) {
    logger.error("getVendorPricingBenchmarks error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      data: null,
      metadata: { sampleSize: 0, meetsKAnonymity: false, kThreshold: k, queryTimeMs: Date.now() - startTime, cached: false },
      filters: { serviceCategory, ...filters },
    };
  }
}

// ─── 3. Service Quality Benchmarks ────────────────────────────

export async function getServiceQualityBenchmarks(
  serviceCategory: string,
  filters?: { region?: string; minRating?: number },
  options?: AggregationOptions
): Promise<AggregationResult<{
  averageOverallRating: number;
  averageQualityRating: number;
  averageValueRating: number;
  npsScore: number;
  recommendationRate: number;
  issueRate: number;
  issueResolutionRate: number;
  ratingDistribution: { rating: number; count: number; percentage: number }[];
}>> {
  const k = options?.kAnonymity ?? DEFAULT_K_ANONYMITY;
  const cacheKey = options?.cacheKey ?? `service-quality:${serviceCategory}:${JSON.stringify(filters || {})}`;
  const cached = getCached<any>(cacheKey);
  if (cached.hit) return cached.result;

  const startTime = Date.now();

  try {
    const conditions: ReturnType<typeof sql>[] = [
      sql`${serviceQualityRatings.serviceCategory} = ${serviceCategory}`,
      consentFilter(sql`${serviceQualityRatings.householdId}`),
    ];

    if (filters?.region) {
      conditions.push(sql`${serviceQualityRatings.householdId} IN (
        SELECT household_id FROM household_details WHERE region = ${filters.region}
      )`);
    }
    if (filters?.minRating) {
      conditions.push(sql`${serviceQualityRatings.overallRating} >= ${filters.minRating}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const stats = firstRow(await db.execute(sql`
      SELECT
        AVG(overall_rating) as avg_overall,
        AVG(quality_rating) as avg_quality,
        AVG(value_for_money_rating) as avg_value,
        COUNT(*) as total,
        COUNT(CASE WHEN would_recommend = true THEN 1 END) as recommended,
        COUNT(CASE WHEN had_issue = true THEN 1 END) as with_issues,
        COUNT(CASE WHEN issue_resolved_satisfactorily = true THEN 1 END) as issues_resolved,
        COUNT(CASE WHEN likelihood_to_recommend >= 9 THEN 1 END) as promoters,
        COUNT(CASE WHEN likelihood_to_recommend <= 6 THEN 1 END) as detractors,
        COUNT(CASE WHEN likelihood_to_recommend IS NOT NULL THEN 1 END) as nps_responses
      FROM service_quality_ratings
      WHERE ${whereClause}
    `));

    const sampleSize = Number(stats.total || 0);
    const queryTimeMs = Date.now() - startTime;

    if (sampleSize < k) {
      const result: AggregationResult<any> = {
        data: null,
        metadata: { sampleSize, meetsKAnonymity: false, kThreshold: k, queryTimeMs, cached: false },
        filters: { serviceCategory, ...filters },
      };
      logAggregationQuery("service-quality", { serviceCategory, ...filters }, queryTimeMs, sampleSize);
      return result;
    }

    const npsResponses = Number(stats.nps_responses || 0);
    const npsScore = npsResponses > 0
      ? Math.round(((Number(stats.promoters || 0) - Number(stats.detractors || 0)) / npsResponses) * 100)
      : 0;

    const total = Number(stats.total || 1);
    const withIssues = Number(stats.with_issues || 0);

    const distribution = rows(await db.execute(sql`
      SELECT overall_rating as rating, COUNT(*) as cnt
      FROM service_quality_ratings
      WHERE ${whereClause}
      GROUP BY 1
      ORDER BY 1
    `));

    const result: AggregationResult<any> = {
      data: {
        averageOverallRating: Number(Number(stats.avg_overall || 0).toFixed(2)),
        averageQualityRating: Number(Number(stats.avg_quality || 0).toFixed(2)),
        averageValueRating: Number(Number(stats.avg_value || 0).toFixed(2)),
        npsScore,
        recommendationRate: Number(((Number(stats.recommended || 0) / total) * 100).toFixed(1)),
        issueRate: Number(((withIssues / total) * 100).toFixed(1)),
        issueResolutionRate: withIssues > 0
          ? Number(((Number(stats.issues_resolved || 0) / withIssues) * 100).toFixed(1))
          : 100,
        ratingDistribution: distribution
          .filter((d: any) => Number(d.cnt) >= k)
          .map((d: any) => ({
            rating: Number(d.rating),
            count: Number(d.cnt),
            percentage: Number(((Number(d.cnt) / sampleSize) * 100).toFixed(1)),
          })),
      },
      metadata: { sampleSize, meetsKAnonymity: true, kThreshold: k, queryTimeMs, cached: false },
      filters: { serviceCategory, ...filters },
    };

    setCache(cacheKey, result, options?.cacheTtl ?? CACHE_TTL_SECONDS);
    logAggregationQuery("service-quality", { serviceCategory, ...filters }, queryTimeMs, sampleSize);
    return result;
  } catch (error: unknown) {
    logger.error("getServiceQualityBenchmarks error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      data: null,
      metadata: { sampleSize: 0, meetsKAnonymity: false, kThreshold: k, queryTimeMs: Date.now() - startTime, cached: false },
      filters: { serviceCategory, ...filters },
    };
  }
}

// ─── 4. Home Operating Cost Benchmarks ────────────────────────

export async function getHomeOperatingCostBenchmarks(
  filters: { region: string; homeType?: string; sqftMin?: number; sqftMax?: number },
  options?: AggregationOptions
): Promise<AggregationResult<{
  avgAnnualTotalCents: number;
  avgMonthlyCents: number;
  avgPerSqFtCents: number;
  costBreakdown: { category: string; avgAnnualCents: number; percentage: number }[];
  monthlyTrend: { month: string; avgCost: number }[];
}>> {
  const k = options?.kAnonymity ?? DEFAULT_K_ANONYMITY;
  const cacheKey = options?.cacheKey ?? `home-operating-costs:${JSON.stringify(filters)}`;
  const cached = getCached<any>(cacheKey);
  if (cached.hit) return cached.result;

  const startTime = Date.now();

  try {
    const houseConditions: ReturnType<typeof sql>[] = [
      sql`region = ${filters.region}`,
      sql`consent_to_anonymized_analytics = true`,
    ];
    if (filters.homeType) houseConditions.push(sql`home_type = ${filters.homeType}`);
    if (filters.sqftMin) houseConditions.push(sql`square_footage >= ${filters.sqftMin}`);
    if (filters.sqftMax) houseConditions.push(sql`square_footage <= ${filters.sqftMax}`);

    const houseWhere = sql.join(houseConditions, sql` AND `);

    const households = rows(await db.execute(sql`
      SELECT household_id, square_footage
      FROM household_details
      WHERE ${houseWhere}
    `));

    const sampleSize = households.length;
    const queryTimeMs = Date.now() - startTime;

    if (sampleSize < k) {
      const result: AggregationResult<any> = {
        data: null,
        metadata: { sampleSize, meetsKAnonymity: false, kThreshold: k, queryTimeMs, cached: false },
        filters,
      };
      logAggregationQuery("home-operating-costs", filters, queryTimeMs, sampleSize);
      return result;
    }

    const householdIds = households.map((h: any) => h.household_id);
    const idList = sql.join(householdIds.map((id: string) => sql`${id}`), sql`, `);

    const costBreakdown = rows(await db.execute(sql`
      SELECT
        category,
        SUM(amount)::integer as total_amount,
        COUNT(*) as cnt
      FROM spending_items
      WHERE household_id IN (${idList})
      GROUP BY 1
      ORDER BY total_amount DESC
    `));

    const totalSpending = costBreakdown.reduce((s: number, c: any) => s + Number(c.total_amount || 0), 0);
    const avgAnnualTotal = Math.round(totalSpending / sampleSize);
    const avgSqFt = households.reduce((s: number, h: any) => s + (Number(h.square_footage) || 0), 0) / sampleSize;

    const monthlyTrend = rows(await db.execute(sql`
      SELECT
        TO_CHAR(date::date, 'YYYY-MM') as month,
        AVG(amount)::integer as avg_cost
      FROM spending_items
      WHERE household_id IN (${idList})
      GROUP BY 1
      ORDER BY 1
    `));

    const result: AggregationResult<any> = {
      data: {
        avgAnnualTotalCents: avgAnnualTotal,
        avgMonthlyCents: Math.round(avgAnnualTotal / 12),
        avgPerSqFtCents: avgSqFt > 0 ? Math.round(avgAnnualTotal / avgSqFt) : 0,
        costBreakdown: costBreakdown
          .filter((c: any) => Number(c.cnt) >= k)
          .map((c: any) => ({
            category: c.category || "Other",
            avgAnnualCents: Math.round(Number(c.total_amount || 0) / sampleSize),
            percentage: totalSpending > 0 ? Number(((Number(c.total_amount || 0) / totalSpending) * 100).toFixed(1)) : 0,
          })),
        monthlyTrend: monthlyTrend.map((m: any) => ({
          month: m.month,
          avgCost: Number(m.avg_cost || 0),
        })),
      },
      metadata: { sampleSize, meetsKAnonymity: true, kThreshold: k, queryTimeMs: Date.now() - startTime, cached: false },
      filters,
    };

    setCache(cacheKey, result, options?.cacheTtl ?? CACHE_TTL_SECONDS);
    logAggregationQuery("home-operating-costs", filters, Date.now() - startTime, sampleSize);
    return result;
  } catch (error: unknown) {
    logger.error("getHomeOperatingCostBenchmarks error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      data: null,
      metadata: { sampleSize: 0, meetsKAnonymity: false, kThreshold: k, queryTimeMs: Date.now() - startTime, cached: false },
      filters,
    };
  }
}

// ─── 5. Maintenance Cost Benchmarks ──────────────────────────

export async function getMaintenanceCostBenchmarks(
  category: string,
  region?: string,
  homeType?: string,
  options?: AggregationOptions
): Promise<AggregationResult<{
  avgAnnualCostCents: number;
  avgCostPerSqFtCents: number;
  costByQuarter: { quarter: string; avgCost: number; count: number }[];
  topExpenseCategories: { category: string; avgCost: number; percentage: number }[];
}>> {
  const k = options?.kAnonymity ?? DEFAULT_K_ANONYMITY;
  const cacheKey = options?.cacheKey ?? `maintenance-costs:${category}:${region}:${homeType}`;
  const cached = getCached<any>(cacheKey);
  if (cached.hit) return cached.result;

  const startTime = Date.now();

  try {
    const conditions: ReturnType<typeof sql>[] = [
      sql`${spendingItems.category} = ${category}`,
      consentFilter(sql`${spendingItems.householdId}`),
    ];

    const whereClause = sql.join(conditions, sql` AND `);

    const stats = firstRow(await db.execute(sql`
      SELECT
        AVG(amount) as avg_amount,
        SUM(amount) as total_amount,
        COUNT(*) as total
      FROM spending_items
      WHERE ${whereClause}
    `));

    const sampleSize = Number(stats.total || 0);
    const queryTimeMs = Date.now() - startTime;

    if (sampleSize < k) {
      return {
        data: null,
        metadata: { sampleSize, meetsKAnonymity: false, kThreshold: k, queryTimeMs, cached: false },
        filters: { category, region, homeType },
      };
    }

    const costByQuarter = rows(await db.execute(sql`
      SELECT
        'Q' || EXTRACT(QUARTER FROM date::date) as quarter,
        AVG(amount)::integer as avg_cost,
        COUNT(*) as cnt
      FROM spending_items
      WHERE ${whereClause}
      GROUP BY 1
      ORDER BY 1
    `));

    const result: AggregationResult<any> = {
      data: {
        avgAnnualCostCents: Math.round(Number(stats.avg_amount || 0)),
        avgCostPerSqFtCents: 0,
        costByQuarter: costByQuarter
          .filter((q: any) => Number(q.cnt) >= k)
          .map((q: any) => ({
            quarter: q.quarter,
            avgCost: Number(q.avg_cost),
            count: Number(q.cnt),
          })),
        topExpenseCategories: [],
      },
      metadata: { sampleSize, meetsKAnonymity: true, kThreshold: k, queryTimeMs: Date.now() - startTime, cached: false },
      filters: { category, region, homeType },
    };

    setCache(cacheKey, result, options?.cacheTtl ?? CACHE_TTL_SECONDS);
    logAggregationQuery("maintenance-costs", { category, region, homeType }, Date.now() - startTime, sampleSize);
    return result;
  } catch (error: unknown) {
    logger.error("getMaintenanceCostBenchmarks error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      data: null,
      metadata: { sampleSize: 0, meetsKAnonymity: false, kThreshold: k, queryTimeMs: Date.now() - startTime, cached: false },
      filters: { category, region, homeType },
    };
  }
}

// ─── 6. Seasonal Demand Patterns ─────────────────────────────

export async function getSeasonalDemandPatterns(
  serviceCategory: string,
  region?: string,
  options?: AggregationOptions
): Promise<AggregationResult<{
  demandByMonth: { month: number; monthName: string; demandIndex: number }[];
  peakMonths: number[];
  lowMonths: number[];
  yearOverYearGrowth: number;
}>> {
  const k = options?.kAnonymity ?? DEFAULT_K_ANONYMITY;
  const cacheKey = options?.cacheKey ?? `seasonal-demand:${serviceCategory}:${region}`;
  const cached = getCached<any>(cacheKey);
  if (cached.hit) return cached.result;

  const startTime = Date.now();

  try {
    const conditions: ReturnType<typeof sql>[] = [
      sql`${vendorPricing.serviceCategory} = ${serviceCategory}`,
      consentFilter(sql`${vendorPricing.householdId}`),
    ];
    if (region) conditions.push(sql`${vendorPricing.region} = ${region}`);

    const whereClause = sql.join(conditions, sql` AND `);

    const monthly = rows(await db.execute(sql`
      SELECT
        EXTRACT(MONTH FROM effective_date::date)::int as month,
        COUNT(*) as cnt
      FROM vendor_pricing
      WHERE ${whereClause}
      GROUP BY 1
      ORDER BY 1
    `));

    const totalCount = monthly.reduce((s: number, m: any) => s + Number(m.cnt), 0);

    if (totalCount < k) {
      return {
        data: null,
        metadata: { sampleSize: totalCount, meetsKAnonymity: false, kThreshold: k, queryTimeMs: Date.now() - startTime, cached: false },
        filters: { serviceCategory, region },
      };
    }

    const avgPerMonth = totalCount / 12;
    const demandByMonth = monthly
      .filter((m: any) => Number(m.cnt) >= k)
      .map((m: any) => ({
        month: Number(m.month),
        monthName: MONTH_NAMES[Number(m.month) - 1] || "",
        demandIndex: avgPerMonth > 0 ? Math.round((Number(m.cnt) / avgPerMonth) * 100) : 0,
      }));

    const sorted = [...demandByMonth].sort((a, b) => b.demandIndex - a.demandIndex);

    const yoyStats = firstRow(await db.execute(sql`
      SELECT
        COUNT(CASE WHEN EXTRACT(YEAR FROM effective_date::date) = EXTRACT(YEAR FROM CURRENT_DATE) THEN 1 END) as this_year,
        COUNT(CASE WHEN EXTRACT(YEAR FROM effective_date::date) = EXTRACT(YEAR FROM CURRENT_DATE) - 1 THEN 1 END) as last_year
      FROM vendor_pricing
      WHERE ${whereClause}
    `));

    const thisYear = Number(yoyStats.this_year || 0);
    const lastYear = Number(yoyStats.last_year || 0);
    const yearOverYearGrowth = lastYear > 0 ? Number((((thisYear - lastYear) / lastYear) * 100).toFixed(1)) : 0;

    const result: AggregationResult<any> = {
      data: {
        demandByMonth,
        peakMonths: sorted.slice(0, 3).map(m => m.month),
        lowMonths: sorted.slice(-3).map(m => m.month),
        yearOverYearGrowth,
      },
      metadata: { sampleSize: totalCount, meetsKAnonymity: true, kThreshold: k, queryTimeMs: Date.now() - startTime, cached: false },
      filters: { serviceCategory, region },
    };

    setCache(cacheKey, result, options?.cacheTtl ?? CACHE_TTL_SECONDS);
    logAggregationQuery("seasonal-demand", { serviceCategory, region }, Date.now() - startTime, totalCount);
    return result;
  } catch (error: unknown) {
    logger.error("getSeasonalDemandPatterns error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      data: null,
      metadata: { sampleSize: 0, meetsKAnonymity: false, kThreshold: k, queryTimeMs: Date.now() - startTime, cached: false },
      filters: { serviceCategory, region },
    };
  }
}
