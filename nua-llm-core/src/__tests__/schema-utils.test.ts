import { wrapArraySchema, unwrapArraySchema } from "../lib/schema-utils";

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
