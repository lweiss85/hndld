import { db } from "../db";
import { eq, and, sql, desc, count, gte, lte } from "drizzle-orm";
import {
  celebrations,
  handwrittenNotes,
  tasks,
  calendarEvents,
  userProfiles,
  households,
  spendingItems,
  importantDates,
} from "../../shared/schema";
import { format, subYears, differenceInMonths, differenceInDays, startOfYear, endOfYear, addDays, subDays } from "date-fns";

interface MilestoneCheck {
  type: "ANNIVERSARY" | "MILESTONE" | "SEASONAL" | "PATTERN_REMINDER";
  title: string;
  subtitle?: string;
  message: string;
  data: Record<string, unknown>;
}

const MILESTONE_TASK_COUNTS = [10, 25, 50, 100, 250, 500, 1000];
const HOURS_PER_TASK_ESTIMATE = 0.47;

function getCurrentSeason(): "spring" | "summer" | "fall" | "winter" {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "fall";
  return "winter";
}

function getSeasonalTheme(season: string) {
  const themes: Record<string, { gradient: string; accent: string; emoji: string }> = {
    spring: { gradient: "from-emerald-400 to-lime-300", accent: "#10b981", emoji: "🌸" },
    summer: { gradient: "from-amber-400 to-orange-300", accent: "#f59e0b", emoji: "☀️" },
    fall: { gradient: "from-orange-500 to-red-400", accent: "#f97316", emoji: "🍂" },
    winter: { gradient: "from-sky-400 to-indigo-300", accent: "#0ea5e9", emoji: "❄️" },
  };
  return themes[season] || themes.spring;
}

export async function generateShareableHtml(celebration: {
  title: string;
  subtitle?: string;
  message: string;
  type: string;
  data: Record<string, unknown>;
}): Promise<string> {
  const season = getCurrentSeason();
  const theme = getSeasonalTheme(season);

  const iconMap: Record<string, string> = {
    ANNIVERSARY: "🎉",
    MILESTONE: "🏆",
    SEASONAL: theme.emoji,
    PATTERN_REMINDER: "💡",
  };

  const icon = iconMap[celebration.type] || "✨";

  return `
<div style="width:375px;height:500px;background:linear-gradient(135deg,#1D2A44 0%,#2a3f6b 100%);border-radius:24px;padding:40px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;font-family:'Inter',system-ui,sans-serif;color:#F6F2EA;position:relative;overflow:hidden;">
  <div style="position:absolute;top:0;left:0;right:0;height:6px;background:linear-gradient(90deg,#C9A96E,#E8D5A3,#C9A96E);"></div>
  <div style="font-size:64px;margin-bottom:24px;filter:drop-shadow(0 4px 12px rgba(0,0,0,0.3));">${icon}</div>
  <div style="font-size:28px;font-weight:700;letter-spacing:-0.5px;margin-bottom:8px;line-height:1.2;">${celebration.title}</div>
  ${celebration.subtitle ? `<div style="font-size:16px;opacity:0.7;margin-bottom:16px;">${celebration.subtitle}</div>` : ""}
  <div style="font-size:15px;opacity:0.85;line-height:1.6;max-width:280px;">${celebration.message}</div>
  ${celebration.data.stat ? `<div style="margin-top:24px;padding:16px 32px;background:rgba(201,169,110,0.15);border:1px solid rgba(201,169,110,0.3);border-radius:16px;font-size:32px;font-weight:700;color:#C9A96E;">${celebration.data.stat}</div>` : ""}
  <div style="position:absolute;bottom:20px;font-size:11px;opacity:0.4;letter-spacing:2px;text-transform:uppercase;">hndld</div>
</div>`.trim();
}

