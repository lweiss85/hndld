import type { Request, Response, Router } from "express";
import { isAuthenticated } from "../replit_integrations/auth";
import { householdContextMiddleware } from "../middleware/householdContext";
import logger from "../lib/logger";
import { getJobCounts, enqueueJob, JOB_NAMES } from "../lib/queue";

const householdContext = householdContextMiddleware;

async function getUserProfile(userId: string) {
  const { storage } = await import("../storage");
  return storage.getUserProfile(userId);
}

export function registerJobRoutes(app: Router) {
  app.get(
    "/admin/jobs",
    isAuthenticated,
    householdContext,
    async (req: Request, res: Response) => {
      try {
        const userId = req.user!.claims.sub;
        const profile = await getUserProfile(userId);

        if (profile?.role !== "ASSISTANT") {
          return res.status(403).json({ message: "Access denied" });
        }

        const counts = await getJobCounts();

        res.json({
          queues: counts,
          jobNames: Object.values(JOB_NAMES),
        });
      } catch (error: any) {
        logger.error("Error fetching job dashboard", { error: error.message });
        res.status(500).json({ message: "Failed to fetch job data" });
      }
    }
  );

  app.post(
    "/admin/jobs/:jobName/trigger",
    isAuthenticated,
    householdContext,
    async (req: Request, res: Response) => {
      try {
        const userId = req.user!.claims.sub;
        const profile = await getUserProfile(userId);

        if (profile?.role !== "ASSISTANT") {
          return res.status(403).json({ message: "Access denied" });
        }

        const { jobName } = req.params;
        const validNames = Object.values(JOB_NAMES) as string[];

        if (!validNames.includes(jobName)) {
          return res.status(400).json({ message: `Invalid job name: ${jobName}` });
        }

        const jobId = await enqueueJob(jobName, {
          manual: true,
          triggeredBy: userId,
          ...(req.body || {}),
        });

        logger.info("Job manually triggered", { jobName, jobId, userId });

        res.json({
          message: `Job ${jobName} enqueued`,
          jobId,
        });
      } catch (error: any) {
        logger.error("Error triggering job", { error: error.message });
        res.status(500).json({ message: "Failed to trigger job" });
      }
    }
  );
}
