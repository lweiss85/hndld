import { db } from "../db";
import {
  householdDetails, vendorPricing, inventoryEvents,
  inventoryItems, vendors, spendingItems, households,
  type InsertVendorPricing, type InsertInventoryEvent,
} from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { differenceInDays, differenceInYears, format } from "date-fns";
import logger from "../lib/logger";

const STATE_TO_REGION: Record<string, string> = {
  CT: "NORTHEAST", DE: "NORTHEAST", MA: "NORTHEAST", MD: "NORTHEAST",
  ME: "NORTHEAST", NH: "NORTHEAST", NJ: "NORTHEAST", NY: "NORTHEAST",
  PA: "NORTHEAST", RI: "NORTHEAST", VT: "NORTHEAST",
  AL: "SOUTHEAST", AR: "SOUTHEAST", FL: "SOUTHEAST", GA: "SOUTHEAST",
  KY: "SOUTHEAST", LA: "SOUTHEAST", MS: "SOUTHEAST", NC: "SOUTHEAST",
  SC: "SOUTHEAST", TN: "SOUTHEAST", VA: "SOUTHEAST", WV: "SOUTHEAST",
  DC: "SOUTHEAST",
  IA: "MIDWEST", IL: "MIDWEST", IN: "MIDWEST", KS: "MIDWEST",
  MI: "MIDWEST", MN: "MIDWEST", MO: "MIDWEST", NE: "MIDWEST",
  ND: "MIDWEST", OH: "MIDWEST", SD: "MIDWEST", WI: "MIDWEST",
  AZ: "SOUTHWEST", NM: "SOUTHWEST", OK: "SOUTHWEST", TX: "SOUTHWEST",
  CO: "WEST", ID: "WEST", MT: "WEST", NV: "WEST", UT: "WEST",
  WY: "WEST",
  AK: "PACIFIC", CA: "PACIFIC", HI: "PACIFIC", OR: "PACIFIC",
  WA: "PACIFIC",
};

const STATE_TO_CLIMATE: Record<string, string> = {
  FL: "HOT_HUMID", LA: "HOT_HUMID", MS: "HOT_HUMID", AL: "HOT_HUMID",
  GA: "HOT_HUMID", SC: "HOT_HUMID", HI: "HOT_HUMID",
  AZ: "HOT_DRY", NV: "HOT_DRY", NM: "HOT_DRY",
  TX: "MIXED_HUMID", NC: "MIXED_HUMID", TN: "MIXED_HUMID",
  AR: "MIXED_HUMID", OK: "MIXED_HUMID", VA: "MIXED_HUMID",
  KY: "MIXED_HUMID", DC: "MIXED_HUMID",
  CO: "MIXED_DRY", UT: "MIXED_DRY",
  NY: "COLD", PA: "COLD", NJ: "COLD", CT: "COLD", MA: "COLD",
  OH: "COLD", IN: "COLD", IL: "COLD", IA: "COLD", MO: "COLD",
  KS: "COLD", NE: "COLD", DE: "COLD", MD: "COLD", RI: "COLD",
  MI: "COLD", WI: "COLD",
  MN: "VERY_COLD", ND: "VERY_COLD", SD: "VERY_COLD",
  MT: "VERY_COLD", WY: "VERY_COLD", ID: "VERY_COLD",
  ME: "VERY_COLD", NH: "VERY_COLD", VT: "VERY_COLD",
  AK: "SUBARCTIC",
  WA: "MARINE", OR: "MARINE", CA: "MARINE",
  WV: "COLD",
};

export function deriveRegionFromState(state: string): string | null {
  const abbr = state.trim().toUpperCase().substring(0, 2);
  return STATE_TO_REGION[abbr] || null;
}

export function deriveClimateZone(state: string): string | null {
  const abbr = state.trim().toUpperCase().substring(0, 2);
  return STATE_TO_CLIMATE[abbr] || null;
}

interface CompletenessField {
  key: string;
  weight: number;
}

