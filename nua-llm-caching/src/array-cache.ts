import { normalizedUsageZero, stableStringify } from "nua-llm-core";
import { sha256 } from "./hash";
import { parseCachedValue, serializeCacheValue } from "./cache-value";
import { estimateRowTokensByPk } from "./estimate-row-tokens";
import { arrayOutputToLookup } from "./schema/lookup";
import {
  CacheStore,
  CacheOptions,
  CacheCheckOptions,
  NormalizedUsage,
  JsonSchema,
  PrimaryKeyValue,
} from "./types";

// --- Types ---

export interface ArrayCacheContext {
  outputName: string;
  prompt: string;
  primaryKey: string;
  effectiveSchema: JsonSchema;
  requestType?: string;
}

export interface ArrayCacheError {
  rowIndex: number;
  row: unknown;
  reason: "invalid-pk" | "parse-error" | "store-error";
  message: string;
}

export interface CachedRowResult {
  result: unknown;
  usage: NormalizedUsage;
}

// --- Functional API ---

/**
 * Build a context key from array request-level parameters.
 */
export function buildArrayContextKey(context: ArrayCacheContext): string {
  const promptContext = [
    context.requestType ?? "cast/array",
    context.outputName,
    context.prompt,
    context.primaryKey,
    stableStringify(context.effectiveSchema),
  ].join(" ");
  return sha256(promptContext);
}

/**
 * Build a cache key for a single row.
 * Format: "mapped-row:{rowHash}:{contextKey}"
 */
export function buildArrayRowKey(
  row: Record<string, unknown>,
  contextKey: string
): string {
  const rowKey = sha256(stableStringify(row));
  return ["mapped-row", rowKey, contextKey].join(":");
}

/**
 * Check cache for multiple rows in a batch operation.
 */
export async function checkArrayCache<
  TRow extends Record<string, unknown>
>(
  store: CacheStore,
  inputRows: TRow[],
  context: ArrayCacheContext,
  options?: CacheCheckOptions
): Promise<{
  contextKey: string;
  cacheHitsByPk: Map<PrimaryKeyValue, CachedRowResult>;
  uncachedRows: TRow[];
  errors: ArrayCacheError[];
}> {
  const contextKey = buildArrayContextKey(context);
  const cacheHitsByPk = new Map<PrimaryKeyValue, CachedRowResult>();
  const errors: ArrayCacheError[] = [];

  // If invalidating cache, return all rows as uncached
  if (options?.invalidateCache) {
    return {
      contextKey,
      cacheHitsByPk,
      uncachedRows: [...inputRows],
      errors,
    };
  }

  // Build cache keys for all rows
  const rowsWithKeys: Array<{
    row: TRow;
    index: number;
    pk: PrimaryKeyValue;
    cacheKey: string;
  }> = [];

  inputRows.forEach((row, index) => {
    const pkValue = row[context.primaryKey];
    if (typeof pkValue !== "string" && typeof pkValue !== "number") {
      errors.push({
        rowIndex: index,
        row,
        reason: "invalid-pk",
        message: `Row at index ${index} has invalid primary key value. Expected string or number.`,
      });
      return;
    }

    const cacheKey = buildArrayRowKey(row, contextKey);
    rowsWithKeys.push({
      row,
      index,
      pk: pkValue,
      cacheKey,
    });
  });

  if (rowsWithKeys.length === 0) {
    return {
      contextKey,
      cacheHitsByPk,
      uncachedRows: [],
      errors,
    };
  }

  // Batch get from cache
  const cacheKeys = rowsWithKeys.map((r) => r.cacheKey);
  const cachedValues = await store.mGet(cacheKeys);

  // Process results
  const uncachedRows: TRow[] = [];

  rowsWithKeys.forEach((item, i) => {
    const rawValue = cachedValues[i];
    if (rawValue) {
      try {
        const { result, usage } = parseCachedValue(rawValue);
        cacheHitsByPk.set(item.pk, { result, usage });
      } catch (e) {
        errors.push({
          rowIndex: item.index,
          row: item.row,
          reason: "parse-error",
          message: `Failed to parse cached value: ${e instanceof Error ? e.message : String(e)}`,
        });
        uncachedRows.push(item.row);
      }
    } else {
      uncachedRows.push(item.row);
    }
  });

  return {
    contextKey,
    cacheHitsByPk,
    uncachedRows,
    errors,
  };
}

