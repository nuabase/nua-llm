import {
  ArrayCacheService,
  buildArrayContextKey,
  buildArrayRowKey,
  checkArrayCache,
  storeArrayResults,
  assembleArrayResult,
} from "../array-cache";
import { createMemoryCacheStore } from "../stores";
import { normalizedUsageZero } from "nua-llm-core";

describe("buildArrayContextKey", () => {
  it("should generate consistent key for same context", () => {
    const context = {
      outputName: "calories",
      prompt: "Calculate calories",
      primaryKey: "id",
      effectiveSchema: { type: "object" },
    };

    const key1 = buildArrayContextKey(context);
    const key2 = buildArrayContextKey(context);

    expect(key1).toBe(key2);
  });

  it("should generate different keys for different prompts", () => {
    const base = {
      outputName: "calories",
      primaryKey: "id",
      effectiveSchema: { type: "object" },
    };

    const key1 = buildArrayContextKey({ ...base, prompt: "Prompt A" });
    const key2 = buildArrayContextKey({ ...base, prompt: "Prompt B" });

    expect(key1).not.toBe(key2);
  });
});

describe("buildArrayRowKey", () => {
  it("should generate key in correct format", () => {
    const row = { id: 1, name: "Item" };
    const key = buildArrayRowKey(row, "context123");

    expect(key).toMatch(/^mapped-row:[a-f0-9]+:context123$/);
  });

  it("should generate same key for equivalent objects", () => {
    const row1 = { a: 1, b: 2 };
    const row2 = { b: 2, a: 1 }; // Different key order

    const key1 = buildArrayRowKey(row1, "ctx");
    const key2 = buildArrayRowKey(row2, "ctx");

    expect(key1).toBe(key2);
  });
});

describe("checkArrayCache", () => {
  const context = {
    outputName: "result",
    prompt: "Process items",
    primaryKey: "id",
    effectiveSchema: { type: "object" },
  };

  it("should return all rows as uncached when cache is empty", async () => {
    const store = createMemoryCacheStore();
    const inputRows = [
      { id: 1, name: "A" },
      { id: 2, name: "B" },
    ];

    const result = await checkArrayCache(store, inputRows, context);

    expect(result.cacheHitsByPk.size).toBe(0);
    expect(result.uncachedRows).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
  });

  it("should return all rows as uncached when invalidateCache is true", async () => {
    const store = createMemoryCacheStore();
    const inputRows = [{ id: 1, name: "A" }];

    // Pre-populate cache
    const { contextKey } = await checkArrayCache(store, inputRows, context);
    const cacheKey = buildArrayRowKey(inputRows[0], contextKey);
    await store.set(
      cacheKey,
      JSON.stringify({
        result: { processed: true },
        usage: normalizedUsageZero,
      })
    );

    // Check with invalidate
    const result = await checkArrayCache(store, inputRows, context, {
      invalidateCache: true,
    });

    expect(result.cacheHitsByPk.size).toBe(0);
    expect(result.uncachedRows).toHaveLength(1);
  });

  it("should detect cache hits", async () => {
    const store = createMemoryCacheStore();
    const inputRows = [
      { id: 1, name: "A" },
      { id: 2, name: "B" },
    ];

    // Pre-populate cache for first row
    const { contextKey } = await checkArrayCache(store, inputRows, context);
    const cacheKey = buildArrayRowKey(inputRows[0], contextKey);
    await store.set(
      cacheKey,
      JSON.stringify({
        result: { processed: true },
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      })
    );

    // Check cache again
    const result = await checkArrayCache(store, inputRows, context);

    expect(result.cacheHitsByPk.size).toBe(1);
    expect(result.cacheHitsByPk.has(1)).toBe(true);
    expect(result.uncachedRows).toHaveLength(1);
    expect(result.uncachedRows[0].id).toBe(2);
  });

  it("should report error for invalid primary key", async () => {
    const store = createMemoryCacheStore();
    const inputRows = [
      { id: 1, name: "A" },
      { name: "B" }, // Missing id
      { id: null, name: "C" }, // Null id
    ];

    const result = await checkArrayCache(store, inputRows, context);

    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].reason).toBe("invalid-pk");
    expect(result.errors[1].reason).toBe("invalid-pk");
  });
});

describe("storeArrayResults", () => {
  const context = {
    outputName: "calories",
    prompt: "Calculate calories",
    primaryKey: "id",
    effectiveSchema: { type: "object" },
  };

  it("should store LLM results with estimated usage", async () => {
    const store = createMemoryCacheStore();
    const inputRows = [
      { id: 1, food: "apple" },
      { id: 2, food: "banana" },
    ];
    const llmOutputRows = [
      { id: 1, calories: 95 },
      { id: 2, calories: 105 },
    ];
    const usage = { promptTokens: 100, completionTokens: 50, totalTokens: 150 };
    const contextKey = buildArrayContextKey(context);

    const result = await storeArrayResults(
      store,
      inputRows,
      context,
      contextKey,
      llmOutputRows,
      usage
    );

    expect(result.llmResultsByPk.size).toBe(2);
    expect(result.llmResultsByPk.has(1)).toBe(true);
    expect(result.llmResultsByPk.has(2)).toBe(true);

    // Verify stored in cache
    const cacheKey1 = buildArrayRowKey(inputRows[0], contextKey);
    const cached = await store.get(cacheKey1);
    expect(cached).not.toBeNull();
  });

  it("should handle empty output", async () => {
    const store = createMemoryCacheStore();
    const contextKey = buildArrayContextKey(context);

    const result = await storeArrayResults(
      store,
      [],
      context,
      contextKey,
      [],
      normalizedUsageZero
    );

    expect(result.llmResultsByPk.size).toBe(0);
    expect(result.errors).toHaveLength(0);
  });
});

