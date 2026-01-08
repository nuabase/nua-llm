import { parseCachedValue, serializeCacheValue } from "../cache-value";

describe("parseCachedValue", () => {
  it("should parse new format with result and usage", () => {
    const cached = JSON.stringify({
      result: { foo: "bar" },
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    });

    const parsed = parseCachedValue(cached);

    expect(parsed.result).toEqual({ foo: "bar" });
    expect(parsed.usage).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });
  });

  it("should handle old format (raw value) with zero usage", () => {
    const cached = JSON.stringify({ foo: "bar" });

    const parsed = parseCachedValue(cached);

    expect(parsed.result).toEqual({ foo: "bar" });
    expect(parsed.usage).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });
  });

  it("should handle primitive values in old format", () => {
    const cached = JSON.stringify("hello");

    const parsed = parseCachedValue(cached);

    expect(parsed.result).toBe("hello");
    expect(parsed.usage).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });
  });

  it("should handle null in old format", () => {
    const cached = JSON.stringify(null);

    const parsed = parseCachedValue(cached);

    expect(parsed.result).toBeNull();
    expect(parsed.usage).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });
  });
});

describe("serializeCacheValue", () => {
  it("should serialize result with usage", () => {
    const result = { foo: "bar" };
    const usage = { promptTokens: 100, completionTokens: 50, totalTokens: 150 };

    const serialized = serializeCacheValue(result, usage);
    const parsed = JSON.parse(serialized);

    expect(parsed.result).toEqual({ foo: "bar" });
    expect(parsed.usage).toEqual(usage);
  });

  it("should handle primitive results", () => {
    const result = "hello";
    const usage = { promptTokens: 10, completionTokens: 5, totalTokens: 15 };

    const serialized = serializeCacheValue(result, usage);
    const parsed = JSON.parse(serialized);

    expect(parsed.result).toBe("hello");
    expect(parsed.usage).toEqual(usage);
  });

  it("should round-trip correctly", () => {
    const originalResult = { nested: { value: 42 } };
    const originalUsage = {
      promptTokens: 200,
      completionTokens: 100,
      totalTokens: 300,
    };

    const serialized = serializeCacheValue(originalResult, originalUsage);
    const { result, usage } = parseCachedValue(serialized);

    expect(result).toEqual(originalResult);
    expect(usage).toEqual(originalUsage);
  });
});
