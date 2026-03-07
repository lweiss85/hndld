import { db } from "../db";
import { applianceConsumables } from "@shared/schema";
import { count } from "drizzle-orm";
import logger from "../lib/logger";

const COMMON_CONSUMABLES = [
  { applianceCategory: "HVAC", consumableName: "HVAC Air Filter", consumableDescription: "Standard air filter replacement", consumableSize: "Check unit for size (common: 16x25x1, 20x25x1, 20x20x1)", defaultIntervalDays: 90, searchQuery: "HVAC air filter", estimatedCostCents: 2500 },
  { applianceCategory: "HVAC", consumableName: "Humidifier Filter/Pad", consumableDescription: "Whole-house humidifier filter or water pad", defaultIntervalDays: 180, searchQuery: "humidifier filter pad", estimatedCostCents: 2000 },
  { applianceCategory: "APPLIANCE", consumableName: "Refrigerator Water Filter", consumableDescription: "Built-in water/ice dispenser filter", defaultIntervalDays: 180, searchQuery: "refrigerator water filter", estimatedCostCents: 3500 },
  { applianceCategory: "APPLIANCE", consumableName: "Dishwasher Filter Cleaning", consumableDescription: "Clean or replace dishwasher drain filter", defaultIntervalDays: 30, searchQuery: "dishwasher cleaner", estimatedCostCents: 1000 },
  { applianceCategory: "APPLIANCE", consumableName: "Dryer Vent Cleaning", consumableDescription: "Professional lint/vent cleaning to prevent fire hazard", defaultIntervalDays: 365, searchQuery: "dryer vent cleaning service", estimatedCostCents: 15000 },
  { applianceCategory: "PLUMBING", consumableName: "Water Softener Salt", consumableDescription: "Salt for water softener brine tank", defaultIntervalDays: 60, searchQuery: "water softener salt", estimatedCostCents: 1500 },
  { applianceCategory: "PLUMBING", consumableName: "Water Heater Flush", consumableDescription: "Drain and flush sediment from tank water heater", defaultIntervalDays: 365, searchQuery: "water heater flush service", estimatedCostCents: 15000 },
  { applianceCategory: "OUTDOOR", consumableName: "Lawn Mower Blade Sharpening", consumableDescription: "Sharpen or replace mower blades for clean cut", defaultIntervalDays: 180, searchQuery: "lawn mower blade sharpening", estimatedCostCents: 3000 },
  { applianceCategory: "HVAC", consumableName: "HVAC Coil Cleaning", consumableDescription: "Professional evaporator/condenser coil cleaning", defaultIntervalDays: 365, searchQuery: "HVAC coil cleaning service", estimatedCostCents: 20000 },
  { applianceCategory: "ELECTRICAL", consumableName: "Smoke Detector Batteries", consumableDescription: "Replace 9V or AA batteries in smoke/CO detectors", defaultIntervalDays: 180, searchQuery: "smoke detector batteries", estimatedCostCents: 1500 },
  { applianceCategory: "ELECTRICAL", consumableName: "Smoke Detector Replacement", consumableDescription: "Replace smoke detectors per NFPA guidelines (10 year lifespan)", defaultIntervalDays: 3650, searchQuery: "smoke detector", estimatedCostCents: 3000 },
  { applianceCategory: "APPLIANCE", consumableName: "Garbage Disposal Cleaning", consumableDescription: "Deep clean with ice, salt, and citrus or cleaning pods", defaultIntervalDays: 30, searchQuery: "garbage disposal cleaner", estimatedCostCents: 800 },
  { applianceCategory: "PLUMBING", consumableName: "Whole-House Water Filter", consumableDescription: "Replace sediment or carbon filter cartridge", defaultIntervalDays: 90, searchQuery: "whole house water filter cartridge", estimatedCostCents: 4000 },
  { applianceCategory: "OUTDOOR", consumableName: "Gutter Cleaning", consumableDescription: "Clear gutters and downspouts of debris", defaultIntervalDays: 180, searchQuery: "gutter cleaning service", estimatedCostCents: 20000 },
];

export async function seedConsumables(): Promise<void> {
  try {
    const [result] = await db.select({ total: count() }).from(applianceConsumables);
    if (result.total > 0) {
      logger.info(`[Seed] Consumables already seeded (${result.total} records)`);
      return;
    }

    await db.insert(applianceConsumables).values(COMMON_CONSUMABLES);
    logger.info(`[Seed] Seeded ${COMMON_CONSUMABLES.length} consumable records`);
  } catch (e) {
    logger.error("[Seed] Failed to seed consumables", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