export async function checkAnniversaries(householdId: string, userId: string): Promise<MilestoneCheck[]> {
  const results: MilestoneCheck[] = [];
  const now = new Date();

  const profile = await db.select().from(userProfiles)
    .where(and(eq(userProfiles.userId, userId), eq(userProfiles.householdId, householdId)))
    .limit(1);

  if (!profile.length || !profile[0].createdAt) return results;

  const joinDate = new Date(profile[0].createdAt);
  const monthsSince = differenceInMonths(now, joinDate);
  const daysSince = differenceInDays(now, joinDate);

  const anniversaryYears = Math.floor(monthsSince / 12);
  if (anniversaryYears >= 1) {
    const anniversaryDate = new Date(joinDate);
    anniversaryDate.setFullYear(joinDate.getFullYear() + anniversaryYears);
    const daysUntilAnniversary = differenceInDays(anniversaryDate, now);

    if (daysUntilAnniversary >= -7 && daysUntilAnniversary <= 7) {
      const existing = await db.select().from(celebrations)
        .where(and(
          eq(celebrations.householdId, householdId),
          eq(celebrations.userId, userId),
          eq(celebrations.type, "ANNIVERSARY"),
          sql`(data->>'year')::int = ${anniversaryYears}`
        )).limit(1);

      if (!existing.length) {
        const [taskCount] = await db.select({ count: count() }).from(tasks)
          .where(and(eq(tasks.householdId, householdId), eq(tasks.status, "DONE")));
        const [spendingCount] = await db.select({ count: count() }).from(spendingItems)
          .where(eq(spendingItems.householdId, householdId));

        const yearLabel = anniversaryYears === 1 ? "1 year" : `${anniversaryYears} years`;

        results.push({
          type: "ANNIVERSARY",
          title: `Happy ${yearLabel} with hndld!`,
          subtitle: `Member since ${format(joinDate, "MMMM d, yyyy")}`,
          message: `Over ${yearLabel}, your household has completed ${taskCount.count} tasks and managed ${spendingCount.count} expenses. Here's to another year of seamless household management.`,
          data: {
            year: anniversaryYears,
            joinDate: joinDate.toISOString(),
            tasksCompleted: taskCount.count,
            expensesManaged: spendingCount.count,
            stat: `${yearLabel}`,
          },
        });
      }
    }
  }

  const monthMilestones = [1, 3, 6];
  for (const m of monthMilestones) {
    if (monthsSince >= m && monthsSince < m + 1) {
      const existing = await db.select().from(celebrations)
        .where(and(
          eq(celebrations.householdId, householdId),
          eq(celebrations.userId, userId),
          eq(celebrations.type, "ANNIVERSARY"),
          sql`(data->>'months')::int = ${m}`
        )).limit(1);

      if (!existing.length) {
        const label = m === 1 ? "1 month" : `${m} months`;
        results.push({
          type: "ANNIVERSARY",
          title: `${label} with hndld!`,
          subtitle: "Your household journey continues",
          message: `You've been managing your household with hndld for ${label}. We're glad to have you.`,
          data: { months: m, joinDate: joinDate.toISOString(), stat: label },
        });
      }
    }
  }

  return results;
}

export async function checkTaskMilestones(householdId: string, userId: string): Promise<MilestoneCheck[]> {
  const results: MilestoneCheck[] = [];

  const [{ count: totalDone }] = await db.select({ count: count() }).from(tasks)
    .where(and(eq(tasks.householdId, householdId), eq(tasks.status, "DONE")));

  const totalCount = Number(totalDone);

  for (const milestone of MILESTONE_TASK_COUNTS) {
    if (totalCount >= milestone) {
      const existing = await db.select().from(celebrations)
        .where(and(
          eq(celebrations.householdId, householdId),
          eq(celebrations.userId, userId),
          eq(celebrations.type, "MILESTONE"),
          sql`(data->>'milestone')::int = ${milestone}`
        )).limit(1);

      if (!existing.length) {
        const hoursSaved = Math.round(milestone * HOURS_PER_TASK_ESTIMATE);
        results.push({
          type: "MILESTONE",
          title: `Your ${milestone}th task completed!`,
          subtitle: "What an achievement",
          message: `Your household has completed ${milestone} tasks through hndld. That's an estimated ${hoursSaved} hours of coordination time saved.`,
          data: {
            milestone,
            totalTasks: totalCount,
            hoursSaved,
            stat: `${hoursSaved}h saved`,
          },
        });
      }
    }
  }

  const profile = await db.select().from(userProfiles)
    .where(and(eq(userProfiles.userId, userId), eq(userProfiles.householdId, householdId)))
    .limit(1);

  if (profile.length && profile[0].createdAt) {
    const joinDate = new Date(profile[0].createdAt);
    const now = new Date();
    const yearsSince = differenceInMonths(now, joinDate) / 12;

    if (yearsSince >= 0.5) {
      const totalHoursSaved = Math.round(totalCount * HOURS_PER_TASK_ESTIMATE);
      const hoursPerYear = Math.round(totalHoursSaved / Math.max(yearsSince, 0.5));

      if (hoursPerYear >= 10) {
        const existing = await db.select().from(celebrations)
          .where(and(
            eq(celebrations.householdId, householdId),
            eq(celebrations.userId, userId),
            eq(celebrations.type, "MILESTONE"),
            sql`data->>'subtype' = 'hours_saved'`,
            sql`created_at > ${subYears(now, 1)}`
          )).limit(1);

        if (!existing.length) {
          results.push({
            type: "MILESTONE",
            title: `You've saved ~${totalHoursSaved} hours`,
            subtitle: "Time well managed",
            message: `Based on your completed tasks, hndld has saved your household approximately ${totalHoursSaved} hours of coordination this year. That's time back for what matters most.`,
            data: {
              subtype: "hours_saved",
              totalHoursSaved,
              hoursPerYear,
              totalTasks: totalCount,
              stat: `~${totalHoursSaved}h`,
            },
          });
        }
      }
    }
  }

  return results;
}

