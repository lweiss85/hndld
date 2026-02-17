/**
 * Service Type Scoping Middleware
 * 
 * This middleware adds service type filtering to requests.
 * It ensures CLEANING users only see CLEANING data and PA users see PA data.
 */

import { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { forbidden, internalError } from "../lib/errors";
import { householdServiceMemberships } from "@shared/schema";

export interface ServiceScopedRequest extends Request {
  householdId?: string;
  userId?: string;
  serviceType?: "CLEANING" | "PA";
  serviceTypes?: ("CLEANING" | "PA")[];
}

/**
 * Middleware that determines which service types the user has access to
 * in the current household context.
 * 
 * Must be used AFTER householdContext middleware.
 */
export async function serviceScopeMiddleware(
  req: ServiceScopedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const householdId = req.householdId;
    const userId = (req as any).user?.claims?.sub;

    if (!householdId || !userId) {
      return next();
    }

    const memberships = await db
      .select()
      .from(householdServiceMemberships)
      .where(
        and(
          eq(householdServiceMemberships.householdId, householdId),
          eq(householdServiceMemberships.userId, userId),
          eq(householdServiceMemberships.isActive, true)
        )
      );

    if (memberships.length === 0) {
      req.serviceTypes = ["PA", "CLEANING"];
      req.serviceType = "PA";
    } else {
      req.serviceTypes = memberships.map(m => m.serviceType) as ("CLEANING" | "PA")[];
      req.serviceType = req.serviceTypes[0];
    }

    const requestedServiceType = req.headers["x-service-type"] as string;
    if (requestedServiceType && req.serviceTypes.includes(requestedServiceType as any)) {
      req.serviceType = requestedServiceType as "CLEANING" | "PA";
    }

    next();
  } catch (error: any) {
    if (error.name === "AppError") {
      return next(error);
    }
    next(internalError("Error in service scope middleware"));
  }
}

/**
 * Helper to build service type filter for queries
 */
export function getServiceTypeFilter(req: ServiceScopedRequest) {
  if (req.serviceTypes?.length === 2) {
    return undefined;
  }
  return req.serviceType || "PA";
}

/**
 * Middleware that requires a specific service type
 */
export function requireServiceType(serviceType: "CLEANING" | "PA") {
  return (req: ServiceScopedRequest, _res: Response, next: NextFunction) => {
    if (!req.serviceTypes?.includes(serviceType)) {
      throw forbidden(`Access denied. This feature requires ${serviceType} service access.`);
    }
    next();
  };
}
