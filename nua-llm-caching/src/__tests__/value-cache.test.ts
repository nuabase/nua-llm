import {
  buildValueContextKey,
  buildValueCacheKey,
  getValueCache,
  setValueCache,
  ValueCacheService,
} from "../value-cache";
import { createMemoryCacheStore } from "../stores";
import { normalizedUsageZero } from "nua-llm-core";

describe("buildValueContextKey", () => {
  it("should generate consistent key for same params", () => {
    const params = {
      requestType: "cast/value",
      outputName: "result",
      prompt: "Summarize",
      effectiveSchema: { type: "string" },
    };

    const key1 = buildValueContextKey(params);
    const key2 = buildValueContextKey(params);

    expect(key1).toBe(key2);
  });

  it("should generate different keys for different prompts", () => {
    const base = {
      requestType: "cast/value",
      outputName: "result",
      effectiveSchema: { type: "string" },
    };

    const key1 = buildValueContextKey({ ...base, prompt: "Prompt A" });
    const key2 = buildValueContextKey({ ...base, prompt: "Prompt B" });

    expect(key1).not.toBe(key2);
  });

  it("should generate different keys for different schemas", () => {
    const base = {
      requestType: "cast/value",
      outputName: "result",
      prompt: "Summarize",
    };

    const key1 = buildValueContextKey({
      ...base,
      effectiveSchema: { type: "string" },
    });
    const key2 = buildValueContextKey({
      ...base,
      effectiveSchema: { type: "number" },
    });

    expect(key1).not.toBe(key2);
  });
});

describe("buildValueCacheKey", () => {
  it("should generate key in correct format", () => {
    const key = buildValueCacheKey({ foo: "bar" }, "context123");

    expect(key).toMatch(/^mapped-value:[a-f0-9]+:context123$/);
  });

  it("should generate consistent key for same data", () => {
    const data = { name: "John", age: 30 };
    const context = "ctx";

    const key1 = buildValueCacheKey(data, context);
    const key2 = buildValueCacheKey(data, context);

    expect(key1).toBe(key2);
  });

  it("should handle object key order consistently", () => {
    const data1 = { a: 1, b: 2 };
    const data2 = { b: 2, a: 1 };
    const context = "ctx";

    const key1 = buildValueCacheKey(data1, context);
    const key2 = buildValueCacheKey(data2, context);

    expect(key1).toBe(key2);
  });
});

describe("getValueCache / setValueCache", () => {
  it("should store and retrieve value", async () => {
    const store = createMemoryCacheStore();
    const key = "test-key";
    const value = { result: "test" };
    const usage = { promptTokens: 100, completionTokens: 50, totalTokens: 150 };

    await setValueCache(store, key, value, usage);
    const result = await getValueCache(store, key);

    expect(result.hit).toBe(true);
    if (result.hit) {
      expect(result.value).toEqual(value);
      expect(result.usage).toEqual(usage);
    }
  });

  it("should return cache miss for non-existent key", async () => {
    const store = createMemoryCacheStore();

    const result = await getValueCache(store, "nonexistent");

    expect(result.hit).toBe(false);
  });

  it("should respect invalidateCache option", async () => {
    const store = createMemoryCacheStore();
    const key = "test-key";

    await setValueCache(store, key, "value", normalizedUsageZero);

    const result = await getValueCache(store, key, { invalidateCache: true });

    expect(result.hit).toBe(false);
  });
});

describe("ValueCacheService", () => {
  const createContext = () => ({
    outputName: "result",
    prompt: "Summarize the data",
    schema: { type: "string" },
    data: { name: "John" },
  });

  it("should get cache miss initially", async () => {
    const store = createMemoryCacheStore();
    const service = new ValueCacheService(store, createContext());

    const result = await service.get();

    expect(result.hit).toBe(false);
  });

  it("should store and retrieve value", async () => {
    const store = createMemoryCacheStore();
    const context = createContext();
    const service = new ValueCacheService(store, context);
    const usage = { promptTokens: 100, completionTokens: 50, totalTokens: 150 };

    await service.set("processed result", usage);
    const result = await service.get();

    expect(result.hit).toBe(true);
    if (result.hit) {
      expect(result.value).toBe("processed result");
      expect(result.usage).toEqual(usage);
    }
  });

  it("should generate consistent cache key", () => {
    const store = createMemoryCacheStore();
    const context = createContext();

    const service1 = new ValueCacheService(store, context);
    const service2 = new ValueCacheService(store, context);

    expect(service1.getCacheKey()).toBe(service2.getCacheKey());
  });

  it("should respect invalidateCache option", async () => {
    const store = createMemoryCacheStore();
    const context = createContext();
    const service = new ValueCacheService(store, context);

    await service.set("cached value", normalizedUsageZero);

    const result = await service.get({ invalidateCache: true });

    expect(result.hit).toBe(false);
  });
});
