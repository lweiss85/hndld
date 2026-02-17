import { db } from "../db";
import { notifications, notificationSettings, type InsertNotification, type Notification, type NotificationSettings } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import logger from "../lib/logger";

const DEMO_MODE = process.env.DEMO_MODE === "true" || !process.env.SMTP_HOST;

interface EmailProvider {
  sendEmail(to: string, subject: string, body: string, html?: string): Promise<boolean>;
}

interface SmsProvider {
  sendSms(to: string, message: string): Promise<boolean>;
}

class DemoEmailProvider implements EmailProvider {
  async sendEmail(to: string, subject: string, body: string): Promise<boolean> {
    logger.info("[Demo Email] Sending", { to, subject, bodyPreview: body.substring(0, 100) });
    return true;
  }
}

class DemoSmsProvider implements SmsProvider {
  async sendSms(to: string, message: string): Promise<boolean> {
    logger.info("[Demo SMS] Sending", { to, messagePreview: message.substring(0, 100) });
    return true;
  }
}

class SmtpEmailProvider implements EmailProvider {
  async sendEmail(to: string, subject: string, body: string, html?: string): Promise<boolean> {
    try {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || "587"),
        secure: process.env.SMTP_SECURE === "true",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: process.env.FROM_EMAIL || "noreply@houseops.app",
        to,
        subject,
        text: body,
        html: html || body,
      });

      return true;
    } catch (error) {
      logger.error("[SMTP Email] Failed to send", { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }
}

class TwilioSmsProvider implements SmsProvider {
  async sendSms(to: string, message: string): Promise<boolean> {
    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const fromNumber = process.env.TWILIO_FROM_NUMBER;

      if (!accountSid || !authToken || !fromNumber) {
        logger.warn("[Twilio SMS] Missing credentials, skipping");
        return false;
      }

      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            "Authorization": `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: to,
            From: fromNumber,
            Body: message,
          }),
        }
      );

      return response.ok;
    } catch (error) {
      logger.error("[Twilio SMS] Failed to send", { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }
}

function getEmailProvider(): EmailProvider {
  if (DEMO_MODE) {
    return new DemoEmailProvider();
  }
  return new SmtpEmailProvider();
}

function getSmsProvider(): SmsProvider {
  if (!process.env.TWILIO_ACCOUNT_SID) {
    return new DemoSmsProvider();
  }
  return new TwilioSmsProvider();
}

export async function createNotification(data: InsertNotification): Promise<Notification> {
  const [notification] = await db.insert(notifications).values(data).returning();
  return notification;
}

export async function getNotifications(userId: string, householdId: string): Promise<Notification[]> {
  return db.select().from(notifications)
    .where(and(
      eq(notifications.userId, userId),
      eq(notifications.householdId, householdId)
    ))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
}

export async function getUnreadCount(userId: string, householdId: string): Promise<number> {
  const result = await db.select().from(notifications)
    .where(and(
      eq(notifications.userId, userId),
      eq(notifications.householdId, householdId),
      eq(notifications.isRead, false)
    ));
  return result.length;
}

export async function markNotificationRead(id: string): Promise<void> {
  await db.update(notifications)
    .set({ isRead: true })
    .where(eq(notifications.id, id));
}

export async function markAllNotificationsRead(userId: string, householdId: string): Promise<void> {
  await db.update(notifications)
    .set({ isRead: true })
    .where(and(
      eq(notifications.userId, userId),
      eq(notifications.householdId, householdId)
    ));
}

export async function getNotificationSettings(userId: string): Promise<NotificationSettings | null> {
  const [settings] = await db.select().from(notificationSettings)
    .where(eq(notificationSettings.userId, userId));
  return settings || null;
}

export async function upsertNotificationSettings(
  userId: string,
  householdId: string,
  data: Partial<NotificationSettings>
): Promise<NotificationSettings> {
  const existing = await getNotificationSettings(userId);
  
  if (existing) {
    const [updated] = await db.update(notificationSettings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(notificationSettings.userId, userId))
      .returning();
    return updated;
  }

  const [created] = await db.insert(notificationSettings)
    .values({
      userId,
      householdId,
      ...data,
    })
    .returning();
  return created;
}

export interface NotifyOptions {
  householdId: string;
  userId: string;
  userEmail?: string;
  type: "APPROVAL_NEEDED" | "TASK_WAITING" | "DAILY_DIGEST" | "WEEKLY_BRIEF" | "UPDATE_POSTED" | "REQUEST_RECEIVED" | "TASK_CANCELLED";
  title: string;
  body: string;
  linkUrl?: string;
}

export async function notify(options: NotifyOptions): Promise<Notification> {
  const notification = await createNotification({
    householdId: options.householdId,
    userId: options.userId,
    type: options.type,
    title: options.title,
    body: options.body,
    linkUrl: options.linkUrl,
  });

  const settings = await getNotificationSettings(options.userId);
  const shouldSendEmail = settings?.emailEnabled !== false;
  const shouldSendSms = settings?.smsEnabled === true && settings?.phoneNumber;

  let emailSent = false;
  let smsSent = false;

  if (shouldSendEmail && options.userEmail) {
    const emailProvider = getEmailProvider();
    emailSent = await emailProvider.sendEmail(
      options.userEmail,
      `[hndld] ${options.title}`,
      options.body,
      generateEmailHtml(options.title, options.body, options.linkUrl)
    );
  }

  if (shouldSendSms && settings?.phoneNumber) {
    const smsProvider = getSmsProvider();
    smsSent = await smsProvider.sendSms(
      settings.phoneNumber,
      `hndld: ${options.title} - ${options.body.substring(0, 100)}`
    );
  }

  if (emailSent || smsSent) {
    await db.update(notifications)
      .set({ emailSent, smsSent })
      .where(eq(notifications.id, notification.id));
  }

  return notification;
}

function generateEmailHtml(title: string, body: string, linkUrl?: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1D2A44; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #1D2A44; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background: #F6F2EA; padding: 20px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; background: #1D2A44; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 16px; }
        .footer { margin-top: 20px; font-size: 12px; color: #667085; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0; font-size: 18px;">hndld</h1>
        </div>
        <div class="content">
          <h2 style="margin-top: 0;">${title}</h2>
          <p>${body}</p>
          ${linkUrl ? `<a href="${linkUrl}" class="button">View Details</a>` : ""}
        </div>
        <div class="footer">
          <p>This is an automated message from hndld. You can manage your notification preferences in the app.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export async function notifyApprovalNeeded(
  householdId: string,
  clientUserIds: string[],
  approvalTitle: string,
  approvalId: string,
  getUserEmail: (userId: string) => Promise<string | undefined>
): Promise<void> {
  for (const userId of clientUserIds) {
    const email = await getUserEmail(userId);
    await notify({
      householdId,
      userId,
      userEmail: email,
      type: "APPROVAL_NEEDED",
      title: "Approval Needed",
      body: `New approval request: ${approvalTitle}`,
      linkUrl: `/approvals?id=${approvalId}`,
    });
  }
}

export async function notifyTaskWaiting(
  householdId: string,
  clientUserIds: string[],
  taskTitle: string,
  taskId: string,
  getUserEmail: (userId: string) => Promise<string | undefined>
): Promise<void> {
  for (const userId of clientUserIds) {
    const email = await getUserEmail(userId);
    await notify({
      householdId,
      userId,
      userEmail: email,
      type: "TASK_WAITING",
      title: "Waiting for Your Input",
      body: `Task needs your attention: ${taskTitle}`,
      linkUrl: `/tasks?id=${taskId}`,
    });
  }
}

export async function notifyTaskCancelled(
  householdId: string,
  assistantUserIds: string[],
  taskTitle: string,
  taskId: string,
  cancelledByName: string,
  reason: string | undefined,
  getUserEmail: (userId: string) => Promise<string | undefined>
): Promise<number> {
  let notifiedCount = 0;
  for (const userId of assistantUserIds) {
    const email = await getUserEmail(userId);
    const bodyText = reason 
      ? `${cancelledByName} cancelled: ${taskTitle}\nReason: ${reason}`
      : `${cancelledByName} cancelled: ${taskTitle}`;
    await notify({
      householdId,
      userId,
      userEmail: email,
      type: "TASK_CANCELLED",
      title: "Request Cancelled",
      body: bodyText,
      linkUrl: `/tasks?id=${taskId}`,
    });
    notifiedCount++;
  }
  return notifiedCount;
}
