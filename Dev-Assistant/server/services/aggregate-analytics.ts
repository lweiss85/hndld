import { db } from "../db";
import {
  inventoryEvents, vendorPricing, serviceQualityRatings,
  spendingItems, householdDetails,
} from "@shared/schema";
import { eq, and, gte, lte, sql, count, avg, min, max } from "drizzle-orm";
import logger from "../lib/logger";

const MIN_K_ANONYMITY = 10;

interface AggregateResult<T> {
  data: T | null;
  sampleSize: number;
  period?: { start: string; end: string };
  region?: string;
  meetsMinimumThreshold: boolean;
}

export async function getApplianceLifespan(
  category: string,
  brand?: string,
  model?: string
): Promise<AggregateResult<{
  avgLifespanYears: number;
  medianLifespanYears: number;
  minLifespanYears: number;
  maxLifespanYears: number;
  failureRate: number;
  topFailureReasons: { reason: string; percentage: number }[];
}>> {
  try {
    const conditions = [
      eq(inventoryEvents.eventType, "FAILURE"),
      eq(inventoryEvents.itemCategory, category),
    ];

    if (brand) conditions.push(eq(inventoryEvents.itemBrand, brand));
    if (model) conditions.push(eq(inventoryEvents.itemModel, model));

    const failures = await db.select({
      avgAge: avg(inventoryEvents.applianceAgeYears),
      minAge: min(inventoryEvents.applianceAgeYears),
      maxAge: max(inventoryEvents.applianceAgeYears),
      medianAge: sql<string>`percentile_cont(0.5) WITHIN GROUP (ORDER BY ${inventoryEvents.applianceAgeYears})`,
      count: count(),
    })
      .from(inventoryEvents)
      .where(and(...conditions));

    const sampleSize = Number(failures[0]?.count || 0);

    if (sampleSize < MIN_K_ANONYMITY) {
      return { data: null, sampleSize, meetsMinimumThreshold: false };
    }

    const totalItems = await db.select({ count: count() })
      .from(inventoryEvents)
      .where(and(eq(inventoryEvents.itemCategory, category)));
    const totalItemCount = Number(totalItems[0]?.count || 1);
    const avgLifespan = Number(failures[0]?.avgAge || 1);
    const failureRate = avgLifespan > 0 ? (sampleSize / totalItemCount) * (1 / avgLifespan) * 100 : 0;

    const reasons = await db.select({
      reason: inventoryEvents.failureReason,
      count: count(),
    })
      .from(inventoryEvents)
      .where(and(...conditions))
      .groupBy(inventoryEvents.failureReason)
      .orderBy(sql`count(*) desc`)
      .limit(5);

    const filteredReasons = reasons.filter(r => Number(r.count) >= MIN_K_ANONYMITY);

    return {
      data: {
        avgLifespanYears: Number(Number(failures[0]?.avgAge || 0).toFixed(2)),
        medianLifespanYears: Number(Number(failures[0]?.medianAge || 0).toFixed(2)),
        minLifespanYears: Number(Number(failures[0]?.minAge || 0).toFixed(2)),
        maxLifespanYears: Number(Number(failures[0]?.maxAge || 0).toFixed(2)),
        failureRate: Number(failureRate.toFixed(2)),
        topFailureReasons: filteredReasons.map(r => ({
          reason: r.reason || "Unknown",
          percentage: Number(((Number(r.count) / sampleSize) * 100).toFixed(1)),
        })),
      },
      sampleSize,
      meetsMinimumThreshold: true,
    };
  } catch (error: unknown) {
    logger.error("getApplianceLifespan error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { data: null, sampleSize: 0, meetsMinimumThreshold: false };
  }
}

export async function getVendorPricingBenchmarks(
  serviceCategory: string,
  region?: string,
  priceType?: string
): Promise<AggregateResult<{
  avgPriceCents: number;
  medianPriceCents: number;
  minPriceCents: number;
  maxPriceCents: number;
  percentile25: number;
  percentile75: number;
  priceByHomeSize: { sqftRange: string; avgPrice: number }[];
}>> {
  try {
    const conditions = [eq(vendorPricing.serviceCategory, serviceCategory)];
    if (region) conditions.push(eq(vendorPricing.region, region));
    if (priceType) conditions.push(eq(vendorPricing.priceType, priceType));

    const pricing = await db.select({
      avgPrice: avg(vendorPricing.priceAmountCents),
      minPrice: min(vendorPricing.priceAmountCents),
      maxPrice: max(vendorPricing.priceAmountCents),
      medianPrice: sql<string>`percentile_cont(0.5) WITHIN GROUP (ORDER BY ${vendorPricing.priceAmountCents})`,
      p25: sql<string>`percentile_cont(0.25) WITHIN GROUP (ORDER BY ${vendorPricing.priceAmountCents})`,
      p75: sql<string>`percentile_cont(0.75) WITHIN GROUP (ORDER BY ${vendorPricing.priceAmountCents})`,
      count: count(),
    })
      .from(vendorPricing)
      .where(and(...conditions));

    const sampleSize = Number(pricing[0]?.count || 0);

    if (sampleSize < MIN_K_ANONYMITY) {
      return { data: null, sampleSize, region, meetsMinimumThreshold: false };
    }

    const priceByHomeSize = await db.select({
      sqftRange: sql<string>`
        CASE
          WHEN ${vendorPricing.homeSquareFootage} < 1000 THEN 'UNDER_1000'
          WHEN ${vendorPricing.homeSquareFootage} < 2000 THEN '1000_2000'
          WHEN ${vendorPricing.homeSquareFootage} < 3000 THEN '2000_3000'
          WHEN ${vendorPricing.homeSquareFootage} < 5000 THEN '3000_5000'
          ELSE '5000_PLUS'
        END`,
      avgPrice: avg(vendorPricing.priceAmountCents),
      count: count(),
    })
      .from(vendorPricing)
      .where(and(...conditions, sql`${vendorPricing.homeSquareFootage} IS NOT NULL`))
      .groupBy(sql`1`);

    const filteredPriceByHomeSize = priceByHomeSize.filter(p => Number(p.count) >= MIN_K_ANONYMITY);

    return {
      data: {
        avgPriceCents: Math.round(Number(pricing[0]?.avgPrice || 0)),
        medianPriceCents: Math.round(Number(pricing[0]?.medianPrice || 0)),
        minPriceCents: Number(pricing[0]?.minPrice || 0),
        maxPriceCents: Number(pricing[0]?.maxPrice || 0),
        percentile25: Math.round(Number(pricing[0]?.p25 || 0)),
        percentile75: Math.round(Number(pricing[0]?.p75 || 0)),
        priceByHomeSize: filteredPriceByHomeSize.map(p => ({
          sqftRange: p.sqftRange,
          avgPrice: Math.round(Number(p.avgPrice || 0)),
        })),
      },
      sampleSize,
      region,
      meetsMinimumThreshold: true,
    };
  } catch (error: unknown) {
    logger.error("getVendorPricingBenchmarks error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { data: null, sampleSize: 0, region, meetsMinimumThreshold: false };
  }
}

export async function getMaintenanceCostBenchmarks(
  category: string,
  region?: string,
  _homeType?: string
): Promise<AggregateResult<{
  avgAnnualCostCents: number;
  avgCostPerSqFtCents: number;
  costByQuarter: { quarter: string; avgCost: number }[];
  topExpenseCategories: { category: string; avgCost: number; percentage: number }[];
}>> {
  try {
    const conditions = [eq(spendingItems.category, category)];

    const spending = await db.select({
      avgAmount: avg(spendingItems.amount),
      totalAmount: sql<number>`sum(${spendingItems.amount})`,
      count: count(),
    })
      .from(spendingItems)
      .where(and(...conditions));

    const sampleSize = Number(spending[0]?.count || 0);

    if (sampleSize < MIN_K_ANONYMITY) {
      return { data: null, sampleSize, region, meetsMinimumThreshold: false };
    }

    const costByQuarter = await db.select({
      quarter: sql<string>`'Q' || EXTRACT(QUARTER FROM ${spendingItems.date})`,
      avgCost: avg(spendingItems.amount),
      count: count(),
    })
      .from(spendingItems)
      .where(and(...conditions))
      .groupBy(sql`1`);

    const filteredQuarters = costByQuarter.filter(q => Number(q.count) >= MIN_K_ANONYMITY);

    return {
      data: {
        avgAnnualCostCents: Math.round(Number(spending[0]?.avgAmount || 0)),
        avgCostPerSqFtCents: 0,
        costByQuarter: filteredQuarters.map(q => ({
          quarter: q.quarter,
          avgCost: Math.round(Number(q.avgCost || 0)),
        })),
        topExpenseCategories: [],
      },
      sampleSize,
      region,
      meetsMinimumThreshold: true,
    };
  } catch (error: unknown) {
    logger.error("getMaintenanceCostBenchmarks error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { data: null, sampleSize: 0, region, meetsMinimumThreshold: false };
  }
}

export async function getSeasonalDemandPatterns(
  serviceCategory: string,
  region?: string
): Promise<AggregateResult<{
  demandByMonth: { month: number; relativeIndex: number }[];
  peakMonths: number[];
  lowMonths: number[];
  yearOverYearGrowth: number;
}>> {
  try {
    const conditions = [eq(vendorPricing.serviceCategory, serviceCategory)];
    if (region) conditions.push(eq(vendorPricing.region, region));

    const monthly = await db.select({
      month: sql<number>`EXTRACT(MONTH FROM ${vendorPricing.effectiveDate})::int`,
      count: count(),
    })
      .from(vendorPricing)
      .where(and(...conditions))
      .groupBy(sql`1`)
      .orderBy(sql`1`);

    const totalCount = monthly.reduce((s, m) => s + Number(m.count), 0);
    const avgPerMonth = totalCount / 12;

    if (totalCount < MIN_K_ANONYMITY) {
      return { data: null, sampleSize: totalCount, region, meetsMinimumThreshold: false };
    }

    const filteredMonthly = monthly.filter(m => Number(m.count) >= MIN_K_ANONYMITY);
    const demandByMonth = filteredMonthly.map(m => ({
      month: m.month,
      relativeIndex: avgPerMonth > 0 ? Math.round((Number(m.count) / avgPerMonth) * 100) : 0,
    }));

    const sorted = [...demandByMonth].sort((a, b) => b.relativeIndex - a.relativeIndex);

    return {
      data: {
        demandByMonth,
        peakMonths: sorted.slice(0, 3).map(m => m.month),
        lowMonths: sorted.slice(-3).map(m => m.month),
        yearOverYearGrowth: 0,
      },
      sampleSize: totalCount,
      region,
      meetsMinimumThreshold: true,
    };
  } catch (error: unknown) {
    logger.error("getSeasonalDemandPatterns error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { data: null, sampleSize: 0, region, meetsMinimumThreshold: false };
  }
}

export async function getServiceQualityBenchmarks(
  serviceCategory: string,
  region?: string
): Promise<AggregateResult<{
  avgOverallRating: number;
  avgQualityRating: number;
  avgValueRating: number;
  recommendationRate: number;
  issueRate: number;
  issueResolutionRate: number;
  ratingDistribution: { rating: number; percentage: number }[];
}>> {
  try {
    const conditions = [eq(serviceQualityRatings.serviceCategory, serviceCategory)];
    if (region) conditions.push(eq(serviceQualityRatings.region, region));

    const ratings = await db.select({
      avgOverall: avg(serviceQualityRatings.overallRating),
      avgQuality: avg(serviceQualityRatings.qualityRating),
      avgValue: avg(serviceQualityRatings.valueForMoneyRating),
      count: count(),
    })
      .from(serviceQualityRatings)
      .where(and(...conditions));

    const sampleSize = Number(ratings[0]?.count || 0);

    if (sampleSize < MIN_K_ANONYMITY) {
      return { data: null, sampleSize, region, meetsMinimumThreshold: false };
    }

    const recommendStats = await db.select({
      recommended: count(sql`CASE WHEN ${serviceQualityRatings.wouldRecommend} = true THEN 1 END`),
      withIssues: count(sql`CASE WHEN ${serviceQualityRatings.hadIssue} = true THEN 1 END`),
      issuesResolved: count(sql`CASE WHEN ${serviceQualityRatings.issueResolvedSatisfactorily} = true THEN 1 END`),
      total: count(),
    })
      .from(serviceQualityRatings)
      .where(and(...conditions));

    const total = Number(recommendStats[0]?.total || 1);

    const distribution = await db.select({
      rating: serviceQualityRatings.overallRating,
      count: count(),
    })
      .from(serviceQualityRatings)
      .where(and(...conditions))
      .groupBy(serviceQualityRatings.overallRating)
      .orderBy(serviceQualityRatings.overallRating);

    return {
      data: {
        avgOverallRating: Number(Number(ratings[0]?.avgOverall || 0).toFixed(2)),
        avgQualityRating: Number(Number(ratings[0]?.avgQuality || 0).toFixed(2)),
        avgValueRating: Number(Number(ratings[0]?.avgValue || 0).toFixed(2)),
        recommendationRate: Number(((Number(recommendStats[0]?.recommended || 0) / total) * 100).toFixed(1)),
        issueRate: Number(((Number(recommendStats[0]?.withIssues || 0) / total) * 100).toFixed(1)),
        issueResolutionRate: Number(recommendStats[0]?.withIssues) > 0
          ? Number(((Number(recommendStats[0]?.issuesResolved || 0) / Number(recommendStats[0]?.withIssues)) * 100).toFixed(1))
          : 100,
        ratingDistribution: distribution
          .filter(d => Number(d.count) >= MIN_K_ANONYMITY)
          .map(d => ({
            rating: d.rating,
            percentage: Number(((Number(d.count) / sampleSize) * 100).toFixed(1)),
          })),
      },
      sampleSize,
      region,
      meetsMinimumThreshold: true,
    };
  } catch (error: unknown) {
    logger.error("getServiceQualityBenchmarks error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { data: null, sampleSize: 0, region, meetsMinimumThreshold: false };
  }
}

export async function getHomeOperatingCostBenchmarks(
  region: string,
  homeType?: string,
  sqftRange?: { min: number; max: number }
): Promise<AggregateResult<{
  avgAnnualTotalCents: number;
  costBreakdown: { category: string; avgAnnualCents: number; percentage: number }[];
  costPerSqFt: number;
  yearOverYearChange: number;
}>> {
  try {
    const houseConditions = [eq(householdDetails.region, region)];
    if (homeType) houseConditions.push(eq(householdDetails.homeType, homeType));
    if (sqftRange) {
      houseConditions.push(gte(householdDetails.squareFootage, sqftRange.min));
      houseConditions.push(lte(householdDetails.squareFootage, sqftRange.max));
    }

    const households = await db.select({
      householdId: householdDetails.householdId,
      sqft: householdDetails.squareFootage,
    })
      .from(householdDetails)
      .where(and(...houseConditions));

    if (households.length < MIN_K_ANONYMITY) {
      return { data: null, sampleSize: households.length, region, meetsMinimumThreshold: false };
    }

    const householdIds = households.map(h => h.householdId);

    const spending = await db.select({
      category: spendingItems.category,
      totalAmount: sql<number>`sum(${spendingItems.amount})`,
      count: count(),
    })
      .from(spendingItems)
      .where(sql`${spendingItems.householdId} IN (${sql.join(householdIds.map(id => sql`${id}`), sql`, `)})`)
      .groupBy(spendingItems.category);

    const totalSpending = spending.reduce((s, c) => s + Number(c.totalAmount || 0), 0);
    const avgAnnualTotal = Math.round(totalSpending / households.length);
    const avgSqFt = households.reduce((s, h) => s + (h.sqft || 0), 0) / households.length;

    return {
      data: {
        avgAnnualTotalCents: avgAnnualTotal,
        costBreakdown: spending
          .filter(s => Number(s.count) >= MIN_K_ANONYMITY)
          .map(s => ({
            category: s.category || "Other",
            avgAnnualCents: Math.round(Number(s.totalAmount || 0) / households.length),
            percentage: totalSpending > 0 ? Number(((Number(s.totalAmount || 0) / totalSpending) * 100).toFixed(1)) : 0,
          })),
        costPerSqFt: avgSqFt > 0 ? Math.round(avgAnnualTotal / avgSqFt) : 0,
        yearOverYearChange: 0,
      },
      sampleSize: households.length,
      region,
      meetsMinimumThreshold: true,
    };
  } catch (error: unknown) {
    logger.error("getHomeOperatingCostBenchmarks error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { data: null, sampleSize: 0, region, meetsMinimumThreshold: false };
  }
}
