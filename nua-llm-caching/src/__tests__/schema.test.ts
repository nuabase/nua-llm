import { arrayOutputToLookup } from "../schema";

describe("arrayOutputToLookup", () => {
  it("should convert array to map", () => {
    const output = [
      { id: 1, value: "a" },
      { id: 2, value: "b" },
      { id: "three", value: "c" },
    ];

    const lookup = arrayOutputToLookup(output, "id", "value");

    expect(lookup.size).toBe(3);
    expect(lookup.get(1)).toBe("a");
    expect(lookup.get(2)).toBe("b");
    expect(lookup.get("three")).toBe("c");
  });

  it("should throw for non-array input", () => {
    expect(() => {
      arrayOutputToLookup("not an array" as any, "id", "value");
    }).toThrow("must be an array");
  });

  it("should throw for missing primary key", () => {
    const output = [
      { id: 1, value: "a" },
      { value: "b" }, // Missing id
    ];

    expect(() => {
      arrayOutputToLookup(output, "id", "value");
    }).toThrow("missing the primary key property");
  });

  it("should throw for null primary key value", () => {
    const output = [{ id: null, value: "a" }];

    expect(() => {
      arrayOutputToLookup(output, "id", "value");
    }).toThrow("invalid value for the primary key");
  });

  it("should throw for missing output value property", () => {
    const output = [{ id: 1 }]; // Missing value

    expect(() => {
      arrayOutputToLookup(output, "id", "value");
    }).toThrow("missing the output value property");
  });

  it("should handle complex output values", () => {
    const output = [
      { id: 1, result: { nested: { deep: true } } },
    ];

    const lookup = arrayOutputToLookup<{ nested: { deep: boolean } }>(
      output,
      "id",
      "result"
    );

    expect(lookup.get(1)).toEqual({ nested: { deep: true } });
  });
});