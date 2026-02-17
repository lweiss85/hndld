import type { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { userProfiles, households } from "@shared/schema";
import { unauthorized, forbidden, notFound, badRequest, conflict, internalError } from "../lib/errors";

const BOOTSTRAP_ALLOWLIST = [
  "/api/auth",
  "/api/role-selection",
  "/api/onboarding/init",
  "/api/organizations/create",
  "/api/households/create",
  "/api/user",
  "/api/households/available",
  "/api/households/set-default",
];

function isBootstrapEndpoint(path: string): boolean {
  return BOOTSTRAP_ALLOWLIST.some(prefix => path.startsWith(prefix));
}

export async function householdContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (isBootstrapEndpoint(req.path)) {
      return next();
    }

    if (!(req.user as any)?.claims?.sub) {
      throw unauthorized("Authentication required");
    }

    const userId = (req.user as any).claims.sub;
    req.userId = userId;

    let householdId = 
      req.headers["x-household-id"] as string || 
      req.query.householdId as string;

    const allProfiles = await db.select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId));

    if (allProfiles.length === 0) {
      throw badRequest("User has no household memberships. Please complete onboarding.", { error: "no_household" });
    }

    if (!householdId) {
      const profileWithDefault = allProfiles.find(p => p.isDefault === true);
      
      if (allProfiles.length === 1) {
        householdId = allProfiles[0].householdId!;
      } else if (profileWithDefault) {
        householdId = profileWithDefault.householdId!;
      } else {
        throw conflict("User belongs to multiple households. Please specify X-Household-Id header.", {
          error: "household_selection_required",
          households: allProfiles.map(p => ({ householdId: p.householdId, role: p.role })),
        });
      }
    }

    const memberProfile = allProfiles.find(p => p.householdId === householdId);
    
    if (!memberProfile) {
      throw forbidden("User is not a member of this household");
    }

    const household = await db.select()
      .from(households)
      .where(eq(households.id, householdId))
      .limit(1);

    if (!household.length) {
      throw notFound("The specified household does not exist");
    }

    req.householdId = householdId;
    req.householdRole = memberProfile.role;
    req.organizationId = memberProfile.organizationId || household[0].organizationId || undefined;
    req.userProfile = memberProfile;

    next();
  } catch (error: any) {
    if (error.name === "AppError") {
      return next(error);
    }
    next(internalError("Failed to determine household context"));
  }
}
