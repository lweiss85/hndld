import type { Request, Response, NextFunction } from "express";

const CURRENT_VERSION = "1";
const SUPPORTED_VERSIONS = ["1"];

export function apiVersionMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestedVersion = req.headers["accept-version"] as string | undefined;

  if (requestedVersion && !SUPPORTED_VERSIONS.includes(requestedVersion)) {
    res.status(400).json({
      error: "Unsupported API version",
      requested: requestedVersion,
      supported: SUPPORTED_VERSIONS,
    });
    return;
  }

  req.apiVersion = requestedVersion || CURRENT_VERSION;
  res.setHeader("X-API-Version", req.apiVersion);

  next();
}
