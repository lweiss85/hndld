import { db } from "../db";
import {
  inventoryItems, inventoryServiceHistory, inventoryEvents,
  householdDetails, applianceConsumables, householdConsumableTracking,
} from "@shared/schema";
import type { HouseholdDetail } from "@shared/schema";
import { eq, and, gte, lte, desc, sql, lt, isNull, or } from "drizzle-orm";
import { addDays, differenceInDays, differenceInYears, format, subDays } from "date-fns";
import { getApplianceLifespanAnalytics, getMaintenanceCostBenchmarks } from "./aggregate-analytics";
import { generateCompletion, isDemoMode, getActiveProvider } from "./ai-provider";
import logger from "../lib/logger";

interface InsightResult {
  category: string;
  title: string;
  summary: string;
  confidence: number;
  data: Record<string, unknown>;
}

const INDUSTRY_LIFESPANS: Record<string, { avgYears: number; description: string }> = {
  "HVAC": { avgYears: 15, description: "HVAC system" },
  "APPLIANCE:water_heater": { avgYears: 12, description: "water heater" },
  "APPLIANCE:refrigerator": { avgYears: 14, description: "refrigerator" },
  "APPLIANCE:dishwasher": { avgYears: 10, description: "dishwasher" },
  "APPLIANCE:washer": { avgYears: 11, description: "washing machine" },
  "APPLIANCE:dryer": { avgYears: 13, description: "dryer" },
  "APPLIANCE:oven": { avgYears: 15, description: "oven/range" },
  "PLUMBING:water_softener": { avgYears: 12, description: "water softener" },
  "ELECTRICAL:garage_door": { avgYears: 15, description: "garage door opener" },
  "OUTDOOR:deck": { avgYears: 20, description: "deck" },
};

function getIndustryLifespan(category: string, itemName: string): { avgYears: number; description: string } | null {
  const nameLower = itemName.toLowerCase();
  for (const [key, value] of Object.entries(INDUSTRY_LIFESPANS)) {
    if (key === category) return value;
    const [cat, subType] = key.split(":");
    if (cat === category && subType && nameLower.includes(subType.replace("_", " "))) {
      return value;
    }
  }
  if (INDUSTRY_LIFESPANS[category]) return INDUSTRY_LIFESPANS[category];
  return null;
}

