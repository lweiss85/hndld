import { db } from "../db";
import { storage } from "../storage";
import { 
  tasks, importantDates, calendarEvents, spendingItems, 
  proactiveInsights, taskPatterns, households
} from "@shared/schema";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { 
  addDays, subDays, differenceInDays, differenceInMinutes, 
  startOfDay, endOfDay, format, isWithinInterval, getDay, getHours,
  isBefore, isAfter
} from "date-fns";
import { generateCompletion, getActiveProvider } from "./ai-provider";

interface ProactiveInsight {
  id?: string;
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
  };
}

export async function gatherHouseholdContext(householdId: string): Promise<HouseholdContext> {
  const now = new Date();
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const weekFromNow = addDays(today, 7);

  const [allTasks, allDates, allEvents, pendingSpending] = await Promise.all([
    storage.getTasks(householdId),
    storage.getImportantDates(householdId),
    storage.getCalendarEvents(householdId),
    db.select().from(spendingItems).where(
      and(
        eq(spendingItems.householdId, householdId),
        eq(spendingItems.status, "NEEDS_APPROVAL")
      )
    ),
  ]);

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
      waitingSince: t.updatedAt || t.createdAt || new Date(),
    }));

  const upcomingDates = allDates
    .filter(d => {
      const date = new Date(d.date);
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

  const todayEvents = allEvents
    .filter(e => e.startAt && isWithinInterval(new Date(e.startAt), { start: today, end: endOfDay(today) }))
    .map(e => ({ id: e.id, title: e.title, startAt: new Date(e.startAt!) }));

  const tomorrowEvents = allEvents
    .filter(e => e.startAt && isWithinInterval(new Date(e.startAt), { start: tomorrow, end: endOfDay(tomorrow) }))
    .map(e => ({ id: e.id, title: e.title, startAt: new Date(e.startAt!) }));

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
      busiestDay: "Monday",
      averageTasksPerWeek: 0,
    },
  };
}

