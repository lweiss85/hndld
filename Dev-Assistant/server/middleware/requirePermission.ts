import type { Request, Response, NextFunction } from "express";
import { Permission, hasPermission } from "../lib/permissions";

export function requirePermission(...permissions: Permission[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.userProfile || !req.householdRole) {
      return res.status(401).json({ 
        error: "authentication_required",
        message: "User profile not available"
      });
    }

    const role = req.householdRole;
    
    const hasAllPermissions = permissions.every(permission => 
      hasPermission(role, permission)
    );

    if (!hasAllPermissions) {
      return res.status(403).json({ 
        error: "permission_denied",
        message: `Missing required permissions: ${permissions.join(", ")}`,
        required: permissions,
        role: role
      });
    }

    next();
  };
}

export function requireAnyPermission(...permissions: Permission[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.userProfile || !req.householdRole) {
      return res.status(401).json({ 
        error: "authentication_required",
        message: "User profile not available"
      });
    }

    const role = req.householdRole;
    
    const hasAnyPermission = permissions.some(permission => 
      hasPermission(role, permission)
    );

    if (!hasAnyPermission) {
      return res.status(403).json({ 
        error: "permission_denied",
        message: `Missing required permissions (need at least one): ${permissions.join(", ")}`,
        required: permissions,
        role: role
      });
    }

    next();
  };
}