export async function analyzeApplianceLifecycle(householdId: string): Promise<InsightResult[]> {
  const insights: InsightResult[] = [];
  const now = new Date();

  const items = await db.select().from(inventoryItems).where(
    and(eq(inventoryItems.householdId, householdId), eq(inventoryItems.isActive, true))
  );

  const [detail] = await db.select().from(householdDetails)
    .where(eq(householdDetails.householdId, householdId)).limit(1);

  for (const item of items) {
    if (!item.purchaseDate) continue;

    const purchaseDate = new Date(item.purchaseDate);
    const ageYears = differenceInYears(now, purchaseDate);
    if (ageYears < 1) continue;

    let medianLifespan: number | null = null;
    let networkData: Record<string, unknown> | null = null;

    try {
      const region = detail?.state || undefined;
      const analytics = await getApplianceLifespanAnalytics(item.category, {
        brand: item.brand || undefined,
        region,
      });

      if (analytics.data && analytics.metadata.meetsKAnonymity) {
        medianLifespan = analytics.data.medianLifespanYears;
        networkData = {
          medianLifespan: analytics.data.medianLifespanYears,
          reliabilityScore: analytics.data.reliabilityScore,
          totalFailures: analytics.data.totalFailures,
          failuresByAge: analytics.data.failuresByAge,
          brandComparison: analytics.data.brandComparison,
        };
      }
    } catch (e) {
      logger.debug("[PredictiveMaintenance] Aggregate analytics unavailable", {
        category: item.category, error: e instanceof Error ? e.message : String(e),
      });
    }

    if (!medianLifespan) {
      const industry = getIndustryLifespan(item.category, item.name);
      if (industry) {
        medianLifespan = industry.avgYears;
      }
    }

    if (!medianLifespan) continue;

    const lifespanPercent = ageYears / medianLifespan;

    if (lifespanPercent > 1.0) {
      const estimatedReplacementCost = await estimateReplacementCost(item.category, detail);
      insights.push({
        category: "REPLACEMENT_FORECAST",
        title: `${item.name} is past typical lifespan — plan replacement`,
        summary: `Your ${item.brand ? item.brand + " " : ""}${item.name} is ${ageYears} years old, which is past the typical ${medianLifespan}-year lifespan for this type of ${item.category.toLowerCase()}. Consider budgeting for a replacement soon to avoid an unexpected failure.`,
        confidence: Math.min(95, 85 + Math.floor((lifespanPercent - 1.0) * 20)),
        data: {
          inventoryItemId: item.id,
          currentAgeYears: ageYears,
          networkMedianLifespan: medianLifespan,
          estimatedReplacementYear: new Date().getFullYear(),
          estimatedReplacementCostCents: estimatedReplacementCost,
          actionUrl: `/marketplace?category=${encodeURIComponent(item.category)}&search=${encodeURIComponent(item.name)}`,
          ...(networkData || {}),
        },
      });
    } else if (lifespanPercent > 0.8) {
      const remainingYears = Math.max(0, Math.round((medianLifespan - ageYears) * 10) / 10);
      const estimatedReplacementCost = await estimateReplacementCost(item.category, detail);
      insights.push({
        category: "REPLACEMENT_FORECAST",
        title: `Your ${item.brand ? item.brand + " " : ""}${item.name} is approaching end of life`,
        summary: `At ${ageYears} years old, your ${item.name} has used about ${Math.round(lifespanPercent * 100)}% of its expected ${medianLifespan}-year lifespan. You likely have ${remainingYears} years remaining. Consider budgeting for a replacement.`,
        confidence: Math.min(85, 70 + Math.floor((lifespanPercent - 0.8) * 75)),
        data: {
          inventoryItemId: item.id,
          currentAgeYears: ageYears,
          networkMedianLifespan: medianLifespan,
          estimatedReplacementYear: new Date().getFullYear() + Math.ceil(remainingYears),
          estimatedReplacementCostCents: estimatedReplacementCost,
          ...(networkData || {}),
        },
      });
    } else if (lifespanPercent >= 0.1 && lifespanPercent <= 0.3 && networkData) {
      const failuresByAge = (networkData.failuresByAge as Array<{ ageRange: string; count: number }>) || [];
      const relevantFailures = failuresByAge.filter(f => {
        const match = f.ageRange.match(/(\d+)/);
        return match && Math.abs(parseInt(match[1]) - ageYears) <= 2;
      });

      if (relevantFailures.length > 0 && relevantFailures.some(f => f.count > 3)) {
        insights.push({
          category: "APPLIANCE_LIFESPAN",
          title: `Heads up: ${item.category} units like yours often need attention around this age`,
          summary: `Network data shows that ${item.category.toLowerCase()} units similar to yours sometimes need maintenance around the ${ageYears}-year mark. Scheduling a preventive checkup now could avoid a more costly repair later.`,
          confidence: Math.min(75, 60 + relevantFailures.reduce((sum, f) => sum + f.count, 0)),
          data: {
            inventoryItemId: item.id,
            currentAgeYears: ageYears,
            networkMedianLifespan: medianLifespan,
            failurePatterns: relevantFailures,
          },
        });
      }
    }
  }

  return insights;
}

async function estimateReplacementCost(category: string, detail: HouseholdDetail | null | undefined): Promise<number | null> {
  try {
    const benchmarks = await getMaintenanceCostBenchmarks(category, detail?.state || undefined);
    if (benchmarks.data) {
      return benchmarks.data.avgAnnualCostCents * 5;
    }
  } catch {
    // fall through
  }
  return null;
}

