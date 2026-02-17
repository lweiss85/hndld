import { db } from "../db";
import { tasks, calendarEvents, vendors } from "@shared/schema";
import { eq, desc, gte, lte, and, ne } from "drizzle-orm";
import { generateCompletion, getActiveProvider } from "./ai-provider";
import { subDays, addDays, startOfDay, endOfDay, format, differenceInDays } from "date-fns";
import logger from "../lib/logger";

export interface SmartSuggestion {
  id: string;
  type: "task" | "reminder" | "vendor" | "event" | "pattern";
  title: string;
  description: string;
  actionLabel: string;
  actionType: "create_task" | "view" | "contact" | "schedule";
  metadata?: Record<string, unknown>;
  priority: number;
}

interface HouseholdPatterns {
  frequentTaskTitles: string[];
  recentCategories: string[];
  vendorCount: number;
  upcomingEvents: Array<{ title: string; startAt: Date }>;
  overdueTaskCount: number;
  waitingOnClientCount: number;
}

async function analyzeHouseholdPatterns(householdId: string): Promise<HouseholdPatterns> {
  const thirtyDaysAgo = subDays(new Date(), 30);
  const sevenDaysFromNow = addDays(new Date(), 7);
  const now = new Date();

  const [recentTasks, upcomingEvents, vendorList, overdueTasks, waitingTasks] = await Promise.all([
    db.select({ title: tasks.title, category: tasks.category })
      .from(tasks)
      .where(and(
        eq(tasks.householdId, householdId),
        gte(tasks.createdAt, thirtyDaysAgo)
      ))
      .orderBy(desc(tasks.createdAt))
      .limit(50),

    db.select({ title: calendarEvents.title, startAt: calendarEvents.startAt })
      .from(calendarEvents)
      .where(and(
        eq(calendarEvents.householdId, householdId),
        gte(calendarEvents.startAt, startOfDay(now)),
        lte(calendarEvents.startAt, endOfDay(sevenDaysFromNow))
      ))
      .orderBy(calendarEvents.startAt)
      .limit(10),

    db.select({ id: vendors.id })
      .from(vendors)
      .where(eq(vendors.householdId, householdId)),

    db.select({ id: tasks.id })
      .from(tasks)
      .where(and(
        eq(tasks.householdId, householdId),
        ne(tasks.status, "DONE"),
        ne(tasks.status, "CANCELLED"),
        lte(tasks.dueAt, now)
      )),

    db.select({ id: tasks.id })
      .from(tasks)
      .where(and(
        eq(tasks.householdId, householdId),
        eq(tasks.status, "WAITING_ON_CLIENT")
      ))
  ]);

  const titleCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  
  recentTasks.forEach(task => {
    const normalizedTitle = task.title.toLowerCase().trim();
    titleCounts.set(normalizedTitle, (titleCounts.get(normalizedTitle) || 0) + 1);
    if (task.category) {
      categoryCounts.set(task.category, (categoryCounts.get(task.category) || 0) + 1);
    }
  });

  const frequentTaskTitles = Array.from(titleCounts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([title]) => title);

  const recentCategories = Array.from(categoryCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([category]) => category);

  return {
    frequentTaskTitles,
    recentCategories,
    vendorCount: vendorList.length,
    upcomingEvents: upcomingEvents.map(e => ({ title: e.title, startAt: e.startAt! })),
    overdueTaskCount: overdueTasks.length,
    waitingOnClientCount: waitingTasks.length,
  };
}