/**
 * Store LLM results in the cache with estimated per-row usage.
 */
export async function storeArrayResults<
  TRow extends Record<string, unknown>
>(
  store: CacheStore,
  inputRows: TRow[],
  context: ArrayCacheContext,
  contextKey: string,
  llmOutputRows: Array<Record<string, unknown>>,
  llmUsage: NormalizedUsage,
  options?: CacheOptions
): Promise<{
  llmResultsByPk: Map<PrimaryKeyValue, CachedRowResult>;
  errors: ArrayCacheError[];
}> {
  const errors: ArrayCacheError[] = [];
  const llmResultsByPk = new Map<PrimaryKeyValue, CachedRowResult>();

  if (llmOutputRows.length === 0) {
    return { llmResultsByPk, errors };
  }

  // Build lookup from input rows by primary key
  const inputByPk = new Map<PrimaryKeyValue, TRow>();
  inputRows.forEach((row) => {
    const pk = row[context.primaryKey] as PrimaryKeyValue;
    if (pk !== undefined) {
      inputByPk.set(pk, row);
    }
  });

  // Find the corresponding input rows for the output rows (for token estimation)
  const matchedInputRows: TRow[] = [];
  llmOutputRows.forEach((outputRow) => {
    const pk = outputRow[context.primaryKey] as PrimaryKeyValue;
    const inputRow = inputByPk.get(pk);
    if (inputRow) {
      matchedInputRows.push(inputRow);
    }
  });

  // Estimate per-row token usage using full output rows (they have primary keys)
  const perRowUsages = estimateRowTokensByPk(
    matchedInputRows,
    llmOutputRows,
    llmUsage,
    context.primaryKey
  );

  // Build cache entries
  const cacheEntries: Record<string, string> = {};

  llmOutputRows.forEach((outputRow, index) => {
    const pk = outputRow[context.primaryKey] as PrimaryKeyValue;
    const outputValue = outputRow[context.outputName];
    const inputRow = inputByPk.get(pk);

    if (!inputRow) {
      console.error(
        `unexpected-situation. LLM returned row with primary key that doesn't exist in input: ${pk}`
      );
      return;
    }

    const usage = perRowUsages.get(pk) ?? normalizedUsageZero;
    const cacheKey = buildArrayRowKey(inputRow, contextKey);

    cacheEntries[cacheKey] = serializeCacheValue(outputValue, usage);
    llmResultsByPk.set(pk, { result: outputValue, usage });
  });

  // Store in cache
  if (Object.keys(cacheEntries).length > 0) {
    await store.mSet(cacheEntries, options);
  }

  return { llmResultsByPk, errors };
}

/**
 * Assemble final result from cache hits and LLM results.
 */
