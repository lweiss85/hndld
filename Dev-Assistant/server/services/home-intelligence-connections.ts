import { db } from "../db";
import {
  people, preferences, importantDates, vendors,
  spendingItems, cleaningVisits, addonServices, tasks, taskPatterns,
} from "@shared/schema";
import { eq, and, gte, desc, sql, count } from "drizzle-orm";
import {
  subDays, addDays, differenceInDays, format,
  isBefore, startOfDay, getMonth,
} from "date-fns";
import { generateCompletion, isDemoMode } from "./ai-provider";
import logger from "../lib/logger";

interface InsightResult {
  category: string;
  title: string;
  summary: string;
  confidence: number;
  data: Record<string, unknown>;
}

export async function analyzePeopleConnections(householdId: string): Promise<InsightResult[]> {
  const insights: InsightResult[] = [];
  const now = new Date();
  const today = startOfDay(now);

  const [householdPeople, householdPrefs, householdDates] = await Promise.all([
    db.select().from(people).where(eq(people.householdId, householdId)),
    db.select().from(preferences).where(eq(preferences.householdId, householdId)),
    db.select().from(importantDates).where(eq(importantDates.householdId, householdId)),
  ]);

  for (const person of householdPeople) {
    const personDates = householdDates.filter(d => d.personId === person.id);
    const upcomingBirthdays = personDates
      .filter(d => d.type === "BIRTHDAY")
      .filter(d => {
        const thisYear = new Date(d.date);
        thisYear.setFullYear(now.getFullYear());
        if (isBefore(thisYear, today)) thisYear.setFullYear(now.getFullYear() + 1);
        return differenceInDays(thisYear, today) <= 30 && differenceInDays(thisYear, today) > 0;
      });

    if (upcomingBirthdays.length > 0) {
      const birthday = upcomingBirthdays[0];
      const bDate = new Date(birthday.date);
      bDate.setFullYear(now.getFullYear());
      if (isBefore(bDate, today)) bDate.setFullYear(now.getFullYear() + 1);
      const daysUntil = differenceInDays(bDate, today);

      const giftPrefs = householdPrefs.filter(
        p => p.category === "GIFTS_FLOWERS" && !p.isNoGo
      );
      const celebrationStyle = (person.celebrationStyle || []) as string[];
      const clothingSize = person.clothingSize;
      const shoeSize = person.shoeSize;

      const giftContext: string[] = [];
      if (celebrationStyle.length > 0) giftContext.push(`Celebration style: ${celebrationStyle.join(", ")}`);
      if (giftPrefs.length > 0) giftContext.push(`Gift preferences: ${giftPrefs.map(p => p.value).join(", ")}`);
      if (clothingSize) giftContext.push(`Clothing size: ${clothingSize}`);
      if (shoeSize) giftContext.push(`Shoe size: ${shoeSize}`);

      let giftIdeas = "Check their wishlist or ask about their interests.";

      if (!isDemoMode() && giftContext.length > 0) {
        try {
          const result = await generateCompletion({
            messages: [
              { role: "system", content: "You are a thoughtful gift advisor for a household concierge. Suggest 3 specific gift ideas based on the person's profile. Return a JSON array of strings. Return ONLY valid JSON." },
              { role: "user", content: `${person.preferredName || person.fullName}'s birthday is in ${daysUntil} days.\n${giftContext.join("\n")}\n\nSuggest 3 thoughtful gift ideas.` },
            ],
            maxTokens: 200,
            temperature: 0.7,
          });
          const parsed = JSON.parse(result);
          if (Array.isArray(parsed) && parsed.length > 0) {
            giftIdeas = parsed.slice(0, 3).join("; ");
          }
        } catch {
          giftIdeas = giftContext.length > 0
            ? `Consider: ${giftPrefs.slice(0, 2).map(p => p.value).join(", ")}${clothingSize ? ` (size ${clothingSize})` : ""}`
            : "Check their wishlist or ask about their interests.";
        }
      } else if (giftContext.length > 0) {
        const parts: string[] = [];
        if (giftPrefs.length > 0) parts.push(giftPrefs.slice(0, 2).map(p => p.value).join(", "));
        if (clothingSize) parts.push(`clothing (size ${clothingSize})`);
        giftIdeas = parts.length > 0 ? `Consider: ${parts.join("; ")}` : giftIdeas;
      }

      insights.push({
        category: "PEOPLE_BIRTHDAY",
        title: `${person.preferredName || person.fullName}'s birthday in ${daysUntil} days`,
        summary: `Gift ideas: ${giftIdeas}`,
        confidence: 90,
        data: {
          personId: person.id,
          personName: person.preferredName || person.fullName,
          daysUntil,
          celebrationStyle,
          giftPreferences: giftPrefs.map(p => p.value),
          clothingSize,
          shoeSize,
        },
      });
    }

    const allergies = (person.allergies || []) as string[];
    const dietaryRules = (person.dietaryRules || []) as string[];

    if (allergies.length > 0 || dietaryRules.length > 0) {
      const noGoFoods = householdPrefs.filter(
        p => (p.category === "FOOD_DRINK" || p.category === "PANTRY") && p.isNoGo
      );
      const safeFoods = householdPrefs.filter(
        p => (p.category === "FOOD_DRINK" || p.category === "PANTRY") && !p.isNoGo
      );

      const restrictions = [...allergies, ...dietaryRules];
      const safeList = safeFoods.map(p => p.value);
      const avoidList = noGoFoods.map(p => p.value);

      if (restrictions.length > 0 && (safeList.length > 0 || avoidList.length > 0)) {
        insights.push({
          category: "PEOPLE_DIETARY",
          title: `Dietary profile: ${person.preferredName || person.fullName}`,
          summary: `Restrictions: ${restrictions.join(", ")}. ${safeList.length > 0 ? `Safe choices: ${safeList.slice(0, 4).join(", ")}.` : ""} ${avoidList.length > 0 ? `Avoid: ${avoidList.slice(0, 4).join(", ")}.` : ""}`,
          confidence: 95,
          data: {
            personId: person.id,
            personName: person.preferredName || person.fullName,
            allergies,
            dietaryRules,
            safeFoods: safeList,
            noGoFoods: avoidList,
            allergyNotes: person.allergyNotes,
            dietNotes: person.dietNotes,
          },
        });
      }
    }
  }

  return insights;
}

