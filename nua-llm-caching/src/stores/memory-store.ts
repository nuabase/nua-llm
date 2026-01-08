import { CacheStore, CacheOptions } from "../types";

interface MemoryEntry {
  value: string;
  expiresAt?: number;
}

/**
 * In-memory cache store for testing purposes.
 */
export function createMemoryCacheStore(): CacheStore {
  const store = new Map<string, MemoryEntry>();

  const isExpired = (entry: MemoryEntry): boolean => {
    if (entry.expiresAt === undefined) {
      return false;
    }
    return Date.now() > entry.expiresAt;
  };

  return {
    async get(key: string): Promise<string | null> {
      const entry = store.get(key);
      if (!entry) {
        return null;
      }
      if (isExpired(entry)) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },

    async set(
      key: string,
      value: string,
      options?: CacheOptions
    ): Promise<void> {
      const entry: MemoryEntry = { value };
      if (options?.ttl) {
        entry.expiresAt = Date.now() + options.ttl * 1000;
      }
      store.set(key, entry);
    },

    async mGet(keys: string[]): Promise<(string | null)[]> {
      return keys.map((key) => {
        const entry = store.get(key);
        if (!entry) {
          return null;
        }
        if (isExpired(entry)) {
          store.delete(key);
          return null;
        }
        return entry.value;
      });
    },

    async mSet(
      entries: Record<string, string>,
      options?: CacheOptions
    ): Promise<void> {
      const expiresAt = options?.ttl
        ? Date.now() + options.ttl * 1000
        : undefined;
      for (const [key, value] of Object.entries(entries)) {
        store.set(key, { value, expiresAt });
      }
    },
  };
}
