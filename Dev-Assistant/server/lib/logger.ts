import winston from "winston";

const logLevel = process.env.LOG_LEVEL || "info";
const isDevelopment = process.env.NODE_ENV !== "production";

const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
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

export default logger;
