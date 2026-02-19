import { Router, Request, Response } from "express";
import { db } from "../db";
import {
  cleaningVisits, approvals, spendingItems, tasks,
  smartLocks, guestAccess, apiTokens,
} from "@shared/schema";
import { eq, and, gte, isNull, sql } from "drizzle-orm";
import { startOfMonth, addDays, format } from "date-fns";
import { getProvider } from "../services/smart-locks";
import logger from "../lib/logger";

const router = Router();

router.post("/alexa", async (req: Request, res: Response) => {
  try {
    const { request, session } = req.body;

    switch (request.type) {
      case "LaunchRequest":
        return res.json(buildResponse(
          "Welcome to hndld. You can ask about your next cleaning, pending approvals, or spending. What would you like to know?",
          false
        ));

      case "IntentRequest":
        return handleIntent(req, res, request.intent, session);

      case "SessionEndedRequest":
        return res.json(buildResponse("Goodbye!", true));

      default:
        return res.json(buildResponse("I didn't understand that. Please try again.", false));
    }
  } catch (error) {
    logger.error("Alexa request failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.json(buildResponse(
      "Sorry, I encountered an error. Please try again later.",
      true
    ));
  }
});

async function handleIntent(req: Request, res: Response, intent: any, session: any) {
  const accessToken = session?.user?.accessToken;

  if (!accessToken && intent.name !== "AMAZON.HelpIntent" && intent.name !== "AMAZON.StopIntent" && intent.name !== "AMAZON.CancelIntent") {
    return res.json(buildLinkAccountResponse());
  }

  let userId: string | undefined;
  let householdId: string | undefined;

  if (accessToken) {
    const [token] = await db.select().from(apiTokens)
      .where(and(
        eq(apiTokens.token, accessToken),
        isNull(apiTokens.revokedAt)
      )).limit(1);

    if (!token) {
      return res.json(buildLinkAccountResponse());
    }

    userId = token.userId;
    householdId = token.householdId;

    await db.update(apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiTokens.id, token.id));
  }

  switch (intent.name) {
    case "NextCleaningIntent":
      return handleNextCleaning(res, householdId!);

    case "PendingApprovalsIntent":
      return handlePendingApprovals(res, householdId!);

    case "ApproveAllIntent":
      return handleApproveAll(res, householdId!);

    case "SpendingSummaryIntent":
      return handleSpendingSummary(res, householdId!, intent.slots);

    case "CreateTaskIntent":
      return handleCreateTask(res, householdId!, userId!, intent.slots);

    case "LockDoorIntent":
      return handleLockDoor(res, householdId!, intent.slots);

    case "UnlockDoorIntent":
      return handleUnlockDoor(res, householdId!, intent.slots);

    case "GuestAccessIntent":
      return handleGuestAccess(res, householdId!);

    case "AMAZON.HelpIntent":
      return res.json(buildResponse(
        "You can ask me: when is my next cleaning, how many approvals are pending, " +
        "what did I spend this month, create a task, " +
        "or lock the front door. What would you like to do?",
        false
      ));

    case "AMAZON.StopIntent":
    case "AMAZON.CancelIntent":
      return res.json(buildResponse("Goodbye!", true));

    default:
      return res.json(buildResponse(
        "I'm not sure how to help with that. Try asking about your next cleaning or pending approvals.",
        false
      ));
  }
}

async function handleNextCleaning(res: Response, householdId: string) {
  const [nextVisit] = await db.select().from(cleaningVisits)
    .where(and(
      eq(cleaningVisits.householdId, householdId),
      gte(cleaningVisits.scheduledAt, new Date())
    ))
    .orderBy(cleaningVisits.scheduledAt)
    .limit(1);

  if (!nextVisit) {
    return res.json(buildResponse(
      "You don't have any upcoming cleaning visits scheduled.",
      true
    ));
  }

  const date = format(nextVisit.scheduledAt, "EEEE, MMMM do");
  const time = format(nextVisit.scheduledAt, "h:mm a");

  return res.json(buildResponse(
    `Your next cleaning is scheduled for ${date} at ${time}.`,
    true
  ));
}

async function handlePendingApprovals(res: Response, householdId: string) {
  const pending = await db.select({ count: sql<number>`count(*)` })
    .from(approvals)
    .where(and(
      eq(approvals.householdId, householdId),
      eq(approvals.status, "PENDING")
    ));

  const count = Number(pending[0]?.count) || 0;

  if (count === 0) {
    return res.json(buildResponse(
      "You have no pending approvals. Everything is up to date!",
      true
    ));
  }

  const plural = count === 1 ? "approval" : "approvals";
  return res.json(buildResponse(
    `You have ${count} pending ${plural}. Would you like me to approve them all, or would you prefer to review them in the app?`,
    false,
    { pendingCount: count }
  ));
}

async function handleApproveAll(res: Response, householdId: string) {
  await db.update(approvals)
    .set({
      status: "APPROVED",
      updatedAt: new Date(),
    })
    .where(and(
      eq(approvals.householdId, householdId),
      eq(approvals.status, "PENDING")
    ));

  return res.json(buildResponse(
    "Done! I've approved all pending items.",
    true
  ));
}

