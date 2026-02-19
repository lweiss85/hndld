import { Router, Request, Response } from "express";
import {
  conversation,
  Simple,
  Suggestion,
} from "@assistant/conversation";
import { db } from "../db";
import {
  cleaningVisits, approvals, spendingItems, tasks, smartLocks, apiTokens,
} from "@shared/schema";
import { eq, and, gte, sql, isNull } from "drizzle-orm";
import { startOfMonth, format } from "date-fns";
import { getProvider } from "../services/smart-locks";
import logger from "../lib/logger";

const router = Router();

const app = conversation({ debug: process.env.NODE_ENV !== "production" });

app.handle("main_invocation", async (conv: any) => {
  conv.add(new Simple({
    speech: "Welcome to hndld. You can ask about your next cleaning, pending approvals, spending, or control your smart locks. What would you like to do?",
    text: "Welcome to hndld! How can I help?",
  }));
  conv.add(new Suggestion({ title: "Next cleaning" }));
  conv.add(new Suggestion({ title: "Pending approvals" }));
  conv.add(new Suggestion({ title: "Spending summary" }));
});

async function getUserContext(conv: any): Promise<{ userId: string; householdId: string } | null> {
  const accessToken = conv.user?.params?.accessToken;
  if (!accessToken) return null;

  const [token] = await db.select().from(apiTokens)
    .where(and(
      eq(apiTokens.token, accessToken),
      isNull(apiTokens.revokedAt)
    )).limit(1);

  if (!token) return null;

  await db.update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, token.id));

  return { userId: token.userId, householdId: token.householdId };
}

app.handle("next_cleaning", async (conv: any) => {
  const context = await getUserContext(conv);
  if (!context) {
    conv.add("Please link your hndld account in the Google Home app first.");
    conv.scene.next = { name: "actions.scene.END_CONVERSATION" };
    return;
  }

  const [nextVisit] = await db.select().from(cleaningVisits)
    .where(and(
      eq(cleaningVisits.householdId, context.householdId),
      gte(cleaningVisits.scheduledAt, new Date())
    ))
    .orderBy(cleaningVisits.scheduledAt)
    .limit(1);

  if (!nextVisit) {
    conv.add("You don't have any upcoming cleaning visits scheduled.");
  } else {
    const date = format(nextVisit.scheduledAt, "EEEE, MMMM do");
    const time = format(nextVisit.scheduledAt, "h:mm a");
    conv.add(`Your next cleaning is scheduled for ${date} at ${time}.`);
  }
});

app.handle("pending_approvals", async (conv: any) => {
  const context = await getUserContext(conv);
  if (!context) {
    conv.add("Please link your hndld account first.");
    return;
  }

  const pending = await db.select({ count: sql<number>`count(*)` })
    .from(approvals)
    .where(and(
      eq(approvals.householdId, context.householdId),
      eq(approvals.status, "PENDING")
    ));

  const count = Number(pending[0]?.count) || 0;

  if (count === 0) {
    conv.add("You have no pending approvals. Everything is up to date!");
  } else {
    conv.add(`You have ${count} pending approval${count === 1 ? "" : "s"}. Would you like me to approve them all?`);
    conv.add(new Suggestion({ title: "Approve all" }));
    conv.add(new Suggestion({ title: "No thanks" }));
  }
});

app.handle("approve_all", async (conv: any) => {
  const context = await getUserContext(conv);
  if (!context) {
    conv.add("Please link your hndld account first.");
    return;
  }

  await db.update(approvals)
    .set({
      status: "APPROVED",
      updatedAt: new Date(),
    })
    .where(and(
      eq(approvals.householdId, context.householdId),
      eq(approvals.status, "PENDING")
    ));

  conv.add("Done! I've approved all pending items.");
});

