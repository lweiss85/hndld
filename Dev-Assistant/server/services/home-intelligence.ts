import { db } from "../db";
import {
  tasks, spendingItems, vendors, calendarEvents,
  householdInsights, taskPatterns,
} from "@shared/schema";
import { eq, and, gte, lte, desc, sql, count } from "drizzle-orm";
import { subDays, addDays, differenceInDays, format, startOfDay } from "date-fns";
import { generateCompletion, isDemoMode } from "./ai-provider";
import logger from "../lib/logger";

interface InsightResult {
  category: string;
  title: string;
  summary: string;
  confidence: number;
  data: Record<string, unknown>;
}

export async function analyzeMaintenancePredictions(householdId: string): Promise<InsightResult[]> {
  const insights: InsightResult[] = [];
  const now = new Date();
  const sixMonthsAgo = subDays(now, 180);

  const completedMaintenance = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.householdId, householdId),
        eq(tasks.category, "MAINTENANCE"),
        eq(tasks.status, "DONE"),
        gte(tasks.createdAt, sixMonthsAgo)
      )
    )
    .orderBy(desc(tasks.createdAt));

  const taskGroups = new Map<string, Date[]>();
  for (const task of completedMaintenance) {
    const key = task.title.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    if (!taskGroups.has(key)) {
      taskGroups.set(key, []);
    }
    taskGroups.get(key)!.push(task.createdAt!);
  }

  for (const [taskName, dates] of Array.from(taskGroups.entries())) {
    if (dates.length < 2) continue;

    dates.sort((a: Date, b: Date) => a.getTime() - b.getTime());
    const intervals: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      intervals.push(differenceInDays(dates[i], dates[i - 1]));
    }

    const avgInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length;
    const lastDone = dates[dates.length - 1];
    const daysSinceLast = differenceInDays(now, lastDone);
    const predictedNextDate = addDays(lastDone, Math.round(avgInterval));

    if (daysSinceLast >= avgInterval * 0.8) {
      insights.push({
        category: "MAINTENANCE_PREDICTION",
        title: `Time for "${taskName}"`,
        summary: `Based on your history (every ~${Math.round(avgInterval)} days), this task is ${daysSinceLast >= avgInterval ? "overdue" : "coming up soon"}. Last done ${format(lastDone, "MMM d")}.`,
        confidence: Math.min(95, 50 + dates.length * 10),
        data: {
          taskName,
          avgIntervalDays: Math.round(avgInterval),
          daysSinceLast,
          predictedNextDate: predictedNextDate.toISOString(),
          occurrenceCount: dates.length,
        },
      });
    }
  }

  return insights;
}

export async function detectSpendingAnomalies(householdId: string): Promise<InsightResult[]> {
  const insights: InsightResult[] = [];
  const now = new Date();
  const thirtyDaysAgo = subDays(now, 30);
  const ninetyDaysAgo = subDays(now, 90);

  const recentSpending = await db
    .select()
    .from(spendingItems)
    .where(
      and(
        eq(spendingItems.householdId, householdId),
        gte(spendingItems.date, thirtyDaysAgo)
      )
    );

  const historicalSpending = await db
    .select()
    .from(spendingItems)
    .where(
      and(
        eq(spendingItems.householdId, householdId),
        gte(spendingItems.date, ninetyDaysAgo),
        lte(spendingItems.date, thirtyDaysAgo)
      )
    );

  if (historicalSpending.length < 3) return insights;

  const recentTotal = recentSpending.reduce((s, i) => s + i.amount, 0);
  const historicalMonthlyAvg = historicalSpending.reduce((s, i) => s + i.amount, 0) / 2;

  if (historicalMonthlyAvg > 0) {
    const ratio = recentTotal / historicalMonthlyAvg;

    if (ratio > 1.5) {
      insights.push({
        category: "SPENDING_ANOMALY",
        title: "Spending is higher than usual",
        summary: `This month's spending ($${(recentTotal / 100).toFixed(2)}) is ${Math.round((ratio - 1) * 100)}% above your 3-month average ($${(historicalMonthlyAvg / 100).toFixed(2)}/month).`,
        confidence: Math.min(90, 60 + recentSpending.length * 2),
        data: {
          recentTotal,
          historicalMonthlyAvg: Math.round(historicalMonthlyAvg),
          percentAbove: Math.round((ratio - 1) * 100),
          recentItemCount: recentSpending.length,
        },
      });
    } else if (ratio < 0.5 && recentSpending.length > 0) {
      insights.push({
        category: "SPENDING_ANOMALY",
        title: "Spending is lower than usual",
        summary: `This month's spending ($${(recentTotal / 100).toFixed(2)}) is ${Math.round((1 - ratio) * 100)}% below your average. Any deferred expenses?`,
        confidence: 55,
        data: {
          recentTotal,
          historicalMonthlyAvg: Math.round(historicalMonthlyAvg),
          percentBelow: Math.round((1 - ratio) * 100),
        },
      });
    }
  }

  const categorySpending = new Map<string, number>();
  for (const item of recentSpending) {
    const cat = item.category || "Other";
    categorySpending.set(cat, (categorySpending.get(cat) || 0) + item.amount);
  }

  const historicalCategories = new Map<string, number>();
  for (const item of historicalSpending) {
    const cat = item.category || "Other";
    historicalCategories.set(cat, (historicalCategories.get(cat) || 0) + item.amount);
  }

  for (const [cat, amount] of Array.from(categorySpending.entries())) {
    const historicalAvg = (historicalCategories.get(cat) || 0) / 2;
    if (historicalAvg > 0 && amount > historicalAvg * 2 && amount > 5000) {
      insights.push({
        category: "SPENDING_ANOMALY",
        title: `"${cat}" spending spike`,
        summary: `${cat} spending is $${(amount / 100).toFixed(2)} this month vs. $${(historicalAvg / 100).toFixed(2)}/month average. Worth reviewing?`,
        confidence: 70,
        data: { spendingCategory: cat, amount, historicalAvg: Math.round(historicalAvg) },
      });
    }
  }

  return insights;
}

