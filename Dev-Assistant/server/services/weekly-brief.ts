import { db } from "../db";
import { eq, and, gte, lte, desc, sql, inArray } from "drizzle-orm";
import {
  weeklyBriefs,
  userEngagement,
  learnedPreferences,
  tasks,
  calendarEvents,
  approvals,
  importantDates,
  people,
  userProfiles,
  notifications,
  notificationSettings,
  households,
} from "@shared/schema";
import { generateCompletion, isDemoMode } from "./ai-provider";
import { addDays, startOfWeek, endOfWeek, format, isWithinInterval } from "date-fns";

interface PersonalizationContext {
  topCategories: string[];
  mentionedPeople: string[];
  preferredTopics: string[];
  recentEngagement: {
    tasksViewed: number;
    approvalsCompleted: number;
    eventsChecked: number;
  };
}

async function getUserPersonalization(
  userId: string,
  householdId: string
): Promise<PersonalizationContext> {
  const thirtyDaysAgo = addDays(new Date(), -30);

  const [preferences, engagement] = await Promise.all([
    db
      .select()
      .from(learnedPreferences)
      .where(eq(learnedPreferences.householdId, householdId))
      .orderBy(desc(learnedPreferences.useCount))
      .limit(10),
    db
      .select({
        entityType: userEngagement.entityType,
        count: sql<number>`count(*)::int`,
      })
      .from(userEngagement)
      .where(
        and(
          eq(userEngagement.userId, userId),
          gte(userEngagement.createdAt, thirtyDaysAgo)
        )
      )
      .groupBy(userEngagement.entityType),
  ]);

  const topCategories = preferences
    .filter((p) => p.category === "task_category")
    .map((p) => p.value)
    .slice(0, 3);

  const preferredTopics = preferences
    .filter((p) => p.category === "brief_topic")
    .map((p) => p.value);

  const engagementMap = new Map(
    engagement.map((e) => [e.entityType, e.count])
  );

  return {
    topCategories: topCategories.length > 0 ? topCategories : ["HOUSEHOLD", "ERRANDS", "EVENTS"],
    mentionedPeople: [],
    preferredTopics: preferredTopics.length > 0 ? preferredTopics : ["tasks", "events", "approvals"],
    recentEngagement: {
      tasksViewed: engagementMap.get("task") || 0,
      approvalsCompleted: engagementMap.get("approval") || 0,
      eventsChecked: engagementMap.get("event") || 0,
    },
  };
}

async function gatherWeeklyData(householdId: string, weekStart: Date, weekEnd: Date) {
  const [taskList, eventList, approvalList, birthdayList, peopleList] = await Promise.all([
    db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.householdId, householdId),
          inArray(tasks.status, ["INBOX", "PLANNED", "IN_PROGRESS", "WAITING_ON_CLIENT"])
        )
      )
      .limit(20),
    db
      .select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.householdId, householdId),
          gte(calendarEvents.startAt, weekStart),
          lte(calendarEvents.startAt, weekEnd)
        )
      )
      .orderBy(calendarEvents.startAt),
    db
      .select()
      .from(approvals)
      .where(
        and(
          eq(approvals.householdId, householdId),
          eq(approvals.status, "PENDING")
        )
      ),
    db
      .select()
      .from(importantDates)
      .where(eq(importantDates.householdId, householdId)),
    db
      .select()
      .from(people)
      .where(eq(people.householdId, householdId)),
  ]);

  const upcomingBirthdays = birthdayList
    .filter((d) => d.type === "BIRTHDAY" && d.date)
    .filter((d) => {
      if (!d.date) return false;
      const thisYear = new Date(d.date);
      thisYear.setFullYear(weekStart.getFullYear());
      return isWithinInterval(thisYear, { start: weekStart, end: weekEnd });
    })
    .map((d) => {
      const person = peopleList.find((p) => p.id === d.personId);
      return { name: person?.fullName || person?.preferredName || "Someone", date: d.date! };
    });

  const urgentTasks = taskList.filter((t) => t.urgency === "HIGH");
  const dueSoonTasks = taskList.filter(
    (t) => t.dueAt && isWithinInterval(t.dueAt, { start: weekStart, end: weekEnd })
  );

  return {
    tasks: taskList,
    events: eventList,
    approvals: approvalList,
    birthdays: upcomingBirthdays,
    urgentTasks,
    dueSoonTasks,
    stats: {
      totalTasks: taskList.length,
      pendingApprovals: approvalList.length,
      upcomingEvents: eventList.length,
      urgentItems: urgentTasks.length,
    },
  };
}

