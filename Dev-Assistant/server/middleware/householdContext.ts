import type { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { userProfiles, households } from "@shared/schema";

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
      return res.status(401).json({ error: "authentication_required" });
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
      return res.status(400).json({ 
        error: "no_household",
        message: "User has no household memberships. Please complete onboarding."
      });
    }

    if (!householdId) {
      const profileWithDefault = allProfiles.find(p => p.isDefault === true);
      
      if (allProfiles.length === 1) {
        householdId = allProfiles[0].householdId!;
      } else if (profileWithDefault) {
        householdId = profileWithDefault.householdId!;
      } else {
        return res.status(409).json({ 
          error: "household_selection_required",
          message: "User belongs to multiple households. Please specify X-Household-Id header.",
          households: allProfiles.map(p => ({
            householdId: p.householdId,
            role: p.role
          }))
        });
      }
    }

    const memberProfile = allProfiles.find(p => p.householdId === householdId);
    
    if (!memberProfile) {
      return res.status(403).json({ 
        error: "access_denied",
        message: "User is not a member of this household"
      });
    }

    const household = await db.select()
      .from(households)
      .where(eq(households.id, householdId))
      .limit(1);

    if (!household.length) {
      return res.status(404).json({ 
        error: "household_not_found",
        message: "The specified household does not exist"
      });
    }

    req.householdId = householdId;
    req.householdRole = memberProfile.role;
    req.organizationId = memberProfile.organizationId || household[0].organizationId || undefined;
    req.userProfile = memberProfile;

    next();
  } catch (error) {
    console.error("Household context middleware error:", error);
    res.status(500).json({ error: "Failed to determine household context" });
  }
}
