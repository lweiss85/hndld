import rateLimit from "express-rate-limit";

export const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000"),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100"),
  message: {
    error: "Too many requests from this IP, please try again later",
    retryAfter: "15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === "/health",
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || "5"),
  message: {
    error: "Too many authentication attempts, please try again later",
    retryAfter: "15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

export const expensiveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: {
    error: "Too many requests for this operation, please try again later",
    retryAfter: "1 hour",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const criticalLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 3,
  message: {
    error: "Too many attempts for this critical operation, please try again tomorrow",
    retryAfter: "24 hours",
  },
  standardHeaders: true,
  legacyHeaders: false,
});