const COMPLETENESS_FIELDS: CompletenessField[] = [
  { key: "city", weight: 5 },
  { key: "state", weight: 8 },
  { key: "postalCode", weight: 5 },
  { key: "region", weight: 3 },
  { key: "homeType", weight: 8 },
  { key: "squareFootage", weight: 8 },
  { key: "bedrooms", weight: 5 },
  { key: "bathrooms", weight: 5 },
  { key: "yearBuilt", weight: 5 },
  { key: "stories", weight: 3 },
  { key: "hasPool", weight: 2 },
  { key: "hasGarage", weight: 2 },
  { key: "hasBasement", weight: 2 },
  { key: "hasHoa", weight: 2 },
  { key: "hvacType", weight: 5 },
  { key: "hvacAgeYears", weight: 5 },
  { key: "heatingFuel", weight: 3 },
  { key: "waterHeaterType", weight: 3 },
  { key: "roofType", weight: 3 },
  { key: "roofAgeYears", weight: 3 },
  { key: "householdSize", weight: 5 },
  { key: "hasPets", weight: 2 },
  { key: "hasChildren", weight: 2 },
  { key: "incomeBracket", weight: 3 },
  { key: "estimatedValueCents", weight: 5 },
];

export function calculateCompletenessScore(details: Record<string, unknown>): number {
  const totalWeight = COMPLETENESS_FIELDS.reduce((sum, f) => sum + f.weight, 0);
  let filledWeight = 0;

  for (const field of COMPLETENESS_FIELDS) {
    const val = details[field.key];
    if (val !== null && val !== undefined && val !== "") {
      filledWeight += field.weight;
    }
  }

  return Math.round((filledWeight / totalWeight) * 100);
}

