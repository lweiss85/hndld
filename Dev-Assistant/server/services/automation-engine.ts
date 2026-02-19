import { db } from "../db";
import { automations, automationRuns, tasks, approvals, calendarEvents, smartLocks } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import logger from "../lib/logger";
import { sendPushNotification } from "./push-notifications";
import { getProvider } from "./smart-locks";
import crypto from "crypto";

interface TriggerEvent {
  type: string;
  householdId: string;
  propertyId?: string;
  data: Record<string, unknown>;
}

interface AutomationConditions {
  userIds?: string[];
  vendorIds?: string[];
  taskCategories?: string[];
  minAmount?: number;
  maxAmount?: number;
}

interface ActionConfig {
  type: string;
  config: Record<string, unknown>;
  order: number;
}

interface ActionResult {
  success: boolean;
  result?: Record<string, unknown>;
  error?: string;
}

interface ActionExecutionRecord {
  type: string;
  status: "SUCCESS" | "FAILED";
  result?: Record<string, unknown>;
  error?: string;
  executedAt: string;
}

export async function processTrigger(event: TriggerEvent): Promise<void> {
  try {
    const matchingAutomations = await db.select().from(automations)
      .where(and(
        eq(automations.householdId, event.householdId),
        eq(automations.trigger, event.type as any),
        eq(automations.isEnabled, true),
        eq(automations.isPaused, false)
      ));

    for (const automation of matchingAutomations) {
      if (automation.pauseUntil && new Date(automation.pauseUntil) > new Date()) {
        continue;
      }

      if (automation.propertyId && event.propertyId && automation.propertyId !== event.propertyId) {
        continue;
      }

      if (!matchesConditions(automation.conditions as AutomationConditions | null, event.data)) {
        continue;
      }

      await executeAutomation(automation, event);
    }
  } catch (error: unknown) {
    logger.error("Automation trigger processing failed", {
      event,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function matchesConditions(conditions: AutomationConditions | null | undefined, data: Record<string, unknown>): boolean {
  if (!conditions) return true;

  if (conditions.userIds?.length && !conditions.userIds.includes(data.userId as string)) {
    return false;
  }
  if (conditions.vendorIds?.length && !conditions.vendorIds.includes(data.vendorId as string)) {
    return false;
  }
  if (conditions.taskCategories?.length && data.category && !conditions.taskCategories.includes(data.category as string)) {
    return false;
  }
  if (conditions.minAmount !== undefined && (data.amount as number) < conditions.minAmount) {
    return false;
  }
  if (conditions.maxAmount !== undefined && (data.amount as number) > conditions.maxAmount) {
    return false;
  }

  return true;
}

async function executeAutomation(automation: typeof automations.$inferSelect, event: TriggerEvent): Promise<void> {
  const runId = crypto.randomUUID();
  const actionsExecuted: ActionExecutionRecord[] = [];
  let status = "RUNNING";
  let error: string | undefined;

  try {
    await db.insert(automationRuns).values({
      id: runId,
      automationId: automation.id,
      householdId: automation.householdId,
      triggeredBy: event,
      status: "RUNNING",
      actionsExecuted: [],
    });

    const actions = [...((automation.actions || []) as ActionConfig[])].sort((a, b) => a.order - b.order);

    for (const action of actions) {
      const actionResult = await executeAction(action, event, automation);
      actionsExecuted.push({
        type: action.type,
        status: actionResult.success ? "SUCCESS" : "FAILED",
        result: actionResult.result,
        error: actionResult.error,
        executedAt: new Date().toISOString(),
      });

      if (!actionResult.success) {
        error = actionResult.error;
        status = "FAILED";
        break;
      }
    }

    if (status === "RUNNING") {
      status = "SUCCESS";
    }

    await db.update(automationRuns)
      .set({
        status,
        actionsExecuted,
        error,
        completedAt: new Date(),
      })
      .where(eq(automationRuns.id, runId));

    await db.update(automations)
      .set({
        runCount: automation.runCount + 1,
        lastRunAt: new Date(),
        lastRunStatus: status,
        lastRunError: error || null,
        updatedAt: new Date(),
      })
      .where(eq(automations.id, automation.id));

    logger.info("Automation executed", {
      automationId: automation.id,
      name: automation.name,
      runId,
      status,
      actionsCount: actionsExecuted.length,
    });
  } catch (err: unknown) {
    logger.error("Automation execution failed", {
      automationId: automation.id,
      runId,
      error: err instanceof Error ? err.message : String(err),
    });

    await db.update(automationRuns)
      .set({
        status: "FAILED",
        error: err instanceof Error ? err.message : String(err),
        completedAt: new Date(),
      })
      .where(eq(automationRuns.id, runId)).catch(() => {});
  }
}

async function executeAction(
  action: ActionConfig,
  event: TriggerEvent,
  automation: typeof automations.$inferSelect
): Promise<ActionResult> {
  const config = action.config as Record<string, any>;
  try {
    switch (action.type) {
      case "SEND_NOTIFICATION": {
        const userId = config.userId || event.data.userId;
        if (!userId) return { success: false, error: "No userId for notification" };
        const title = interpolate(config.title || "Automation Alert", event.data);
        const body = interpolate(config.body || "", event.data);
        await sendPushNotification(userId as string, title, body);
        return { success: true, result: { userId, title } };
      }

      case "CREATE_TASK": {
        const [newTask] = await db.insert(tasks).values({
          householdId: automation.householdId,
          title: interpolate(config.title || "Auto-created task", event.data),
          description: interpolate(config.description || "", event.data),
          status: "INBOX",
          urgency: config.priority || "MEDIUM",
          createdBy: automation.createdBy,
        }).returning();
        return { success: true, result: { taskId: newTask?.id } };
      }

      case "COMPLETE_TASK": {
        const taskId = config.taskId || event.data.taskId;
        if (!taskId) return { success: false, error: "No taskId to complete" };
        await db.update(tasks)
          .set({ status: "DONE", updatedAt: new Date() })
          .where(eq(tasks.id, taskId as string));
        return { success: true, result: { taskId } };
      }

      case "CREATE_APPROVAL": {
        const [newApproval] = await db.insert(approvals).values({
          householdId: automation.householdId,
          title: interpolate(config.title || "Auto-created approval", event.data),
          details: interpolate(config.description || "", event.data),
          status: "PENDING",
          createdBy: automation.createdBy,
        }).returning();
        return { success: true, result: { approvalId: newApproval?.id } };
      }

      case "AUTO_APPROVE": {
        const aId = config.approvalId || event.data.approvalId;
        if (!aId) return { success: false, error: "No approvalId to approve" };
        await db.update(approvals)
          .set({ status: "APPROVED", updatedAt: new Date() })
          .where(eq(approvals.id, aId as string));
        return { success: true, result: { approvalId: aId } };
      }

      case "LOCK_DOOR":
      case "UNLOCK_DOOR": {
        const lockId = config.lockId || event.data.lockId;
        if (!lockId) return { success: false, error: "No lockId specified" };
        const [lock] = await db.select().from(smartLocks).where(eq(smartLocks.id, lockId as string)).limit(1);
        if (!lock) return { success: false, error: `Lock ${lockId} not found` };
        const provider = getProvider(lock.provider);
        const cmd = { lockId: lock.id, externalId: lock.externalId || "", accessToken: lock.accessToken || "" };
        if (action.type === "LOCK_DOOR") {
          await provider.lock(cmd);
        } else {
          await provider.unlock(cmd);
        }
        return { success: true, result: { lockId, action: action.type } };
      }

      case "ADD_TO_CALENDAR": {
        const [newEvent] = await db.insert(calendarEvents).values({
          householdId: automation.householdId,
          title: interpolate(config.title || "Auto-created event", event.data),
          startAt: config.startTime ? new Date(config.startTime as string) : new Date(),
          endAt: config.endTime ? new Date(config.endTime as string) : new Date(Date.now() + 3600000),
        }).returning();
        return { success: true, result: { eventId: newEvent?.id } };
      }

      case "TRIGGER_WEBHOOK": {
        const url = config.url as string;
        if (!url) return { success: false, error: "No webhook URL specified" };
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...((config.headers || {}) as Record<string, string>),
          },
          body: JSON.stringify({
            event,
            automation: { id: automation.id, name: automation.name },
            timestamp: new Date().toISOString(),
          }),
        });
        return { success: response.ok, result: { status: response.status } };
      }

      case "LOG_EVENT": {
        logger.info("Automation LOG_EVENT action", {
          automationId: automation.id,
          message: interpolate(config.message || "", event.data),
          data: event.data,
        });
        return { success: true };
      }

      case "SEND_EMAIL": {
        logger.info("Automation SEND_EMAIL action (stub)", {
          to: config.to,
          subject: interpolate(config.subject || "", event.data),
        });
        return { success: true, result: { stub: true } };
      }

      case "SEND_SMS": {
        logger.info("Automation SEND_SMS action (stub)", {
          to: config.to,
          message: interpolate(config.message || "", event.data),
        });
        return { success: true, result: { stub: true } };
      }

      case "UPDATE_BUDGET": {
        logger.info("Automation UPDATE_BUDGET action (stub)", {
          budgetId: config.budgetId,
          adjustment: config.adjustment,
        });
        return { success: true, result: { stub: true } };
      }

      default:
        return { success: false, error: `Unknown action type: ${action.type}` };
    }
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function interpolate(template: string, data: Record<string, unknown>): string {
  if (!template) return "";
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = data[key];
    return val !== undefined && val !== null ? String(val) : `{{${key}}}`;
  });
}

export const AUTOMATION_TEMPLATES = [
  {
    id: "lock-after-cleaning",
    name: "Lock After Cleaning",
    description: "Automatically lock all doors when cleaning is completed",
    icon: "lock",
    color: "green",
    trigger: "CLEANING_COMPLETED",
    triggerConfig: {},
    actions: [
      { type: "LOCK_DOOR", config: { lockId: "" }, order: 1 },
      { type: "SEND_NOTIFICATION", config: { title: "Cleaning Complete", body: "Doors have been locked after cleaning session" }, order: 2 },
    ],
  },
  {
    id: "approval-reminder",
    name: "Approval Reminder",
    description: "Send a notification when an approval has been pending for too long",
    icon: "clock",
    color: "amber",
    trigger: "APPROVAL_PENDING_HOURS",
    triggerConfig: { pendingHours: 24 },
    actions: [
      { type: "SEND_NOTIFICATION", config: { title: "Pending Approval", body: "An approval has been waiting for {{pendingHours}} hours" }, order: 1 },
    ],
  },
  {
    id: "budget-alert",
    name: "Budget Alert",
    description: "Get notified when spending reaches a budget threshold",
    icon: "alert-triangle",
    color: "red",
    trigger: "BUDGET_THRESHOLD",
    triggerConfig: { threshold: 80 },
    actions: [
      { type: "SEND_NOTIFICATION", config: { title: "Budget Warning", body: "Spending has reached {{threshold}}% of budget" }, order: 1 },
    ],
  },
  {
    id: "task-overdue-escalate",
    name: "Overdue Task Escalation",
    description: "Create an approval request when a task becomes overdue",
    icon: "alert-circle",
    color: "orange",
    trigger: "TASK_OVERDUE",
    triggerConfig: {},
    actions: [
      { type: "CREATE_APPROVAL", config: { title: "Overdue Task: {{taskTitle}}", description: "Task '{{taskTitle}}' is overdue and needs attention" }, order: 1 },
      { type: "SEND_NOTIFICATION", config: { title: "Task Overdue", body: "{{taskTitle}} needs your attention" }, order: 2 },
    ],
  },
  {
    id: "guest-arrival",
    name: "Guest Arrival Prep",
    description: "Unlock the door and create welcome tasks when a guest arrives",
    icon: "users",
    color: "blue",
    trigger: "GUEST_ACCESS_STARTED",
    triggerConfig: {},
    actions: [
      { type: "UNLOCK_DOOR", config: { lockId: "" }, order: 1 },
      { type: "CREATE_TASK", config: { title: "Welcome guest {{guestName}}", description: "Prepare welcome amenities", priority: "HIGH" }, order: 2 },
      { type: "SEND_NOTIFICATION", config: { title: "Guest Arriving", body: "{{guestName}} has arrived. Door unlocked." }, order: 3 },
    ],
  },
  {
    id: "document-expiry",
    name: "Document Expiry Alert",
    description: "Get notified before important documents expire",
    icon: "file-warning",
    color: "yellow",
    trigger: "DOCUMENT_EXPIRING",
    triggerConfig: { documentDaysBefore: 30 },
    actions: [
      { type: "SEND_NOTIFICATION", config: { title: "Document Expiring", body: "{{documentName}} expires in {{daysUntilExpiry}} days" }, order: 1 },
      { type: "CREATE_TASK", config: { title: "Renew: {{documentName}}", description: "Document expires on {{expiryDate}}", priority: "HIGH" }, order: 2 },
    ],
  },
  {
    id: "spending-webhook",
    name: "Spending Webhook",
    description: "Send spending data to an external accounting system",
    icon: "webhook",
    color: "purple",
    trigger: "SPENDING_CREATED",
    triggerConfig: {},
    actions: [
      { type: "TRIGGER_WEBHOOK", config: { url: "" }, order: 1 },
      { type: "LOG_EVENT", config: { message: "Spending of {{amount}} logged and sent to webhook" }, order: 2 },
    ],
  },
  {
    id: "daily-morning-routine",
    name: "Morning Routine",
    description: "Unlock doors, create daily task checklist every weekday morning",
    icon: "sunrise",
    color: "sky",
    trigger: "SCHEDULE_TIME",
    triggerConfig: { scheduleTime: "07:00", scheduleDays: [1, 2, 3, 4, 5] },
    actions: [
      { type: "UNLOCK_DOOR", config: { lockId: "" }, order: 1 },
      { type: "CREATE_TASK", config: { title: "Morning household check", description: "Check mail, water plants, review schedule", priority: "MEDIUM" }, order: 2 },
    ],
  },
];