export async function generateProactiveInsights(
  context: HouseholdContext
): Promise<ProactiveInsight[]> {
  const insights: ProactiveInsight[] = [];

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

  const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return insights.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

async function generateDateReminderBody(date: { title: string; type: string; daysUntil: number }): Promise<string> {
  if (getActiveProvider() === "NONE") {
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

async function generateAIInsight(context: HouseholdContext): Promise<ProactiveInsight | null> {
  try {
    const prompt = `Based on this household context, suggest ONE helpful, specific insight. Be actionable. Return JSON with: type (SUGGESTION), priority (LOW/MEDIUM), title (short), body (1-2 sentences), actionLabel, actionUrl.

Context:
- Overdue tasks: ${context.tasks.overdue.length}
- Due today: ${context.tasks.dueToday.length}
- Due this week: ${context.tasks.dueSoon.length}
- Upcoming dates: ${context.dates.upcoming.slice(0, 3).map(d => `${d.title} in ${d.daysUntil} days`).join(", ")}
- Events today: ${context.events.today.length}

Return ONLY valid JSON.`;

    const result = await generateCompletion({
      messages: [
        { role: "system", content: "You are a proactive household assistant. Return only valid JSON." },
        { role: "user", content: prompt }
      ],
      maxTokens: 300,
      temperature: 0.7,
    });

    const parsed = JSON.parse(result);
    return {
      type: parsed.type || "SUGGESTION",
      priority: parsed.priority || "LOW",
      title: parsed.title,
      body: parsed.body,
      actionLabel: parsed.actionLabel,
      actionUrl: parsed.actionUrl,
    };
  } catch {
    return null;
  }
}

export async function getProactiveInsights(householdId: string): Promise<ProactiveInsight[]> {
  const existing = await db
    .select()
    .from(proactiveInsights)
    .where(
      and(
        eq(proactiveInsights.householdId, householdId),
        eq(proactiveInsights.isDismissed, false)
      )
    )
    .orderBy(desc(proactiveInsights.createdAt))
    .limit(10);

  if (existing.length > 0) {
    return existing.map(i => ({
      id: i.id,
      type: i.type as ProactiveInsight["type"],
      priority: i.priority as ProactiveInsight["priority"],
      title: i.title,
      body: i.body,
      actionLabel: i.actionLabel || undefined,
      actionUrl: i.actionUrl || undefined,
      metadata: i.metadata as Record<string, unknown>,
    }));
  }

  const context = await gatherHouseholdContext(householdId);
  const insights = await generateProactiveInsights(context);
  
  const persistedInsights: ProactiveInsight[] = [];
  for (const insight of insights) {
    const [inserted] = await db.insert(proactiveInsights).values({
      householdId,
      type: insight.type,
      priority: insight.priority,
      title: insight.title,
      body: insight.body,
      actionLabel: insight.actionLabel,
      actionUrl: insight.actionUrl,
      metadata: insight.metadata || {},
    }).returning();
    
    persistedInsights.push({
      id: inserted.id,
      ...insight,
    });
  }
  
  return persistedInsights;
}

export async function dismissInsight(id: string): Promise<void> {
  await db
    .update(proactiveInsights)
    .set({ isDismissed: true })
    .where(eq(proactiveInsights.id, id));
}

export async function recordTaskCompletion(data: {
  id: string;
  householdId: string;
  category: string;
  estimatedMinutes?: number;
  createdAt: Date;
  completedAt: Date;
}): Promise<void> {
  const actualMinutes = differenceInMinutes(data.completedAt, data.createdAt);
  
  await db.insert(taskPatterns).values({
    householdId: data.householdId,
    taskId: data.id,
    category: data.category,
    estimatedMinutes: data.estimatedMinutes || 0,
    actualMinutes: Math.max(0, actualMinutes),
    dayOfWeek: getDay(data.completedAt),
    hourOfDay: getHours(data.completedAt),
  });
}

export async function getSmartEstimate(householdId: string, category: string): Promise<{
  estimatedMinutes: number;
  confidence: "low" | "medium" | "high";
  sampleSize: number;
}> {
  const patterns = await db
    .select()
    .from(taskPatterns)
    .where(
      and(
        eq(taskPatterns.householdId, householdId),
        eq(taskPatterns.category, category)
      )
    )
    .orderBy(desc(taskPatterns.createdAt))
    .limit(20);

  if (patterns.length < 3) {
    const defaults: Record<string, number> = {
      HOUSEHOLD: 30, ERRANDS: 45, MAINTENANCE: 60,
      GROCERIES: 60, KIDS: 30, PETS: 15, EVENTS: 90, OTHER: 30
    };
    return {
      estimatedMinutes: defaults[category] || 30,
      confidence: "low",
      sampleSize: patterns.length,
    };
  }

  const avgMinutes = patterns.reduce((sum, p) => sum + p.actualMinutes, 0) / patterns.length;
  
  return {
    estimatedMinutes: Math.round(avgMinutes),
    confidence: patterns.length >= 10 ? "high" : "medium",
    sampleSize: patterns.length,
  };
}

export async function runProactiveAgent(): Promise<void> {
  console.log("[AI Agent] Starting proactive analysis...");
  
  const allHouseholds = await db.select({ id: households.id }).from(households);
  
  for (const household of allHouseholds) {
    try {
      const context = await gatherHouseholdContext(household.id);
      const insights = await generateProactiveInsights(context);
      
      await db.delete(proactiveInsights).where(
        and(
          eq(proactiveInsights.householdId, household.id),
          eq(proactiveInsights.isDismissed, false)
        )
      );
      
      for (const insight of insights) {
        await db.insert(proactiveInsights).values({
          householdId: household.id,
          type: insight.type,
          priority: insight.priority,
          title: insight.title,
          body: insight.body,
          actionLabel: insight.actionLabel,
          actionUrl: insight.actionUrl,
          metadata: insight.metadata || {},
        });
      }
      
      console.log(`[AI Agent] Generated ${insights.length} insights for household ${household.id}`);
    } catch (error) {
      console.error(`[AI Agent] Failed for household ${household.id}:`, error);
    }
  }
  
  console.log("[AI Agent] Proactive analysis complete");
}
