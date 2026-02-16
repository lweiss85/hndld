import type { UserProfile } from "@shared/schema";
import type { AuthUser } from "./api";

declare global {
  namespace Express {
    interface User extends AuthUser {}
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
