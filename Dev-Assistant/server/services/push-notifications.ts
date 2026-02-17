import { db } from "../db";
import { pushSubscriptions, notificationSettings, type InsertPushSubscription } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import logger from "../lib/logger";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:hello@hndld.app";

export function getVapidPublicKey(): string | null {
  return VAPID_PUBLIC_KEY || null;
}

export function isPushEnabled(): boolean {
  return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

export async function savePushSubscription(data: InsertPushSubscription): Promise<void> {
  const existing = await db.select()
    .from(pushSubscriptions)
    .where(and(
      eq(pushSubscriptions.userId, data.userId),
      eq(pushSubscriptions.endpoint, data.endpoint)
    ))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(pushSubscriptions).values(data);
  }
}

export async function removePushSubscription(userId: string, endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions)
    .where(and(
      eq(pushSubscriptions.userId, userId),
      eq(pushSubscriptions.endpoint, endpoint)
    ));
}

export async function getUserSubscriptions(userId: string) {
  return db.select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
}

export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  url?: string
): Promise<{ sent: number; failed: number }> {
  if (!isPushEnabled()) {
    logger.info("[Push] Push notifications not configured");
    return { sent: 0, failed: 0 };
  }

  const settings = await db.select()
    .from(notificationSettings)
    .where(eq(notificationSettings.userId, userId))
    .limit(1);

  if (!settings[0]?.pushEnabled) {
    return { sent: 0, failed: 0 };
  }

  const subscriptions = await getUserSubscriptions(userId);
  
  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  try {
    const webpush = await import("web-push");
    
    webpush.setVapidDetails(
      VAPID_SUBJECT,
      VAPID_PUBLIC_KEY!,
      VAPID_PRIVATE_KEY!
    );

    const payload = JSON.stringify({
      title,
      body,
      icon: "/favicon.png",
      badge: "/favicon.png",
      data: { url: url || "/" },
    });

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          payload
        );
        sent++;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        logger.error("[Push] Failed to send notification", { endpoint: sub.endpoint, error: message });
        if ((error as { statusCode?: number }).statusCode === 410 || (error as { statusCode?: number }).statusCode === 404) {
          await removePushSubscription(userId, sub.endpoint);
        }
        failed++;
      }
    }
  } catch (error) {
    logger.error("[Push] Error loading web-push", { error: error instanceof Error ? error.message : String(error) });
  }

  return { sent, failed };
}

export async function sendPushToHouseholdUsers(
  householdId: string,
  userIds: string[],
  title: string,
  body: string,
  url?: string
): Promise<{ totalSent: number; totalFailed: number }> {
  let totalSent = 0;
  let totalFailed = 0;

  for (const userId of userIds) {
    const result = await sendPushNotification(userId, title, body, url);
    totalSent += result.sent;
    totalFailed += result.failed;
  }

  return { totalSent, totalFailed };
}