function generateRuleBasedSuggestions(patterns: HouseholdPatterns): SmartSuggestion[] {
  const suggestions: SmartSuggestion[] = [];
  let priority = 1;

  if (patterns.overdueTaskCount > 0) {
    suggestions.push({
      id: `overdue-${Date.now()}`,
      type: "reminder",
      title: `${patterns.overdueTaskCount} overdue task${patterns.overdueTaskCount > 1 ? "s" : ""}`,
      description: "Review and update or complete these tasks",
      actionLabel: "View Tasks",
      actionType: "view",
      metadata: { filter: "overdue" },
      priority: priority++,
    });
  }

  if (patterns.waitingOnClientCount > 0) {
    suggestions.push({
      id: `waiting-${Date.now()}`,
      type: "reminder",
      title: `${patterns.waitingOnClientCount} task${patterns.waitingOnClientCount > 1 ? "s" : ""} waiting on client`,
      description: "Items that need client input or approval",
      actionLabel: "View Tasks",
      actionType: "view",
      metadata: { filter: "waiting" },
      priority: priority++,
    });
  }

  patterns.upcomingEvents.slice(0, 2).forEach(event => {
    const daysUntil = differenceInDays(event.startAt, new Date());
    if (daysUntil <= 3 && daysUntil >= 0) {
      suggestions.push({
        id: `event-prep-${Date.now()}-${Math.random()}`,
        type: "event",
        title: `Prepare for "${event.title}"`,
        description: daysUntil === 0 
          ? "Happening today!" 
          : `Coming up in ${daysUntil} day${daysUntil > 1 ? "s" : ""}`,
        actionLabel: "Create Prep Task",
        actionType: "create_task",
        metadata: { 
          eventTitle: event.title,
          eventDate: event.startAt.toISOString(),
        },
        priority: priority++,
      });
    }
  });

  return suggestions;
}

async function generateAISuggestions(
  patterns: HouseholdPatterns,
  existingSuggestionCount: number
): Promise<SmartSuggestion[]> {
  if (getActiveProvider() === "NONE") {
    return [];
  }

  if (existingSuggestionCount >= 5) {
    return [];
  }

  const contextSummary = `
Household patterns:
- Frequently created tasks: ${patterns.frequentTaskTitles.join(", ") || "none identified"}
- Most common categories: ${patterns.recentCategories.join(", ") || "varied"}
- Upcoming events: ${patterns.upcomingEvents.map(e => `${e.title} on ${format(e.startAt, "MMM d")}`).join(", ") || "none"}
- Overdue tasks: ${patterns.overdueTaskCount}
- Waiting on client: ${patterns.waitingOnClientCount}
`;

  const prompt = `Based on this household management data, suggest 1-2 proactive tasks or reminders that would be helpful.

${contextSummary}

Return a JSON array of suggestions. Each suggestion should have:
- title: short actionable title (max 40 chars)
- description: brief explanation (max 80 chars)
- type: one of "task", "reminder", "pattern"

Focus on proactive suggestions like:
- Recurring maintenance reminders
- Seasonal preparation
- Organization tips based on patterns

Return ONLY valid JSON array, no explanation.`;

  try {
    const result = await generateCompletion({
      messages: [
        { role: "system", content: "You are a helpful household management AI. Return only valid JSON arrays." },
        { role: "user", content: prompt },
      ],
      maxTokens: 300,
      temperature: 0.7,
    });

    const parsed = JSON.parse(result);
    if (!Array.isArray(parsed)) return [];

    return parsed.slice(0, 2).map((s: { title?: string; description?: string; type?: string }, i: number) => ({
      id: `ai-${Date.now()}-${i}`,
      type: (s.type as SmartSuggestion["type"]) || "pattern",
      title: s.title || "Suggested action",
      description: s.description || "",
      actionLabel: "Create Task",
      actionType: "create_task" as const,
      priority: existingSuggestionCount + i + 1,
    }));
  } catch (error) {
    logger.error("AI suggestion error", { error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

export async function getSmartSuggestions(householdId: string): Promise<SmartSuggestion[]> {
  const patterns = await analyzeHouseholdPatterns(householdId);
  const ruleBasedSuggestions = generateRuleBasedSuggestions(patterns);
  
  const aiSuggestions = await generateAISuggestions(patterns, ruleBasedSuggestions.length);
  
  const allSuggestions = [...ruleBasedSuggestions, ...aiSuggestions];
  
  return allSuggestions.slice(0, 5);
}