export async function analyzeConsumableNeeds(householdId: string): Promise<InsightResult[]> {
  const insights: InsightResult[] = [];
  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");

  const tracked = await db.select({
    tracking: householdConsumableTracking,
    consumable: applianceConsumables,
    item: inventoryItems,
  }).from(householdConsumableTracking)
    .innerJoin(applianceConsumables, eq(householdConsumableTracking.consumableId, applianceConsumables.id))
    .innerJoin(inventoryItems, eq(householdConsumableTracking.inventoryItemId, inventoryItems.id))
    .where(
      and(
        eq(householdConsumableTracking.householdId, householdId),
        eq(householdConsumableTracking.autoRemind, true),
      )
    );

  for (const row of tracked) {
    if (!row.tracking.nextDueDate) continue;
    const dueDate = new Date(row.tracking.nextDueDate);
    const daysDue = differenceInDays(dueDate, now);

    const consumableName = row.consumable.consumableName;
    const itemName = row.item.name;
    const brand = row.item.brand || "";
    const model = row.item.model || "";
    const size = row.consumable.consumableSize || "";
    const actionUrl = row.consumable.affiliateUrl || `/marketplace?search=${encodeURIComponent(consumableName)}`;

    const baseData: Record<string, unknown> = {
      consumableSize: size,
      partNumber: row.consumable.consumablePartNumber,
      estimatedCost: row.consumable.estimatedCostCents,
      daysDue,
      inventoryItemId: row.item.id,
      consumableTrackingId: row.tracking.id,
      actionUrl,
    };

    if (daysDue < 0) {
      const daysOverdue = Math.abs(daysDue);
      insights.push({
        category: "CONSUMABLE_REMINDER",
        title: `${consumableName} replacement is ${daysOverdue} days overdue`,
        summary: `The ${consumableName} for your ${brand} ${itemName} was due ${daysOverdue} days ago. Replace it as soon as possible to maintain performance and avoid damage.`,
        confidence: 95,
        data: { ...baseData, daysOverdue, priority: "HIGH" },
      });
    } else if (daysDue <= 7) {
      const timeText = daysDue === 0 ? "today" : daysDue === 1 ? "tomorrow" : `in ${daysDue} days`;
      insights.push({
        category: "CONSUMABLE_REMINDER",
        title: `Time to replace ${consumableName} for your ${itemName}`,
        summary: `Your ${brand} ${model} ${size} ${consumableName.toLowerCase()} is due ${timeText}.${row.consumable.estimatedCostCents ? ` Estimated cost: $${(row.consumable.estimatedCostCents / 100).toFixed(0)}.` : ""} If not stocked, order one through hndld →`,
        confidence: 90,
        data: { ...baseData, priority: "HIGH" },
      });
    } else if (daysDue <= 30) {
      insights.push({
        category: "CONSUMABLE_REMINDER",
        title: `Your ${consumableName} is due in ${daysDue} days`,
        summary: `The ${consumableName} for your ${brand} ${itemName} is coming up. Check if you have a replacement ready.`,
        confidence: 80,
        data: { ...baseData, priority: "MEDIUM" },
      });
    }
  }

  const untrackedItems = await db.select().from(inventoryItems).where(
    and(
      eq(inventoryItems.householdId, householdId),
      eq(inventoryItems.isActive, true),
      sql`${inventoryItems.serviceIntervalDays} IS NOT NULL`,
    )
  );

  const trackedItemIds = new Set(tracked.map(t => t.item.id));

  for (const item of untrackedItems) {
    if (trackedItemIds.has(item.id)) continue;

    const matchingConsumables = await db.select().from(applianceConsumables).where(
      and(
        eq(applianceConsumables.applianceCategory, item.category),
        eq(applianceConsumables.isActive, true),
        or(
          isNull(applianceConsumables.applianceBrand),
          item.brand ? eq(applianceConsumables.applianceBrand, item.brand) : sql`true`,
        ),
      )
    );

    for (const consumable of matchingConsumables.slice(0, 2)) {
      insights.push({
        category: "CONSUMABLE_REMINDER",
        title: `Track ${consumable.consumableName} for your ${item.name}`,
        summary: `We can track ${consumable.consumableName} replacements for your ${item.brand ? item.brand + " " : ""}${item.name} — want to set up reminders?`,
        confidence: 50,
        data: {
          inventoryItemId: item.id,
          consumableId: consumable.id,
          consumableName: consumable.consumableName,
          actionUrl: `/inventory?id=${item.id}`,
          isSuggestion: true,
        },
      });
    }
  }

  return insights;
}