export function assembleArrayResult<TRow extends Record<string, unknown>>(
  inputRows: TRow[],
  cacheHitsByPk: Map<PrimaryKeyValue, CachedRowResult>,
  llmResultsByPk: Map<PrimaryKeyValue, CachedRowResult>,
  context: Pick<ArrayCacheContext, "primaryKey" | "outputName">
): {
  data: Array<Record<string, unknown>>;
  rowsWithNoResults: PrimaryKeyValue[];
  cacheHitCount: number;
  llmUsage: NormalizedUsage;
  cacheUsage: NormalizedUsage;
} {
  const data: Array<Record<string, unknown>> = [];
  const rowsWithNoResults: PrimaryKeyValue[] = [];
  let cacheHitCount = 0;

  // Accumulate usage
  const cacheUsage: NormalizedUsage = { ...normalizedUsageZero };
  const llmUsage: NormalizedUsage = { ...normalizedUsageZero };

  inputRows.forEach((row) => {
    const pk = row[context.primaryKey] as PrimaryKeyValue;

    // Check LLM results first (fresh results take precedence)
    const llmResult = llmResultsByPk.get(pk);
    if (llmResult) {
      data.push({
        [context.primaryKey]: pk,
        [context.outputName]: llmResult.result,
      });
      // LLM usage is already accounted at batch level, but we track it here for attribution
      llmUsage.promptTokens += llmResult.usage.promptTokens;
      llmUsage.completionTokens += llmResult.usage.completionTokens;
      llmUsage.totalTokens += llmResult.usage.totalTokens;
      return;
    }

    // Check cache hits
    const cachedResult = cacheHitsByPk.get(pk);
    if (cachedResult) {
      data.push({
        [context.primaryKey]: pk,
        [context.outputName]: cachedResult.result,
      });
      cacheHitCount++;
      cacheUsage.promptTokens += cachedResult.usage.promptTokens;
      cacheUsage.completionTokens += cachedResult.usage.completionTokens;
      cacheUsage.totalTokens += cachedResult.usage.totalTokens;
      return;
    }

    // No result found
    rowsWithNoResults.push(pk);
  });

  return {
    data,
    rowsWithNoResults,
    cacheHitCount,
    llmUsage,
    cacheUsage,
  };
}

// --- Service API ---

/**
 * ArrayCacheService provides a stateful facade for array caching operations.
 */
export class ArrayCacheService<TRow extends Record<string, unknown>> {
  private _cacheHitsByPk: Map<PrimaryKeyValue, CachedRowResult> = new Map();
  private _uncachedRows: TRow[] = [];
  private _errors: ArrayCacheError[] = [];
  private _llmResultsByPk: Map<PrimaryKeyValue, CachedRowResult> = new Map();
  private _contextKey: string;
  private _cacheChecked = false;
  private _resultsStored = false;

  constructor(
    private store: CacheStore,
    private inputRows: TRow[],
    private context: ArrayCacheContext
  ) {
    this._contextKey = buildArrayContextKey(context);
  }

  get cacheHitsByPk(): Map<PrimaryKeyValue, CachedRowResult> {
    return this._cacheHitsByPk;
  }

  get uncachedRows(): TRow[] {
    return this._uncachedRows;
  }

  get errors(): ArrayCacheError[] {
    return this._errors;
  }

  get contextKey(): string {
    return this._contextKey;
  }

  async checkCache(options?: CacheCheckOptions): Promise<void> {
    const result = await checkArrayCache(
      this.store,
      this.inputRows,
      this.context,
      options
    );

    this._cacheHitsByPk = result.cacheHitsByPk;
    this._uncachedRows = result.uncachedRows;
    this._errors.push(...result.errors);
    this._cacheChecked = true;
  }

  async storeResults(
    llmOutputRows: Array<Record<string, unknown>>,
    llmUsage: NormalizedUsage,
    options?: CacheOptions
  ): Promise<void> {
    if (!this._cacheChecked) {
      throw new Error("checkCache() must be called before storeResults()");
    }

    const result = await storeArrayResults(
      this.store,
      this._uncachedRows,
      this.context,
      this._contextKey,
      llmOutputRows,
      llmUsage,
      options
    );

    this._llmResultsByPk = result.llmResultsByPk;
    this._errors.push(...result.errors);
    this._resultsStored = true;
  }

  assembleResult(): {
    data: Array<Record<string, unknown>>;
    rowsWithNoResults: PrimaryKeyValue[];
    cacheHitCount: number;
    llmUsage: NormalizedUsage;
    cacheUsage: NormalizedUsage;
  } {
    if (!this._cacheChecked) {
      throw new Error("checkCache() must be called before assembleResult()");
    }

    // Allow assembling result even without storing (for fully cached scenarios)
    return assembleArrayResult(
      this.inputRows,
      this._cacheHitsByPk,
      this._llmResultsByPk,
      this.context
    );
  }
}