export async function checkSeasonalTouches(householdId: string, userId: string): Promise<MilestoneCheck[]> {
  const results: MilestoneCheck[] = [];
  const now = new Date();
  const season = getCurrentSeason();
  const month = now.getMonth();

  const existing = await db.select().from(celebrations)
    .where(and(
      eq(celebrations.householdId, householdId),
      eq(celebrations.userId, userId),
      eq(celebrations.type, "SEASONAL"),
      sql`(data->>'season') = ${season}`,
      sql`EXTRACT(YEAR FROM created_at) = ${now.getFullYear()}`
    )).limit(1);

  if (!existing.length) {
    const seasonalSuggestions: Record<string, { title: string; message: string; checklist: string[] }> = {
      spring: {
        title: "Spring refresh time",
        message: "Based on your household patterns, here's a personalized spring cleaning checklist.",
        checklist: [
          "Deep clean kitchen appliances",
          "Rotate seasonal wardrobes",
          "Schedule HVAC maintenance",
          "Clean windows and screens",
          "Declutter and organize closets",
          "Check smoke detector batteries",
          "Service lawn equipment",
          "Clean gutters",
        ],
      },
      summer: {
        title: "Summer prep suggestions",
        message: "Get ready for the season with these household suggestions.",
        checklist: [
          "Schedule pool maintenance",
          "Check outdoor furniture",
          "Stock up on sunscreen and supplies",
          "Plan summer activities",
          "Service air conditioning",
          "Organize garage and outdoor storage",
        ],
      },
      fall: {
        title: "Fall household prep",
        message: "Prepare your home for the cooler months ahead.",
        checklist: [
          "Schedule heating system inspection",
          "Clean and store outdoor furniture",
          "Check weatherstripping and insulation",
          "Clean chimney and fireplace",
          "Rake leaves and prep landscaping",
          "Stock pantry for holiday entertaining",
        ],
      },
      winter: {
        title: "Winter home care",
        message: "Keep your household running smoothly through winter.",
        checklist: [
          "Check pipes for freezing risk",
          "Stock emergency supplies",
          "Service snow removal equipment",
          "Check heating efficiency",
          "Plan holiday preparations",
          "Schedule end-of-year home review",
        ],
      },
    };

    const suggestion = seasonalSuggestions[season];
    if (suggestion) {
      results.push({
        type: "SEASONAL",
        title: suggestion.title,
        subtitle: `${season.charAt(0).toUpperCase() + season.slice(1)} ${now.getFullYear()}`,
        message: suggestion.message,
        data: {
          season,
          year: now.getFullYear(),
          checklist: suggestion.checklist,
        },
      });
    }
  }

  return results;
}

