import { db } from "../db";
import {
  people, vendors, tasks, preferences, calendarEvents,
  importantDates, spendingItems, learnedPreferences,
  cleaningVisits, householdLocations,
} from "@shared/schema";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import { subDays, format } from "date-fns";
import { generateCompletion, isDemoMode } from "./ai-provider";
import logger from "../lib/logger";

interface GraphNode {
  id: string;
  type: "person" | "vendor" | "task" | "preference" | "event" | "spending" | "location" | "date";
  label: string;
  attributes: Record<string, unknown>;
}

interface GraphEdge {
  from: string;
  to: string;
  relation: string;
  weight?: number;
  metadata?: Record<string, unknown>;
}

export interface HouseholdGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  summary: string;
}

export async function buildHouseholdGraph(householdId: string): Promise<HouseholdGraph> {
  const sixMonthsAgo = subDays(new Date(), 180);

  const [
    householdPeople,
    householdVendors,
    recentTasks,
    householdPrefs,
    upcomingEvents,
    dates,
    recentSpending,
    locations,
    visits,
    learned,
  ] = await Promise.all([
    db.select().from(people).where(eq(people.householdId, householdId)),
    db.select().from(vendors).where(eq(vendors.householdId, householdId)),
    db.select().from(tasks).where(
      and(eq(tasks.householdId, householdId), gte(tasks.createdAt, sixMonthsAgo))
    ).orderBy(desc(tasks.createdAt)).limit(200),
    db.select().from(preferences).where(eq(preferences.householdId, householdId)),
    db.select().from(calendarEvents).where(
      and(eq(calendarEvents.householdId, householdId), gte(calendarEvents.startAt, sixMonthsAgo))
    ).orderBy(desc(calendarEvents.startAt)).limit(100),
    db.select().from(importantDates).where(eq(importantDates.householdId, householdId)),
    db.select().from(spendingItems).where(
      and(eq(spendingItems.householdId, householdId), gte(spendingItems.date, sixMonthsAgo))
    ).orderBy(desc(spendingItems.date)).limit(200),
    db.select().from(householdLocations).where(eq(householdLocations.householdId, householdId)),
    db.select().from(cleaningVisits).where(
      and(eq(cleaningVisits.householdId, householdId), gte(cleaningVisits.scheduledAt, sixMonthsAgo))
    ).orderBy(desc(cleaningVisits.scheduledAt)).limit(100),
    db.select().from(learnedPreferences).where(eq(learnedPreferences.householdId, householdId)),
  ]);

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  for (const p of householdPeople) {
    nodes.push({
      id: `person:${p.id}`,
      type: "person",
      label: p.preferredName || p.fullName,
      attributes: {
        role: p.role,
        birthday: p.birthday ? format(p.birthday, "yyyy-MM-dd") : null,
        allergies: p.allergies,
        dietaryRules: p.dietaryRules,
        clothingSize: p.clothingSize,
        shoeSize: p.shoeSize,
      },
    });
  }

  for (const v of householdVendors) {
    nodes.push({
      id: `vendor:${v.id}`,
      type: "vendor",
      label: v.name,
      attributes: {
        category: v.category,
        phone: v.phone,
        email: v.email,
        canEnterAlone: v.canEnterAlone,
        preferredTimes: v.preferredTimes,
        notes: v.notes,
      },
    });
  }

  const tasksByCategory = new Map<string, typeof recentTasks>();
  for (const t of recentTasks) {
    nodes.push({
      id: `task:${t.id}`,
      type: "task",
      label: t.title,
      attributes: {
        status: t.status,
        category: t.category,
        urgency: t.urgency,
        dueAt: t.dueAt ? format(t.dueAt, "yyyy-MM-dd") : null,
        recurrence: t.recurrence,
        createdAt: t.createdAt ? format(t.createdAt, "yyyy-MM-dd") : null,
      },
    });
    if (!tasksByCategory.has(t.category)) tasksByCategory.set(t.category, []);
    tasksByCategory.get(t.category)!.push(t);
  }

  for (const pref of householdPrefs) {
    nodes.push({
      id: `pref:${pref.id}`,
      type: "preference",
      label: `${pref.category}: ${pref.key}`,
      attributes: {
        category: pref.category,
        key: pref.key,
        value: pref.value,
        isNoGo: pref.isNoGo,
        tags: pref.tags,
      },
    });
  }

  for (const lp of learned) {
    nodes.push({
      id: `pref:learned:${lp.id}`,
      type: "preference",
      label: `Learned: ${lp.key}`,
      attributes: {
        category: lp.category,
        key: lp.key,
        value: lp.value,
        confidence: lp.confidence,
        source: lp.source,
        useCount: lp.useCount,
      },
    });
  }

  for (const ev of upcomingEvents) {
    nodes.push({
      id: `event:${ev.id}`,
      type: "event",
      label: ev.title,
      attributes: {
        startAt: format(ev.startAt, "yyyy-MM-dd HH:mm"),
        endAt: ev.endAt ? format(ev.endAt, "yyyy-MM-dd HH:mm") : null,
        location: ev.location,
        description: ev.description,
      },
    });
  }

  for (const d of dates) {
    nodes.push({
      id: `date:${d.id}`,
      type: "date",
      label: d.title,
      attributes: {
        type: d.type,
        date: format(d.date, "yyyy-MM-dd"),
        notes: d.notes,
        personId: d.personId,
      },
    });
    if (d.personId) {
      edges.push({
        from: `date:${d.id}`,
        to: `person:${d.personId}`,
        relation: "belongs_to",
      });
    }
  }

  for (const s of recentSpending) {
    nodes.push({
      id: `spending:${s.id}`,
      type: "spending",
      label: s.note || s.title || `${s.category} $${(s.amount / 100).toFixed(2)}`,
      attributes: {
        amount: s.amount / 100,
        category: s.category,
        vendor: s.vendor,
        date: s.date ? format(s.date, "yyyy-MM-dd") : null,
        status: s.status,
      },
    });
    if (s.vendor) {
      const matchedVendor = householdVendors.find(
        v => v.name.toLowerCase() === s.vendor!.toLowerCase()
      );
      if (matchedVendor) {
        edges.push({
          from: `spending:${s.id}`,
          to: `vendor:${matchedVendor.id}`,
          relation: "paid_to",
          metadata: { amount: s.amount / 100 },
        });
      }
    }
    if (s.relatedTaskId) {
      edges.push({
        from: `spending:${s.id}`,
        to: `task:${s.relatedTaskId}`,
        relation: "expense_for",
      });
    }
  }

  for (const loc of locations) {
    nodes.push({
      id: `location:${loc.id}`,
      type: "location",
      label: loc.name,
      attributes: {
        type: loc.type,
        address: loc.address,
        notes: loc.notes,
      },
    });
  }

  for (const ev of upcomingEvents) {
    if (ev.location) {
      const matchedLoc = locations.find(
        l => l.name.toLowerCase() === ev.location!.toLowerCase() ||
             (l.address && ev.location!.toLowerCase().includes(l.address.toLowerCase()))
      );
      if (matchedLoc) {
        edges.push({
          from: `event:${ev.id}`,
          to: `location:${matchedLoc.id}`,
          relation: "at_location",
        });
      }
    }
  }

  const cleaningVendors = householdVendors.filter(vn =>
    vn.category?.toLowerCase().includes("clean")
  );
  for (const v of visits) {
    const visitNodeId = `visit:${v.id}`;
    nodes.push({
      id: visitNodeId,
      type: "task",
      label: `Cleaning visit ${v.scheduledAt ? format(v.scheduledAt, "MMM d") : ""}`,
      attributes: {
        scheduledAt: v.scheduledAt ? format(v.scheduledAt, "yyyy-MM-dd") : null,
        completedAt: v.completedAt ? format(v.completedAt, "yyyy-MM-dd") : null,
        status: v.status,
        price: v.totalPriceInCents ? v.totalPriceInCents / 100 : null,
        category: "CLEANING",
      },
    });
    if (cleaningVendors.length > 0) {
      edges.push({
        from: `vendor:${cleaningVendors[0].id}`,
        to: visitNodeId,
        relation: "performed_service",
        metadata: {
          scheduledAt: v.scheduledAt ? format(v.scheduledAt, "yyyy-MM-dd") : null,
          status: v.status,
          price: v.totalPriceInCents ? v.totalPriceInCents / 100 : null,
        },
      });
    }
  }

  for (const t of recentTasks) {
    const relatedVendor = householdVendors.find(v =>
      (t.title && v.name && t.title.toLowerCase().includes(v.name.toLowerCase())) ||
      (v.category && t.category && v.category.toLowerCase().includes(t.category.toLowerCase()))
    );
    if (relatedVendor) {
      edges.push({
        from: `task:${t.id}`,
        to: `vendor:${relatedVendor.id}`,
        relation: "involves_vendor",
      });
    }
  }

  for (const pref of householdPrefs) {
    const relatedVendor = householdVendors.find(v =>
      pref.value.toLowerCase().includes(v.name.toLowerCase()) ||
      v.name.toLowerCase().includes(pref.value.toLowerCase())
    );
    if (relatedVendor) {
      edges.push({
        from: `pref:${pref.id}`,
        to: `vendor:${relatedVendor.id}`,
        relation: "references_vendor",
      });
    }
  }

  const summary = [
    `${householdPeople.length} people`,
    `${householdVendors.length} vendors`,
    `${recentTasks.length} tasks (6 months)`,
    `${householdPrefs.length + learned.length} preferences`,
    `${upcomingEvents.length} events`,
    `${recentSpending.length} spending items`,
    `${locations.length} locations`,
    `${dates.length} important dates`,
    `${edges.length} relationships`,
  ].join(", ");

  return { nodes, edges, summary };
}

