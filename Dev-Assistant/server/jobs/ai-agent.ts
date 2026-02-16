import type PgBoss from "pg-boss";
import { runProactiveAgent } from "../services/ai-agent";
import logger from "../lib/logger";

export async function handleAiAgentJob(job: PgBoss.Job): Promise<void> {
  const startTime = Date.now();
  const trigger = (job.data as any)?.trigger || "unknown";
  logger.info("[AIAgent Job] Starting", { jobId: job.id, trigger });

  await runProactiveAgent();

  const duration = Date.now() - startTime;
  logger.info("[AIAgent Job] Complete", {
    jobId: job.id,
    trigger,
    durationMs: duration,
  });
}
