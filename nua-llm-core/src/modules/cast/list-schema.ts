import { JsonSchema } from "../../lib/schema-utils";

declare const listSchemaBrand: unique symbol;

/** Names the two fields of every row in a list result. */
export type ListRowKeys = {
  /** Holds the primary key of the input row the result row answers. */
  primaryKey: string;
  /** Holds the output value. */
  outputName: string;
};

/**
 * The schema of a list cast's result, with the row keys it was built for. Only
 * listSchema() makes one, so a castArray call cannot be given an item schema by
 * mistake.
 */
export type ListSchema = ListRowKeys & {
  readonly [listSchemaBrand]: true;
  /** The JSON schema of the whole list, as sent to the model and validated against. */
  jsonSchema: JsonSchema;
};

/**
 * Builds the list schema whose rows each hold one `itemSchema` value:
 *
 *   array<{ <primaryKey>: string | number, <outputName>: <itemSchema> }>
 */
export function listSchema(itemSchema: JsonSchema, keys: ListRowKeys): ListSchema {
  const jsonSchema: JsonSchema = {
    type: "array",
    items: {
      type: "object",
      required: [keys.primaryKey, keys.outputName],
      properties: {
        [keys.primaryKey]: {
          anyOf: [{ type: "string" }, { type: "number" }, { type: "integer" }],
        },
        [keys.outputName]: itemSchema,
      },
    },
  };

  if (typeof itemSchema.$schema === "string") {
    jsonSchema.$schema = itemSchema.$schema;
  }

  return brand(keys, jsonSchema);
}

function brand(keys: ListRowKeys, jsonSchema: JsonSchema): ListSchema {
  return { primaryKey: keys.primaryKey, outputName: keys.outputName, jsonSchema } as ListSchema;
}
