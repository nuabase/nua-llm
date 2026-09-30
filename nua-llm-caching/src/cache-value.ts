import { normalizedUsageZero } from "nua-llm-core";
import { CachedValueWithUsage, NormalizedUsage } from "./types";

/**
 * Parse cache entry with backwards compatibility.
 * New format: { result, usage }
 * Old format: raw value (treated as zero usage)
 */
export function parseCachedValue(raw: string): CachedValueWithUsage {
  const parsed: unknown = JSON.parse(raw);
  if (
    parsed &&
    typeof parsed === "object" &&
    "result" in parsed &&
    "usage" in parsed
  ) {
    return parsed as CachedValueWithUsage;
  }
  return { result: parsed, usage: normalizedUsageZero };
}

/**
 * Serialize value with usage for caching.
 */
export function serializeCacheValue(
  result: unknown,
  usage: NormalizedUsage
): string {
  // Only the token counts. The provider's prompt-cache counts describe the LLM call that
  // produced the value, not a later read from this cache.
  const { promptTokens, completionTokens, totalTokens } = usage;
  return JSON.stringify({ result, usage: { promptTokens, completionTokens, totalTokens } });
}
