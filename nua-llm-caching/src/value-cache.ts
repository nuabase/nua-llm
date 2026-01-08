import { normalizedUsageZero, stableStringify } from "nua-llm-core";
import { sha256 } from "./hash";
import { parseCachedValue, serializeCacheValue } from "./cache-value";
import {
  CacheStore,
  CacheOptions,
  CacheCheckOptions,
  NormalizedUsage,
  JsonSchema,
} from "./types";

// --- Functional API ---

export interface ValueCacheKeyParams {
  outputName: string;
  prompt: string;
  schema: JsonSchema;
  data: unknown;
}

export interface ValueCacheContextParams {
  requestType: string;
  outputName: string;
  prompt: string;
  primaryKey?: string;
  effectiveSchema: JsonSchema;
}

/**
 * Build a context key from request-level parameters.
 * This creates a hash that uniquely identifies the prompt/schema combination.
 */
export function buildValueContextKey(params: ValueCacheContextParams): string {
  const promptContext = [
    params.requestType,
    params.outputName,
    params.prompt,
    params.primaryKey ?? "",
    stableStringify(params.effectiveSchema),
  ].join(" ");
  return sha256(promptContext);
}

/**
 * Build a full cache key for a value cache entry.
 * Format: "mapped-value:{dataHash}:{contextKey}"
 */
export function buildValueCacheKey(
  data: unknown,
  contextKey: string
): string {
  const dataKey = sha256(stableStringify(data));
  return ["mapped-value", dataKey, contextKey].join(":");
}

/**
 * Get a value from the cache.
 */
export async function getValueCache<T>(
  store: CacheStore,
  key: string,
  options?: CacheCheckOptions
): Promise<{ hit: true; value: T; usage: NormalizedUsage } | { hit: false }> {
  if (options?.invalidateCache) {
    return { hit: false };
  }

  const cached = await store.get(key);
  if (cached) {
    const { result, usage } = parseCachedValue(cached);
    return { hit: true, value: result as T, usage };
  }
  return { hit: false };
}

/**
 * Set a value in the cache.
 */
export async function setValueCache(
  store: CacheStore,
  key: string,
  value: unknown,
  usage: NormalizedUsage,
  options?: CacheOptions
): Promise<void> {
  await store.set(key, serializeCacheValue(value, usage), options);
}

// --- Service API ---

export interface ValueCacheContext {
  outputName: string;
  prompt: string;
  schema: JsonSchema;
  data: unknown;
  requestType?: string;
  primaryKey?: string;
}

/**
 * ValueCacheService provides a stateful facade for value caching.
 */
export class ValueCacheService {
  private contextKey: string;
  private cacheKey: string;

  constructor(
    private store: CacheStore,
    private context: ValueCacheContext
  ) {
    this.contextKey = buildValueContextKey({
      requestType: context.requestType ?? "cast/value",
      outputName: context.outputName,
      prompt: context.prompt,
      primaryKey: context.primaryKey,
      effectiveSchema: context.schema,
    });
    this.cacheKey = buildValueCacheKey(context.data, this.contextKey);
  }

  getContextKey(): string {
    return this.contextKey;
  }

  getCacheKey(): string {
    return this.cacheKey;
  }

  async get<T>(
    options?: CacheCheckOptions
  ): Promise<
    { value: T; usage: NormalizedUsage; hit: true } | { hit: false }
  > {
    return getValueCache<T>(this.store, this.cacheKey, options);
  }

  async set(
    value: unknown,
    usage: NormalizedUsage,
    options?: CacheOptions
  ): Promise<void> {
    return setValueCache(this.store, this.cacheKey, value, usage, options);
  }
}
