/**
 * Scheduler Additions for Proactive AI
 * 
 * FILE: server/services/scheduler.ts
 * ACTION: Add these functions to your existing scheduler
 */

import cron from "node-cron";
import { runProactiveAgent } from "./ai-agent";

let proactiveAgentJob: ReturnType<typeof cron.schedule> | null = null;

/**
 * Start the proactive AI agent
 * Runs daily at 8am to generate insights
 */
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

  // Run at 8am every day
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

  // Also run a lighter check at 6pm for evening reminders
  cron.schedule("0 18 * * *", async () => {
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
    console.log("[Scheduler] Proactive agent stopped");
  }
}

/**
 * Trigger immediate proactive analysis for a household
 * Useful for testing or on-demand refresh
 */
export async function triggerProactiveAnalysis(householdId: string): Promise<void> {
  const { gatherHouseholdContext, generateProactiveInsights } = await import("./ai-agent");
  
  console.log(`[Scheduler] Triggering proactive analysis for household ${householdId}`);
  
  const context = await gatherHouseholdContext(householdId);
  const insights = await generateProactiveInsights(context);
  
  console.log(`[Scheduler] Generated ${insights.length} insights for household ${householdId}`);
}


// ============================================================================
// ADD TO YOUR EXISTING startAllSchedulers() FUNCTION:
// ============================================================================

/*
export function startAllSchedulers(): void {
  startScheduledBackups();
  startCalendarSync();
  startProactiveAgent();  // <-- ADD THIS LINE
}
*/
