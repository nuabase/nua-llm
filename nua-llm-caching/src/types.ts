import { NormalizedUsage } from "nua-llm-core";

export type { NormalizedUsage } from "nua-llm-core";

export type PrimaryKeyValue = string | number;

export interface CacheOptions {
  ttl?: number; // Time-to-live in seconds
}

export interface CacheCheckOptions {
  invalidateCache?: boolean; // Skip cache lookup and force fresh LLM call
}

export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: CacheOptions): Promise<void>;
  mGet(keys: string[]): Promise<(string | null)[]>;
  mSet(entries: Record<string, string>, options?: CacheOptions): Promise<void>;
}

export type CachedValueWithUsage = {
  result: unknown;
  usage: NormalizedUsage;
};

export type JsonSchema = Record<string, unknown>;