export async function analyzeWarrantyActions(householdId: string): Promise<InsightResult[]> {
  const insights: InsightResult[] = [];
  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");
  const thirtyDaysOut = format(addDays(now, 30), "yyyy-MM-dd");
  const ninetyDaysOut = format(addDays(now, 90), "yyyy-MM-dd");
  const thirtyDaysAgo = format(subDays(now, 30), "yyyy-MM-dd");

  const expiringItems = await db.select().from(inventoryItems).where(
    and(
      eq(inventoryItems.householdId, householdId),
      eq(inventoryItems.isActive, true),
      gte(inventoryItems.warrantyExpires, todayStr),
      lte(inventoryItems.warrantyExpires, ninetyDaysOut),
    )
  );

  for (const item of expiringItems) {
    if (!item.warrantyExpires) continue;
    const expiryDate = new Date(item.warrantyExpires);
    const daysUntil = differenceInDays(expiryDate, now);

    if (daysUntil <= 30) {
      insights.push({
        category: "WARRANTY_ACTION",
        title: `Warranty on your ${item.name} expires ${format(expiryDate, "MMM d, yyyy")}`,
        summary: `Your ${item.brand ? item.brand + " " : ""}${item.name} warranty${item.warrantyProvider ? ` with ${item.warrantyProvider}` : ""} expires in ${daysUntil} days. Check for any issues to claim before it ends. Consider an extended warranty and document the current condition with photos.`,
        confidence: 90,
        data: {
          inventoryItemId: item.id,
          warrantyExpires: item.warrantyExpires,
          daysUntil,
          warrantyProvider: item.warrantyProvider,
          actionUrl: `/inventory?id=${item.id}`,
        },
      });
    } else {
      insights.push({
        category: "WARRANTY_ACTION",
        title: `Warranty reminder: ${item.name} coverage ends ${format(expiryDate, "MMM d")}`,
        summary: `Your warranty on ${item.name} expires in ${daysUntil} days. Keep this on your radar — inspect the ${item.category.toLowerCase()} for any issues worth reporting.`,
        confidence: 70,
        data: {
          inventoryItemId: item.id,
          warrantyExpires: item.warrantyExpires,
          daysUntil,
          actionUrl: `/inventory?id=${item.id}`,
        },
      });
    }
  }

  const recentlyExpired = await db.select().from(inventoryItems).where(
    and(
      eq(inventoryItems.householdId, householdId),
      eq(inventoryItems.isActive, true),
      lt(inventoryItems.warrantyExpires, todayStr),
      gte(inventoryItems.warrantyExpires, thirtyDaysAgo),
    )
  );

  for (const item of recentlyExpired) {
    if (!item.purchaseDate) continue;
    const ageYears = differenceInYears(now, new Date(item.purchaseDate));
    const industry = getIndustryLifespan(item.category, item.name);

    if (industry && ageYears >= industry.avgYears * 0.6) {
      const estimatedCost = await estimateReplacementCost(item.category, null);
      insights.push({
        category: "WARRANTY_ACTION",
        title: `Warranty just ended on your ${item.name}`,
        summary: `Your warranty just ended and your ${item.name} (${ageYears} years old) is entering its most failure-prone years. Consider a home warranty or setting aside a repair fund.${estimatedCost ? ` Estimated replacement cost: $${(estimatedCost / 100).toFixed(0)}.` : ""}`,
        confidence: 75,
        data: {
          inventoryItemId: item.id,
          ageYears,
          estimatedReplacementCostCents: estimatedCost,
          actionUrl: `/inventory?id=${item.id}`,
        },
      });
    }
  }

  return insights;
}

