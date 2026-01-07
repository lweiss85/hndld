import { db } from "../db";
import { analyticsEvents, tasks, approvals, requests, spendingItems, updates } from "@shared/schema";
import { eq, and, gte, lte, sql, count, desc } from "drizzle-orm";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subDays, format } from "date-fns";

export type TimePeriod = "week" | "month" | "quarter" | "year";

export async function trackEvent(
  householdId: string,
  eventType: "TASK_CREATED" | "TASK_COMPLETED" | "TASK_OVERDUE" | 
             "APPROVAL_REQUESTED" | "APPROVAL_APPROVED" | "APPROVAL_DECLINED" |
             "REQUEST_CREATED" | "REQUEST_RESPONDED" |
             "UPDATE_POSTED" | "LOGIN" | "SESSION_END",
  metadata?: Record<string, unknown>,
  userId?: string
) {
  try {
    await db.insert(analyticsEvents).values({
      householdId,
      userId: userId || null,
      eventType,
      metadata: metadata || {},
    });
  } catch (error) {
    console.error("Failed to track analytics event:", error);
  }
}

function getDateRange(period: TimePeriod): { start: Date; end: Date } {
  const now = new Date();
  
  switch (period) {
    case "week":
      return { start: startOfWeek(now), end: endOfWeek(now) };
    case "month":
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case "quarter":
      const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      const quarterEnd = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0);
      return { start: quarterStart, end: quarterEnd };
    case "year":
      return { start: startOfYear(now), end: endOfYear(now) };
    default:
      return { start: startOfMonth(now), end: endOfMonth(now) };
  }
}

export async function getAnalyticsDashboard(householdId: string, period: TimePeriod = "month") {
  const { start, end } = getDateRange(period);

  const [
    tasksCompletedResult,
    totalTasksResult,
    pendingApprovalsResult,
    totalApprovalsResult,
    requestsResult,
    spendingResult,
    updatesResult,
  ] = await Promise.all([
    db.select({ count: count() })
      .from(tasks)
      .where(and(
        eq(tasks.householdId, householdId),
        eq(tasks.status, "DONE"),
        gte(tasks.updatedAt, start),
        lte(tasks.updatedAt, end)
      )),
    
    db.select({ count: count() })
      .from(tasks)
      .where(and(
        eq(tasks.householdId, householdId),
        gte(tasks.createdAt, start),
        lte(tasks.createdAt, end)
      )),
    
    db.select({ count: count() })
      .from(approvals)
      .where(and(
        eq(approvals.householdId, householdId),
        eq(approvals.status, "PENDING")
      )),
    
    db.select({ count: count() })
      .from(approvals)
      .where(and(
        eq(approvals.householdId, householdId),
        gte(approvals.createdAt, start),
        lte(approvals.createdAt, end)
      )),
    
    db.select({ count: count() })
      .from(requests)
      .where(and(
        eq(requests.householdId, householdId),
        gte(requests.createdAt, start),
        lte(requests.createdAt, end)
      )),
    
    db.select({ total: sql<number>`COALESCE(SUM(${spendingItems.amount}), 0)` })
      .from(spendingItems)
      .where(and(
        eq(spendingItems.householdId, householdId),
        gte(spendingItems.date, start),
        lte(spendingItems.date, end)
      )),
    
    db.select({ count: count() })
      .from(updates)
      .where(and(
        eq(updates.householdId, householdId),
        gte(updates.createdAt, start),
        lte(updates.createdAt, end)
      )),
  ]);

  const tasksCompleted = tasksCompletedResult[0]?.count || 0;
  const totalTasks = totalTasksResult[0]?.count || 0;
  const pendingApprovals = pendingApprovalsResult[0]?.count || 0;
  const totalApprovals = totalApprovalsResult[0]?.count || 0;
  const totalRequests = requestsResult[0]?.count || 0;
  const totalSpending = spendingResult[0]?.total || 0;
  const totalUpdates = updatesResult[0]?.count || 0;

  const estimatedHoursSaved = Math.round(tasksCompleted * 0.25 * 10) / 10;

  return {
    period,
    dateRange: { start, end },
    kpis: {
      tasksCompleted,
      totalTasks,
      completionRate: totalTasks > 0 ? Math.round((tasksCompleted / totalTasks) * 100) : 0,
      pendingApprovals,
      totalApprovals,
      totalRequests,
      totalSpending,
      totalUpdates,
      estimatedHoursSaved,
    },
  };
}