export async function captureVendorPricingFromSpending(
  spendingItemId: string
): Promise<void> {
  try {
    const [spending] = await db.select()
      .from(spendingItems)
      .where(eq(spendingItems.id, spendingItemId));

    if (!spending || !spending.vendor) return;

    const [vendor] = await db.select()
      .from(vendors)
      .where(eq(vendors.name, spending.vendor));

    if (!vendor) return;

    const [details] = await db.select()
      .from(householdDetails)
      .where(eq(householdDetails.householdId, spending.householdId));

    const pricingData: InsertVendorPricing = {
      vendorId: vendor.id,
      householdId: spending.householdId,
      serviceCategory: spending.category || "OTHER",
      priceType: "FLAT_RATE",
      priceAmountCents: typeof spending.amount === "string" ? parseInt(spending.amount, 10) : Number(spending.amount || 0),
      effectiveDate: spending.date ? format(new Date(spending.date), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
      isVerified: true,
      verificationSource: "SPENDING_RECORD",
      relatedSpendingItemId: spendingItemId,
      homeSquareFootage: details?.squareFootage || null,
      region: details?.region || null,
      metroArea: details?.metroArea || null,
      state: details?.state || null,
      confidenceScore: 90,
    };

    await db.insert(vendorPricing).values(pricingData);

    logger.info("Vendor pricing captured from spending", {
      spendingItemId,
      vendorId: vendor.id,
    });
  } catch (error: unknown) {
    logger.error("Failed to capture vendor pricing from spending", {
      spendingItemId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function captureInventoryEvent(
  inventoryItemId: string,
  eventType: string,
  eventData: Partial<InsertInventoryEvent>
): Promise<string | null> {
  try {
    const [item] = await db.select()
      .from(inventoryItems)
      .where(eq(inventoryItems.id, inventoryItemId));

    if (!item) {
      logger.warn("Inventory item not found for event capture", { inventoryItemId });
      return null;
    }

    const [details] = await db.select()
      .from(householdDetails)
      .where(eq(householdDetails.householdId, item.householdId));

    const eventDate = eventData.eventDate || format(new Date(), "yyyy-MM-dd");
    const purchaseDate = item.purchaseDate;
    let ageAtEventDays: number | null = null;
    let ageAtEventYears: number | null = null;

    if (purchaseDate) {
      const purchaseDt = new Date(purchaseDate);
      const eventDt = new Date(eventDate);
      ageAtEventDays = differenceInDays(eventDt, purchaseDt);
      ageAtEventYears = Number((ageAtEventDays / 365.25).toFixed(2));
    }

    const record: InsertInventoryEvent = {
      inventoryItemId,
      householdId: item.householdId,
      eventType: eventType as typeof inventoryEvents.$inferInsert.eventType,
      eventDate,
      eventDescription: eventData.eventDescription || null,
      totalCostCents: eventData.totalCostCents || null,
      laborCostCents: eventData.laborCostCents || null,
      partsCostCents: eventData.partsCostCents || null,
      taxCents: eventData.taxCents || null,
      vendorId: eventData.vendorId || null,
      vendorName: eventData.vendorName || null,
      failureCategory: eventData.failureCategory || null,
      failureReason: eventData.failureReason || null,
      failureDescription: eventData.failureDescription || null,
      symptomsBefore: eventData.symptomsBefore || null,
      wasUnderWarranty: eventData.wasUnderWarranty || null,
      rootCause: eventData.rootCause || null,
      wasPreventable: eventData.wasPreventable || null,
      partsReplaced: eventData.partsReplaced || null,
      repairDurationMinutes: eventData.repairDurationMinutes || null,
      repairOutcome: eventData.repairOutcome || null,
      itemBrand: item.brand || null,
      itemModel: item.model || null,
      itemCategory: item.category || null,
      itemPurchaseDate: purchaseDate || null,
      itemAgeAtEventDays: ageAtEventDays,
      applianceAgeYears: ageAtEventYears ? String(ageAtEventYears) : null,
      householdRegion: details?.region || null,
      householdClimateZone: details?.climateZone || null,
      notes: eventData.notes || null,
      source: eventData.source || "USER_INPUT",
      createdBy: eventData.createdBy || null,
    };

    const [inserted] = await db.insert(inventoryEvents).values(record).returning();

    if (["REPAIR", "ROUTINE_MAINTENANCE", "PART_REPLACED"].includes(eventType)) {
      await db.update(inventoryItems)
        .set({ lastServiceDate: eventDate, updatedAt: new Date() })
        .where(eq(inventoryItems.id, inventoryItemId));
    }

    logger.info("Inventory event captured", {
      eventId: inserted.id,
      inventoryItemId,
      eventType,
    });

    return inserted.id;
  } catch (error: unknown) {
    logger.error("Failed to capture inventory event", {
      inventoryItemId,
      eventType,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

interface DataSuggestion {
  field: string;
  label: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  category: string;
  description: string;
}

export async function getDataCompletionSuggestions(
  householdId: string
): Promise<DataSuggestion[]> {
  const suggestions: DataSuggestion[] = [];

  const [details] = await db.select()
    .from(householdDetails)
    .where(eq(householdDetails.householdId, householdId));

  if (!details) {
    suggestions.push({
      field: "householdDetails",
      label: "Home Profile",
      priority: "HIGH",
      category: "SETUP",
      description: "Set up your home profile to get personalized insights and maintenance recommendations",
    });
    return suggestions;
  }

  const highPriority: { field: string; label: string; desc: string }[] = [
    { field: "state", label: "State/Location", desc: "Your location helps us provide regional maintenance schedules and vendor pricing" },
    { field: "homeType", label: "Home Type", desc: "Knowing your home type helps tailor maintenance recommendations" },
    { field: "squareFootage", label: "Square Footage", desc: "Home size affects cleaning, HVAC, and maintenance cost estimates" },
    { field: "yearBuilt", label: "Year Built", desc: "Your home's age helps predict when major systems may need attention" },
  ];

  for (const item of highPriority) {
    const val = (details as Record<string, unknown>)[item.field];
    if (val === null || val === undefined) {
      suggestions.push({
        field: item.field,
        label: item.label,
        priority: "HIGH",
        category: "LOCATION" ,
        description: item.desc,
      });
    }
  }

  const mediumPriority: { field: string; label: string; desc: string }[] = [
    { field: "hvacType", label: "HVAC System", desc: "Track your HVAC system for maintenance reminders" },
    { field: "hvacAgeYears", label: "HVAC Age", desc: "Know when your HVAC may need replacement" },
    { field: "roofType", label: "Roof Type", desc: "Different roofs need different maintenance schedules" },
    { field: "roofAgeYears", label: "Roof Age", desc: "Track your roof's age for replacement planning" },
    { field: "waterHeaterType", label: "Water Heater", desc: "Monitor your water heater for maintenance and efficiency" },
    { field: "householdSize", label: "Household Size", desc: "Helps estimate utility and maintenance needs" },
  ];

  for (const item of mediumPriority) {
    const val = (details as Record<string, unknown>)[item.field];
    if (val === null || val === undefined) {
      suggestions.push({
        field: item.field,
        label: item.label,
        priority: "MEDIUM",
        category: "SYSTEMS",
        description: item.desc,
      });
    }
  }

  if (!details.consentToAnonymizedAnalytics) {
    suggestions.push({
      field: "consentToAnonymizedAnalytics",
      label: "Analytics Consent",
      priority: "LOW",
      category: "CONSENT",
      description: "Opt in to anonymized analytics to see how your home compares to similar homes in your area",
    });
  }

  return suggestions;
}
