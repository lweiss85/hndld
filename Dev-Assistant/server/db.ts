import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import logger from "./lib/logger";
import { metrics } from "./lib/metrics";

const { Pool } = pg;

const SLOW_QUERY_THRESHOLD_MS = 100;
const POOL_LOG_INTERVAL_MS = 60 * 1000;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

const poolStats = {
  totalConnections: 0,
  totalErrors: 0,
  totalAcquires: 0,
  totalReleases: 0,
  peakWaiting: 0,
  peakTotal: 0,
};

pool.on("connect", () => {
  poolStats.totalConnections++;
  const total = pool.totalCount;
  if (total > poolStats.peakTotal) poolStats.peakTotal = total;
  logger.debug("Pool connection created", {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  });
});

pool.on("acquire", () => {
  poolStats.totalAcquires++;
});

pool.on("release", () => {
  poolStats.totalReleases++;
});

pool.on("remove", () => {
  logger.debug("Pool connection removed", {
    total: pool.totalCount,
    idle: pool.idleCount,
  });
});

pool.on("error", (err) => {
  poolStats.totalErrors++;
  logger.error("Pool connection error", {
    message: err.message,
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  });
});

export function getPoolStats() {
  const waiting = pool.waitingCount;
  if (waiting > poolStats.peakWaiting) poolStats.peakWaiting = waiting;
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting,
    max: 20,
    utilization: pool.totalCount > 0
      ? Math.round(((pool.totalCount - pool.idleCount) / pool.totalCount) * 100)
      : 0,
    lifetime: {
      connections: poolStats.totalConnections,
      acquires: poolStats.totalAcquires,
      releases: poolStats.totalReleases,
      errors: poolStats.totalErrors,
      peakWaiting: poolStats.peakWaiting,
      peakTotal: poolStats.peakTotal,
    },
  };
}

const poolLogInterval = setInterval(() => {
  const stats = getPoolStats();
  if (stats.total > 0) {
    logger.info("DB pool status", {
      total: stats.total,
      idle: stats.idle,
      waiting: stats.waiting,
      utilization: `${stats.utilization}%`,
      lifetimeErrors: stats.lifetime.errors,
    });
  }
  if (stats.waiting > 5) {
    logger.warn("High pool wait queue", {
      waiting: stats.waiting,
      total: stats.total,
      max: stats.max,
    });
  }
}, POOL_LOG_INTERVAL_MS);

if (poolLogInterval.unref) poolLogInterval.unref();

const originalQuery = pool.query.bind(pool);

pool.query = function trackedQuery(...args: any[]) {
  const start = process.hrtime.bigint();
  const queryText = typeof args[0] === "string"
    ? args[0]
    : args[0]?.text || "unknown";

  const result = (originalQuery as any)(...args);

  if (result && typeof result.then === "function") {
    result.then(() => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      if (durationMs >= SLOW_QUERY_THRESHOLD_MS) {
        const truncated = queryText.length > 200 ? queryText.slice(0, 200) + "..." : queryText;
        logger.warn("Slow DB query detected", {
          query: truncated,
          durationMs: Math.round(durationMs),
        });
        metrics.recordSlowQuery({
          query: truncated,
          durationMs: Math.round(durationMs),
          timestamp: Date.now(),
        });
      }
    }).catch(() => {});
  }

  return result;
} as any;

export const db = drizzle(pool, { schema });
