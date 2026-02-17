import type { Request, Response, NextFunction } from "express";
import { Permission, hasPermission } from "../lib/permissions";
import { unauthorized, forbidden } from "../lib/errors";

export function requirePermission(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.userProfile || !req.householdRole) {
      throw unauthorized("User profile not available");
    }

    const role = req.householdRole;
    
    const hasAllPermissions = permissions.every(permission => 
      hasPermission(role, permission)
    );

    if (!hasAllPermissions) {
      throw forbidden(`Missing required permissions: ${permissions.join(", ")}`);
    }

    next();
  };
}

export function requireAnyPermission(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.userProfile || !req.householdRole) {
      throw unauthorized("User profile not available");
    }

    const role = req.householdRole;
    
    const hasAnyPermission = permissions.some(permission => 
      hasPermission(role, permission)
    );

    if (!hasAnyPermission) {
      throw forbidden(`Missing required permissions (need at least one): ${permissions.join(", ")}`);
    }

    next();
  };
}
