import { db } from "../db";
import { auditLogs, type InsertAuditLog } from "@shared/schema";
import { desc, eq, and, gte, lte } from "drizzle-orm";

type EntityType = 
  | "TASK" | "APPROVAL" | "UPDATE" | "REQUEST" | "VENDOR" | "SPENDING"
  | "CALENDAR_EVENT" | "VAULT" | "SETTINGS" | "PLAYBOOK" | "MEMBER" | "HOUSEHOLD";

interface LogAuditOptions {
  householdId: string;
  userId: string;
  action: string;
  entityType: EntityType;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
}

export async function logAudit(options: LogAuditOptions) {
  try {
    const entry: InsertAuditLog = {
      householdId: options.householdId,
      userId: options.userId,
      action: options.action,
      entityType: options.entityType,
      entityId: options.entityId || null,
      beforeJson: options.before ? JSON.stringify(options.before) : null,
      afterJson: options.after ? JSON.stringify(options.after) : null,
      ip: options.ip || null,
      userAgent: options.userAgent || null,
    };

    const [log] = await db.insert(auditLogs).values(entry).returning();
    return log;
  } catch (error) {
    console.error("[Audit] Failed to log:", error);
    return null;
  }
}

export async function getAuditLogs(
  householdId: string,
  options?: {
    entityType?: EntityType;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }
) {
  const conditions = [eq(auditLogs.householdId, householdId)];

  if (options?.entityType) {
    conditions.push(eq(auditLogs.entityType, options.entityType));
  }
  if (options?.userId) {
    conditions.push(eq(auditLogs.userId, options.userId));
  }
  if (options?.startDate) {
    conditions.push(gte(auditLogs.createdAt, options.startDate));
  }
  if (options?.endDate) {
    conditions.push(lte(auditLogs.createdAt, options.endDate));
  }

  const logs = await db
    .select()
    .from(auditLogs)
    .where(and(...conditions))
    .orderBy(desc(auditLogs.createdAt))
    .limit(options?.limit || 100)
    .offset(options?.offset || 0);

  return logs;
}

export async function getAuditLogCount(householdId: string): Promise<number> {
  const result = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.householdId, householdId));
  return result.length;
}
