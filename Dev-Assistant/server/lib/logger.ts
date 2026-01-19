/**
 * Logger with PII Sanitization
 * 
 * Automatically redacts sensitive fields from log output.
 */

import winston from "winston";

const logLevel = process.env.LOG_LEVEL || "info";
const isDevelopment = process.env.NODE_ENV !== "production";

const SENSITIVE_FIELDS = new Set([
  "password",
  "pin",
  "pinHash",
  "token",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "secret",
  "apiKey",
  "api_key",
  "sessionSecret",
  "session_secret",
  "ssn",
  "socialSecurityNumber",
  "social_security_number",
  "creditCard",
  "credit_card",
  "cardNumber",
  "card_number",
  "cvv",
  "cvc",
  "value",
  "wifiPassword",
  "wifi_password",
  "alarmCode",
  "alarm_code",
  "gateCode",
  "gate_code",
  "accessTokenEncrypted",
  "access_token_encrypted",
  "refreshTokenEncrypted",
  "refresh_token_encrypted",
  "stripeCustomerId",
  "stripe_customer_id",
  "venmoUsername",
  "venmo_username",
  "zelleRecipient",
  "zelle_recipient",
  "cashAppCashtag",
  "cash_app_cashtag",
  "paypalMeHandle",
  "paypal_me_handle",
]);

const SENSITIVE_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /apikey/i,
  /api_key/i,
  /auth/i,
  /credential/i,
  /private/i,
];

function sanitize(obj: any, seen = new WeakSet()): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === "object") {
    if (seen.has(obj)) {
      return "[Circular]";
    }
    seen.add(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitize(item, seen));
  }

  if (typeof obj === "object") {
    const sanitized: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(obj)) {
      const isSensitive = 
        SENSITIVE_FIELDS.has(key) ||
        SENSITIVE_FIELDS.has(key.toLowerCase()) ||
        SENSITIVE_PATTERNS.some(pattern => pattern.test(key));
      
      if (isSensitive) {
        sanitized[key] = "[REDACTED]";
      } else if (typeof value === "object" && value !== null) {
        sanitized[key] = sanitize(value, seen);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  return obj;
}

const sanitizeFormat = winston.format((info) => {
  if (typeof info.message === "object") {
    info.message = sanitize(info.message);
  }
  
  const { level, message, timestamp, ...meta } = info;
  const sanitizedMeta = sanitize(meta);
  
  return {
    level,
    message,
    timestamp,
    ...sanitizedMeta,
  };
});

const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    sanitizeFormat(),
    isDevelopment
      ? winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : "";
            return `${timestamp} [${level}] ${message} ${metaStr}`;
          })
        )
      : winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      stderrLevels: ["error"],
    }),
  ],
});

export { sanitize };

export default logger;