async function handleSpendingSummary(res: Response, householdId: string, slots: any) {
  const period = slots?.period?.value || "this month";
  let startDate = startOfMonth(new Date());

  if (period.includes("week")) {
    startDate = addDays(new Date(), -7);
  } else if (period.includes("year")) {
    startDate = new Date(new Date().getFullYear(), 0, 1);
  }

  const spending = await db.select({
    total: sql<number>`coalesce(sum(${spendingItems.amount}), 0)`,
    count: sql<number>`count(*)`,
  })
    .from(spendingItems)
    .where(and(
      eq(spendingItems.householdId, householdId),
      gte(spendingItems.date, startDate)
    ));

  const total = Number(spending[0]?.total || 0) / 100;
  const count = Number(spending[0]?.count) || 0;

  if (count === 0) {
    return res.json(buildResponse(
      `You haven't recorded any spending ${period}.`,
      true
    ));
  }

  return res.json(buildResponse(
    `${period}, you've spent $${total.toFixed(2)} across ${count} transactions.`,
    true
  ));
}

async function handleCreateTask(res: Response, householdId: string, userId: string, slots: any) {
  const taskTitle = slots?.taskTitle?.value;

  if (!taskTitle) {
    return res.json(buildResponse(
      "What task would you like to create?",
      false,
      { expectingSlot: "taskTitle" }
    ));
  }

  await db.insert(tasks).values({
    householdId,
    title: taskTitle,
    status: "INBOX",
    urgency: "MEDIUM",
    createdBy: userId,
  });

  return res.json(buildResponse(
    `Done! I've created a task: ${taskTitle}.`,
    true
  ));
}

async function handleLockDoor(res: Response, householdId: string, slots: any) {
  const doorName = slots?.doorName?.value || "front door";

  const [lock] = await db.select().from(smartLocks)
    .where(and(
      eq(smartLocks.householdId, householdId),
      sql`lower(${smartLocks.name}) like ${`%${doorName.toLowerCase()}%`}`
    ))
    .limit(1);

  if (!lock) {
    return res.json(buildResponse(
      `I couldn't find a lock called ${doorName}. Please check your smart lock settings in the app.`,
      true
    ));
  }

  try {
    const provider = getProvider(lock.provider);
    const success = await provider.lock({
      lockId: lock.id,
      externalId: lock.externalId || "",
      accessToken: lock.accessToken || "",
    });

    if (success) {
      return res.json(buildResponse(`The ${lock.name} is now locked.`, true));
    }
  } catch (err) {
    logger.error("[Alexa] Lock door failed", { error: err });
  }

  return res.json(buildResponse(`I couldn't lock the ${lock.name}. Please try again or check the app.`, true));
}

async function handleUnlockDoor(res: Response, householdId: string, slots: any) {
  const doorName = slots?.doorName?.value || "front door";

  const [lock] = await db.select().from(smartLocks)
    .where(and(
      eq(smartLocks.householdId, householdId),
      sql`lower(${smartLocks.name}) like ${`%${doorName.toLowerCase()}%`}`
    ))
    .limit(1);

  if (!lock) {
    return res.json(buildResponse(
      `I couldn't find a lock called ${doorName}.`,
      true
    ));
  }

  try {
    const provider = getProvider(lock.provider);
    const success = await provider.unlock({
      lockId: lock.id,
      externalId: lock.externalId || "",
      accessToken: lock.accessToken || "",
    });

    if (success) {
      return res.json(buildResponse(`The ${lock.name} is now unlocked.`, true));
    }
  } catch (err) {
    logger.error("[Alexa] Unlock door failed", { error: err });
  }

  return res.json(buildResponse(`I couldn't unlock the ${lock.name}. Please try again.`, true));
}

async function handleGuestAccess(res: Response, householdId: string) {
  const activeGuests = await db.select().from(guestAccess)
    .where(and(
      eq(guestAccess.householdId, householdId),
      eq(guestAccess.status, "ACTIVE"),
      gte(guestAccess.expiresAt, new Date())
    ));

  if (activeGuests.length === 0) {
    return res.json(buildResponse(
      "No one currently has guest access to your home.",
      true
    ));
  }

  const names = activeGuests.map(g => g.guestName || g.guestEmail.split("@")[0]).join(", ");
  const plural = activeGuests.length === 1 ? "person has" : "people have";

  return res.json(buildResponse(
    `${activeGuests.length} ${plural} guest access: ${names}.`,
    true
  ));
}

function buildResponse(speech: string, shouldEndSession: boolean, sessionAttributes?: any) {
  return {
    version: "1.0",
    sessionAttributes: sessionAttributes || {},
    response: {
      outputSpeech: {
        type: "PlainText",
        text: speech,
      },
      shouldEndSession,
    },
  };
}

function buildLinkAccountResponse() {
  return {
    version: "1.0",
    response: {
      outputSpeech: {
        type: "PlainText",
        text: "Please link your hndld account in the Alexa app to use this skill.",
      },
      card: {
        type: "LinkAccount",
      },
      shouldEndSession: true,
    },
  };
}

export function registerAlexaRoutes(app: Router) {
  app.use(router);
}
