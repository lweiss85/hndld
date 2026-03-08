import { Router, Request, Response } from "express";
import { db } from "../db";
import {
  properties, propertyRooms, people, preferences,
  inventoryItems, cleaningVisits, playbooks, playbookSteps,
  automations, householdSettings,
} from "@shared/schema";
import { eq, and, desc, gte, asc } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import { subDays, differenceInDays } from "date-fns";
import logger from "../lib/logger";

const router = Router();

function deriveCondition(item: {
  purchaseDate: string | null;
  warrantyExpires: string | null;
  lastServiceDate: string | null;
  nextServiceDue: string | null;
  serviceIntervalDays: number | null;
}): { status: string; ageDays: number | null; warrantyActive: boolean; serviceOverdue: boolean } {
  const now = new Date();
  let ageDays: number | null = null;
  if (item.purchaseDate) {
    ageDays = differenceInDays(now, new Date(item.purchaseDate));
  }

  let warrantyActive = false;
  if (item.warrantyExpires) {
    warrantyActive = new Date(item.warrantyExpires) > now;
  }

  let serviceOverdue = false;
  if (item.nextServiceDue) {
    serviceOverdue = new Date(item.nextServiceDue) < now;
  } else if (item.lastServiceDate && item.serviceIntervalDays) {
    const nextDue = new Date(item.lastServiceDate);
    nextDue.setDate(nextDue.getDate() + item.serviceIntervalDays);
    serviceOverdue = nextDue < now;
  }

  let status = "good";
  if (serviceOverdue) {
    status = "needs_service";
  } else if (ageDays && ageDays > 365 * 10) {
    status = "aging";
  } else if (ageDays && ageDays > 365 * 5) {
    status = "mature";
  }

  return { status, ageDays, warrantyActive, serviceOverdue };
}

router.get(
  "/household-context/:householdId",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { householdId } = req.params;
      const reqHouseholdId = req.householdId;

      if (reqHouseholdId !== householdId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const sixMonthsAgo = subDays(new Date(), 180);

      const [
        householdProps,
        householdPeople,
        householdPrefs,
        inventory,
        visits,
        householdPlaybooks,
        householdAutomations,
        settings,
      ] = await Promise.all([
        db.select().from(properties)
          .where(and(eq(properties.householdId, householdId), eq(properties.isActive, true))),
        db.select().from(people)
          .where(eq(people.householdId, householdId)),
        db.select().from(preferences)
          .where(eq(preferences.householdId, householdId)),
        db.select().from(inventoryItems)
          .where(and(eq(inventoryItems.householdId, householdId), eq(inventoryItems.isActive, true))),
        db.select().from(cleaningVisits)
          .where(and(eq(cleaningVisits.householdId, householdId), gte(cleaningVisits.scheduledAt, sixMonthsAgo)))
          .orderBy(desc(cleaningVisits.scheduledAt))
          .limit(50),
        db.select().from(playbooks)
          .where(and(eq(playbooks.householdId, householdId), eq(playbooks.isActive, true))),
        db.select().from(automations)
          .where(and(eq(automations.householdId, householdId), eq(automations.isEnabled, true))),
        db.select().from(householdSettings)
          .where(eq(householdSettings.householdId, householdId))
          .limit(1),
      ]);

      const propertyIds = householdProps.map(p => p.id);

      let rooms: (typeof propertyRooms.$inferSelect)[] = [];
      if (propertyIds.length > 0) {
        const roomPromises = propertyIds.map(pid =>
          db.select().from(propertyRooms)
            .where(and(
              eq(propertyRooms.propertyId, pid),
              eq(propertyRooms.householdId, householdId),
              eq(propertyRooms.isActive, true)
            ))
            .orderBy(asc(propertyRooms.sortOrder))
        );
        const roomResults = await Promise.all(roomPromises);
        rooms = roomResults.flat();
      }

      const playbookIds = householdPlaybooks.map(p => p.id);
      let steps: (typeof playbookSteps.$inferSelect)[] = [];
      if (playbookIds.length > 0) {
        const stepPromises = playbookIds.map(pid =>
          db.select().from(playbookSteps)
            .where(eq(playbookSteps.playbookId, pid))
            .orderBy(asc(playbookSteps.stepNumber))
        );
        const stepResults = await Promise.all(stepPromises);
        steps = stepResults.flat();
      }

      const inventoryWithCondition = inventory.map(item => ({
        ...item,
        condition: deriveCondition(item),
      }));

      const propertiesWithRooms = householdProps.map(prop => ({
        ...prop,
        rooms: rooms.filter(r => r.propertyId === prop.id),
      }));

      const playbooksWithSteps = householdPlaybooks.map(pb => ({
        ...pb,
        steps: steps.filter(s => s.playbookId === pb.id),
      }));

      const hardConstraints = householdPrefs.filter(p => p.isNoGo || p.severity === "hard");
      const softPreferences = householdPrefs.filter(p => !p.isNoGo && p.severity !== "hard");

      const briefing = {
        householdId,
        generatedAt: new Date().toISOString(),
        settings: settings[0] || null,
        properties: propertiesWithRooms,
        people: householdPeople,
        constraints: {
          hard: hardConstraints,
          soft: softPreferences,
        },
        inventory: inventoryWithCondition,
        recentCleaningVisits: visits,
        playbooks: playbooksWithSteps,
        automations: householdAutomations,
        summary: {
          propertyCount: householdProps.length,
          roomCount: rooms.length,
          peopleCount: householdPeople.length,
          inventoryCount: inventory.length,
          itemsNeedingService: inventoryWithCondition.filter(i => i.condition.serviceOverdue).length,
          hardConstraintCount: hardConstraints.length,
          softPreferenceCount: softPreferences.length,
          activePlaybookCount: householdPlaybooks.length,
          activeAutomationCount: householdAutomations.length,
          recentVisitCount: visits.length,
        },
      };

      res.json(briefing);
    } catch (error: unknown) {
      logger.error("Failed to build household context", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to build household context" });
    }
  }
);

export function registerHouseholdContextRoutes(app: Router) {
  app.use(router);
}
