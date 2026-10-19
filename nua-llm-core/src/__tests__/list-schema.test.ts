import { listSchema } from "../modules/cast/list-schema";

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
