import type { Request, Response, NextFunction } from "express";

export function cacheControl(maxAge: number, scope: "private" | "public" = "private") {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.set("Cache-Control", `${scope}, max-age=${maxAge}`);
    next();
  };
}

export function noCache(_req: Request, res: Response, next: NextFunction) {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
}

export function apiCacheHeaders(req: Request, res: Response, next: NextFunction) {
  if (req.method === "GET") {
    if (req.path.match(/\/(addon-services|task-templates|cleaning)$/)) {
      res.set("Cache-Control", "private, max-age=300");
    } else if (req.path.match(/\/(household\/settings|preferences|people|locations|important-dates|vendors)$/)) {
      res.set("Cache-Control", "private, max-age=60");
    } else if (req.path.match(/\/(billing\/plans|push\/vapid-key)$/)) {
      res.set("Cache-Control", "public, max-age=3600");
    } else {
      res.set("Cache-Control", "no-cache");
    }
  } else {
    res.set("Cache-Control", "no-store");
  }
  next();
}
