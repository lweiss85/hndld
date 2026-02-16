import type PgBoss from "pg-boss";
import { syncCalendarEvents } from "../services/google-calendar";
import { db } from "../db";
import { calendarConnections } from "@shared/schema";
import logger from "../lib/logger";

export async function handleCalendarSyncJob(job: PgBoss.Job): Promise<void> {
  const startTime = Date.now();
  logger.info("[CalendarSync Job] Starting", { jobId: job.id });

  const connections = await db
    .selectDistinct({ householdId: calendarConnections.householdId })
    .from(calendarConnections);

  if (connections.length === 0) {
    logger.info("[CalendarSync Job] No calendar connections to sync");
    return;
  }

  let totalSynced = 0;
  let successCount = 0;
  let errorCount = 0;

  for (const { householdId } of connections) {
    try {
      const result = await syncCalendarEvents(householdId);
      if (result.synced !== undefined) {
        totalSynced += result.synced;
        successCount++;
      } else if (result.error) {
        errorCount++;
        logger.debug("[CalendarSync Job] Skipped household", { householdId, error: result.error });
      }
    } catch (error: any) {
      errorCount++;
      logger.error("[CalendarSync Job] Failed for household", { householdId, error: error.message });
    }
  }

  const duration = Date.now() - startTime;
  logger.info("[CalendarSync Job] Complete", {
    jobId: job.id,
    totalSynced,
    successCount,
    errorCount,
    durationMs: duration,
  });
}
