import { Router, Request, Response } from "express";
import { db } from "../db";
import { serviceExecutionEvents, propertyRooms } from "@shared/schema";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import logger from "../lib/logger";
import { subDays } from "date-fns";

const router = Router();

router.post(
  "/service-execution/events",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const {
        relatedEntityType,
        relatedEntityId,
        eventType,
        roomId,
        playbookStepId,
        timestamp,
        durationSeconds,
        notes,
        metadata,
        executorType,
        executorId,
      } = req.body;

      if (!relatedEntityType || !relatedEntityId || !eventType) {
        return res.status(400).json({ error: "relatedEntityType, relatedEntityId, and eventType are required" });
      }

      if (roomId) {
        const [room] = await db.select().from(propertyRooms)
          .where(and(eq(propertyRooms.id, roomId), eq(propertyRooms.householdId, householdId)))
          .limit(1);
        if (!room) {
          return res.status(400).json({ error: "Room not found in this household" });
        }
      }

      const [event] = await db
        .insert(serviceExecutionEvents)
        .values({
          householdId,
          relatedEntityType,
          relatedEntityId,
          eventType,
          roomId: roomId || null,
          playbookStepId: playbookStepId || null,
          timestamp: timestamp ? new Date(timestamp) : new Date(),
          durationSeconds: durationSeconds || null,
          notes: notes || null,
          metadata: metadata || {},
          executorType: executorType || "HUMAN",
          executorId: executorId || null,
        })
        .returning();

      logger.info("Service execution event logged", { eventId: event.id, householdId, eventType });

      res.status(201).json({ event });
    } catch (error: unknown) {
      logger.error("Failed to log execution event", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to log execution event" });
    }
  }
);

router.get(
  "/service-execution/events",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const { entityType, entityId, roomId, eventType, limit: limitParam } = req.query;

      const conditions = [eq(serviceExecutionEvents.householdId, householdId)];

      if (entityType) {
        conditions.push(eq(serviceExecutionEvents.relatedEntityType, entityType as string));
      }
      if (entityId) {
        conditions.push(eq(serviceExecutionEvents.relatedEntityId, entityId as string));
      }
      if (roomId) {
        conditions.push(eq(serviceExecutionEvents.roomId, roomId as string));
      }
      if (eventType) {
        conditions.push(eq(serviceExecutionEvents.eventType, eventType as typeof serviceExecutionEvents.eventType.enumValues[number]));
      }

      const maxRows = Math.min(Number(limitParam) || 100, 500);

      const events = await db
        .select()
        .from(serviceExecutionEvents)
        .where(and(...conditions))
        .orderBy(desc(serviceExecutionEvents.timestamp))
        .limit(maxRows);

      res.json({ events, meta: { count: events.length } });
    } catch (error: unknown) {
      logger.error("Failed to fetch execution events", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to fetch execution events" });
    }
  }
);

router.get(
  "/service-execution/summary",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const { entityType, entityId } = req.query;

      if (!entityType || !entityId) {
        return res.status(400).json({ error: "entityType and entityId are required" });
      }

      const conditions = [
        eq(serviceExecutionEvents.householdId, householdId),
        eq(serviceExecutionEvents.relatedEntityType, entityType as string),
        eq(serviceExecutionEvents.relatedEntityId, entityId as string),
      ];

      const [totals] = await db
        .select({
          totalEvents: sql<number>`count(*)`,
          totalDurationSeconds: sql<number>`coalesce(sum(${serviceExecutionEvents.durationSeconds}), 0)`,
          firstEvent: sql<string>`min(${serviceExecutionEvents.timestamp})`,
          lastEvent: sql<string>`max(${serviceExecutionEvents.timestamp})`,
        })
        .from(serviceExecutionEvents)
        .where(and(...conditions));

      const byType = await db
        .select({
          eventType: serviceExecutionEvents.eventType,
          count: sql<number>`count(*)`,
          totalDuration: sql<number>`coalesce(sum(${serviceExecutionEvents.durationSeconds}), 0)`,
          avgDuration: sql<number>`coalesce(avg(${serviceExecutionEvents.durationSeconds}), 0)`,
        })
        .from(serviceExecutionEvents)
        .where(and(...conditions))
        .groupBy(serviceExecutionEvents.eventType)
        .orderBy(sql`count(*) desc`);

      const byRoom = await db
        .select({
          roomId: serviceExecutionEvents.roomId,
          count: sql<number>`count(*)`,
          totalDuration: sql<number>`coalesce(sum(${serviceExecutionEvents.durationSeconds}), 0)`,
          avgDuration: sql<number>`coalesce(avg(${serviceExecutionEvents.durationSeconds}), 0)`,
        })
        .from(serviceExecutionEvents)
        .where(and(...conditions))
        .groupBy(serviceExecutionEvents.roomId)
        .orderBy(sql`coalesce(sum(${serviceExecutionEvents.durationSeconds}), 0) desc`);

      const byExecutorType = await db
        .select({
          executorType: serviceExecutionEvents.executorType,
          count: sql<number>`count(*)`,
          totalDuration: sql<number>`coalesce(sum(${serviceExecutionEvents.durationSeconds}), 0)`,
        })
        .from(serviceExecutionEvents)
        .where(and(...conditions))
        .groupBy(serviceExecutionEvents.executorType);

      res.json({
        summary: {
          totalEvents: Number(totals.totalEvents),
          totalDurationSeconds: Number(totals.totalDurationSeconds),
          firstEvent: totals.firstEvent,
          lastEvent: totals.lastEvent,
          byType,
          byRoom,
          byExecutorType,
        },
      });
    } catch (error: unknown) {
      logger.error("Failed to fetch execution summary", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to fetch execution summary" });
    }
  }
);