function graphToContext(graph: HouseholdGraph): string {
  const sections: string[] = [];

  const byType = new Map<string, GraphNode[]>();
  for (const n of graph.nodes) {
    if (!byType.has(n.type)) byType.set(n.type, []);
    byType.get(n.type)!.push(n);
  }

  const typeLabels: Record<string, string> = {
    person: "People",
    vendor: "Vendors & Service Providers",
    task: "Tasks & Activities",
    preference: "Preferences & Rules",
    event: "Calendar Events",
    spending: "Spending & Expenses",
    location: "Locations",
    date: "Important Dates",
  };

  for (const [type, label] of Object.entries(typeLabels)) {
    const items = byType.get(type);
    if (!items?.length) continue;

    const lines = items.slice(0, 50).map(n => {
      const attrs = Object.entries(n.attributes)
        .filter(([_, v]) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0))
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(", ");
      return `  - ${n.label}${attrs ? ` (${attrs})` : ""}`;
    });

    sections.push(`## ${label}\n${lines.join("\n")}`);
  }

  if (graph.edges.length > 0) {
    const relLines = graph.edges.slice(0, 80).map(e => {
      const fromNode = graph.nodes.find(n => n.id === e.from);
      const toNode = graph.nodes.find(n => n.id === e.to);
      const meta = e.metadata ? ` (${JSON.stringify(e.metadata)})` : "";
      return `  - ${fromNode?.label || e.from} → [${e.relation}] → ${toNode?.label || e.to}${meta}`;
    });
    sections.push(`## Relationships\n${relLines.join("\n")}`);
  }

  return sections.join("\n\n");
}

