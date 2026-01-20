/**
 * Proactive AI Agent Service
 * 
 * FILE: server/services/ai-agent.ts
 * ACTION: Create this new file
 * 
 * This is the MISSING PIECE that transforms hndld from reactive AI utilities
 * into a true proactive assistant that anticipates needs.
 * 
 * Features:
 * - Daily proactive insights
 * - Important date reminders (7, 3, 1 day before)
 * - Overdue task escalation
 * - Pattern-based suggestions
 * - Smart scheduling recommendations
 */

import { db } from "../db";
import { storage } from "../storage";
import { 
  tasks, importantDates, calendarEvents, spendingItems, 
  preferences, people, householdLocations, analyticsEvents,
  proactiveInsights, taskPatterns
} from "@shared/schema";
import { eq, and, gte, lte, lt, desc, sql } from "drizzle-orm";
import { 
  addDays, subDays, differenceInDays, differenceInMinutes, 
  startOfDay, endOfDay, format, isWithinInterval, getDay, getHours,
  isBefore, isAfter, startOfWeek, endOfWeek
} from "date-fns";
import { generateCompletion, getActiveProvider } from "./ai-provider";
import { notify } from "./notifications";
import { wsManager } from "./websocket";

// ============================================================================
// TYPES
// ============================================================================