export async function checkPatternReminders(householdId: string, userId: string): Promise<MilestoneCheck[]> {
  const results: MilestoneCheck[] = [];
  const now = new Date();

  const lastYearStart = subYears(startOfYear(now), 0);
  const lastYearEnd = endOfYear(subYears(now, 1));
  const lookAheadStart = subDays(now, 3);
  const lookAheadEnd = addDays(now, 30);

  const lastYearEvents = await db.select().from(calendarEvents)
    .where(and(
      eq(calendarEvents.householdId, householdId),
      gte(calendarEvents.startAt, subYears(lookAheadStart, 1)),
      lte(calendarEvents.startAt, subYears(lookAheadEnd, 1))
    ));

  for (const event of lastYearEvents) {
    const eventTitle = event.title.toLowerCase();
    const isPartyOrGathering = eventTitle.includes("party") || eventTitle.includes("gathering") ||
      eventTitle.includes("dinner") || eventTitle.includes("celebration") || eventTitle.includes("brunch") ||
      eventTitle.includes("bbq") || eventTitle.includes("holiday");

    if (isPartyOrGathering) {
      const lastYearDate = new Date(event.startAt);
      const thisYearDate = new Date(lastYearDate);
      thisYearDate.setFullYear(now.getFullYear());

      const daysUntil = differenceInDays(thisYearDate, now);

      if (daysUntil >= 0 && daysUntil <= 30) {
        const existing = await db.select().from(celebrations)
          .where(and(
            eq(celebrations.householdId, householdId),
            eq(celebrations.userId, userId),
            eq(celebrations.type, "PATTERN_REMINDER"),
            sql`(data->>'originalEventId') = ${event.id}`,
            sql`EXTRACT(YEAR FROM created_at) = ${now.getFullYear()}`
          )).limit(1);

        if (!existing.length) {
          results.push({
            type: "PATTERN_REMINDER",
            title: `Planning "${event.title}" again?`,
            subtitle: `Last year: ${format(lastYearDate, "MMMM d")}`,
            message: `Last year you had "${event.title}" on ${format(lastYearDate, "MMMM d")}. Would you like to start planning for this year?`,
            data: {
              originalEventId: event.id,
              originalTitle: event.title,
              originalDate: lastYearDate.toISOString(),
              suggestedDate: thisYearDate.toISOString(),
              daysUntil,
            },
          });
        }
      }
    }
  }

  return results;
}

export async function checkHandwrittenNoteEligibility(householdId: string, userId: string): Promise<boolean> {
  const profile = await db.select().from(userProfiles)
    .where(and(eq(userProfiles.userId, userId), eq(userProfiles.householdId, householdId)))
    .limit(1);

  if (!profile.length || !profile[0].createdAt) return false;

  const joinDate = new Date(profile[0].createdAt);
  const monthsSince = differenceInMonths(new Date(), joinDate);

  if (monthsSince < 3) return false;

  const existingNote = await db.select().from(handwrittenNotes)
    .where(and(
      eq(handwrittenNotes.householdId, householdId),
      eq(handwrittenNotes.userId, userId)
    )).limit(1);

  return existingNote.length === 0;
}

export async function runCelebrationCheck(householdId: string, userId: string) {
  const allChecks = await Promise.all([
    checkAnniversaries(householdId, userId),
    checkTaskMilestones(householdId, userId),
    checkSeasonalTouches(householdId, userId),
    checkPatternReminders(householdId, userId),
  ]);

  const newCelebrations = allChecks.flat();
  const created = [];

  for (const check of newCelebrations) {
    const shareableHtml = await generateShareableHtml(check);

    const [celebration] = await db.insert(celebrations).values({
      householdId,
      userId,
      type: check.type,
      title: check.title,
      subtitle: check.subtitle,
      message: check.message,
      data: check.data,
      shareableHtml,
      triggeredAt: new Date(),
    }).returning();

    created.push(celebration);
  }

  const noteEligible = await checkHandwrittenNoteEligibility(householdId, userId);
  if (noteEligible) {
    const household = await db.select().from(households)
      .where(eq(households.id, householdId)).limit(1);

    if (household.length) {
      await db.insert(handwrittenNotes).values({
        householdId,
        userId,
        recipientName: household[0].name,
        message: `Dear ${household[0].name} household,\n\nThank you for trusting hndld with your household management for the past three months. It's been a privilege to help simplify your daily life.\n\nWith warmth,\nThe hndld Team`,
        occasion: "3-month-thank-you",
        status: "QUEUED",
        scheduledFor: addDays(new Date(), 3),
      });
    }
  }

  return created;
}

export async function getHouseholdSummary(householdId: string) {
  const [tasksDone] = await db.select({ count: count() }).from(tasks)
    .where(and(eq(tasks.householdId, householdId), eq(tasks.status, "DONE")));

  const [totalTasks] = await db.select({ count: count() }).from(tasks)
    .where(eq(tasks.householdId, householdId));

  const [totalEvents] = await db.select({ count: count() }).from(calendarEvents)
    .where(eq(calendarEvents.householdId, householdId));

  const [totalSpending] = await db.select({ count: count() }).from(spendingItems)
    .where(eq(spendingItems.householdId, householdId));

  const estimatedHoursSaved = Math.round(Number(tasksDone.count) * HOURS_PER_TASK_ESTIMATE);

  return {
    tasksCompleted: Number(tasksDone.count),
    totalTasks: Number(totalTasks.count),
    eventsManaged: Number(totalEvents.count),
    expensesTracked: Number(totalSpending.count),
    estimatedHoursSaved,
  };
}
