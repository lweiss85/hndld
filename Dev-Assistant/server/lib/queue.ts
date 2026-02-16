import PgBoss from "pg-boss";
import logger from "./logger";

export const JOB_NAMES = {
  WEEKLY_BRIEF: "weekly-brief",
  SEND_EMAIL: "send-email",
  CALENDAR_SYNC: "calendar-sync",
  AI_AGENT: "ai-agent",
  BACKUP: "backup",
} as const;

let boss: PgBoss | null = null;
let started = false;

export async function getQueue(): Promise<PgBoss> {
  if (boss && started) return boss;

  if (!boss) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required for job queue");
    }

    boss = new PgBoss({
      connectionString,
      retryLimit: 3,
      retryDelay: 30,
      retryBackoff: true,
      expireInHours: 4,
      archiveCompletedAfterSeconds: 60 * 60,
      deleteAfterDays: 7,
      monitorStateIntervalSeconds: 30,
      migrate: true,
    });

    boss.on("error", (error) => {
      logger.error("Queue error", { message: error.message });
    });

    boss.on("monitor-states", (states) => {
      logger.debug("Queue states", states);
    });
  }

  if (!started) {
    await boss.start();
    started = true;
    logger.info("Job queue started (pg-boss)");
  }

  return boss;
}

export async function createQueues(): Promise<void> {
  const queue = await getQueue();
  for (const name of Object.values(JOB_NAMES)) {
    await queue.createQueue(name);
  }
  logger.info("Job queues created", { queues: Object.values(JOB_NAMES) });
}

export async function scheduleRecurringJobs(): Promise<void> {
  const queue = await getQueue();
  await createQueues();

  await queue.schedule(JOB_NAMES.CALENDAR_SYNC, "*/15 * * * *", {}, {
    retryLimit: 2,
    expireInMinutes: 10,
    singletonKey: "calendar-sync-global",
  });

  await queue.schedule(JOB_NAMES.AI_AGENT, "0 8 * * *", { trigger: "morning" }, {
    retryLimit: 1,
    expireInMinutes: 30,
    singletonKey: "ai-agent-morning",
  });

  await queue.schedule(JOB_NAMES.AI_AGENT, "0 18 * * *", { trigger: "evening" }, {
    retryLimit: 1,
    expireInMinutes: 30,
    singletonKey: "ai-agent-evening",
  });

  await queue.schedule(JOB_NAMES.WEEKLY_BRIEF, "0 8 * * 0", { trigger: "morning" }, {
    retryLimit: 2,
    expireInMinutes: 60,
    singletonKey: "weekly-brief-morning",
  });

  await queue.schedule(JOB_NAMES.WEEKLY_BRIEF, "0 18 * * 0", { trigger: "evening" }, {
    retryLimit: 2,
    expireInMinutes: 60,
    singletonKey: "weekly-brief-evening",
  });

  logger.info("Recurring jobs scheduled", {
    jobs: [
      "calendar-sync (every 15min)",
      "ai-agent (8am, 6pm daily)",
      "weekly-brief (Sunday 8am, 6pm)",
    ],
  });
}

export async function registerWorkers(): Promise<void> {
  const queue = await getQueue();

  const { handleCalendarSyncJob } = await import("../jobs/calendar-sync");
  const { handleWeeklyBriefJob } = await import("../jobs/weekly-brief");
  const { handleSendEmailJob } = await import("../jobs/send-email");
  const { handleAiAgentJob } = await import("../jobs/ai-agent");

  await queue.work(JOB_NAMES.CALENDAR_SYNC, handleCalendarSyncJob);
  await queue.work(JOB_NAMES.WEEKLY_BRIEF, handleWeeklyBriefJob);
  await queue.work(JOB_NAMES.SEND_EMAIL, { batchSize: 5 }, handleSendEmailJob);
  await queue.work(JOB_NAMES.AI_AGENT, handleAiAgentJob);

  logger.info("Queue workers registered", {
    workers: Object.values(JOB_NAMES),
  });
}

export async function enqueueEmail(data: {
  to: string;
  subject: string;
  body: string;
  html?: string;
}): Promise<string | null> {
  const queue = await getQueue();
  return queue.send(JOB_NAMES.SEND_EMAIL, data, {
    retryLimit: 3,
    retryDelay: 60,
    expireInMinutes: 30,
  });
}

export async function enqueueJob(
  name: string,
  data: Record<string, any> = {},
  options: PgBoss.SendOptions = {}
): Promise<string | null> {
  const queue = await getQueue();
  return queue.send(name, data, options);
}

export async function getJobCounts(): Promise<Record<string, { queued: number; active: number; failed: number; completed: number }>> {
  const queue = await getQueue();
  const counts: Record<string, any> = {};

  for (const name of Object.values(JOB_NAMES)) {
    const [queued, active, failed, completed] = await Promise.all([
      queue.getQueueSize(name),
      queue.getQueueSize(name, { before: "active" }),
      queue.getQueueSize(name, { before: "failed" }),
      queue.getQueueSize(name, { before: "completed" }),
    ]);
    counts[name] = { queued, active, failed, completed };
  }

  return counts;
}

export async function stopQueue(): Promise<void> {
  if (boss && started) {
    await boss.stop({ graceful: true, timeout: 10000 });
    started = false;
    logger.info("Job queue stopped");
  }
}
