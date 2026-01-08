import { createMemoryCacheStore } from "../stores";

describe("createMemoryCacheStore", () => {
  describe("get/set", () => {
    it("should store and retrieve a value", async () => {
      const store = createMemoryCacheStore();

      await store.set("key1", "value1");
      const result = await store.get("key1");

      expect(result).toBe("value1");
    });

    it("should return null for non-existent key", async () => {
      const store = createMemoryCacheStore();

      const result = await store.get("nonexistent");

      expect(result).toBeNull();
    });

    it("should overwrite existing value", async () => {
      const store = createMemoryCacheStore();

      await store.set("key1", "value1");
      await store.set("key1", "value2");
      const result = await store.get("key1");

      expect(result).toBe("value2");
    });

    it("should respect TTL expiration", async () => {
      const store = createMemoryCacheStore();

      await store.set("key1", "value1", { ttl: 0.001 }); // 1ms TTL

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = await store.get("key1");
      expect(result).toBeNull();
    });

    it("should not expire when TTL not set", async () => {
      const store = createMemoryCacheStore();

      await store.set("key1", "value1");

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = await store.get("key1");
      expect(result).toBe("value1");
    });
  });

  describe("mGet/mSet", () => {
    it("should store and retrieve multiple values", async () => {
      const store = createMemoryCacheStore();

      await store.mSet({
        key1: "value1",
        key2: "value2",
        key3: "value3",
      });

      const results = await store.mGet(["key1", "key2", "key3"]);

      expect(results).toEqual(["value1", "value2", "value3"]);
    });

    it("should return null for missing keys in mGet", async () => {
      const store = createMemoryCacheStore();

      await store.set("key1", "value1");

      const results = await store.mGet(["key1", "key2", "key3"]);

      expect(results).toEqual(["value1", null, null]);
    });

    it("should return empty array for empty keys", async () => {
      const store = createMemoryCacheStore();

      const results = await store.mGet([]);

      expect(results).toEqual([]);
    });

    it("should handle empty mSet", async () => {
      const store = createMemoryCacheStore();

      // Should not throw
      await store.mSet({});
    });
  });
});