export async function learnHouseholdPatterns(householdId: string): Promise<InsightResult[]> {
  const insights: InsightResult[] = [];
  const ninetyDaysAgo = subDays(new Date(), 90);

  const patterns = await db
    .select()
    .from(taskPatterns)
    .where(
      and(
        eq(taskPatterns.householdId, householdId),
        gte(taskPatterns.createdAt, ninetyDaysAgo)
      )
    );

  if (patterns.length >= 5) {
    const dayBuckets = new Map<number, number>();
    for (const p of patterns) {
      dayBuckets.set(p.dayOfWeek, (dayBuckets.get(p.dayOfWeek) || 0) + 1);
    }
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    let busiestDay = 0;
    let maxTasks = 0;
    for (const [day, taskCount] of Array.from(dayBuckets.entries())) {
      if (taskCount > maxTasks) {
        busiestDay = day;
        maxTasks = taskCount;
      }
    }

    const categoryTimes = new Map<string, number[]>();
    for (const p of patterns) {
      if (!categoryTimes.has(p.category)) {
        categoryTimes.set(p.category, []);
      }
      categoryTimes.get(p.category)!.push(p.actualMinutes);
    }

    const categoryAvgs: Record<string, number> = {};
    for (const [cat, times] of Array.from(categoryTimes.entries())) {
      categoryAvgs[cat] = Math.round(times.reduce((s: number, v: number) => s + v, 0) / times.length);
    }

    insights.push({
      category: "HOUSEHOLD_PATTERN",
      title: `${dayNames[busiestDay]} is your busiest day`,
      summary: `Most tasks are completed on ${dayNames[busiestDay]}s. Average task times: ${Object.entries(categoryAvgs).map(([c, m]) => `${c}: ${m}min`).join(", ")}.`,
      confidence: Math.min(90, 50 + patterns.length),
      data: {
        busiestDay: dayNames[busiestDay],
        tasksOnBusiest: maxTasks,
        totalPatterns: patterns.length,
        categoryAverages: categoryAvgs,
        dayDistribution: Object.fromEntries(Array.from(dayBuckets.entries()).map(([d, c]) => [dayNames[d], c])),
      },
    });
  }

  const recentTasks = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.householdId, householdId),
        eq(tasks.status, "DONE"),
        gte(tasks.createdAt, ninetyDaysAgo)
      )
    );

  const recurringTitles = new Map<string, number>();
  for (const task of recentTasks) {
    const key = task.title.toLowerCase().trim();
    recurringTitles.set(key, (recurringTitles.get(key) || 0) + 1);
  }

  const frequentTasks = Array.from(recurringTitles.entries())
    .filter(([_, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (frequentTasks.length > 0) {
    insights.push({
      category: "HOUSEHOLD_PATTERN",
      title: "Recurring task patterns detected",
      summary: `Your most frequent tasks: ${frequentTasks.map(([name, n]) => `"${name}" (${n}x)`).join(", ")}. Consider setting up recurring schedules.`,
      confidence: 75,
      data: { frequentTasks: Object.fromEntries(frequentTasks) },
    });
  }

  return insights;
}

export async function generateCalendarSuggestions(householdId: string): Promise<InsightResult[]> {
  const insights: InsightResult[] = [];
  const now = new Date();
  const weekFromNow = addDays(now, 7);

  const upcomingEvents = await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.householdId, householdId),
        gte(calendarEvents.startAt, startOfDay(now)),
        lte(calendarEvents.startAt, weekFromNow)
      )
    )
    .orderBy(calendarEvents.startAt);

  if (upcomingEvents.length === 0) return insights;

  const dayLoad = new Map<string, number>();
  for (const event of upcomingEvents) {
    const day = format(event.startAt, "EEEE");
    dayLoad.set(day, (dayLoad.get(day) || 0) + 1);
  }

  for (const [day, eventCount] of Array.from(dayLoad.entries())) {
    if (eventCount >= 3) {
      insights.push({
        category: "CALENDAR_SUGGESTION",
        title: `Busy ${day} ahead`,
        summary: `You have ${eventCount} events on ${day}. Consider prepping meals or adjusting task deadlines.`,
        confidence: 80,
        data: {
          day,
          eventCount,
          events: upcomingEvents
            .filter(e => format(e.startAt, "EEEE") === day)
            .map(e => ({ title: e.title, time: format(e.startAt, "h:mm a") })),
        },
      });
    }
  }

  if (!isDemoMode() && upcomingEvents.length > 0) {
    try {
      const eventList = upcomingEvents.slice(0, 8).map(e =>
        `${e.title} on ${format(e.startAt, "EEE MMM d 'at' h:mm a")}${e.location ? ` at ${e.location}` : ""}`
      ).join("\n");

      const result = await generateCompletion({
        messages: [
          { role: "system", content: "You are a proactive household assistant. Based on upcoming events, suggest 1-2 preparation tasks. Return JSON array of objects with title, summary fields. Be specific and actionable. Return ONLY valid JSON." },
          { role: "user", content: `Upcoming events:\n${eventList}\n\nWhat preparations would help this household?` },
        ],
        maxTokens: 300,
        temperature: 0.6,
      });

      const suggestions = JSON.parse(result);
      for (const s of (Array.isArray(suggestions) ? suggestions : []).slice(0, 2)) {
        if (s.title && s.summary) {
          insights.push({
            category: "CALENDAR_SUGGESTION",
            title: s.title,
            summary: s.summary,
            confidence: 65,
            data: { aiGenerated: true },
          });
        }
      }
    } catch (error) {
      logger.warn("[HomeIntelligence] AI calendar suggestion failed", {
        error: error instanceof Error ? error.message : String(error),
        householdId,
      });
    }
  }

  return insights;
}