export async function analyzeVendorConnections(householdId: string): Promise<InsightResult[]> {
  const insights: InsightResult[] = [];
  const ninetyDaysAgo = subDays(new Date(), 90);

  const [householdVendors, recentVisits, recentSpending, householdPrefs] = await Promise.all([
    db.select().from(vendors).where(eq(vendors.householdId, householdId)),
    db.select().from(cleaningVisits).where(
      and(eq(cleaningVisits.householdId, householdId), gte(cleaningVisits.scheduledAt, ninetyDaysAgo))
    ),
    db.select().from(spendingItems).where(
      and(eq(spendingItems.householdId, householdId), gte(spendingItems.date, ninetyDaysAgo))
    ),
    db.select().from(preferences).where(
      and(eq(preferences.householdId, householdId), eq(preferences.category, "HOME"))
    ),
  ]);

  const ratedVisits = recentVisits.filter(v => v.rating !== null && v.rating !== undefined);
  if (ratedVisits.length >= 3) {
    const avgRating = ratedVisits.reduce((s, v) => s + (v.rating || 0), 0) / ratedVisits.length;
    const cleanerRatings = new Map<string, { total: number; count: number; visits: number }>();
    for (const visit of ratedVisits) {
      const cleaner = visit.cleanerName || "Unknown";
      const existing = cleanerRatings.get(cleaner) || { total: 0, count: 0, visits: 0 };
      existing.total += visit.rating || 0;
      existing.count++;
      existing.visits++;
      cleanerRatings.set(cleaner, existing);
    }

    const rankedCleaners = Array.from(cleanerRatings.entries())
      .map(([name, data]) => ({ name, avg: data.total / data.count, visits: data.visits }))
      .sort((a, b) => b.avg - a.avg);

    if (rankedCleaners.length > 0) {
      const favorite = rankedCleaners[0];
      insights.push({
        category: "VENDOR_RATINGS",
        title: `Cleaning favorite: ${favorite.name}`,
        summary: `${favorite.name} averages ${favorite.avg.toFixed(1)}/5 across ${favorite.visits} visits. Overall average: ${avgRating.toFixed(1)}/5 from ${ratedVisits.length} rated visits.`,
        confidence: Math.min(90, 60 + ratedVisits.length * 3),
        data: {
          favoriteCleanerName: favorite.name,
          favoriteAvgRating: Number(favorite.avg.toFixed(1)),
          overallAvgRating: Number(avgRating.toFixed(1)),
          totalRatedVisits: ratedVisits.length,
          rankedCleaners: rankedCleaners.map(c => ({
            name: c.name,
            avgRating: Number(c.avg.toFixed(1)),
            visitCount: c.visits,
          })),
        },
      });
    }

    const lowRatedVisits = ratedVisits.filter(v => (v.rating || 0) <= 2);
    if (lowRatedVisits.length >= 2) {
      const feedbackSummary = lowRatedVisits
        .filter(v => v.feedback)
        .map(v => v.feedback)
        .slice(0, 3);

      insights.push({
        category: "VENDOR_RATINGS",
        title: `${lowRatedVisits.length} low-rated cleaning visits`,
        summary: `${lowRatedVisits.length} visits rated 2/5 or below in the last 90 days.${feedbackSummary.length > 0 ? ` Feedback: "${feedbackSummary[0]}"` : ""} Consider discussing with your cleaning service.`,
        confidence: 75,
        data: {
          lowRatedCount: lowRatedVisits.length,
          feedback: feedbackSummary,
        },
      });
    }
  }

  const vendorSpendMap = new Map<string, { total: number; count: number; categories: Set<string> }>();
  for (const item of recentSpending) {
    if (!item.vendor) continue;
    const key = item.vendor.toLowerCase();
    const existing = vendorSpendMap.get(key) || { total: 0, count: 0, categories: new Set<string>() };
    existing.total += item.amount;
    existing.count++;
    if (item.category) existing.categories.add(item.category);
    vendorSpendMap.set(key, existing);
  }

  const matchedVendors = householdVendors.map(v => {
    const spendData = vendorSpendMap.get(v.name.toLowerCase());
    return {
      vendor: v,
      spending: spendData?.total || 0,
      transactionCount: spendData?.count || 0,
      categories: spendData ? Array.from(spendData.categories) : [],
    };
  }).filter(v => v.spending > 0);

  const topVendors = matchedVendors.sort((a, b) => b.spending - a.spending).slice(0, 5);
  if (topVendors.length >= 2) {
    insights.push({
      category: "VENDOR_FAVORITES",
      title: "Your most-used vendors",
      summary: topVendors.map(v =>
        `${v.vendor.name}: $${(v.spending / 100).toFixed(2)} (${v.transactionCount} transactions)`
      ).join(". "),
      confidence: 85,
      data: {
        topVendors: topVendors.map(v => ({
          name: v.vendor.name,
          category: v.vendor.category,
          totalSpending: v.spending,
          transactions: v.transactionCount,
          serviceCategories: v.categories,
        })),
      },
    });
  }

  return insights;
}

