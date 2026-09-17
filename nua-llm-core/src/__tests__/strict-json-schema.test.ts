import { toStrictSchema } from "../lib/strict-json-schema";

describe("toStrictSchema", () => {
  it("closes objects and keeps required properties", () => {
    const strict = toStrictSchema({
      type: "array",
      items: {
        type: "object",
        required: ["id", "account"],
        properties: {
          id: { anyOf: [{ type: "string" }, { type: "number" }] },
          account: { type: "string", enum: ["Expenses:Food", "Expenses:Travel"] },
        },
      },
    });
    expect(strict).toEqual({
      type: "array",
      items: {
        type: "object",
        required: ["id", "account"],
        additionalProperties: false,
        properties: {
          id: { anyOf: [{ type: "string" }, { type: "number" }] },
          account: { type: "string", enum: ["Expenses:Food", "Expenses:Travel"] },
        },
      },
    });
  });

  it("gives up on optional properties rather than changing their meaning", () => {
    expect(
      toStrictSchema({
        type: "object",
        properties: { a: { type: "string" }, b: { type: "string" } },
        required: ["a"],
      }),
    ).toBeNull();
  });

  it("gives up on open-ended records", () => {
    expect(toStrictSchema({ type: "object", additionalProperties: { type: "number" } })).toBeNull();
  });

  it("gives up on unsupported keywords anywhere in the tree", () => {
    expect(
      toStrictSchema({
        type: "object",
        properties: { a: { oneOf: [{ type: "string" }, { type: "number" }] } },
        required: ["a"],
      }),
    ).toBeNull();
  });

  it("shapes $defs", () => {
    const strict = toStrictSchema({
      type: "object",
      properties: { a: { $ref: "#/$defs/Item" } },
      required: ["a"],
      $defs: { Item: { type: "object", properties: { n: { type: "number" } }, required: ["n"] } },
    });
    expect(strict?.$defs).toEqual({
      Item: {
        type: "object",
        properties: { n: { type: "number" } },
        required: ["n"],
        additionalProperties: false,
      },
    });
  });
});
