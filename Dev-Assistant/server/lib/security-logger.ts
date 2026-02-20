import { db } from "../db";
import { auditLogs } from "@shared/schema";
import logger from "./logger";

type SecurityEventType =
  | "AUTHENTICATION_SUCCESS"
  | "AUTHENTICATION_FAILURE"
  | "AUTHORIZATION_FAILURE"
  | "RATE_LIMIT_EXCEEDED"
  | "POTENTIAL_ATTACK"
  | "DATA_EXPORT"
  | "API_KEY_CREATED"
  | "API_KEY_REVOKED"
  | "SUSPICIOUS_INPUT"
  | "VAULT_ACCESS"
  | "PRIVILEGE_ESCALATION";

interface SecurityEvent {
  eventType: SecurityEventType;
  userId?: string;
  householdId?: string;
  ipAddress?: string;
  userAgent?: string;
  details: Record<string, unknown>;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export async function logSecurityEvent(event: SecurityEvent): Promise<void> {
  const logData = {
    ...event,
    timestamp: new Date().toISOString(),
  };

  if (event.severity === "CRITICAL" || event.severity === "HIGH") {
    logger.warn("Security event", logData);
  } else {
    logger.info("Security event", logData);
  }

  try {
    await db.insert(auditLogs).values({
      householdId: event.householdId || "SYSTEM",
      userId: event.userId || "SYSTEM",
      action: event.eventType,
      entityType: "SECURITY",
      entityId: null,
      beforeJson: null,
      afterJson: JSON.stringify(event.details),
      ip: event.ipAddress || null,
      userAgent: event.userAgent || null,
    });
  } catch (err: unknown) {
    logger.error("Failed to persist security event", {
      error: err instanceof Error ? err.message : String(err),
      eventType: event.eventType,
    });
  }

  if (event.severity === "CRITICAL") {
    await sendCriticalAlert(event);
  }
}

async function sendCriticalAlert(event: SecurityEvent): Promise<void> {
  logger.error("CRITICAL SECURITY ALERT", {
    eventType: event.eventType,
    userId: event.userId,
    ipAddress: event.ipAddress,
    details: event.details,
    timestamp: new Date().toISOString(),
  });
}

export type { SecurityEvent, SecurityEventType };
