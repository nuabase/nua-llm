import { z } from "zod";
import { describeSchema } from "../lib/schema-utils";
import { listSchema } from "../modules/cast/list-schema";

const keys = { primaryKey: "id", outputName: "nutrition" };
const itemSchema = z.object({ calories: z.number() });

describe("listSchema", () => {
  it("makes an array of rows that each hold the primary key and one output value", () => {
    const list = listSchema(itemSchema, keys);

    expect(list).toMatchObject({ primaryKey: "id", outputName: "nutrition" });
    expect(describeSchema(list.schema)).toEqual({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "array",
      items: {
        type: "object",
        required: ["id", "nutrition"],
        properties: {
          id: { type: ["string", "number"] },
          nutrition: { type: "object", properties: { calories: { type: "number" } }, required: ["calories"] },
        },
      },
    });
  });

  it("accepts string and number primary keys and rejects rows missing either field", () => {
    const { schema } = listSchema(itemSchema, keys);

    expect(schema.safeParse([{ id: "a", nutrition: { calories: 1 } }, { id: 2, nutrition: { calories: 3 } }]))
      .toMatchObject({ success: true });
    expect(schema.safeParse([{ id: 1 }]).success).toBe(false);
    expect(schema.safeParse([{ nutrition: { calories: 1 } }]).success).toBe(false);
  });
});
