import type PgBoss from "pg-boss";
import { runWeeklyBriefScheduler } from "../services/weekly-brief";
import logger from "../lib/logger";

export async function handleWeeklyBriefJob(job: PgBoss.Job): Promise<void> {
  const startTime = Date.now();
  const trigger = (job.data as any)?.trigger || "unknown";
  logger.info("[WeeklyBrief Job] Starting", { jobId: job.id, trigger });

  const result = await runWeeklyBriefScheduler();
  const duration = Date.now() - startTime;

  logger.info("[WeeklyBrief Job] Complete", {
    jobId: job.id,
    trigger,
    sent: result.sent,
    failed: result.failed,
    durationMs: duration,
  });
}