export async function getTasksOverTime(householdId: string, period: TimePeriod = "month") {
  const { start, end } = getDateRange(period);
  
  const allTasks = await db.select({
    createdAt: tasks.createdAt,
    status: tasks.status,
  })
    .from(tasks)
    .where(and(
      eq(tasks.householdId, householdId),
      gte(tasks.createdAt, start),
      lte(tasks.createdAt, end)
    ))
    .orderBy(tasks.createdAt);

  const dailyData: Record<string, { created: number; completed: number }> = {};
  
  for (const task of allTasks) {
    const dateKey = format(task.createdAt || new Date(), "yyyy-MM-dd");
    if (!dailyData[dateKey]) {
      dailyData[dateKey] = { created: 0, completed: 0 };
    }
    dailyData[dateKey].created++;
    if (task.status === "DONE") {
      dailyData[dateKey].completed++;
    }
  }

  return Object.entries(dailyData).map(([date, data]) => ({
    date,
    ...data,
  }));
}

export async function getTasksByCategory(householdId: string, period: TimePeriod = "month") {
  const { start, end } = getDateRange(period);
  
  const results = await db.select({
    category: tasks.category,
    count: count(),
  })
    .from(tasks)
    .where(and(
      eq(tasks.householdId, householdId),
      gte(tasks.createdAt, start),
      lte(tasks.createdAt, end)
    ))
    .groupBy(tasks.category);

  return results;
}

export async function getSpendingByCategory(householdId: string, period: TimePeriod = "month") {
  const { start, end } = getDateRange(period);
  
  const results = await db.select({
    category: spendingItems.category,
    total: sql<number>`SUM(${spendingItems.amount})`,
  })
    .from(spendingItems)
    .where(and(
      eq(spendingItems.householdId, householdId),
      gte(spendingItems.date, start),
      lte(spendingItems.date, end)
    ))
    .groupBy(spendingItems.category);

  return results;
}

export async function generateClientImpactSummary(householdId: string) {
  const { start, end } = getDateRange("month");
  
  const dashboard = await getAnalyticsDashboard(householdId, "month");
  
  const topCategories = await db.select({
    category: tasks.category,
    count: count(),
  })
    .from(tasks)
    .where(and(
      eq(tasks.householdId, householdId),
      eq(tasks.status, "DONE"),
      gte(tasks.updatedAt, start),
      lte(tasks.updatedAt, end)
    ))
    .groupBy(tasks.category)
    .orderBy(desc(count()))
    .limit(3);

  return {
    period: format(start, "MMMM yyyy"),
    tasksHandled: dashboard.kpis.tasksCompleted,
    hoursSaved: dashboard.kpis.estimatedHoursSaved,
    spendingManaged: dashboard.kpis.totalSpending,
    topCategories: topCategories.map((c) => c.category),
    highlights: generateHighlights(dashboard.kpis, topCategories),
  };
}

function generateHighlights(
  kpis: { tasksCompleted: number; totalSpending: number; pendingApprovals: number },
  topCategories: { category: string; count: number }[]
): string[] {
  const highlights: string[] = [];
  
  if (kpis.tasksCompleted > 0) {
    highlights.push(`Completed ${kpis.tasksCompleted} tasks this month`);
  }
  
  if (kpis.totalSpending > 0) {
    highlights.push(`Managed $${(kpis.totalSpending / 100).toFixed(2)} in spending`);
  }
  
  if (topCategories.length > 0) {
    const topCategory = topCategories[0];
    highlights.push(`Most active area: ${topCategory.category.toLowerCase().replace("_", " ")}`);
  }
  
  return highlights;
}

const DEFAULT_ESTIMATED_MINUTES = 15;

interface DashboardStats {
  tasksCompleted: number;
  tasksCompletedChange: number;
  timeSaved: number;
  timeSavedChange: number;
  moneyManaged: number;
  moneyManagedChange: number;
  responseTime: number;
  responseTimeChange: number;
}

interface TimelineDataPoint {
  date: string;
  tasksCompleted: number;
  spending: number;
  updates: number;
}

function getPeriodRange(period: string): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  
  switch (period) {
    case "7d":
      start.setDate(start.getDate() - 7);
      break;
    case "30d":
      start.setDate(start.getDate() - 30);
      break;
    case "90d":
      start.setDate(start.getDate() - 90);
      break;
    case "1y":
      start.setFullYear(start.getFullYear() - 1);
      break;
    default:
      start.setDate(start.getDate() - 30);
  }
  
  return { start, end };
}

function calcPercentChange(prev: number, current: number): number {
  if (prev === 0) return current > 0 ? 100 : 0;
  return ((current - prev) / prev) * 100;
}

