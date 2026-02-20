import { Express, Request, Response, NextFunction } from "express";
import helmet from "helmet";
import hpp from "hpp";
import { slowDown } from "express-slow-down";
import express from "express";
import logger from "../lib/logger";

export function configureSecurityMiddleware(app: Express) {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://api.anthropic.com", "wss:", "ws:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    frameguard: { action: "deny" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    noSniff: true,
    xssFilter: true,
  }));

  app.use(hpp());

  app.use(slowDown({
    windowMs: 60000,
    delayAfter: 100,
    delayMs: (hits: number) => hits * 100,
  }));

  app.use(express.json({ limit: "10kb" }));

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });

  logger.info("Security middleware configured (helmet, hpp, slowDown, body limits)");
}