describe("assembleArrayResult", () => {
  const context = {
    primaryKey: "id",
    outputName: "result",
  };

  it("should combine cache hits and LLM results in order", () => {
    const inputRows = [
      { id: 1, name: "A" },
      { id: 2, name: "B" },
      { id: 3, name: "C" },
    ];

    const cacheHitsByPk = new Map([
      [1, { result: "cached1", usage: normalizedUsageZero }],
      [3, { result: "cached3", usage: normalizedUsageZero }],
    ]);

    const llmResultsByPk = new Map([
      [2, { result: "llm2", usage: normalizedUsageZero }],
    ]);

    const result = assembleArrayResult(
      inputRows,
      cacheHitsByPk,
      llmResultsByPk,
      context
    );

    expect(result.data).toHaveLength(3);
    expect(result.data[0]).toEqual({ id: 1, result: "cached1" });
    expect(result.data[1]).toEqual({ id: 2, result: "llm2" });
    expect(result.data[2]).toEqual({ id: 3, result: "cached3" });
    expect(result.cacheHitCount).toBe(2);
    expect(result.rowsWithNoResults).toHaveLength(0);
  });

  it("should track rows with no results", () => {
    const inputRows = [
      { id: 1, name: "A" },
      { id: 2, name: "B" },
    ];

    const cacheHitsByPk = new Map([
      [1, { result: "cached1", usage: normalizedUsageZero }],
    ]);

    const llmResultsByPk = new Map<number, { result: unknown; usage: typeof normalizedUsageZero }>();

    const result = assembleArrayResult(
      inputRows,
      cacheHitsByPk,
      llmResultsByPk,
      context
    );

    expect(result.data).toHaveLength(1);
    expect(result.rowsWithNoResults).toEqual([2]);
  });

  it("should accumulate cache usage", () => {
    const inputRows = [
      { id: 1, name: "A" },
      { id: 2, name: "B" },
    ];

    const cacheHitsByPk = new Map([
      [
        1,
        {
          result: "r1",
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        },
      ],
      [
        2,
        {
          result: "r2",
          usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
        },
      ],
    ]);

    const result = assembleArrayResult(
      inputRows,
      cacheHitsByPk,
      new Map(),
      context
    );

    expect(result.cacheUsage).toEqual({
      promptTokens: 30,
      completionTokens: 15,
      totalTokens: 45,
    });
  });

  it("should give LLM results precedence over cache", () => {
    const inputRows = [{ id: 1, name: "A" }];

    // Both have result for id=1
    const cacheHitsByPk = new Map([
      [1, { result: "cached", usage: normalizedUsageZero }],
    ]);

    const llmResultsByPk = new Map([
      [1, { result: "fresh", usage: normalizedUsageZero }],
    ]);

    const result = assembleArrayResult(
      inputRows,
      cacheHitsByPk,
      llmResultsByPk,
      context
    );

    expect(result.data[0].result).toBe("fresh");
    expect(result.cacheHitCount).toBe(0); // Cache hit not counted when LLM result exists
  });
});

describe("ArrayCacheService", () => {
  const context = {
    outputName: "calories",
    prompt: "Calculate calories",
    primaryKey: "id",
    effectiveSchema: { type: "object" },
  };

  it("should integrate check, store, and assemble", async () => {
    const store = createMemoryCacheStore();
    const inputRows = [
      { id: 1, food: "apple" },
      { id: 2, food: "banana" },
    ];

    const service = new ArrayCacheService(store, inputRows, context);

    // Check cache - should be empty
    await service.checkCache();
    expect(service.uncachedRows).toHaveLength(2);
    expect(service.cacheHitsByPk.size).toBe(0);

    // Store LLM results
    const llmOutput = [
      { id: 1, calories: 95 },
      { id: 2, calories: 105 },
    ];
    const usage = { promptTokens: 100, completionTokens: 50, totalTokens: 150 };
    await service.storeResults(llmOutput, usage);

    // Assemble result
    const result = service.assembleResult();

    expect(result.data).toHaveLength(2);
    expect(result.cacheHitCount).toBe(0);
    expect(result.rowsWithNoResults).toHaveLength(0);
  });

  it("should handle partial cache hits", async () => {
    const store = createMemoryCacheStore();
    const inputRows = [
      { id: 1, food: "apple" },
      { id: 2, food: "banana" },
    ];

    // First request - populate cache
    const service1 = new ArrayCacheService(store, inputRows, context);
    await service1.checkCache();
    await service1.storeResults(
      [
        { id: 1, calories: 95 },
        { id: 2, calories: 105 },
      ],
      { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
    );

    // Second request with one new row
    const newInputRows = [
      { id: 1, food: "apple" }, // Cached
      { id: 3, food: "orange" }, // New
    ];

    const service2 = new ArrayCacheService(store, newInputRows, context);
    await service2.checkCache();

    expect(service2.cacheHitsByPk.size).toBe(1);
    expect(service2.uncachedRows).toHaveLength(1);
    expect(service2.uncachedRows[0].id).toBe(3);
  });

  it("should throw if storeResults called before checkCache", async () => {
    const store = createMemoryCacheStore();
    const service = new ArrayCacheService(store, [], context);

    await expect(service.storeResults([], normalizedUsageZero)).rejects.toThrow(
      "checkCache() must be called before storeResults()"
    );
  });

  it("should throw if assembleResult called before checkCache", () => {
    const store = createMemoryCacheStore();
    const service = new ArrayCacheService(store, [], context);

    expect(() => service.assembleResult()).toThrow(
      "checkCache() must be called before assembleResult()"
    );
  });
});
