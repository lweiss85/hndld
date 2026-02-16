import { randomUUID } from "crypto";
import { AsyncLocalStorage } from "async_hooks";
import type { Request, Response, NextFunction } from "express";

export interface RequestContext {
  requestId: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function getRequestId(): string | undefined {
  return requestContextStorage.getStore()?.requestId;
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = (req.headers["x-request-id"] as string) || randomUUID();
  req.requestId = requestId;

  res.setHeader("X-Request-ID", requestId);

  const originalJson = res.json.bind(res);
  res.json = function (body: any) {
    if (res.statusCode >= 400 && body && typeof body === "object" && !Array.isArray(body)) {
      body.requestId = requestId;
    }
    return originalJson(body);
  };

  requestContextStorage.run({ requestId }, () => {
    next();
  });
}