export async function getDashboardStats(householdId: string, period: string = "30d"): Promise<DashboardStats> {
  const range = getPeriodRange(period);
  const duration = range.end.getTime() - range.start.getTime();
  const prevRange = {
    start: new Date(range.start.getTime() - duration),
    end: range.start,
  };

  const [currentTasks, prevTasks] = await Promise.all([
    db.select({ count: count() }).from(tasks).where(and(
      eq(tasks.householdId, householdId),
      eq(tasks.status, "DONE"),
      gte(tasks.updatedAt, range.start),
      lte(tasks.updatedAt, range.end)
    )),
    db.select({ count: count() }).from(tasks).where(and(
      eq(tasks.householdId, householdId),
      eq(tasks.status, "DONE"),
      gte(tasks.updatedAt, prevRange.start),
      lte(tasks.updatedAt, prevRange.end)
    )),
  ]);

  const [currentSpending, prevSpending] = await Promise.all([
    db.select({ total: sql<number>`COALESCE(SUM(${spendingItems.amount}), 0)` }).from(spendingItems).where(and(
      eq(spendingItems.householdId, householdId),
      gte(spendingItems.date, range.start),
      lte(spendingItems.date, range.end)
    )),
    db.select({ total: sql<number>`COALESCE(SUM(${spendingItems.amount}), 0)` }).from(spendingItems).where(and(
      eq(spendingItems.householdId, householdId),
      gte(spendingItems.date, prevRange.start),
      lte(spendingItems.date, prevRange.end)
    )),
  ]);

  const tasksCompleted = Number(currentTasks[0]?.count || 0);
  const prevTasksCompleted = Number(prevTasks[0]?.count || 0);
  const moneyManaged = Number(currentSpending[0]?.total || 0);
  const prevMoneyManaged = Number(prevSpending[0]?.total || 0);

  const avgMinutesPerTask = 30;
  const timeSaved = tasksCompleted * avgMinutesPerTask;
  const prevTimeSaved = prevTasksCompleted * avgMinutesPerTask;

  return {
    tasksCompleted,
    tasksCompletedChange: calcPercentChange(prevTasksCompleted, tasksCompleted),
    timeSaved,
    timeSavedChange: calcPercentChange(prevTimeSaved, timeSaved),
    moneyManaged,
    moneyManagedChange: calcPercentChange(prevMoneyManaged, moneyManaged),
    responseTime: 4,
    responseTimeChange: 0,
  };
}

export async function getTaskBreakdown(householdId: string, period: string = "30d") {
  const range = getPeriodRange(period);
  
  const result = await db.select({
    category: tasks.category,
    count: count(),
  })
    .from(tasks)
    .where(and(
      eq(tasks.householdId, householdId),
      eq(tasks.status, "DONE"),
      gte(tasks.updatedAt, range.start),
      lte(tasks.updatedAt, range.end)
    ))
    .groupBy(tasks.category);

  const total = result.reduce((sum, r) => sum + Number(r.count), 0);

  return result.map(r => ({
    category: r.category || "OTHER",
    count: Number(r.count),
    percentage: total > 0 ? (Number(r.count) / total) * 100 : 0,
    avgCompletionTime: 30,
  }));
}

export async function getSpendingBreakdown(householdId: string, period: string = "30d") {
  const range = getPeriodRange(period);
  
  const result = await db.select({
    category: spendingItems.category,
    amount: sql<number>`COALESCE(SUM(${spendingItems.amount}), 0)`,
    count: count(),
  })
    .from(spendingItems)
    .where(and(
      eq(spendingItems.householdId, householdId),
      gte(spendingItems.date, range.start),
      lte(spendingItems.date, range.end)
    ))
    .groupBy(spendingItems.category);

  const total = result.reduce((sum, r) => sum + Number(r.amount || 0), 0);

  return result.map(r => ({
    category: r.category || "OTHER",
    amount: Number(r.amount || 0),
    count: Number(r.count),
    percentage: total > 0 ? (Number(r.amount || 0) / total) * 100 : 0,
  }));
}

