import { isNuaValidationError } from "../lib/nua-errors";
import { listSchema, parseListSchema } from "../modules/cast/list-schema";

const keys = { primaryKey: "id", outputName: "nutrition" };

describe("listSchema", () => {
  it("makes an array of rows that each hold the primary key and one output value", () => {
    const itemSchema = { type: "object", properties: { calories: { type: "number" } } };

    expect(listSchema(itemSchema, keys)).toEqual({
      primaryKey: "id",
      outputName: "nutrition",
      jsonSchema: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "nutrition"],
          properties: {
            id: { anyOf: [{ type: "string" }, { type: "number" }, { type: "integer" }] },
            nutrition: itemSchema,
          },
        },
      },
    });
  });

  it("keeps the item schema's $schema at the top", () => {
    const schema = listSchema({ $schema: "http://json-schema.org/draft-07/schema#", type: "string" }, keys);
    expect(schema.jsonSchema.$schema).toBe("http://json-schema.org/draft-07/schema#");
  });
});

describe("parseListSchema", () => {
  it("accepts a stored list schema as it is", () => {
    const stored = JSON.parse(JSON.stringify(listSchema({ type: "boolean" }, keys).jsonSchema));
    const parsed = parseListSchema(stored, keys);
    expect(isNuaValidationError(parsed)).toBe(false);
    expect(parsed).toEqual({ ...keys, jsonSchema: stored });
  });

  it("rejects an item schema", () => {
    expect(isNuaValidationError(parseListSchema({ type: "object", properties: {} }, keys))).toBe(true);
  });

  it("rejects a list schema built for other row keys", () => {
    const stored = listSchema({ type: "boolean" }, keys).jsonSchema;
    expect(isNuaValidationError(parseListSchema(stored, { primaryKey: "id", outputName: "other" }))).toBe(true);
  });
});
