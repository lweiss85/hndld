import type { UserProfile } from "@shared/schema";

declare global {
  namespace Express {
    interface Request {
      householdId?: string;
      householdRole?: string;
      organizationId?: string;
      userId?: string;
      userProfile?: UserProfile;
    }
  }
}

export {};
