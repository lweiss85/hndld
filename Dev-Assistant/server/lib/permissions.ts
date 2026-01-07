import type { UserProfile } from "@shared/schema";

export type Permission =
  | "CAN_VIEW_TASKS"
  | "CAN_EDIT_TASKS"
  | "CAN_VIEW_APPROVALS"
  | "CAN_APPROVE"
  | "CAN_VIEW_VAULT"
  | "CAN_EDIT_VAULT"
  | "CAN_VIEW_SPENDING"
  | "CAN_EDIT_SPENDING"
  | "CAN_MANAGE_MEMBERS"
  | "CAN_MANAGE_SETTINGS"
  | "CAN_VIEW_UPDATES"
  | "CAN_CREATE_UPDATE"
  | "CAN_EDIT_UPDATES"
  | "CAN_POST_UPDATES"
  | "CAN_VIEW_CALENDAR"
  | "CAN_EDIT_CALENDAR"
  | "CAN_VIEW_VENDORS"
  | "CAN_EDIT_VENDORS"
  | "CAN_VIEW_REQUESTS"
  | "CAN_CREATE_REQUESTS"
  | "CAN_UPDATE_REQUEST"
  | "CAN_VIEW_PLAYBOOKS"
  | "CAN_MANAGE_PLAYBOOKS"
  | "CAN_VIEW_AUDIT_LOG"
  | "CAN_MANAGE_BACKUPS"
  | "CAN_MANAGE_ORGANIZATIONS"
  | "CAN_ADMIN_EXPORTS";

type RolePermissions = {
  [role: string]: Permission[];
};

const ROLE_PERMISSIONS: RolePermissions = {
  ASSISTANT: [
    "CAN_VIEW_TASKS",
    "CAN_EDIT_TASKS",
    "CAN_VIEW_APPROVALS",
    "CAN_APPROVE",
    "CAN_VIEW_VAULT",
    "CAN_EDIT_VAULT",
    "CAN_VIEW_SPENDING",
    "CAN_EDIT_SPENDING",
    "CAN_MANAGE_MEMBERS",
    "CAN_MANAGE_SETTINGS",
    "CAN_VIEW_UPDATES",
    "CAN_CREATE_UPDATE",
    "CAN_EDIT_UPDATES",
    "CAN_POST_UPDATES",
    "CAN_VIEW_CALENDAR",
    "CAN_EDIT_CALENDAR",
    "CAN_VIEW_VENDORS",
    "CAN_EDIT_VENDORS",
    "CAN_VIEW_REQUESTS",
    "CAN_CREATE_REQUESTS",
    "CAN_UPDATE_REQUEST",
    "CAN_VIEW_PLAYBOOKS",
    "CAN_MANAGE_PLAYBOOKS",
    "CAN_VIEW_AUDIT_LOG",
    "CAN_MANAGE_BACKUPS",
    "CAN_MANAGE_ORGANIZATIONS",
    "CAN_ADMIN_EXPORTS",
  ],
  CLIENT: [
    "CAN_VIEW_TASKS",
    "CAN_VIEW_APPROVALS",
    "CAN_APPROVE",
    "CAN_VIEW_SPENDING",
    "CAN_VIEW_UPDATES",
    "CAN_VIEW_CALENDAR",
    "CAN_VIEW_VENDORS",
    "CAN_VIEW_REQUESTS",
    "CAN_CREATE_REQUESTS",
    "CAN_VIEW_PLAYBOOKS",
  ],
};

export function hasPermission(role: string, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes(permission);
}

export function getPermissions(role: string): Permission[] {
  return ROLE_PERMISSIONS[role] || [];
}

export function requirePermission(userProfile: UserProfile | null, permission: Permission): void {
  if (!userProfile) {
    throw new PermissionError("Not authenticated");
  }
  if (!hasPermission(userProfile.role, permission)) {
    throw new PermissionError(`Permission denied: ${permission}`);
  }
}

export function checkPermission(userProfile: UserProfile | null, permission: Permission): boolean {
  if (!userProfile) return false;
  return hasPermission(userProfile.role, permission);
}

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionError";
  }
}