export async function trackVendorPerformance(householdId: string): Promise<InsightResult[]> {
  const insights: InsightResult[] = [];
  const ninetyDaysAgo = subDays(new Date(), 90);

  const householdVendors = await db
    .select()
    .from(vendors)
    .where(eq(vendors.householdId, householdId));

  if (householdVendors.length === 0) return insights;

  const vendorSpending = await db
    .select({
      vendor: spendingItems.vendor,
      totalAmount: sql<number>`sum(${spendingItems.amount})`,
      itemCount: count(),
    })
    .from(spendingItems)
    .where(
      and(
        eq(spendingItems.householdId, householdId),
        gte(spendingItems.date, ninetyDaysAgo)
      )
    )
    .groupBy(spendingItems.vendor);

  const vendorTasks = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.householdId, householdId),
        gte(tasks.createdAt, ninetyDaysAgo)
      )
    );

  const vendorData: Record<string, { spending: number; taskCount: number; name: string }> = {};
  for (const v of householdVendors) {
    vendorData[v.name.toLowerCase()] = { spending: 0, taskCount: 0, name: v.name };
  }

  for (const vs of vendorSpending) {
    if (vs.vendor) {
      const key = vs.vendor.toLowerCase();
      if (vendorData[key]) {
        vendorData[key].spending = Number(vs.totalAmount);
      }
    }
  }

  for (const t of vendorTasks) {
    const titleLower = t.title.toLowerCase();
    for (const key of Object.keys(vendorData)) {
      if (titleLower.includes(key)) {
        vendorData[key].taskCount++;
      }
    }
  }

  const activeVendors = Object.values(vendorData).filter(v => v.spending > 0 || v.taskCount > 0);
  if (activeVendors.length > 0) {
    const topBySpending = [...activeVendors].sort((a, b) => b.spending - a.spending).slice(0, 3);

    insights.push({
      category: "VENDOR_PERFORMANCE",
      title: "Vendor activity summary",
      summary: `Top vendors by spending: ${topBySpending.map(v => `${v.name} ($${(v.spending / 100).toFixed(2)})`).join(", ")}. ${activeVendors.length} vendors active in the last 90 days.`,
      confidence: 85,
      data: {
        activeVendorCount: activeVendors.length,
        topVendors: topBySpending.map(v => ({
          name: v.name,
          spending: v.spending,
          taskCount: v.taskCount,
        })),
      },
    });
  }

  const inactiveVendors = householdVendors.filter(v => {
    const key = v.name.toLowerCase();
    const data = vendorData[key];
    return data && data.spending === 0 && data.taskCount === 0;
  });

  if (inactiveVendors.length > 0) {
    insights.push({
      category: "VENDOR_PERFORMANCE",
      title: `${inactiveVendors.length} inactive vendor${inactiveVendors.length > 1 ? "s" : ""}`,
      summary: `${inactiveVendors.map(v => v.name).join(", ")} ha${inactiveVendors.length > 1 ? "ve" : "s"}n't been used in 90 days. Still needed?`,
      confidence: 60,
      data: { inactiveVendors: inactiveVendors.map(v => v.name) },
    });
  }

  return insights;
}

