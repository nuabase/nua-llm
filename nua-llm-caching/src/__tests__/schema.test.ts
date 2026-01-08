import { wrapArraySchema, unwrapArraySchema, arrayOutputToLookup } from "../schema";

describe("wrapArraySchema", () => {
  it("should wrap schema with array and primary key", () => {
    const originalSchema = {
      type: "object",
      properties: {
        calories: { type: "number" },
      },
    };

    const wrapped = wrapArraySchema(originalSchema, {
      primaryKey: "id",
      outputName: "nutrition",
    });

    expect(wrapped.type).toBe("array");
    expect((wrapped.items as any).type).toBe("object");
    expect((wrapped.items as any).required).toContain("id");
    expect((wrapped.items as any).required).toContain("nutrition");
    expect((wrapped.items as any).properties.nutrition).toEqual(originalSchema);
  });

  it("should preserve $schema if present", () => {
    const originalSchema = {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "string",
    };

    const wrapped = wrapArraySchema(originalSchema, {
      primaryKey: "pk",
      outputName: "value",
    });

    expect(wrapped.$schema).toBe("http://json-schema.org/draft-07/schema#");
  });

  it("should add primary key as anyOf string/number/integer", () => {
    const wrapped = wrapArraySchema({ type: "boolean" }, {
      primaryKey: "id",
      outputName: "result",
    });

    const pkSchema = (wrapped.items as any).properties.id;
    expect(pkSchema.anyOf).toContainEqual({ type: "string" });
    expect(pkSchema.anyOf).toContainEqual({ type: "number" });
    expect(pkSchema.anyOf).toContainEqual({ type: "integer" });
  });
});

describe("unwrapArraySchema", () => {
  it("should extract original schema from wrapped", () => {
    const originalSchema = {
      type: "object",
      properties: { value: { type: "number" } },
    };

    const wrapped = wrapArraySchema(originalSchema, {
      primaryKey: "id",
      outputName: "result",
    });

    const unwrapped = unwrapArraySchema(wrapped, "result");

    expect(unwrapped).toEqual(originalSchema);
  });

  it("should return null for invalid wrapped schema", () => {
    const invalid = { type: "string" }; // Not wrapped

    const result = unwrapArraySchema(invalid, "result");

    expect(result).toBeNull();
  });

  it("should return null if outputName not found", () => {
    const wrapped = wrapArraySchema({ type: "string" }, {
      primaryKey: "id",
      outputName: "result",
    });

    const result = unwrapArraySchema(wrapped, "wrongName");

    expect(result).toBeNull();
  });
});

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
