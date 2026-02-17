import cron from "node-cron";
import { createBackupZip, cleanupOldBackups, getBackupSettings } from "./backup";
import { syncCalendarEvents } from "./google-calendar";
import { runProactiveAgent } from "./ai-agent";
import { runWeeklyBriefScheduler } from "./weekly-brief";
import { db } from "../db";
import { calendarConnections } from "@shared/schema";
import logger from "../lib/logger";

let scheduledBackupTask: ReturnType<typeof cron.schedule> | null = null;
let calendarSyncJob: ReturnType<typeof cron.schedule> | null = null;
let proactiveAgentJob: ReturnType<typeof cron.schedule> | null = null;
let eveningAgentJob: ReturnType<typeof cron.schedule> | null = null;
let weeklyBriefMorningJob: ReturnType<typeof cron.schedule> | null = null;
let weeklyBriefEveningJob: ReturnType<typeof cron.schedule> | null = null;

export function startScheduledBackups(): void {
  const settings = getBackupSettings();
  
  if (!settings.scheduledBackupsEnabled) {
    logger.info("[Scheduler] Scheduled backups are disabled");
    return;
  }

  if (scheduledBackupTask) {
    scheduledBackupTask.stop();
  }

  const cronExpression = `${settings.backupTimeMinute} ${settings.backupTimeHour} * * *`;
  
  scheduledBackupTask = cron.schedule(cronExpression, async () => {
    logger.info("[Scheduler] Running scheduled backup...");
    try {
      const backupPath = await createBackupZip(true);
      logger.info("[Scheduler] Backup completed", { backupPath });
      
      const deletedCount = cleanupOldBackups();
      if (deletedCount > 0) {
        logger.info("[Scheduler] Cleaned up old backups", { deletedCount });
      }
    } catch (error) {
      logger.error("[Scheduler] Backup failed", { error: error instanceof Error ? error.message : String(error) });
    }
  });

  logger.info("[Scheduler] Scheduled backups enabled", { hour: settings.backupTimeHour, minute: settings.backupTimeMinute });
}

export function stopScheduledBackups(): void {
  if (scheduledBackupTask) {
    scheduledBackupTask.stop();
    scheduledBackupTask = null;
    logger.info("[Scheduler] Scheduled backups stopped");
  }
}

export function restartScheduledBackups(): void {
  stopScheduledBackups();
  startScheduledBackups();
}

export function startCalendarSync(): void {
  if (calendarSyncJob) {
    logger.info("[Scheduler] Calendar sync already running");
    return;
  }

  const isEnabled = process.env.ENABLE_CALENDAR_SYNC !== "false";
  if (!isEnabled) {
    logger.info("[Scheduler] Calendar sync disabled via env var");
    return;
  }

  calendarSyncJob = cron.schedule("*/15 * * * *", async () => {
    const startTime = Date.now();
    logger.info("[Scheduler] Starting calendar sync...");
    
    try {
      const connections = await db
        .selectDistinct({ householdId: calendarConnections.householdId })
        .from(calendarConnections);
      
      if (connections.length === 0) {
        logger.info("[Scheduler] No calendar connections to sync");
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
            logger.info("[Scheduler] Synced events for household", { synced: result.synced, householdId });
          } else if (result.error) {
            errorCount++;
            logger.info("[Scheduler] Skipped household", { householdId, reason: result.error });
          }
        } catch (error: unknown) {
          errorCount++;
          const message = error instanceof Error ? error.message : "Unknown error";
          logger.error("[Scheduler] Failed to sync household", { householdId, error: message });
        }
      }

      const duration = Date.now() - startTime;
      logger.info("[Scheduler] Calendar sync complete", { totalSynced, successCount, errorCount, duration });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("[Scheduler] Calendar sync job failed", { error: message });
    }
  });

  logger.info("[Scheduler] Calendar sync scheduled (every 15 minutes)");
}

export function stopCalendarSync(): void {
  if (calendarSyncJob) {
    calendarSyncJob.stop();
    calendarSyncJob = null;
    logger.info("[Scheduler] Calendar sync stopped");
  }
}