router.get(
  "/service-execution/analytics",
  isAuthenticated,
  householdContextMiddleware,
  async (req: Request, res: Response) => {
    try {
      const householdId = req.householdId!;
      const periodParam = (req.query.period as string) || "90d";
      const days = parseInt(periodParam.replace("d", ""), 10) || 90;
      const since = subDays(new Date(), days);

      const conditions = [
        eq(serviceExecutionEvents.householdId, householdId),
        gte(serviceExecutionEvents.timestamp, since),
      ];

      const roomAnalytics = await db
        .select({
          roomId: serviceExecutionEvents.roomId,
          roomName: propertyRooms.name,
          roomType: propertyRooms.roomType,
          totalEvents: sql<number>`count(*)`,
          totalDurationSeconds: sql<number>`coalesce(sum(${serviceExecutionEvents.durationSeconds}), 0)`,
          avgDurationSeconds: sql<number>`coalesce(avg(${serviceExecutionEvents.durationSeconds}), 0)`,
          uniqueVisits: sql<number>`count(distinct date_trunc('day', ${serviceExecutionEvents.timestamp}))`,
        })
        .from(serviceExecutionEvents)
        .leftJoin(propertyRooms, eq(serviceExecutionEvents.roomId, propertyRooms.id))
        .where(and(...conditions))
        .groupBy(serviceExecutionEvents.roomId, propertyRooms.name, propertyRooms.roomType)
        .orderBy(sql`coalesce(sum(${serviceExecutionEvents.durationSeconds}), 0) desc`);

      const eventTypeTrends = await db
        .select({
          eventType: serviceExecutionEvents.eventType,
          count: sql<number>`count(*)`,
          totalDuration: sql<number>`coalesce(sum(${serviceExecutionEvents.durationSeconds}), 0)`,
        })
        .from(serviceExecutionEvents)
        .where(and(...conditions))
        .groupBy(serviceExecutionEvents.eventType)
        .orderBy(sql`count(*) desc`);

      const executorBreakdown = await db
        .select({
          executorType: serviceExecutionEvents.executorType,
          count: sql<number>`count(*)`,
          totalDuration: sql<number>`coalesce(sum(${serviceExecutionEvents.durationSeconds}), 0)`,
        })
        .from(serviceExecutionEvents)
        .where(and(...conditions))
        .groupBy(serviceExecutionEvents.executorType);

      const [overallStats] = await db
        .select({
          totalEvents: sql<number>`count(*)`,
          totalDurationSeconds: sql<number>`coalesce(sum(${serviceExecutionEvents.durationSeconds}), 0)`,
          issuesFound: sql<number>`count(*) filter (where ${serviceExecutionEvents.eventType} = 'ISSUE_FOUND')`,
          suppliesNeeded: sql<number>`count(*) filter (where ${serviceExecutionEvents.eventType} = 'SUPPLY_NEEDED')`,
        })
        .from(serviceExecutionEvents)
        .where(and(...conditions));

      res.json({
        analytics: {
          period: { days, since: since.toISOString() },
          overall: {
            totalEvents: Number(overallStats.totalEvents),
            totalDurationSeconds: Number(overallStats.totalDurationSeconds),
            issuesFound: Number(overallStats.issuesFound),
            suppliesNeeded: Number(overallStats.suppliesNeeded),
          },
          byRoom: roomAnalytics,
          byEventType: eventTypeTrends,
          byExecutorType: executorBreakdown,
        },
      });
    } catch (error: unknown) {
      logger.error("Failed to fetch execution analytics", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Failed to fetch execution analytics" });
    }
  }
);

export function registerServiceExecutionRoutes(app: Router) {
  app.use(router);
}
