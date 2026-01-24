import cron from "node-cron";
import { createBackupZip, cleanupOldBackups, getBackupSettings } from "./backup";
import { syncCalendarEvents } from "./google-calendar";
import { runProactiveAgent } from "./ai-agent";
import { runWeeklyBriefScheduler } from "./weekly-brief";
import { db } from "../db";
import { calendarConnections } from "@shared/schema";

let scheduledBackupTask: ReturnType<typeof cron.schedule> | null = null;
let calendarSyncJob: ReturnType<typeof cron.schedule> | null = null;
let proactiveAgentJob: ReturnType<typeof cron.schedule> | null = null;
let eveningAgentJob: ReturnType<typeof cron.schedule> | null = null;
let weeklyBriefJob: ReturnType<typeof cron.schedule> | null = null;

export function startScheduledBackups(): void {
  const settings = getBackupSettings();
  
  if (!settings.scheduledBackupsEnabled) {
    console.log("[Scheduler] Scheduled backups are disabled");
    return;
  }

  if (scheduledBackupTask) {
    scheduledBackupTask.stop();
  }

  const cronExpression = `${settings.backupTimeMinute} ${settings.backupTimeHour} * * *`;
  
  scheduledBackupTask = cron.schedule(cronExpression, async () => {
    console.log("[Scheduler] Running scheduled backup...");
    try {
      const backupPath = await createBackupZip(true);
      console.log(`[Scheduler] Backup completed: ${backupPath}`);
      
      const deletedCount = cleanupOldBackups();
      if (deletedCount > 0) {
        console.log(`[Scheduler] Cleaned up ${deletedCount} old backups`);
      }
    } catch (error) {
      console.error("[Scheduler] Backup failed:", error);
    }
  });

  console.log(`[Scheduler] Scheduled backups enabled at ${settings.backupTimeHour}:${String(settings.backupTimeMinute).padStart(2, "0")}`);
}

export function stopScheduledBackups(): void {
  if (scheduledBackupTask) {
    scheduledBackupTask.stop();
    scheduledBackupTask = null;
    console.log("[Scheduler] Scheduled backups stopped");
  }
}

export function restartScheduledBackups(): void {
  stopScheduledBackups();
  startScheduledBackups();
}

export function startCalendarSync(): void {
  if (calendarSyncJob) {
    console.log("[Scheduler] Calendar sync already running");
    return;
  }

  const isEnabled = process.env.ENABLE_CALENDAR_SYNC !== "false";
  if (!isEnabled) {
    console.log("[Scheduler] Calendar sync disabled via env var");
    return;
  }

  calendarSyncJob = cron.schedule("*/15 * * * *", async () => {
    const startTime = Date.now();
    console.log("[Scheduler] Starting calendar sync...");
    
    try {
      const connections = await db
        .selectDistinct({ householdId: calendarConnections.householdId })
        .from(calendarConnections);
      
      if (connections.length === 0) {
        console.log("[Scheduler] No calendar connections to sync");
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
            console.log(`[Scheduler] Synced ${result.synced} events for household ${householdId}`);
          } else if (result.error) {
            errorCount++;
            console.log(`[Scheduler] Skipped household ${householdId}: ${result.error}`);
          }
        } catch (error: any) {
          errorCount++;
          console.error(`[Scheduler] Failed to sync household ${householdId}:`, error.message);
        }
      }

      const duration = Date.now() - startTime;
      console.log(`[Scheduler] Calendar sync complete: ${totalSynced} events, ${successCount} succeeded, ${errorCount} failed (${duration}ms)`);
    } catch (error: any) {
      console.error("[Scheduler] Calendar sync job failed:", error.message);
    }
  });

  console.log("[Scheduler] Calendar sync scheduled (every 15 minutes)");
}

export function stopCalendarSync(): void {
  if (calendarSyncJob) {
    calendarSyncJob.stop();
    calendarSyncJob = null;
    console.log("[Scheduler] Calendar sync stopped");
  }
}

export async function triggerImmediateSync(): Promise<{ total: number; succeeded: number; failed: number }> {
  console.log("[Scheduler] Triggering immediate calendar sync...");
  
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
    console.log("[Scheduler] Proactive agent already running");
    return;
  }

  const isEnabled = process.env.ENABLE_PROACTIVE_AI !== "false";
  if (!isEnabled) {
    console.log("[Scheduler] Proactive AI agent disabled via env var");
    return;
  }

  proactiveAgentJob = cron.schedule("0 8 * * *", async () => {
    const startTime = Date.now();
    console.log("[Scheduler] Running proactive AI agent...");
    
    try {
      await runProactiveAgent();
      const duration = Date.now() - startTime;
      console.log(`[Scheduler] Proactive agent completed (${duration}ms)`);
    } catch (error: any) {
      console.error("[Scheduler] Proactive agent failed:", error.message);
    }
  });

  eveningAgentJob = cron.schedule("0 18 * * *", async () => {
    console.log("[Scheduler] Running evening proactive check...");
    try {
      await runProactiveAgent();
    } catch (error: any) {
      console.error("[Scheduler] Evening proactive check failed:", error.message);
    }
  });

  console.log("[Scheduler] Proactive AI agent scheduled (8am and 6pm daily)");
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
  console.log("[Scheduler] Proactive agent stopped");
}

export function startWeeklyBriefScheduler(): void {
  if (weeklyBriefJob) {
    console.log("[Scheduler] Weekly brief scheduler already running");
    return;
  }

  const isEnabled = process.env.ENABLE_WEEKLY_BRIEF !== "false";
  if (!isEnabled) {
    console.log("[Scheduler] Weekly brief scheduler disabled via env var");
    return;
  }

  weeklyBriefJob = cron.schedule("0 8 * * 0", async () => {
    console.log("[Scheduler] Running Sunday morning weekly brief delivery...");
    try {
      const result = await runWeeklyBriefScheduler();
      console.log(`[Scheduler] Weekly briefs: ${result.sent} sent, ${result.failed} failed`);
    } catch (error: any) {
      console.error("[Scheduler] Weekly brief scheduler failed:", error.message);
    }
  });

  cron.schedule("0 18 * * 0", async () => {
    console.log("[Scheduler] Running Sunday evening weekly brief delivery...");
    try {
      const result = await runWeeklyBriefScheduler();
      console.log(`[Scheduler] Weekly briefs (evening): ${result.sent} sent, ${result.failed} failed`);
    } catch (error: any) {
      console.error("[Scheduler] Weekly brief scheduler (evening) failed:", error.message);
    }
  });

  console.log("[Scheduler] Weekly brief scheduler started (Sunday 8am and 6pm)");
}

export function stopWeeklyBriefScheduler(): void {
  if (weeklyBriefJob) {
    weeklyBriefJob.stop();
    weeklyBriefJob = null;
    console.log("[Scheduler] Weekly brief scheduler stopped");
  }
}

export function startAllSchedulers(): void {
  startScheduledBackups();
  startCalendarSync();
  startProactiveAgent();
  startWeeklyBriefScheduler();
}