interface ProactiveInsight {
  type: "REMINDER" | "SUGGESTION" | "ALERT" | "OPPORTUNITY";
  priority: "LOW" | "MEDIUM" | "HIGH";
  title: string;
  body: string;
  actionLabel?: string;
  actionUrl?: string;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

interface HouseholdContext {
  householdId: string;
  tasks: {
    overdue: Array<{ id: string; title: string; dueAt: Date; daysOverdue: number }>;
    dueToday: Array<{ id: string; title: string; dueAt: Date }>;
    dueSoon: Array<{ id: string; title: string; dueAt: Date; daysUntil: number }>;
    waitingOnClient: Array<{ id: string; title: string; waitingSince: Date }>;
  };
  dates: {
    upcoming: Array<{ id: string; title: string; date: Date; type: string; daysUntil: number }>;
  };
  events: {
    today: Array<{ id: string; title: string; startAt: Date }>;
    tomorrow: Array<{ id: string; title: string; startAt: Date }>;
  };
  spending: {
    pendingReimbursements: number;
    totalPending: number;
  };
  patterns: {
    busiestDay: string;
    averageTasksPerWeek: number;
    commonCategories: string[];
  };
}

// ============================================================================
// CONTEXT GATHERING
// ============================================================================

/**
 * Gathers comprehensive household context for AI reasoning
 */
export async function gatherHouseholdContext(householdId: string): Promise<HouseholdContext> {
  const now = new Date();
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const weekFromNow = addDays(today, 7);

  // Fetch all relevant data in parallel
  const [
    allTasks,
    allDates,
    allEvents,
    pendingSpending,
    recentAnalytics,
  ] = await Promise.all([
    storage.getTasks(householdId),
    storage.getImportantDates(householdId),
    storage.getCalendarEvents(householdId),
    db.select().from(spendingItems).where(
      and(
        eq(spendingItems.householdId, householdId),
        eq(spendingItems.status, "PENDING")
      )
    ),
    db.select().from(analyticsEvents).where(
      and(
        eq(analyticsEvents.householdId, householdId),
        gte(analyticsEvents.createdAt, subDays(now, 30))
      )
    ),
  ]);

  // Process tasks
  const activeTasks = allTasks.filter(t => t.status !== "DONE" && t.status !== "CANCELLED");
  
  const overdueTasks = activeTasks
    .filter(t => t.dueAt && isBefore(new Date(t.dueAt), today))
    .map(t => ({
      id: t.id,
      title: t.title,
      dueAt: new Date(t.dueAt!),
      daysOverdue: differenceInDays(today, new Date(t.dueAt!)),
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  const tasksDueToday = activeTasks
    .filter(t => t.dueAt && isWithinInterval(new Date(t.dueAt), { start: today, end: endOfDay(today) }))
    .map(t => ({ id: t.id, title: t.title, dueAt: new Date(t.dueAt!) }));

  const tasksDueSoon = activeTasks
    .filter(t => t.dueAt && isAfter(new Date(t.dueAt), today) && isBefore(new Date(t.dueAt), weekFromNow))
    .map(t => ({
      id: t.id,
      title: t.title,
      dueAt: new Date(t.dueAt!),
      daysUntil: differenceInDays(new Date(t.dueAt!), today),
    }))
    .sort((a, b) => a.daysUntil - b.daysUntil);

  const waitingOnClient = activeTasks
    .filter(t => t.status === "WAITING_ON_CLIENT")
    .map(t => ({
      id: t.id,
      title: t.title,
      waitingSince: t.updatedAt || t.createdAt,
    }));

  // Process important dates
  const upcomingDates = allDates
    .filter(d => {
      const date = new Date(d.date);
      // Handle recurring dates (birthdays, anniversaries)
      const thisYear = new Date(date);
      thisYear.setFullYear(now.getFullYear());
      if (isBefore(thisYear, today)) {
        thisYear.setFullYear(now.getFullYear() + 1);
      }
      return differenceInDays(thisYear, today) <= 14;
    })
    .map(d => {
      const date = new Date(d.date);
      const thisYear = new Date(date);
      thisYear.setFullYear(now.getFullYear());
      if (isBefore(thisYear, today)) {
        thisYear.setFullYear(now.getFullYear() + 1);
      }
      return {
        id: d.id,
        title: d.title,
        date: thisYear,
        type: d.type,
        daysUntil: differenceInDays(thisYear, today),
      };
    })
    .sort((a, b) => a.daysUntil - b.daysUntil);

  // Process events
  const todayEvents = allEvents
    .filter(e => e.startAt && isWithinInterval(new Date(e.startAt), { start: today, end: endOfDay(today) }))
    .map(e => ({ id: e.id, title: e.title, startAt: new Date(e.startAt!) }));

  const tomorrowEvents = allEvents
    .filter(e => e.startAt && isWithinInterval(new Date(e.startAt), { start: tomorrow, end: endOfDay(tomorrow) }))
    .map(e => ({ id: e.id, title: e.title, startAt: new Date(e.startAt!) }));

  // Calculate patterns from analytics
  const taskCompletions = recentAnalytics.filter(e => e.eventType === "TASK_COMPLETED");
  const dayDistribution = taskCompletions.reduce((acc, e) => {
    const day = format(new Date(e.createdAt), "EEEE");
    acc[day] = (acc[day] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const busiestDay = Object.entries(dayDistribution)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || "Monday";

  return {
    householdId,
    tasks: {
      overdue: overdueTasks,
      dueToday: tasksDueToday,
      dueSoon: tasksDueSoon,
      waitingOnClient,
    },
    dates: {
      upcoming: upcomingDates,
    },
    events: {
      today: todayEvents,
      tomorrow: tomorrowEvents,
    },
    spending: {
      pendingReimbursements: pendingSpending.length,
      totalPending: pendingSpending.reduce((sum, s) => sum + s.amount, 0),
    },
    patterns: {
      busiestDay,
      averageTasksPerWeek: Math.round(taskCompletions.length / 4),
      commonCategories: [], // Could be enhanced
    },
  };
}

// ============================================================================
// PROACTIVE INSIGHT GENERATION
// ============================================================================

/**
 * Generates proactive insights using AI reasoning
 */
export async function generateProactiveInsights(
  context: HouseholdContext
): Promise<ProactiveInsight[]> {
  const insights: ProactiveInsight[] = [];

  // 1. OVERDUE TASKS - High priority alerts
  for (const task of context.tasks.overdue.slice(0, 3)) {
    if (task.daysOverdue >= 2) {
      insights.push({
        type: "ALERT",
        priority: task.daysOverdue >= 5 ? "HIGH" : "MEDIUM",
        title: `"${task.title}" is ${task.daysOverdue} days overdue`,
        body: task.daysOverdue >= 5 
          ? "This has been waiting a while. Should I reschedule it or remove it from your list?"
          : "Want me to bump this to today's priorities?",
        actionLabel: "View Task",
        actionUrl: `/tasks?id=${task.id}`,
      });
    }
  }

  // 2. IMPORTANT DATE REMINDERS
  const reminderDays = [7, 3, 1, 0];
  for (const date of context.dates.upcoming) {
    if (reminderDays.includes(date.daysUntil)) {
      const urgency = date.daysUntil === 0 ? "HIGH" : date.daysUntil <= 3 ? "MEDIUM" : "LOW";
      const timeText = date.daysUntil === 0 ? "today" : 
                       date.daysUntil === 1 ? "tomorrow" : 
                       `in ${date.daysUntil} days`;
      
      insights.push({
        type: "REMINDER",
        priority: urgency,
        title: `${date.title} is ${timeText}`,
        body: await generateDateReminderBody(date),
        actionLabel: date.type === "BIRTHDAY" ? "Send Gift?" : "View Details",
        actionUrl: `/house/dates?id=${date.id}`,
        metadata: { dateType: date.type, daysUntil: date.daysUntil },
      });
    }
  }

  // 3. BUSY DAY AHEAD
  if (context.events.tomorrow.length >= 3 || context.tasks.dueToday.length >= 5) {
    insights.push({
      type: "ALERT",
      priority: "MEDIUM",
      title: "Busy day tomorrow",
      body: `You have ${context.events.tomorrow.length} events and ${context.tasks.dueToday.length} tasks due. Consider reviewing your schedule.`,
      actionLabel: "View Calendar",
      actionUrl: "/calendar",
    });
  }

  // 4. PENDING REIMBURSEMENTS
  if (context.spending.pendingReimbursements >= 3 || context.spending.totalPending >= 50000) {
    insights.push({
      type: "SUGGESTION",
      priority: "LOW",
      title: `${context.spending.pendingReimbursements} expenses pending`,
      body: `$${(context.spending.totalPending / 100).toFixed(2)} in reimbursements waiting. Ready to invoice your client?`,
      actionLabel: "Review Expenses",
      actionUrl: "/spending",
    });
  }

  // 5. WAITING ON CLIENT - Gentle nudge
  for (const task of context.tasks.waitingOnClient) {
    const daysSince = differenceInDays(new Date(), new Date(task.waitingSince));
    if (daysSince >= 3) {
      insights.push({
        type: "SUGGESTION",
        priority: "LOW",
        title: `Still waiting on "${task.title}"`,
        body: `This has been waiting for client input for ${daysSince} days. Should I send a reminder?`,
        actionLabel: "View Task",
        actionUrl: `/tasks?id=${task.id}`,
      });
    }
  }

  // 6. AI-POWERED CONTEXTUAL SUGGESTIONS (if API key available)
  if (getActiveProvider() !== "NONE" && insights.length < 5) {
    try {
      const aiInsight = await generateAIInsight(context);
      if (aiInsight) {
        insights.push(aiInsight);
      }
    } catch (error) {
      console.error("Failed to generate AI insight:", error);
    }
  }

  // Sort by priority
  const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return insights.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

/**
 * Generate a contextual reminder body for important dates
 */
async function generateDateReminderBody(date: { title: string; type: string; daysUntil: number }): Promise<string> {
  if (getActiveProvider() === "NONE") {
    // Fallback messages
    if (date.type === "BIRTHDAY") {
      return date.daysUntil === 0 
        ? "Don't forget to wish them a happy birthday!"
        : "Time to think about a gift or card.";
    }
    if (date.type === "ANNIVERSARY") {
      return "A thoughtful gesture would mean a lot.";
    }
    return "Mark this on your calendar.";
  }

  try {
    const response = await generateCompletion({
      messages: [{
        role: "system",
        content: "You are a thoughtful household assistant. Generate a brief, warm reminder (1-2 sentences) for an upcoming date. Be helpful and suggest a specific action if appropriate."
      }, {
        role: "user",
        content: `${date.type}: "${date.title}" is in ${date.daysUntil} days. Generate a helpful reminder.`
      }],
      maxTokens: 100,
      temperature: 0.7,
    });
    return response;
  } catch {
    return "Don't forget to prepare for this.";
  }
}

/**
 * Generate an AI-powered contextual insight
 */
async function generateAIInsight(context: HouseholdContext): Promise<ProactiveInsight | null> {
  try {
    const prompt = `Based on this household context, suggest ONE helpful, specific insight that a proactive assistant would share. Be actionable and specific.

Context:
- Overdue tasks: ${context.tasks.overdue.length} (${context.tasks.overdue.slice(0, 3).map(t => t.title).join(", ")})
- Due today: ${context.tasks.dueToday.length} tasks
- Due this week: ${context.tasks.dueSoon.length} tasks
- Upcoming dates: ${context.dates.upcoming.slice(0, 3).map(d => `${d.title} in ${d.daysUntil} days`).join(", ")}
- Events today: ${context.events.today.length}
- Events tomorrow: ${context.events.tomorrow.length}
- Pending expenses: $${(context.spending.totalPending / 100).toFixed(2)}
- Busiest day: ${context.patterns.busiestDay}

Return JSON: { "title": "...", "body": "...", "priority": "LOW|MEDIUM|HIGH" }`;

    const response = await generateCompletion({
      messages: [{
        role: "system",
        content: "You are a proactive household assistant. Return only valid JSON."
      }, {
        role: "user",
        content: prompt
      }],
      maxTokens: 200,
      temperature: 0.6,
    });

    const parsed = JSON.parse(response);
    return {
      type: "SUGGESTION",
      priority: parsed.priority || "LOW",
      title: parsed.title,
      body: parsed.body,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// SCHEDULED JOBS
// ============================================================================

/**
 * Run the proactive agent for all households
 * Call this from scheduler.ts on a cron schedule (e.g., 8am daily)
 */
export async function runProactiveAgent(): Promise<void> {
  console.log("[AI Agent] Starting proactive agent run...");
  
  try {
    // Get all active households
    const households = await db.selectDistinct({ id: tasks.householdId }).from(tasks);
    
    let totalInsights = 0;
    
    for (const { id: householdId } of households) {
      try {
        const context = await gatherHouseholdContext(householdId);
        const insights = await generateProactiveInsights(context);
        
        // Store insights and notify users
        for (const insight of insights.slice(0, 5)) { // Max 5 insights per day
          // Check if we already sent this insight recently
          const existing = await db.select().from(proactiveInsights).where(
            and(
              eq(proactiveInsights.householdId, householdId),
              eq(proactiveInsights.title, insight.title),
              gte(proactiveInsights.createdAt, subDays(new Date(), 1))
            )
          );
          
          if (existing.length === 0) {
            await db.insert(proactiveInsights).values({
              householdId,
              type: insight.type,
              priority: insight.priority,
              title: insight.title,
              body: insight.body,
              actionUrl: insight.actionUrl,
              metadata: insight.metadata || {},
            });
            
            // Send real-time notification via WebSocket
            wsManager.broadcastToHousehold(householdId, {
              type: "proactive:insight",
              payload: insight,
            });
            
            totalInsights++;
          }
        }
      } catch (error) {
        console.error(`[AI Agent] Failed for household ${householdId}:`, error);
      }
    }
    
    console.log(`[AI Agent] Generated ${totalInsights} insights across ${households.length} households`);
  } catch (error) {
    console.error("[AI Agent] Failed:", error);
  }
}

/**
 * Get proactive insights for a specific household
 */
export async function getProactiveInsights(householdId: string): Promise<ProactiveInsight[]> {
  const insights = await db.select().from(proactiveInsights)
    .where(
      and(
        eq(proactiveInsights.householdId, householdId),
        gte(proactiveInsights.createdAt, subDays(new Date(), 1)),
        eq(proactiveInsights.isDismissed, false)
      )
    )
    .orderBy(desc(proactiveInsights.createdAt));
  
  return insights.map(i => ({
    type: i.type as ProactiveInsight["type"],
    priority: i.priority as ProactiveInsight["priority"],
    title: i.title,
    body: i.body,
    actionUrl: i.actionUrl || undefined,
    metadata: i.metadata as Record<string, unknown>,
  }));
}

/**
 * Dismiss a proactive insight
 */
export async function dismissInsight(insightId: string): Promise<void> {
  await db.update(proactiveInsights)
    .set({ isDismissed: true })
    .where(eq(proactiveInsights.id, insightId));
}

// ============================================================================
// TASK PATTERN LEARNING
// ============================================================================

/**
 * Record task completion for pattern learning
 */
export async function recordTaskCompletion(task: {
  id: string;
  householdId: string;
  category: string;
  estimatedMinutes?: number | null;
  createdAt: Date;
  completedAt: Date;
}): Promise<void> {
  const actualMinutes = differenceInMinutes(task.completedAt, task.createdAt);
  
  await db.insert(taskPatterns).values({
    householdId: task.householdId,
    taskId: task.id,
    category: task.category,
    estimatedMinutes: task.estimatedMinutes || 0,
    actualMinutes: Math.min(actualMinutes, 480), // Cap at 8 hours
    dayOfWeek: getDay(task.completedAt),
    hourOfDay: getHours(task.completedAt),
  });
}

/**
 * Get smart duration estimate based on household patterns
 */
export async function getSmartEstimate(
  householdId: string, 
  category: string
): Promise<{ minutes: number; confidence: "low" | "medium" | "high"; source: "pattern" | "default" }> {
  const patterns = await db.select()
    .from(taskPatterns)
    .where(and(
      eq(taskPatterns.householdId, householdId),
      eq(taskPatterns.category, category)
    ))
    .orderBy(desc(taskPatterns.createdAt))
    .limit(20);
  
  if (patterns.length >= 5) {
    const avgMinutes = Math.round(
      patterns.reduce((sum, p) => sum + p.actualMinutes, 0) / patterns.length
    );
    const confidence = patterns.length >= 10 ? "high" : "medium";
    return { minutes: avgMinutes, confidence, source: "pattern" };
  }
  
  // Fall back to category defaults
  const defaults: Record<string, number> = {
    HOUSEHOLD: 20,
    ERRANDS: 30,
    MAINTENANCE: 45,
    GROCERIES: 45,
    KIDS: 30,
    PETS: 15,
    EVENTS: 60,
    OTHER: 20,
  };
  
  return { 
    minutes: defaults[category] || 20, 
    confidence: "low", 
    source: "default" 
  };
}
