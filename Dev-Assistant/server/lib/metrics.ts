import logger from "./logger";

interface TimingEntry {
  route: string;
  method: string;
  statusCode: number;
  durationMs: number;
  timestamp: number;
}

interface SlowQueryEntry {
  query: string;
  durationMs: number;
  timestamp: number;
}

const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 50_000;

class MetricsCollector {
  private timings: TimingEntry[] = [];
  private slowQueries: SlowQueryEntry[] = [];
  private requestCount = 0;
  private errorCount = 0;
  private startTime = Date.now();
  private dailyLogTimer: ReturnType<typeof setInterval> | null = null;

  recordTiming(entry: TimingEntry) {
    this.requestCount++;
    if (entry.statusCode >= 500) this.errorCount++;
    this.timings.push(entry);
    if (this.timings.length > MAX_ENTRIES) {
      this.timings = this.timings.slice(-MAX_ENTRIES / 2);
    }
  }

  recordSlowQuery(entry: SlowQueryEntry) {
    this.slowQueries.push(entry);
    if (this.slowQueries.length > 5000) {
      this.slowQueries = this.slowQueries.slice(-2500);
    }
  }

  private getRecentTimings(): TimingEntry[] {
    const cutoff = Date.now() - WINDOW_MS;
    return this.timings.filter((t) => t.timestamp > cutoff);
  }

  private getRecentSlowQueries(): SlowQueryEntry[] {
    const cutoff = Date.now() - WINDOW_MS;
    return this.slowQueries.filter((q) => q.timestamp > cutoff);
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  getStats() {
    const recent = this.getRecentTimings();
    const durations = recent.map((t) => t.durationMs).sort((a, b) => a - b);
    const recentSlowQueries = this.getRecentSlowQueries();

    const routeStats = new Map<string, number[]>();
    for (const t of recent) {
      const key = `${t.method} ${t.route}`;
      if (!routeStats.has(key)) routeStats.set(key, []);
      routeStats.get(key)!.push(t.durationMs);
    }

    const slowestRoutes = Array.from(routeStats.entries())
      .map(([route, times]) => ({
        route,
        count: times.length,
        avg: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
        p95: this.percentile(times.sort((a, b) => a - b), 95),
        max: Math.max(...times),
      }))
      .sort((a, b) => b.p95 - a.p95)
      .slice(0, 20);

    return {
      uptime_seconds: Math.round((Date.now() - this.startTime) / 1000),
      total_requests: this.requestCount,
      total_errors: this.errorCount,
      window_24h: {
        request_count: recent.length,
        p50_ms: this.percentile(durations, 50),
        p90_ms: this.percentile(durations, 90),
        p95_ms: this.percentile(durations, 95),
        p99_ms: this.percentile(durations, 99),
        avg_ms: recent.length
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
          : 0,
        max_ms: durations.length ? durations[durations.length - 1] : 0,
      },
      slow_queries_24h: recentSlowQueries.length,
      slowest_routes: slowestRoutes,
    };
  }

  toPrometheus(): string {
    const stats = this.getStats();
    const recent = this.getRecentTimings();
    const totalDurationMs = recent.reduce((sum, t) => sum + t.durationMs, 0);
    const lines: string[] = [];

    lines.push("# HELP http_requests_total Total HTTP requests");
    lines.push("# TYPE http_requests_total counter");
    lines.push(`http_requests_total ${stats.total_requests}`);

    lines.push("# HELP http_errors_total Total HTTP 5xx errors");
    lines.push("# TYPE http_errors_total counter");
    lines.push(`http_errors_total ${stats.total_errors}`);

    lines.push("# HELP http_request_duration_ms HTTP request duration in milliseconds");
    lines.push("# TYPE http_request_duration_ms summary");
    lines.push(`http_request_duration_ms{quantile="0.5"} ${stats.window_24h.p50_ms}`);
    lines.push(`http_request_duration_ms{quantile="0.9"} ${stats.window_24h.p90_ms}`);
    lines.push(`http_request_duration_ms{quantile="0.95"} ${stats.window_24h.p95_ms}`);
    lines.push(`http_request_duration_ms{quantile="0.99"} ${stats.window_24h.p99_ms}`);
    lines.push(`http_request_duration_ms_sum ${totalDurationMs}`);
    lines.push(`http_request_duration_ms_count ${stats.window_24h.request_count}`);

    lines.push("# HELP http_request_duration_ms_max Maximum request duration in milliseconds");
    lines.push("# TYPE http_request_duration_ms_max gauge");
    lines.push(`http_request_duration_ms_max ${stats.window_24h.max_ms}`);

    lines.push("# HELP http_slow_queries_total Slow DB queries (>100ms) in last 24h");
    lines.push("# TYPE http_slow_queries_total gauge");
    lines.push(`http_slow_queries_total ${stats.slow_queries_24h}`);

    lines.push("# HELP process_uptime_seconds Server uptime in seconds");
    lines.push("# TYPE process_uptime_seconds gauge");
    lines.push(`process_uptime_seconds ${stats.uptime_seconds}`);

    lines.push("# HELP http_route_duration_p95_ms 95th percentile duration per route");
    lines.push("# TYPE http_route_duration_p95_ms gauge");
    lines.push("# HELP http_route_requests_total Request count per route");
    lines.push("# TYPE http_route_requests_total gauge");
    for (const route of stats.slowest_routes) {
      const label = route.route.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      lines.push(`http_route_duration_p95_ms{route="${label}"} ${route.p95}`);
      lines.push(`http_route_requests_total{route="${label}"} ${route.count}`);
    }

    return lines.join("\n") + "\n";
  }

  logDailyP95() {
    const stats = this.getStats();
    logger.info("Daily APM summary", {
      p50_ms: stats.window_24h.p50_ms,
      p90_ms: stats.window_24h.p90_ms,
      p95_ms: stats.window_24h.p95_ms,
      p99_ms: stats.window_24h.p99_ms,
      avg_ms: stats.window_24h.avg_ms,
      max_ms: stats.window_24h.max_ms,
      request_count: stats.window_24h.request_count,
      error_count: stats.total_errors,
      slow_queries_24h: stats.slow_queries_24h,
      slowest_routes: stats.slowest_routes.slice(0, 5),
    });
  }

  startDailyLog() {
    const msUntilMidnight = this.msUntilHour(0);
    setTimeout(() => {
      this.logDailyP95();
      this.dailyLogTimer = setInterval(() => this.logDailyP95(), 24 * 60 * 60 * 1000);
    }, msUntilMidnight);
    logger.info(`APM daily summary scheduled in ${Math.round(msUntilMidnight / 60000)}m`);
  }

  private msUntilHour(hour: number): number {
    const now = new Date();
    const target = new Date(now);
    target.setHours(hour, 0, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    return target.getTime() - now.getTime();
  }

  cleanup() {
    if (this.dailyLogTimer) clearInterval(this.dailyLogTimer);
  }
}

export const metrics = new MetricsCollector();