export async function generatePersonalizedBrief(
  userId: string,
  householdId: string
): Promise<{ content: string; personalizationData: Record<string, unknown> }> {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 0 });

  const [personalization, weeklyData, household] = await Promise.all([
    getUserPersonalization(userId, householdId),
    gatherWeeklyData(householdId, weekStart, weekEnd),
    db.select().from(households).where(eq(households.id, householdId)).limit(1),
  ]);

  const householdName = household[0]?.name || "your household";

  if (isDemoMode()) {
    const parts: string[] = [];
    if (weeklyData.stats.urgentItems > 0) {
      parts.push(`${weeklyData.stats.urgentItems} urgent item${weeklyData.stats.urgentItems > 1 ? "s" : ""} need attention`);
    }
    if (weeklyData.stats.pendingApprovals > 0) {
      parts.push(`${weeklyData.stats.pendingApprovals} approval${weeklyData.stats.pendingApprovals > 1 ? "s" : ""} waiting`);
    }
    if (weeklyData.stats.upcomingEvents > 0) {
      parts.push(`${weeklyData.stats.upcomingEvents} event${weeklyData.stats.upcomingEvents > 1 ? "s" : ""} this week`);
    }
    if (weeklyData.birthdays.length > 0) {
      parts.push(`${weeklyData.birthdays[0].name}'s birthday coming up`);
    }

    return {
      content: `Good week ahead for ${householdName}! ${parts.length > 0 ? parts.join(". ") + "." : "Looking calm and organized."}`,
      personalizationData: {
        topCategories: personalization.topCategories,
        mentionedPeople: weeklyData.birthdays.map((b) => b.name),
        upcomingEvents: weeklyData.stats.upcomingEvents,
        pendingTasks: weeklyData.stats.totalTasks,
        urgentItems: weeklyData.stats.urgentItems,
      },
    };
  }

  const priorityFocus = personalization.recentEngagement.approvalsCompleted > 5
    ? "approvals and decisions"
    : personalization.recentEngagement.tasksViewed > 10
    ? "task progress"
    : "overall household rhythm";

  const prompt = `Generate a personalized weekly brief for a household management app.

HOUSEHOLD: ${householdName}
USER PREFERENCES:
- Most engaged categories: ${personalization.topCategories.join(", ")}
- Priority focus: ${priorityFocus}

THIS WEEK'S DATA:
- Pending tasks: ${weeklyData.stats.totalTasks} (${weeklyData.stats.urgentItems} urgent)
- Pending approvals: ${weeklyData.stats.pendingApprovals}
- Events: ${weeklyData.stats.upcomingEvents}
- Birthdays: ${weeklyData.birthdays.map((b) => `${b.name} on ${format(b.date, "EEEE")}`).join(", ") || "None"}

TOP EVENTS: ${JSON.stringify(weeklyData.events.slice(0, 5).map((e) => ({ title: e.title, day: format(e.startAt, "EEEE") })))}
URGENT TASKS: ${JSON.stringify(weeklyData.urgentTasks.slice(0, 3).map((t) => t.title))}
DUE SOON: ${JSON.stringify(weeklyData.dueSoonTasks.slice(0, 3).map((t) => ({ title: t.title, due: t.dueAt ? format(t.dueAt, "EEEE") : "soon" })))}

Write a warm, personalized 3-4 sentence weekly brief that:
1. Prioritizes what THIS user cares about based on their engagement patterns
2. Mentions specific people/events by name when relevant
3. Uses a calm, supportive tone like a trusted household manager
4. Ends with an encouraging note

Keep it concise but make it feel personal, not generic.`;

  try {
    const content = await generateCompletion({
      messages: [
        {
          role: "system",
          content: "You are a warm, professional household assistant delivering personalized weekly briefings. Be concise, specific, and genuinely helpful.",
        },
        { role: "user", content: prompt },
      ],
      maxTokens: 400,
      temperature: 0.7,
    });

    return {
      content,
      personalizationData: {
        topCategories: personalization.topCategories,
        mentionedPeople: weeklyData.birthdays.map((b) => b.name),
        upcomingEvents: weeklyData.stats.upcomingEvents,
        pendingTasks: weeklyData.stats.totalTasks,
        urgentItems: weeklyData.stats.urgentItems,
      },
    };
  } catch (error) {
    console.error("[WeeklyBrief] AI generation failed:", error);
    return {
      content: `Your week at ${householdName}: ${weeklyData.stats.totalTasks} tasks, ${weeklyData.stats.pendingApprovals} approvals waiting, and ${weeklyData.stats.upcomingEvents} events coming up.`,
      personalizationData: {
        topCategories: personalization.topCategories,
        mentionedPeople: [],
        upcomingEvents: weeklyData.stats.upcomingEvents,
        pendingTasks: weeklyData.stats.totalTasks,
        urgentItems: weeklyData.stats.urgentItems,
      },
    };
  }
}

