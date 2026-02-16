import logger from "./logger";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  invalidations: number;
  size: number;
}

const TTL = {
  SHORT: 60 * 1000,
  MEDIUM: 5 * 60 * 1000,
  LONG: 60 * 60 * 1000,
} as const;

class MemoryCache {
  private store = new Map<string, CacheEntry<any>>();
  private inflight = new Map<string, Promise<any>>();
  private stats: CacheStats = { hits: 0, misses: 0, sets: 0, invalidations: 0, size: 0 };
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000);
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      this.stats.misses++;
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.stats.misses++;
      this.stats.size = this.store.size;
      return undefined;
    }
    this.stats.hits++;
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
    this.stats.sets++;
    this.stats.size = this.store.size;
  }

  invalidate(key: string): boolean {
    const deleted = this.store.delete(key);
    if (deleted) {
      this.stats.invalidations++;
      this.stats.size = this.store.size;
    }
    return deleted;
  }

  invalidatePattern(pattern: string): number {
    let count = 0;
    const keys = Array.from(this.store.keys());
    for (const key of keys) {
      if (key.startsWith(pattern)) {
        this.store.delete(key);
        count++;
      }
    }
    if (count > 0) {
      this.stats.invalidations += count;
      this.stats.size = this.store.size;
    }
    return count;
  }

  async getOrSet<T>(key: string, fetcher: () => Promise<T>, ttlMs: number): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }
    const pending = this.inflight.get(key);
    if (pending) {
      return pending as Promise<T>;
    }
    const promise = fetcher().then((value) => {
      this.inflight.delete(key);
      if (value !== undefined && value !== null) {
        this.set(key, value, ttlMs);
      }
      return value;
    }).catch((err) => {
      this.inflight.delete(key);
      throw err;
    });
    this.inflight.set(key, promise);
    return promise;
  }

  getStats(): CacheStats {
    return { ...this.stats, size: this.store.size };
  }

  clear(): void {
    this.store.clear();
    this.stats.size = 0;
  }

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    const entries = Array.from(this.store.entries());
    for (const [key, entry] of entries) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      this.stats.size = this.store.size;
      logger.debug(`Cache cleanup: removed ${cleaned} expired entries, ${this.store.size} remaining`);
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.store.clear();
  }
}

export const cache = new MemoryCache();

export const CacheKeys = {
  householdSettings: (householdId: string) => `hs:${householdId}:settings`,
  householdPreferences: (householdId: string) => `hs:${householdId}:prefs`,
  householdLocations: (householdId: string) => `hs:${householdId}:locations`,
  householdPeople: (householdId: string) => `hs:${householdId}:people`,
  householdImportantDates: (householdId: string) => `hs:${householdId}:dates`,
  household: (householdId: string) => `hs:${householdId}:info`,
  addonServices: (householdId: string) => `hs:${householdId}:addons`,
  userProfile: (userId: string) => `user:${userId}:profile`,
  orgPaymentProfile: (orgId: string) => `org:${orgId}:payment`,
  householdPaymentOverride: (householdId: string) => `hs:${householdId}:payment`,
  taskTemplates: (householdId: string) => `hs:${householdId}:templates`,
  vendors: (householdId: string) => `hs:${householdId}:vendors`,
} as const;

export const CacheTTL = TTL;

export function invalidateHousehold(householdId: string): void {
  cache.invalidatePattern(`hs:${householdId}:`);
}

export function invalidateUser(userId: string): void {
  cache.invalidatePattern(`user:${userId}:`);
}

export function invalidateOrg(orgId: string): void {
  cache.invalidatePattern(`org:${orgId}:`);
}