export async function getTimelineData(
  householdId: string,
  period: string = "30d"
): Promise<TimelineDataPoint[]> {
  const range = getPeriodRange(period);

  const [tasksByDate, spendingByDate, updatesByDate] = await Promise.all([
    db.select({
      date: sql<string>`DATE(${tasks.updatedAt})::text`,
      count: count(),
    })
      .from(tasks)
      .where(and(
        eq(tasks.householdId, householdId),
        eq(tasks.status, "DONE"),
        gte(tasks.updatedAt, range.start),
        lte(tasks.updatedAt, range.end)
      ))
      .groupBy(sql`DATE(${tasks.updatedAt})`),
    
    db.select({
      date: sql<string>`DATE(${spendingItems.date})::text`,
      amount: sql<number>`COALESCE(SUM(${spendingItems.amount}), 0)`,
    })
      .from(spendingItems)
      .where(and(
        eq(spendingItems.householdId, householdId),
        gte(spendingItems.date, range.start),
        lte(spendingItems.date, range.end)
      ))
      .groupBy(sql`DATE(${spendingItems.date})`),
    
    db.select({
      date: sql<string>`DATE(${updates.createdAt})::text`,
      count: count(),
    })
      .from(updates)
      .where(and(
        eq(updates.householdId, householdId),
        gte(updates.createdAt, range.start),
        lte(updates.createdAt, range.end)
      ))
      .groupBy(sql`DATE(${updates.createdAt})`),
  ]);

  const dateMap = new Map<string, TimelineDataPoint>();
  
  const current = new Date(range.start);
  while (current <= range.end) {
    const dateStr = current.toISOString().split("T")[0];
    dateMap.set(dateStr, {
      date: dateStr,
      tasksCompleted: 0,
      spending: 0,
      updates: 0,
    });
    current.setDate(current.getDate() + 1);
  }

  tasksByDate.forEach(t => {
    const point = dateMap.get(t.date);
    if (point) point.tasksCompleted = Number(t.count);
  });

  spendingByDate.forEach(s => {
    const point = dateMap.get(s.date);
    if (point) point.spending = Number(s.amount || 0);
  });

  updatesByDate.forEach(u => {
    const point = dateMap.get(u.date);
    if (point) point.updates = Number(u.count);
  });

  return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function getAssistantPerformance(householdId: string, period: string = "30d") {
  const range = getPeriodRange(period);
  
  const [allTasks, completedTasks, updateCount] = await Promise.all([
    db.select({ count: count() }).from(tasks).where(and(
      eq(tasks.householdId, householdId),
      gte(tasks.createdAt, range.start),
      lte(tasks.createdAt, range.end)
    )),
    db.select({ count: count() }).from(tasks).where(and(
      eq(tasks.householdId, householdId),
      eq(tasks.status, "DONE"),
      gte(tasks.updatedAt, range.start),
      lte(tasks.updatedAt, range.end)
    )),
    db.select({ count: count() }).from(updates).where(and(
      eq(updates.householdId, householdId),
      gte(updates.createdAt, range.start),
      lte(updates.createdAt, range.end)
    )),
  ]);

  const totalTasks = Number(allTasks[0]?.count || 0);
  const completed = Number(completedTasks[0]?.count || 0);
  const updatesTotal = Number(updateCount[0]?.count || 0);

  const days = Math.max(1, Math.ceil((range.end.getTime() - range.start.getTime()) / (1000 * 60 * 60 * 24)));

  const topCategories = await db.select({
    category: tasks.category,
    count: count(),
  })
    .from(tasks)
    .where(and(
      eq(tasks.householdId, householdId),
      eq(tasks.status, "DONE"),
      gte(tasks.updatedAt, range.start),
      lte(tasks.updatedAt, range.end)
    ))
    .groupBy(tasks.category)
    .orderBy(desc(count()))
    .limit(3);

  return {
    avgResponseTime: 4,
    taskCompletionRate: totalTasks > 0 ? (completed / totalTasks) * 100 : 0,
    updateFrequency: updatesTotal / days,
    topCategories: topCategories.map(r => r.category || "OTHER"),
  };
}

export async function getTimeReturned(householdId: string, period: "week" | "month" | "all" = "week") {
  let start: Date | null = null;
  const end = new Date();
  
  if (period === "week") {
    start = startOfWeek(end);
  } else if (period === "month") {
    start = startOfMonth(end);
  }
  
  const conditions = [
    eq(tasks.householdId, householdId),
    eq(tasks.status, "DONE"),
  ];
  
  if (start) {
    conditions.push(gte(tasks.updatedAt, start));
  }
  
  const result = await db.select({
    totalMinutes: sql<number>`COALESCE(SUM(COALESCE(${tasks.estimatedMinutes}, ${DEFAULT_ESTIMATED_MINUTES})), 0)`,
  })
    .from(tasks)
    .where(and(...conditions));
  
  const minutes = Number(result[0]?.totalMinutes) || 0;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  return {
    minutes,
    hours,
    remainingMinutes,
    formatted: hours > 0 ? `${hours}h ${remainingMinutes}m` : `${remainingMinutes}m`,
  };
}

export async function getImpactMetrics(householdId: string) {
  const [week, month, allTime] = await Promise.all([
    getTimeReturned(householdId, "week"),
    getTimeReturned(householdId, "month"),
    getTimeReturned(householdId, "all"),
  ]);
  
  return {
    minutesReturnedWeek: week.minutes,
    minutesReturnedMonth: month.minutes,
    minutesReturnedAllTime: allTime.minutes,
    hoursReturnedWeek: week.hours + (week.remainingMinutes / 60),
    hoursReturnedMonth: month.hours + (month.remainingMinutes / 60),
    hoursReturnedAllTime: allTime.hours + (allTime.remainingMinutes / 60),
    formattedWeek: week.formatted,
    formattedMonth: month.formatted,
    formattedAllTime: allTime.hours > 0 ? `${allTime.hours}h` : `${allTime.minutes}m`,
  };
}