export async function analyzeServiceConnections(householdId: string): Promise<InsightResult[]> {
  const insights: InsightResult[] = [];
  const sixMonthsAgo = subDays(new Date(), 180);

  const [visits, addons] = await Promise.all([
    db.select().from(cleaningVisits).where(
      and(eq(cleaningVisits.householdId, householdId), gte(cleaningVisits.scheduledAt, sixMonthsAgo))
    ).orderBy(cleaningVisits.scheduledAt),
    db.select().from(addonServices).where(eq(addonServices.householdId, householdId)),
  ]);

  if (visits.length >= 3) {
    const completedVisits = visits.filter(v => v.completedAt);
    const totalCost = completedVisits.reduce((s, v) => s + (v.totalPriceInCents || 0), 0);
    const avgCost = completedVisits.length > 0 ? totalCost / completedVisits.length : 0;

    const monthlyCosts = new Map<string, { total: number; count: number }>();
    for (const visit of completedVisits) {
      const month = format(visit.scheduledAt, "yyyy-MM");
      const existing = monthlyCosts.get(month) || { total: 0, count: 0 };
      existing.total += visit.totalPriceInCents || 0;
      existing.count++;
      monthlyCosts.set(month, existing);
    }

    const monthlyData = Array.from(monthlyCosts.entries())
      .map(([month, data]) => ({ month, total: data.total, count: data.count }))
      .sort((a, b) => a.month.localeCompare(b.month));

    if (monthlyData.length >= 2) {
      const recent = monthlyData[monthlyData.length - 1];
      const previous = monthlyData[monthlyData.length - 2];
      const costChange = previous.total > 0
        ? ((recent.total - previous.total) / previous.total) * 100
        : 0;

      insights.push({
        category: "SERVICE_COSTS",
        title: "Cleaning service cost trend",
        summary: `Average visit: $${(avgCost / 100).toFixed(2)}. ${Math.abs(costChange) > 10 ? `${costChange > 0 ? "Up" : "Down"} ${Math.abs(Math.round(costChange))}% vs last month.` : "Costs are stable."} ${completedVisits.length} visits in 6 months.`,
        confidence: Math.min(90, 60 + completedVisits.length * 2),
        data: {
          avgCostCents: Math.round(avgCost),
          totalCostCents: totalCost,
          visitCount: completedVisits.length,
          costChangePercent: Math.round(costChange),
          monthlyBreakdown: monthlyData.map(m => ({
            month: m.month,
            totalCents: m.total,
            visits: m.count,
          })),
        },
      });
    }

    const addonUsage = new Map<string, number>();
    for (const visit of visits) {
      const requestedAddons = (visit.addonsRequested || []) as string[];
      for (const addon of requestedAddons) {
        addonUsage.set(addon, (addonUsage.get(addon) || 0) + 1);
      }
    }

    const popularAddons = Array.from(addonUsage.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    if (popularAddons.length > 0) {
      const addonDetails = addons.reduce((map, a) => {
        map.set(a.id, a);
        return map;
      }, new Map<string, typeof addons[0]>());

      insights.push({
        category: "SERVICE_HISTORY",
        title: "Most requested add-on services",
        summary: popularAddons.map(([id, uses]) => {
          const detail = addonDetails.get(id);
          return detail ? `${detail.name} (${uses}x, $${((detail.priceInCents || 0) / 100).toFixed(2)})` : `${id} (${uses}x)`;
        }).join(", "),
        confidence: 80,
        data: {
          popularAddons: popularAddons.map(([id, uses]) => {
            const detail = addonDetails.get(id);
            return {
              addonId: id,
              name: detail?.name || id,
              usageCount: uses,
              priceInCents: detail?.priceInCents || 0,
            };
          }),
        },
      });
    }
  }

  return insights;
}

export async function analyzeScheduleConnections(householdId: string): Promise<InsightResult[]> {
  const insights: InsightResult[] = [];
  const now = new Date();
  const sixMonthsAgo = subDays(now, 180);

  const [visits, patterns, recentTasks] = await Promise.all([
    db.select().from(cleaningVisits).where(
      and(eq(cleaningVisits.householdId, householdId), gte(cleaningVisits.scheduledAt, sixMonthsAgo))
    ).orderBy(cleaningVisits.scheduledAt),
    db.select().from(taskPatterns).where(
      and(eq(taskPatterns.householdId, householdId), gte(taskPatterns.createdAt, sixMonthsAgo))
    ),
    db.select().from(tasks).where(
      and(
        eq(tasks.householdId, householdId),
        gte(tasks.createdAt, sixMonthsAgo)
      )
    ),
  ]);

  if (visits.length >= 4) {
    const scheduledDates = visits.map(v => v.scheduledAt).sort((a, b) => a.getTime() - b.getTime());
    const intervals: number[] = [];
    for (let i = 1; i < scheduledDates.length; i++) {
      intervals.push(differenceInDays(scheduledDates[i], scheduledDates[i - 1]));
    }

    if (intervals.length > 0) {
      const avgInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length;
      const lastVisit = scheduledDates[scheduledDates.length - 1];
      const daysSinceLast = differenceInDays(now, lastVisit);
      const predictedNext = addDays(lastVisit, Math.round(avgInterval));
      const daysUntilNext = differenceInDays(predictedNext, now);

      const variance = intervals.reduce((s, v) => s + Math.pow(v - avgInterval, 2), 0) / intervals.length;
      const isRegular = Math.sqrt(variance) < avgInterval * 0.3;

      insights.push({
        category: "SCHEDULE_CLEANING",
        title: isRegular ? `Cleaning every ~${Math.round(avgInterval)} days` : "Cleaning schedule varies",
        summary: `Last visit: ${format(lastVisit, "MMM d")}. ${daysUntilNext > 0 ? `Next predicted: ${format(predictedNext, "MMM d")} (${daysUntilNext} days).` : `Overdue by ${Math.abs(daysUntilNext)} days.`} Pattern: ${isRegular ? "regular" : "irregular"} across ${visits.length} visits.`,
        confidence: isRegular ? 85 : 60,
        data: {
          avgIntervalDays: Math.round(avgInterval),
          lastVisitDate: lastVisit.toISOString(),
          predictedNextDate: predictedNext.toISOString(),
          daysUntilNext,
          daysSinceLast,
          isRegular,
          totalVisits: visits.length,
          intervalVariance: Math.round(Math.sqrt(variance)),
        },
      });
    }
  }

  if (patterns.length >= 10) {
    const hourBuckets = new Map<number, number>();
    const dayBuckets = new Map<number, number>();
    const categoryDay = new Map<string, Map<number, number>>();

    for (const p of patterns) {
      hourBuckets.set(p.hourOfDay, (hourBuckets.get(p.hourOfDay) || 0) + 1);
      dayBuckets.set(p.dayOfWeek, (dayBuckets.get(p.dayOfWeek) || 0) + 1);

      if (!categoryDay.has(p.category)) {
        categoryDay.set(p.category, new Map());
      }
      const catDayMap = categoryDay.get(p.category)!;
      catDayMap.set(p.dayOfWeek, (catDayMap.get(p.dayOfWeek) || 0) + 1);
    }

    const peakHours = Array.from(hourBuckets.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const peakDays = Array.from(dayBuckets.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const categoryBestDays: Record<string, string> = {};
    for (const [cat, dayMap] of Array.from(categoryDay.entries())) {
      const bestDay = Array.from(dayMap.entries()).sort((a, b) => b[1] - a[1])[0];
      if (bestDay) {
        categoryBestDays[cat] = dayNames[bestDay[0]];
      }
    }

    insights.push({
      category: "SCHEDULE_PATTERNS",
      title: "Your productivity patterns",
      summary: `Peak hours: ${peakHours.map(([h]) => `${h > 12 ? h - 12 : h}${h >= 12 ? "pm" : "am"}`).join(", ")}. Busiest days: ${peakDays.map(([d]) => dayNames[d]).join(", ")}. ${Object.entries(categoryBestDays).slice(0, 3).map(([cat, day]) => `${cat} tasks best on ${day}`).join("; ")}.`,
      confidence: Math.min(90, 50 + patterns.length),
      data: {
        peakHours: peakHours.map(([h, c]) => ({ hour: h, taskCount: c })),
        peakDays: peakDays.map(([d, c]) => ({ day: dayNames[d], taskCount: c })),
        categoryBestDays,
        totalPatterns: patterns.length,
      },
    });
  }

  const recurringTasks = recentTasks.filter(t => t.recurrence && t.recurrence !== "none");
  if (recurringTasks.length > 0) {
    const recurrenceGroups = new Map<string, typeof recurringTasks>();
    for (const task of recurringTasks) {
      const groupId = task.recurrenceGroupId || task.id;
      if (!recurrenceGroups.has(groupId)) {
        recurrenceGroups.set(groupId, []);
      }
      recurrenceGroups.get(groupId)!.push(task);
    }

    const activeRecurring = Array.from(recurrenceGroups.entries())
      .map(([groupId, groupTasks]) => {
        const latest = groupTasks.sort((a, b) =>
          (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0)
        )[0];
        const completionRate = groupTasks.filter(t => t.status === "DONE").length / groupTasks.length;
        return {
          groupId,
          title: latest.title,
          recurrence: latest.recurrence,
          category: latest.category,
          totalOccurrences: groupTasks.length,
          completionRate: Math.round(completionRate * 100),
        };
      })
      .sort((a, b) => b.totalOccurrences - a.totalOccurrences);

    if (activeRecurring.length > 0) {
      const lowCompletion = activeRecurring.filter(r => r.completionRate < 50 && r.totalOccurrences >= 3);
      if (lowCompletion.length > 0) {
        insights.push({
          category: "SCHEDULE_PREDICTIONS",
          title: `${lowCompletion.length} recurring task${lowCompletion.length > 1 ? "s" : ""} often skipped`,
          summary: lowCompletion.slice(0, 3).map(r =>
            `"${r.title}" (${r.completionRate}% completion, ${r.recurrence})`
          ).join(". ") + ". Consider adjusting frequency or removing.",
          confidence: 70,
          data: {
            lowCompletionTasks: lowCompletion.slice(0, 5).map(r => ({
              title: r.title,
              recurrence: r.recurrence,
              completionRate: r.completionRate,
              totalOccurrences: r.totalOccurrences,
            })),
          },
        });
      }
    }
  }

  return insights;
}
