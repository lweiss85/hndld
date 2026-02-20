import { db } from "../db";
import { sql } from "drizzle-orm";
import logger from "./logger";

interface PerformanceMetrics {
  timestamp: Date;
  dbConnectionPool: { total: number; idle: number; waiting: number };
  queryPerformance: { avgDurationMs: number; slowQueries: number };
  memoryUsage: { heapUsed: number; heapTotal: number; rss: number };
  cpuUsage: { user: number; system: number };
}

let lastCpuUsage = process.cpuUsage();
let lastCpuTime = Date.now();

async function collectPerformanceMetrics(): Promise<PerformanceMetrics> {
  const timestamp = new Date();

  let dbPool = { total: 0, idle: 0, waiting: 0 };
  try {
    const poolResult = await db.execute(sql`
      SELECT 
        count(*) FILTER (WHERE state IS NOT NULL) as total,
        count(*) FILTER (WHERE state = 'idle') as idle,
        count(*) FILTER (WHERE wait_event IS NOT NULL AND state = 'active') as waiting
      FROM pg_stat_activity 
      WHERE datname = current_database()
    `);
    const row = (poolResult as { rows: Record<string, unknown>[] }).rows?.[0] || (poolResult as Record<string, unknown>[])[0];
    if (row) {
      dbPool = {
        total: Number(row.total || 0),
        idle: Number(row.idle || 0),
        waiting: Number(row.waiting || 0),
      };
    }
  } catch {
    logger.warn("Failed to query pg_stat_activity");
  }

  let queryPerf = { avgDurationMs: 0, slowQueries: 0 };
  try {
    const stmtResult = await db.execute(sql`
      SELECT 
        COALESCE(AVG(mean_exec_time), 0) as avg_duration_ms,
        COALESCE(COUNT(*) FILTER (WHERE mean_exec_time > 100), 0) as slow_queries
      FROM pg_stat_statements 
      WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
    `);
    const srow = (stmtResult as { rows: Record<string, unknown>[] }).rows?.[0] || (stmtResult as Record<string, unknown>[])[0];
    if (srow) {
      queryPerf = {
        avgDurationMs: Math.round(Number(srow.avg_duration_ms || 0) * 100) / 100,
        slowQueries: Number(srow.slow_queries || 0),
      };
    }
  } catch {
    logger.debug("pg_stat_statements not available, skipping query performance metrics");
  }

  const mem = process.memoryUsage();
  const memoryUsage = {
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    rss: mem.rss,
  };

  const nowCpu = process.cpuUsage();
  const nowTime = Date.now();
  const elapsedMs = nowTime - lastCpuTime;
  const elapsedMicros = elapsedMs * 1000;
  const cpuUsage = {
    user: elapsedMicros > 0 ? ((nowCpu.user - lastCpuUsage.user) / elapsedMicros) * 100 : 0,
    system: elapsedMicros > 0 ? ((nowCpu.system - lastCpuUsage.system) / elapsedMicros) * 100 : 0,
  };
  lastCpuUsage = nowCpu;
  lastCpuTime = nowTime;

  return {
    timestamp,
    dbConnectionPool: dbPool,
    queryPerformance: queryPerf,
    memoryUsage,
    cpuUsage,
  };
}

const HEAP_WARNING_THRESHOLD = 0.85;
const CPU_WARNING_THRESHOLD = 80;
const SLOW_QUERY_WARNING = 10;

function startPerformanceMonitoring(intervalMs: number = 30_000): NodeJS.Timeout {
  logger.info("Performance monitoring started", { intervalMs });

  const timer = setInterval(async () => {
    try {
      const metrics = await collectPerformanceMetrics();

      const heapRatio = metrics.memoryUsage.heapUsed / metrics.memoryUsage.heapTotal;
      if (heapRatio > HEAP_WARNING_THRESHOLD) {
        logger.warn("High memory usage detected", {
          heapUsedMB: Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(metrics.memoryUsage.heapTotal / 1024 / 1024),
          rssMB: Math.round(metrics.memoryUsage.rss / 1024 / 1024),
          heapPercent: Math.round(heapRatio * 100),
        });
      }

      const totalCpu = metrics.cpuUsage.user + metrics.cpuUsage.system;
      if (totalCpu > CPU_WARNING_THRESHOLD) {
        logger.warn("High CPU usage detected", {
          userPercent: Math.round(metrics.cpuUsage.user * 100) / 100,
          systemPercent: Math.round(metrics.cpuUsage.system * 100) / 100,
          totalPercent: Math.round(totalCpu * 100) / 100,
        });
      }

      if (metrics.queryPerformance.slowQueries > SLOW_QUERY_WARNING) {
        logger.warn("High number of slow queries", {
          slowQueries: metrics.queryPerformance.slowQueries,
          avgDurationMs: metrics.queryPerformance.avgDurationMs,
        });
      }

      logger.debug("Performance metrics", {
        dbConnections: metrics.dbConnectionPool.total,
        dbIdle: metrics.dbConnectionPool.idle,
        heapUsedMB: Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024),
        rssMB: Math.round(metrics.memoryUsage.rss / 1024 / 1024),
        cpuUser: Math.round(metrics.cpuUsage.user * 100) / 100,
        avgQueryMs: metrics.queryPerformance.avgDurationMs,
      });
    } catch (error: unknown) {
      logger.error("Performance monitoring error", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, intervalMs);

  return timer;
}

export { collectPerformanceMetrics, startPerformanceMonitoring };
export type { PerformanceMetrics };