app.handle("spending_summary", async (conv: any) => {
  const context = await getUserContext(conv);
  if (!context) {
    conv.add("Please link your hndld account first.");
    return;
  }

  const startDate = startOfMonth(new Date());

  const spending = await db.select({
    total: sql<number>`coalesce(sum(${spendingItems.amount}), 0)`,
    count: sql<number>`count(*)`,
  })
    .from(spendingItems)
    .where(and(
      eq(spendingItems.householdId, context.householdId),
      gte(spendingItems.date, startDate)
    ));

  const total = Number(spending[0]?.total || 0) / 100;
  const count = Number(spending[0]?.count) || 0;

  if (count === 0) {
    conv.add("You haven't recorded any spending this month.");
  } else {
    conv.add(`This month, you've spent $${total.toFixed(2)} across ${count} transactions.`);
  }
});

app.handle("create_task", async (conv: any) => {
  const context = await getUserContext(conv);
  if (!context) {
    conv.add("Please link your hndld account first.");
    return;
  }

  const taskTitle = conv.intent?.params?.task_title?.resolved;

  if (!taskTitle) {
    conv.add("What task would you like to create?");
    conv.scene.next = { name: "collect_task_title" };
    return;
  }

  await db.insert(tasks).values({
    householdId: context.householdId,
    title: taskTitle,
    status: "INBOX",
    urgency: "MEDIUM",
    createdBy: context.userId,
  });

  conv.add(`Done! I've created a task: ${taskTitle}.`);
});

app.handle("lock_door", async (conv: any) => {
  const context = await getUserContext(conv);
  if (!context) {
    conv.add("Please link your hndld account first.");
    return;
  }

  const doorName = conv.intent?.params?.door_name?.resolved || "front door";

  const [lock] = await db.select().from(smartLocks)
    .where(and(
      eq(smartLocks.householdId, context.householdId),
      sql`lower(${smartLocks.name}) like ${`%${doorName.toLowerCase()}%`}`
    ))
    .limit(1);

  if (!lock) {
    conv.add(`I couldn't find a lock called ${doorName}.`);
    return;
  }

  try {
    const provider = getProvider(lock.provider);
    const success = await provider.lock({
      lockId: lock.id,
      externalId: lock.externalId || "",
      accessToken: lock.accessToken || "",
    });

    if (success) {
      conv.add(`The ${lock.name} is now locked.`);
      return;
    }
  } catch (err) {
    logger.error("[Google Assistant] Lock door failed", { error: err });
  }

  conv.add(`I couldn't lock the ${lock.name}. Please try again.`);
});

app.handle("unlock_door", async (conv: any) => {
  const context = await getUserContext(conv);
  if (!context) {
    conv.add("Please link your hndld account first.");
    return;
  }

  const doorName = conv.intent?.params?.door_name?.resolved || "front door";

  const [lock] = await db.select().from(smartLocks)
    .where(and(
      eq(smartLocks.householdId, context.householdId),
      sql`lower(${smartLocks.name}) like ${`%${doorName.toLowerCase()}%`}`
    ))
    .limit(1);

  if (!lock) {
    conv.add(`I couldn't find a lock called ${doorName}.`);
    return;
  }

  try {
    const provider = getProvider(lock.provider);
    const success = await provider.unlock({
      lockId: lock.id,
      externalId: lock.externalId || "",
      accessToken: lock.accessToken || "",
    });

    if (success) {
      conv.add(`The ${lock.name} is now unlocked.`);
      return;
    }
  } catch (err) {
    logger.error("[Google Assistant] Unlock door failed", { error: err });
  }

  conv.add(`I couldn't unlock the ${lock.name}. Please try again.`);
});

app.handle("fallback", (conv: any) => {
  conv.add("I'm not sure how to help with that. You can ask about your next cleaning, pending approvals, or spending.");
  conv.add(new Suggestion({ title: "Next cleaning" }));
  conv.add(new Suggestion({ title: "Help" }));
});

router.post("/google-assistant", app as any);

export function registerGoogleAssistantRoutes(appRouter: Router) {
  appRouter.use(router);
}