export async function triggerImmediateSync(): Promise<{ total: number; succeeded: number; failed: number }> {
  logger.info("[Scheduler] Triggering immediate calendar sync...");
  
  const connections = await db
    .selectDistinct({ householdId: calendarConnections.householdId })
    .from(calendarConnections);
  
  const results = await Promise.allSettled(
    connections.map(({ householdId }) => syncCalendarEvents(householdId))
  );
  
  return {
    total: connections.length,
    succeeded: results.filter(r => r.status === "fulfilled").length,
    failed: results.filter(r => r.status === "rejected").length,
  };
}

export function startProactiveAgent(): void {
  if (proactiveAgentJob) {
    logger.info("[Scheduler] Proactive agent already running");
    return;
  }

  const isEnabled = process.env.ENABLE_PROACTIVE_AI !== "false";
  if (!isEnabled) {
    logger.info("[Scheduler] Proactive AI agent disabled via env var");
    return;
  }

  proactiveAgentJob = cron.schedule("0 8 * * *", async () => {
    const startTime = Date.now();
    logger.info("[Scheduler] Running proactive AI agent...");
    
    try {
      await runProactiveAgent();
      const duration = Date.now() - startTime;
      logger.info("[Scheduler] Proactive agent completed", { duration });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("[Scheduler] Proactive agent failed", { error: message });
    }
  });

  eveningAgentJob = cron.schedule("0 18 * * *", async () => {
    logger.info("[Scheduler] Running evening proactive check...");
    try {
      await runProactiveAgent();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("[Scheduler] Evening proactive check failed", { error: message });
    }
  });

  logger.info("[Scheduler] Proactive AI agent scheduled (8am and 6pm daily)");
}

export function stopProactiveAgent(): void {
  if (proactiveAgentJob) {
    proactiveAgentJob.stop();
    proactiveAgentJob = null;
  }
  if (eveningAgentJob) {
    eveningAgentJob.stop();
    eveningAgentJob = null;
  }
  logger.info("[Scheduler] Proactive agent stopped");
}

export function startWeeklyBriefScheduler(): void {
  if (weeklyBriefMorningJob || weeklyBriefEveningJob) {
    logger.info("[Scheduler] Weekly brief scheduler already running");
    return;
  }

  const isEnabled = process.env.ENABLE_WEEKLY_BRIEF !== "false";
  if (!isEnabled) {
    logger.info("[Scheduler] Weekly brief scheduler disabled via env var");
    return;
  }

  weeklyBriefMorningJob = cron.schedule("0 8 * * 0", async () => {
    logger.info("[Scheduler] Running Sunday morning weekly brief delivery...");
    try {
      const result = await runWeeklyBriefScheduler();
      logger.info("[Scheduler] Weekly briefs delivered", { sent: result.sent, failed: result.failed });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("[Scheduler] Weekly brief scheduler failed", { error: message });
    }
  });

  weeklyBriefEveningJob = cron.schedule("0 18 * * 0", async () => {
    logger.info("[Scheduler] Running Sunday evening weekly brief delivery...");
    try {
      const result = await runWeeklyBriefScheduler();
      logger.info("[Scheduler] Weekly briefs (evening) delivered", { sent: result.sent, failed: result.failed });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("[Scheduler] Weekly brief scheduler (evening) failed", { error: message });
    }
  });

  logger.info("[Scheduler] Weekly brief scheduler started (Sunday 8am and 6pm)");
}

export function stopWeeklyBriefScheduler(): void {
  if (weeklyBriefMorningJob) {
    weeklyBriefMorningJob.stop();
    weeklyBriefMorningJob = null;
  }
  if (weeklyBriefEveningJob) {
    weeklyBriefEveningJob.stop();
    weeklyBriefEveningJob = null;
  }
  logger.info("[Scheduler] Weekly brief scheduler stopped");
}

export function startAllSchedulers(): void {
  startScheduledBackups();
  startCalendarSync();
  startProactiveAgent();
  startWeeklyBriefScheduler();
}
