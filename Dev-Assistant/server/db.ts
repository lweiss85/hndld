import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import logger from "./lib/logger";
import { metrics } from "./lib/metrics";

const { Pool } = pg;

const SLOW_QUERY_THRESHOLD_MS = 100;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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