export async function generateAIPredictiveInsight(
  householdId: string,
  items: Array<{
    name: string; category: string; brand: string | null;
    purchaseDate: string | null; lastServiceDate: string | null; nextServiceDue: string | null;
  }>,
  householdDetail: HouseholdDetail | null,
): Promise<InsightResult | null> {
  if (getActiveProvider() === "NONE") return null;

  const prompt = `You are a home maintenance expert. Based on this household's appliance inventory and local conditions, identify the single most important maintenance action they should take in the next 30 days.

Household: ${householdDetail?.climateZone || "unknown"} climate zone, ${householdDetail?.squareFootage || "unknown"} sq ft, built ${householdDetail?.yearBuilt || "unknown"}
HVAC: ${householdDetail?.hvacType || "unknown"} type, ${householdDetail?.hvacAgeYears || "unknown"} years old
Water Heater: ${householdDetail?.waterHeaterType || "unknown"}, ${householdDetail?.waterHeaterAgeYears || "unknown"} years old
Roof: ${householdDetail?.roofType || "unknown"}, ${householdDetail?.roofAgeYears || "unknown"} years old
Current month: ${format(new Date(), "MMMM")}

Appliances: ${JSON.stringify(items.slice(0, 15).map(i => ({
    name: i.name, category: i.category, brand: i.brand,
    ageYears: i.purchaseDate ? differenceInYears(new Date(), new Date(i.purchaseDate)) : null,
    lastService: i.lastServiceDate, nextServiceDue: i.nextServiceDue,
  })))}

Return ONLY valid JSON: { "title": "short title", "summary": "1-2 sentence actionable recommendation", "confidence": 60-85, "relatedItemName": "item name or null", "urgency": "low/medium/high" }`;

  try {
    const result = await generateCompletion({
      messages: [{ role: "user", content: prompt }],
      maxTokens: 300,
      temperature: 0.3,
    });

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.title || !parsed.summary) return null;

    return {
      category: "MAINTENANCE_PREDICTION",
      title: parsed.title,
      summary: parsed.summary,
      confidence: Math.min(85, Math.max(60, parsed.confidence || 65)),
      data: {
        aiGenerated: true,
        relatedItemName: parsed.relatedItemName || null,
        urgency: parsed.urgency || "medium",
      },
    };
  } catch (e) {
    logger.error("[PredictiveMaintenance] AI insight generation failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

export async function generateAllPredictiveInsights(householdId: string): Promise<InsightResult[]> {
  const safeRun = (name: string, fn: () => Promise<InsightResult[]>) =>
    fn().catch(e => {
      logger.error(`[PredictiveMaintenance] ${name} failed`, {
        error: e instanceof Error ? e.message : String(e), householdId,
      });
      return [] as InsightResult[];
    });

  const [lifecycle, consumables, warranty] = await Promise.all([
    safeRun("Lifecycle", () => analyzeApplianceLifecycle(householdId)),
    safeRun("Consumables", () => analyzeConsumableNeeds(householdId)),
    safeRun("Warranty", () => analyzeWarrantyActions(householdId)),
  ]);

  const combined = [...lifecycle, ...consumables, ...warranty];

  if (combined.length < 8 && getActiveProvider() !== "NONE") {
    try {
      const items = await db.select().from(inventoryItems)
        .where(and(eq(inventoryItems.householdId, householdId), eq(inventoryItems.isActive, true)));
      const [detail] = await db.select().from(householdDetails)
        .where(eq(householdDetails.householdId, householdId)).limit(1);
      const aiInsight = await generateAIPredictiveInsight(householdId, items, detail || null);
      if (aiInsight) combined.push(aiInsight);
    } catch (e) {
      logger.error("[PredictiveMaintenance] AI insight failed", {
        error: e instanceof Error ? e.message : String(e), householdId,
      });
    }
  }

  return combined.sort((a, b) => b.confidence - a.confidence);
}