export async function generateAllInsights(householdId: string): Promise<InsightResult[]> {
  const [maintenance, spending, patterns, calendar, vendorPerf] = await Promise.all([
    analyzeMaintenancePredictions(householdId).catch(e => {
      logger.error("[HomeIntelligence] Maintenance analysis failed", { error: e instanceof Error ? e.message : String(e), householdId });
      return [] as InsightResult[];
    }),
    detectSpendingAnomalies(householdId).catch(e => {
      logger.error("[HomeIntelligence] Spending analysis failed", { error: e instanceof Error ? e.message : String(e), householdId });
      return [] as InsightResult[];
    }),
    learnHouseholdPatterns(householdId).catch(e => {
      logger.error("[HomeIntelligence] Pattern analysis failed", { error: e instanceof Error ? e.message : String(e), householdId });
      return [] as InsightResult[];
    }),
    generateCalendarSuggestions(householdId).catch(e => {
      logger.error("[HomeIntelligence] Calendar analysis failed", { error: e instanceof Error ? e.message : String(e), householdId });
      return [] as InsightResult[];
    }),
    trackVendorPerformance(householdId).catch(e => {
      logger.error("[HomeIntelligence] Vendor analysis failed", { error: e instanceof Error ? e.message : String(e), householdId });
      return [] as InsightResult[];
    }),
  ]);

  return [...maintenance, ...spending, ...patterns, ...calendar, ...vendorPerf]
    .sort((a, b) => b.confidence - a.confidence);
}

export async function getInsights(householdId: string, forceRefresh = false) {
  const now = new Date();
  const oneHourAgo = subDays(now, 1 / 24);

  if (!forceRefresh) {
    const cached = await db
      .select()
      .from(householdInsights)
      .where(
        and(
          eq(householdInsights.householdId, householdId),
          eq(householdInsights.isActive, true),
          eq(householdInsights.isDismissed, false),
          gte(householdInsights.lastAnalyzedAt, oneHourAgo)
        )
      )
      .orderBy(desc(householdInsights.confidence))
      .limit(20);

    if (cached.length > 0) {
      return cached;
    }
  }

  await db
    .update(householdInsights)
    .set({ isActive: false, updatedAt: now })
    .where(
      and(
        eq(householdInsights.householdId, householdId),
        eq(householdInsights.isActive, true)
      )
    );

  const freshInsights = await generateAllInsights(householdId);

  const stored = [];
  for (const insight of freshInsights) {
    const [row] = await db
      .insert(householdInsights)
      .values({
        householdId,
        category: insight.category as "MAINTENANCE_PREDICTION" | "SPENDING_ANOMALY" | "HOUSEHOLD_PATTERN" | "CALENDAR_SUGGESTION" | "VENDOR_PERFORMANCE",
        title: insight.title,
        summary: insight.summary,
        confidence: insight.confidence,
        data: insight.data,
        isActive: true,
        isDismissed: false,
        lastAnalyzedAt: now,
        expiresAt: addDays(now, 1),
      })
      .returning();
    stored.push(row);
  }

  logger.info("[HomeIntelligence] Generated insights", {
    householdId,
    count: stored.length,
  });

  return stored;
}

export async function dismissInsight(insightId: string): Promise<void> {
  await db
    .update(householdInsights)
    .set({ isDismissed: true, updatedAt: new Date() })
    .where(eq(householdInsights.id, insightId));
}
