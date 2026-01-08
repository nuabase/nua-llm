import { CacheStore, CacheOptions } from "../types";

/**
 * Expected interface for a Redis client.
 * Compatible with node-redis v4+ client.
 */
export interface RedisClientLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { EX?: number }): Promise<unknown>;
  mGet(keys: string[]): Promise<(string | null)[]>;
  mSet(
    entries: Array<[string, string]> | Record<string, string>
  ): Promise<unknown>;
}

/**
 * Creates a CacheStore adapter for a Redis client.
 * The client should be a node-redis v4+ client instance.
 */
export function createRedisCacheStore(client: RedisClientLike): CacheStore {
  return {
    async get(key: string): Promise<string | null> {
      return client.get(key);
    },

    async set(
      key: string,
      value: string,
      options?: CacheOptions
    ): Promise<void> {
      if (options?.ttl) {
        await client.set(key, value, { EX: options.ttl });
      } else {
        await client.set(key, value);
      }
    },

    async mGet(keys: string[]): Promise<(string | null)[]> {
      if (keys.length === 0) {
        return [];
      }
      return client.mGet(keys);
    },

    async mSet(
      entries: Record<string, string>,
      _options?: CacheOptions
    ): Promise<void> {
      const entriesArray = Object.entries(entries);
      if (entriesArray.length === 0) {
        return;
      }
      // Note: Redis mSet doesn't support per-key TTL.
      // If TTL is needed, use individual set calls with EXPIRE.
      await client.mSet(entriesArray);
    },
  };
}
