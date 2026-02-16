import type { Request, Response } from "express";
import type { UserProfile } from "@shared/schema";

export interface AuthUserClaims {
  sub: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  profile_image_url?: string;
  exp?: number;
  [key: string]: unknown;
}

export interface AuthUser {
  claims: AuthUserClaims;
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
}

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

export interface HouseholdRequest extends AuthenticatedRequest {
  householdId: string;
  householdRole?: string;
  organizationId?: string;
  userId?: string;
  userProfile?: UserProfile;
}

export type { Request, Response };