function findConnections(graph: HouseholdGraph): string[] {
  const connections: string[] = [];

  const vendorSpending = new Map<string, number>();
  for (const edge of graph.edges) {
    if (edge.relation === "paid_to") {
      const vendorNode = graph.nodes.find(n => n.id === edge.to);
      if (vendorNode) {
        const current = vendorSpending.get(vendorNode.label) || 0;
        vendorSpending.set(vendorNode.label, current + ((edge.metadata?.amount as number) || 0));
      }
    }
  }
  Array.from(vendorSpending.entries()).forEach(([vendor, total]) => {
    if (total > 500) {
      connections.push(`You've spent $${total.toFixed(0)} with ${vendor} in the last 6 months.`);
    }
  });

  const personDates = graph.edges.filter(e => e.relation === "belongs_to");
  for (const pd of personDates) {
    const dateNode = graph.nodes.find(n => n.id === pd.from);
    const personNode = graph.nodes.find(n => n.id === pd.to);
    if (dateNode && personNode) {
      const dateStr = dateNode.attributes.date as string;
      if (dateStr) {
        const eventDate = new Date(dateStr);
        const daysUntil = Math.ceil((eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysUntil > 0 && daysUntil <= 30) {
          connections.push(
            `${personNode.label}'s ${dateNode.label} is in ${daysUntil} days (${format(eventDate, "MMM d")}).`
          );
        }
      }
    }
  }

  const vendorTasks = graph.edges.filter(e => e.relation === "involves_vendor" || e.relation === "performed_service");
  const vendorTaskCount = new Map<string, number>();
  for (const vt of vendorTasks) {
    const vendorId = vt.relation === "involves_vendor" ? vt.to : vt.from;
    vendorTaskCount.set(vendorId, (vendorTaskCount.get(vendorId) || 0) + 1);
  }
  Array.from(vendorTaskCount.entries()).forEach(([vendorId, count]) => {
    if (count >= 5) {
      const vendor = graph.nodes.find(n => n.id === vendorId);
      if (vendor) {
        connections.push(`${vendor.label} has been involved in ${count} tasks/visits recently.`);
      }
    }
  });

  return connections;
}

export interface AskResult {
  answer: string;
  connections: string[];
  sources: { type: string; label: string; id: string }[];
  graphSummary: string;
}

export async function askHousehold(householdId: string, question: string): Promise<AskResult> {
  const graph = await buildHouseholdGraph(householdId);
  const context = graphToContext(graph);
  const connections = findConnections(graph);

  const relevantNodes = findRelevantNodes(graph, question);

  if (isDemoMode()) {
    return {
      answer: buildRuleBasedAnswer(graph, question, relevantNodes),
      connections,
      sources: relevantNodes.map(n => ({ type: n.type, label: n.label, id: n.id })),
      graphSummary: graph.summary,
    };
  }

  try {
    const answer = await generateCompletion({
      messages: [
        {
          role: "system",
          content: `You are a household knowledge assistant for a luxury concierge service. You have access to the household's complete knowledge graph. Answer questions concisely and helpfully using ONLY the data provided. If the data doesn't contain enough information to answer, say so honestly. Format dates in a friendly way. Always mention specific names, vendors, amounts, and dates when available. Keep answers under 200 words.`,
        },
        {
          role: "user",
          content: `Here is the household knowledge graph:\n\n${context}\n\nQuestion: ${question}`,
        },
      ],
      maxTokens: 512,
      temperature: 0.3,
    });

    return {
      answer,
      connections,
      sources: relevantNodes.map(n => ({ type: n.type, label: n.label, id: n.id })),
      graphSummary: graph.summary,
    };
  } catch (error) {
    logger.error("[KnowledgeGraph] AI query failed, using rule-based fallback", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      answer: buildRuleBasedAnswer(graph, question, relevantNodes),
      connections,
      sources: relevantNodes.map(n => ({ type: n.type, label: n.label, id: n.id })),
      graphSummary: graph.summary,
    };
  }
}

function findRelevantNodes(graph: HouseholdGraph, question: string): GraphNode[] {
  const q = question.toLowerCase();
  const keywords = q.split(/\s+/).filter(w => w.length > 2);

  return graph.nodes.filter(node => {
    const label = node.label.toLowerCase();
    const attrStr = JSON.stringify(node.attributes).toLowerCase();

    if (label.includes(q) || q.includes(label)) return true;

    const matchCount = keywords.filter(kw => label.includes(kw) || attrStr.includes(kw)).length;
    return matchCount >= Math.max(1, Math.floor(keywords.length * 0.3));
  }).slice(0, 20);
}

function buildRuleBasedAnswer(graph: HouseholdGraph, question: string, relevant: GraphNode[]): string {
  const q = question.toLowerCase();

  if (q.includes("when") && (q.includes("last") || q.includes("recent"))) {
    const taskMatches = relevant.filter(n => n.type === "task" || n.type === "event" || n.type === "spending");
    if (taskMatches.length > 0) {
      const sorted = taskMatches.sort((a, b) => {
        const dateA = (a.attributes.scheduledAt || a.attributes.completedAt || a.attributes.createdAt || a.attributes.startAt || a.attributes.date || "") as string;
        const dateB = (b.attributes.scheduledAt || b.attributes.completedAt || b.attributes.createdAt || b.attributes.startAt || b.attributes.date || "") as string;
        return dateB.localeCompare(dateA);
      });
      const latest = sorted[0];
      const dateVal = (latest.attributes.scheduledAt || latest.attributes.completedAt || latest.attributes.createdAt || latest.attributes.startAt || latest.attributes.dueAt) as string;
      return `The most recent match is "${latest.label}"${dateVal ? ` on ${dateVal}` : ""}. Found ${sorted.length} related item${sorted.length > 1 ? "s" : ""} in your household records.`;
    }
  }

  if (q.includes("how much") || q.includes("spend") || q.includes("cost")) {
    const spendMatches = relevant.filter(n => n.type === "spending");
    if (spendMatches.length > 0) {
      const total = spendMatches.reduce((sum, n) => sum + ((n.attributes.amount as number) || 0), 0);
      return `Found ${spendMatches.length} spending record${spendMatches.length > 1 ? "s" : ""} totaling $${total.toFixed(2)}. Most recent: "${spendMatches[0].label}".`;
    }
  }

  if (q.includes("who") || q.includes("contact") || q.includes("vendor")) {
    const personOrVendor = relevant.filter(n => n.type === "person" || n.type === "vendor");
    if (personOrVendor.length > 0) {
      const items = personOrVendor.slice(0, 5).map(n => {
        const details: string[] = [n.label];
        if (n.attributes.role) details.push(`(${n.attributes.role})`);
        if (n.attributes.category) details.push(`- ${n.attributes.category}`);
        if (n.attributes.phone) details.push(`phone: ${n.attributes.phone}`);
        if (n.attributes.email) details.push(`email: ${n.attributes.email}`);
        return details.join(" ");
      });
      return items.join("\n");
    }
  }

  if (q.includes("allerg") || q.includes("diet") || q.includes("food")) {
    const personMatches = relevant.filter(n => n.type === "person");
    const prefMatches = relevant.filter(n => n.type === "preference");
    const parts: string[] = [];
    for (const p of personMatches) {
      const allergies = p.attributes.allergies as string[];
      const diet = p.attributes.dietaryRules as string[];
      if (allergies?.length || diet?.length) {
        parts.push(`${p.label}: ${allergies?.length ? `allergies: ${allergies.join(", ")}` : ""}${diet?.length ? ` diet: ${diet.join(", ")}` : ""}`);
      }
    }
    for (const pref of prefMatches) {
      parts.push(`Preference: ${pref.attributes.key} = ${pref.attributes.value}${pref.attributes.isNoGo ? " (NO-GO)" : ""}`);
    }
    if (parts.length > 0) return parts.join("\n");
  }

  if (q.includes("upcoming") || q.includes("next") || q.includes("schedule") || q.includes("calendar")) {
    const eventMatches = relevant.filter(n => n.type === "event" || n.type === "date");
    const tasksDue = relevant.filter(n => n.type === "task" && n.attributes.dueAt);
    const combined = [...eventMatches, ...tasksDue];
    if (combined.length > 0) {
      const items = combined.slice(0, 7).map(n => {
        const when = (n.attributes.startAt || n.attributes.date || n.attributes.dueAt || n.attributes.scheduledAt || "") as string;
        return `${n.label}${when ? ` - ${when}` : ""}${n.attributes.location ? ` at ${n.attributes.location}` : ""}`;
      });
      return `Upcoming:\n${items.join("\n")}`;
    }
  }

  if (relevant.length > 0) {
    const items = relevant.slice(0, 5).map(n => `• ${n.label} (${n.type})`);
    return `Here's what I found related to your question:\n${items.join("\n")}`;
  }

  return "I couldn't find specific information about that in your household records. Try asking about people, vendors, tasks, spending, events, or preferences.";
}
