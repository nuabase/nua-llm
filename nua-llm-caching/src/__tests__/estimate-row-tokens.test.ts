import { estimateRowTokens, estimateRowTokensByPk } from "../estimate-row-tokens";

describe("estimateRowTokens", () => {
  it("should distribute tokens proportionally by size", () => {
    const inputRows = [
      { short: "a" },
      { longer: "this is longer" },
    ];
    const outputRows = [
      { short: "x" },
      { longer: "this is also longer" },
    ];
    const totalUsage = {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    };

    const result = estimateRowTokens(inputRows, outputRows, totalUsage);

    expect(result).toHaveLength(2);
    // First row is shorter, should get fewer tokens
    expect(result[0].promptTokens).toBeLessThan(result[1].promptTokens);
    expect(result[0].completionTokens).toBeLessThan(result[1].completionTokens);
    // Total should roughly equal original (allowing for rounding differences)
    const totalPrompt = result.reduce((a, b) => a + b.promptTokens, 0);
    const totalCompletion = result.reduce((a, b) => a + b.completionTokens, 0);
    expect(totalPrompt).toBeGreaterThanOrEqual(99);
    expect(totalPrompt).toBeLessThanOrEqual(101);
    expect(totalCompletion).toBeGreaterThanOrEqual(49);
    expect(totalCompletion).toBeLessThanOrEqual(51);
  });

  it("should return empty array for empty inputs", () => {
    expect(estimateRowTokens([], [], { promptTokens: 100, completionTokens: 50, totalTokens: 150 })).toEqual([]);
    expect(estimateRowTokens([{ a: 1 }], [], { promptTokens: 100, completionTokens: 50, totalTokens: 150 })).toEqual([]);
    expect(estimateRowTokens([], [{ a: 1 }], { promptTokens: 100, completionTokens: 50, totalTokens: 150 })).toEqual([]);
  });

  it("should distribute evenly for equal-sized rows", () => {
    const inputRows = [{ a: 1 }, { a: 2 }, { a: 3 }];
    const outputRows = [{ b: 1 }, { b: 2 }, { b: 3 }];
    const totalUsage = {
      promptTokens: 300,
      completionTokens: 150,
      totalTokens: 450,
    };

    const result = estimateRowTokens(inputRows, outputRows, totalUsage);

    // Should be roughly equal (may have small rounding differences)
    expect(result[0].promptTokens).toBe(result[1].promptTokens);
    expect(result[1].promptTokens).toBe(result[2].promptTokens);
  });

  it("should calculate totalTokens correctly", () => {
    const inputRows = [{ a: 1 }];
    const outputRows = [{ b: 2 }];
    const totalUsage = {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    };

    const result = estimateRowTokens(inputRows, outputRows, totalUsage);

    expect(result[0].totalTokens).toBe(
      result[0].promptTokens + result[0].completionTokens
    );
  });
});

describe("estimateRowTokensByPk", () => {
  it("should return map keyed by primary key", () => {
    const inputRows = [
      { id: 1, data: "short" },
      { id: 2, data: "longer data here" },
    ];
    const outputRows = [
      { id: 1, result: "a" },
      { id: 2, result: "bb" },
    ];
    const totalUsage = {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    };

    const result = estimateRowTokensByPk(
      inputRows,
      outputRows,
      totalUsage,
      "id"
    );

    expect(result.size).toBe(2);
    expect(result.has(1)).toBe(true);
    expect(result.has(2)).toBe(true);
    expect(result.get(1)?.promptTokens).toBeDefined();
  });

  it("should handle string primary keys", () => {
    const inputRows = [{ key: "a", data: "x" }];
    const outputRows = [{ key: "a", result: "y" }];
    const totalUsage = {
      promptTokens: 50,
      completionTokens: 25,
      totalTokens: 75,
    };

    const result = estimateRowTokensByPk(
      inputRows,
      outputRows,
      totalUsage,
      "key"
    );

    expect(result.has("a")).toBe(true);
  });
});