export async function createAndSendWeeklyBrief(
  userId: string,
  householdId: string
): Promise<string> {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });

  const existing = await db
    .select()
    .from(weeklyBriefs)
    .where(
      and(
        eq(weeklyBriefs.userId, userId),
        eq(weeklyBriefs.householdId, householdId),
        eq(weeklyBriefs.weekStartDate, weekStart)
      )
    )
    .limit(1);

  if (existing.length > 0 && existing[0].status !== "PENDING") {
    return existing[0].content;
  }

  const { content, personalizationData } = await generatePersonalizedBrief(userId, householdId);

  const briefId = existing[0]?.id;

  if (briefId) {
    await db
      .update(weeklyBriefs)
      .set({
        content,
        status: "SENT",
        sentAt: new Date(),
        personalizationData,
        topicsIncluded: personalizationData.topCategories,
      })
      .where(eq(weeklyBriefs.id, briefId));
  } else {
    await db.insert(weeklyBriefs).values({
      userId,
      householdId,
      content,
      status: "SENT",
      weekStartDate: weekStart,
      sentAt: new Date(),
      personalizationData,
      topicsIncluded: personalizationData.topCategories,
    });
  }

  await db.insert(notifications).values({
    userId,
    householdId,
    type: "WEEKLY_BRIEF",
    title: "Your Weekly Brief is Ready",
    body: content.slice(0, 200) + (content.length > 200 ? "..." : ""),
    isRead: false,
  });

  return content;
}

export async function markBriefAsRead(briefId: string): Promise<void> {
  await db
    .update(weeklyBriefs)
    .set({ status: "READ", readAt: new Date() })
    .where(eq(weeklyBriefs.id, briefId));
}

export async function submitBriefFeedback(
  briefId: string,
  rating: number,
  feedbackText?: string
): Promise<void> {
  await db
    .update(weeklyBriefs)
    .set({ feedbackRating: rating, feedbackText })
    .where(eq(weeklyBriefs.id, briefId));

  const brief = await db
    .select()
    .from(weeklyBriefs)
    .where(eq(weeklyBriefs.id, briefId))
    .limit(1);

  if (brief[0] && rating >= 4) {
    const topics = brief[0].topicsIncluded || [];
    for (const topic of topics) {
      await db
        .insert(learnedPreferences)
        .values({
          householdId: brief[0].householdId,
          category: "brief_topic",
          key: topic,
          value: topic,
          confidence: "medium",
          source: "explicit",
          useCount: 1,
          lastUsedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [learnedPreferences.householdId, learnedPreferences.category, learnedPreferences.key],
          set: {
            useCount: sql`${learnedPreferences.useCount} + 1`,
            lastUsedAt: new Date(),
            confidence: "high",
          },
        });
    }
  }
}

export async function trackUserEngagement(
  userId: string,
  householdId: string,
  entityType: string,
  entityId?: string,
  action: string = "view",
  metadata?: Record<string, any>
): Promise<void> {
  await db.insert(userEngagement).values({
    userId,
    householdId,
    entityType,
    entityId,
    action,
    metadata,
  });

  if (entityType === "task" && action === "view") {
    const task = await db
      .select({ category: tasks.category })
      .from(tasks)
      .where(eq(tasks.id, entityId || ""))
      .limit(1);

    if (task[0]) {
      await db
        .insert(learnedPreferences)
        .values({
          householdId,
          category: "task_category",
          key: task[0].category,
          value: task[0].category,
          confidence: "low",
          source: "inferred",
          useCount: 1,
          lastUsedAt: new Date(),
        })
        .onConflictDoNothing();
    }
  }
}

export async function runWeeklyBriefScheduler(): Promise<{ sent: number; failed: number }> {
  console.log("[WeeklyBrief] Running scheduled brief delivery...");

  const now = new Date();
  const dayOfWeek = now.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();

  const eligibleUsers = await db
    .select({
      userId: notificationSettings.userId,
      householdId: notificationSettings.householdId,
      weeklyBriefDay: notificationSettings.weeklyBriefDay,
      weeklyBriefTime: notificationSettings.weeklyBriefTime,
    })
    .from(notificationSettings)
    .where(eq(notificationSettings.weeklyBriefDay, dayOfWeek));

  let sent = 0;
  let failed = 0;

  for (const user of eligibleUsers) {
    try {
      await createAndSendWeeklyBrief(user.userId, user.householdId);
      sent++;
      console.log(`[WeeklyBrief] Sent brief to user ${user.userId}`);
    } catch (error) {
      failed++;
      console.error(`[WeeklyBrief] Failed for user ${user.userId}:`, error);
    }
  }

  console.log(`[WeeklyBrief] Completed: ${sent} sent, ${failed} failed`);
  return { sent, failed };
}

export async function getLatestBrief(
  userId: string,
  householdId: string
): Promise<typeof weeklyBriefs.$inferSelect | null> {
  const briefs = await db
    .select()
    .from(weeklyBriefs)
    .where(
      and(
        eq(weeklyBriefs.userId, userId),
        eq(weeklyBriefs.householdId, householdId)
      )
    )
    .orderBy(desc(weeklyBriefs.createdAt))
    .limit(1);

  return briefs[0] || null;
}
